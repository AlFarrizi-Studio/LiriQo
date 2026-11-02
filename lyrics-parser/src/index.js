import { fetchLiriQoLyrics } from "./api.js";
import { parseTTML } from "./ttml.js";
import { parseQrc } from "./qrc.js";
import { parseLrcLyrics, parsePlain, stripLrcTimestamps } from "./lrc.js";
import { attachTranslations } from "./translations.js";
import { createResult, isNonEmptyString } from "./util.js";
import { parseYrc, parseMusixmatchRichsync, normalizedTrackToLyrics, getTrackAttribution } from "./provider-formats.js";

export { fetchLiriQoLyrics, searchLiriQoVideoId, ApiError } from "./api.js";
export { parseTTML } from "./ttml.js";
export { parseQrc, extractSongwriters } from "./qrc.js";
export { buildWordSyncedLRC } from "./words.js";
export { parseLrcLyrics, parsePlain, stripLrcTimestamps } from "./lrc.js";
export { attachTranslations, detectTranslationLanguage } from "./translations.js";
export { hasWordData, isGranularWordTiming, isRealTrack, fitsDuration, pickTrack, pickAnchorTrack } from "./select.js";
export { formatLrcTime, wordSeparator, createResult, stringSimilarity, insertInstrumentalLines,
  LIRIQO_API_BASE, LIRIQO_HOMEPAGE, isNonEmptyString } from "./util.js";
export { parseYrc, parseMusixmatchRichsync, normalizedTrackToLyrics, getTrackAttribution } from "./provider-formats.js";

const HIGH = ['apple_music_liriqo', 'musixmatch', 'unison_community', 'netease', 'kugou_legato', 'qq_portato'];
const TEXT = ['apple_music_liriqo', 'lrclib', 'unison_community', 'netease', 'kugou_legato', 'qq_portato', 'ytm_line'];
const alias = provider => provider === 'unison' ? 'unison_community' : provider;
const rank = (track, order) => {
  const index = order.indexOf(alias(track.provider));
  return index < 0 ? 999 : index;
};
const attempt = fn => {
  try { return fn(); } catch { return null; }
};

function parseTrack(track, options) {
  let line = null;
  if (isNonEmptyString(track.ttml)) {
    const parsed = attempt(() => parseTTML(track.ttml, options));
    if (parsed?.lyrics?.length) {
      if (parsed.isWordSynced) return { ...parsed, route: 'ttml' };
      line = { ...parsed, route: 'ttml' };
    }
  }
  if (isNonEmptyString(track.qrc)) {
    const parsed = attempt(() => parseQrc(track.qrc, options.durationMs, { title: options.song, artist: options.artist }));
    if (parsed?.lyrics?.length && parsed.lyrics.some(x => x.parts?.length)) return { ...parsed, isWordSynced: true, route: 'qrc' };
    if (parsed?.lyrics?.length && !line) line = { ...parsed, isWordSynced: false, route: 'qrc' };
  }
  const native = [
    ['yrc', () => parseYrc(track.yrc)],
    ['richsync', () => parseMusixmatchRichsync(track.richsync ?? track.richsync_body)],
  ];
  for (const [route, fn] of native) {
    const timed = attempt(fn);
    if (!timed?.length) continue;
    const parsed = attempt(() => normalizedTrackToLyrics({ ...track, timed }, options));
    if (parsed?.lyrics?.length) {
      if (parsed.isWordSynced) return { ...parsed, route };
      if (!line) line = { ...parsed, route };
    }
  }
  if (Array.isArray(track.timed) && track.timed.length && track.syncLevel !== 'plain') {
    const parsed = attempt(() => normalizedTrackToLyrics(track, options));
    if (parsed?.lyrics?.length) {
      if (parsed.isWordSynced) return { ...parsed, route: 'words' };
      if (!line) line = { ...parsed, route: 'timed' };
    }
  }
  if (isNonEmptyString(track.lrc)) {
    const lyrics = attempt(() => parseLrcLyrics(track.lrc, options.durationMs, options));
    if (lyrics?.length) {
      const parsed = { lyrics, isWordSynced: lyrics.some(x => x.parts?.length), route: 'lrc' };
      if (parsed.isWordSynced) return parsed;
      if (!line) line = parsed;
    }
  }
  return line;
}

function resultFor(track, parsed, cacheAllowed = true) {
  const attribution = getTrackAttribution(track);
  const result = { ...createResult(parsed.lyrics, { language: parsed.language ?? null,
    songwriters: parsed.songwriters ?? null, cacheAllowed }), ...attribution };
  attachTranslations(result.lyrics, track.translation);
  return result;
}

export function parseLiriQoResponse(data, options = {}) {
  const durationMs = Math.max(0, Math.round((Number(options.duration ?? data?.metadata?.duration) || 0) * 1000));
  const settings = { ...options, durationMs, instrumentalGapMs: options.instrumentalGapMs ?? 5000 };
  const tracks = (Array.isArray(data?.tracks) ? data.tracks : [])
    .filter(track => track && typeof track === 'object' && track.provider !== 'lrclib_wordsync');
  const parsed = tracks.map(track => ({ track, parsed: parseTrack(track, settings) }));
  const eligible = item => item.parsed?.lyrics?.length &&
    (!durationMs || item.parsed.lyrics.every(line => line.isInstrumental || line.startTimeMs <= durationMs + 10000));
  const out = { richsynced: null, synced: null, plain: null, provider: null,
    syncedProvider: null, plainProvider: null, route: null };
  const high = parsed.filter(item => eligible(item) && item.parsed.isWordSynced)
    .sort((a, b) => rank(a.track, HIGH) - rank(b.track, HIGH))[0];
  if (high) {
    out.richsynced = resultFor(high.track, high.parsed);
    out.provider = high.track.provider;
    out.route = high.parsed.route;
  }
  const synced = parsed.filter(eligible).sort((a, b) => rank(a.track, TEXT) - rank(b.track, TEXT))[0];
  if (synced) {
    const lineOnly = { ...synced.parsed, lyrics: synced.parsed.lyrics.map(({ parts, ...line }) => ({ ...line })) };
    out.synced = resultFor(synced.track, lineOnly);
    out.syncedProvider = synced.track.provider;
    if (!out.route) out.route = synced.parsed.route;
    if (!out.provider) out.provider = synced.track.provider;
  }
  for (const track of [...tracks].sort((a, b) => rank(a, TEXT) - rank(b, TEXT))) {
    let content = isNonEmptyString(track.plain) ? track.plain : '';
    if (!content && isNonEmptyString(track.lrc)) content = stripLrcTimestamps(track.lrc);
    if (!content && Array.isArray(track.timed)) content = track.timed.filter(x => x && typeof x.text === 'string').map(x => x.text).join('\n');
    if (!content.trim()) continue;
    const lyrics = parsePlain(content).filter(line => line.words.trim());
    if (!lyrics.length) continue;
    out.plain = resultFor(track, { lyrics }, false);
    out.plainProvider = track.provider;
    if (!out.route) out.route = 'plain';
    if (!out.provider) out.provider = track.provider;
    break;
  }
  return out;
}

export async function getLiriQoLyrics(videoId, options = {}) {
  return parseLiriQoResponse(await fetchLiriQoLyrics(videoId, options), options);
}

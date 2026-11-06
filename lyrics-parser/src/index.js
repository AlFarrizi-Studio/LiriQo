import { fetchLiriQoLyrics } from "./api.js";
import { parseTTML } from "./ttml.js";
import { parseQrc } from "./qrc.js";
import { parseLrcLyrics, parsePlain, stripLrcTimestamps } from "./lrc.js";
import { attachTranslations } from "./translations.js";
import { createResult, isNonEmptyString } from "./util.js";
import { parseYrc, parseMusixmatchRichsync, normalizedTrackToLyrics, getTrackAttribution } from "./provider-formats.js";
import { parseKuwoLrcx } from "./kuwo.js";
import { parseMiguMrc } from "./migu.js";
import { parsePetitLyricsWsy } from "./petitlyrics.js";
import { CANONICAL_HIGH_ORDER, CANONICAL_TEXT_ORDER, canonicalProvider, providerRank } from "./registry.js";

export { fetchLiriQoLyrics, searchLiriQoVideoId, ApiError } from "./api.js";
export { parseTTML } from "./ttml.js";
export { parseQrc, extractSongwriters } from "./qrc.js";
export { buildWordSyncedLRC } from "./words.js";
export { parseLrcLyrics, parsePlain, stripLrcTimestamps } from "./lrc.js";
export { attachTranslations, detectTranslationLanguage } from "./translations.js";
export { hasWordData, isGranularWordTiming, isRealTrack, fitsDuration, pickTrack, pickAnchorTrack } from "./select.js";
export { formatLrcTime, wordSeparator, createResult, stringSimilarity, insertInstrumentalLines,
  LIRIQO_API_BASE, LIRIQO_HOMEPAGE, isNonEmptyString } from "./util.js";
export { parseYrc, parseMusixmatchRichsync, normalizedTrackToLyrics, normalizeProviderTrack, getTrackAttribution, unitGranularity } from "./provider-formats.js";
export { parseKuwoLrcx } from "./kuwo.js";
export { parseMiguMrc, stripMiguMetaLines } from "./migu.js";
export { parsePetitLyricsWsy, classifyPetitLyricsText } from "./petitlyrics.js";
export { CANONICAL_HIGH_ORDER, CANONICAL_TEXT_ORDER, CANONICAL_PLAIN_ORDER, canonicalProvider, providerRank, PROVIDER_MIN_TIER, PROVIDER_ALIASES } from "./registry.js";

const HIGH = CANONICAL_HIGH_ORDER;
const TEXT = CANONICAL_TEXT_ORDER;
const attempt = fn => {
  try { return fn(); } catch { return null; }
};

/** Route table for already-normalized and raw payloads (order = preference). */
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
    ['krc', () => parseYrc(track.krc)],
    ['lrcx', () => parseKuwoLrcx(track.lrcx)],
    ['mrc', () => parseMiguMrc(track.mrc)],
    ['wsy', () => parsePetitLyricsWsy(track.wsy ?? track.wsyXml)],
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

/**
 * True when a parsed track carries GENUINE native granular (word/syllable/
 * character) timing: at least one sung line with validated parts, none of
 * which are phrase-only. Mere presence of `words[]` never satisfies this.
 */
function hasNativeGranular(parsed) {
  return !!parsed?.isWordSynced && parsed.lyrics.some(line =>
    !line.isCue && !line.isInstrumental &&
    line.parts?.length && line.granularity !== 'phrase' &&
    line.parts.some(part => part.words.trim() && part.durationMs > 0));
}

/** Response tracks list; falls back to a primary-only envelope. */
function responseTracks(data) {
  const tracks = Array.isArray(data?.tracks)
    ? data.tracks.filter(track => track && typeof track === 'object' && track.provider !== 'lrclib_wordsync')
    : [];
  if (tracks.length || !data?.primary || typeof data.primary !== 'object') return tracks;
  // Primary-only payload (fast partial): parse the primary track when it is
  // not already duplicated inside `tracks`.
  const primary = data.primary;
  return tracks.some(track => canonicalProvider(track.provider) === canonicalProvider(primary.provider)) ? tracks : [primary, ...tracks];
}

export function parseLiriQoResponse(data, options = {}) {
  const durationMs = Math.max(0, Math.round((Number(options.duration ?? data?.metadata?.duration) || 0) * 1000));
  const settings = { ...options, durationMs, instrumentalGapMs: options.instrumentalGapMs ?? 5000 };
  const tracks = responseTracks(data);
  const parsed = tracks.map((track, index) => ({ track, index, parsed: parseTrack(track, settings) }));
  const eligible = item => item.parsed?.lyrics?.length &&
    (!durationMs || item.parsed.lyrics.every(line => line.isInstrumental || line.startTimeMs <= durationMs + 10000));
  const out = { richsynced: null, synced: null, plain: null, provider: null,
    syncedProvider: null, plainProvider: null, route: null };
  // Selection: 1) evidence-based sync quality (native granular wins), 2)
  // canonical provider priority from the registry, 3) stable response order.
  const quality = item => hasNativeGranular(item.parsed) ? 0 : 1;
  const byPreference = (a, b) =>
    quality(a) - quality(b) ||
    providerRank(a.track.provider, HIGH) - providerRank(b.track.provider, HIGH) ||
    a.index - b.index;
  const high = parsed.filter(item => eligible(item) && item.parsed.isWordSynced).sort(byPreference)[0];
  if (high) {
    out.richsynced = resultFor(high.track, high.parsed);
    out.provider = high.track.provider;
    out.route = high.parsed.route;
  }
  // Line-sync fallback keeps the canonical TEXT order (the richsynced winner
  // above already captured the best word-tier result).
  const synced = parsed.filter(eligible).sort((a, b) =>
    providerRank(a.track.provider, TEXT) - providerRank(b.track.provider, TEXT) ||
    a.index - b.index)[0];
  if (synced) {
    const lineOnly = { ...synced.parsed, lyrics: synced.parsed.lyrics.map(({ parts, granularity, ...line }) => ({ ...line })) };
    out.synced = resultFor(synced.track, lineOnly);
    out.syncedProvider = synced.track.provider;
    if (!out.route) out.route = synced.parsed.route;
    if (!out.provider) out.provider = synced.track.provider;
  }
  for (const track of [...tracks].sort((a, b) =>
    providerRank(a.provider, CANONICAL_TEXT_ORDER) - providerRank(b.provider, CANONICAL_TEXT_ORDER))) {
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

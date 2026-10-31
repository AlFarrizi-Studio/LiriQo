/**
 * LiriQo Lyrics Parser
 * ====================
 * Standalone parser for the LiriQo API covering all 7 providers, producing
 * Better-Lyrics-compatible lyric objects:
 *
 *   Apple Music / Unison  -> TTML   (per-syllable parts, background vocals,
 *                                    singer agents, instrumentals, songwriters)
 *   QQ Music              -> QRC    (per-syllable parts, singer agents for
 *                                    duets, instrumentals, songwriters, translations)
 *   KuGou                 -> words  (per-syllable markup builder)
 *   LRCLib / NetEase / YTM-> LRC    (line sync, translations for NetEase)
 *   any provider          -> plain  (unsynced)
 *
 * Main entry: {@link getLiriQoLyrics}.
 */

import { fetchLiriQoLyrics } from "./api.js";
import {
  hasWordData,
  isRealTrack,
  pickAnchorTrack,
  pickTrack,
} from "./select.js";
import { buildWordSyncedLRC } from "./words.js";
import { parseTTML } from "./ttml.js";
import { parseQrc } from "./qrc.js";
import { parseLrcLyrics, parsePlain, stripLrcTimestamps } from "./lrc.js";
import { attachTranslations } from "./translations.js";
import { createResult, isNonEmptyString, LIRIQO_HOMEPAGE } from "./util.js";

export { fetchLiriQoLyrics, searchLiriQoVideoId } from "./api.js";
export { parseTTML } from "./ttml.js";
export { parseQrc, extractSongwriters } from "./qrc.js";
export { buildWordSyncedLRC } from "./words.js";
export { parseLrcLyrics, parsePlain, stripLrcTimestamps } from "./lrc.js";
export { attachTranslations, detectTranslationLanguage } from "./translations.js";
export {
  hasWordData,
  isGranularWordTiming,
  isRealTrack,
  fitsDuration,
  pickTrack,
  pickAnchorTrack,
} from "./select.js";
export {
  formatLrcTime,
  wordSeparator,
  createResult,
  stringSimilarity,
  insertInstrumentalLines,
  LIRIQO_API_BASE,
  LIRIQO_HOMEPAGE,
} from "./util.js";

const hasTtml = (track) => isNonEmptyString(track.ttml);
const hasQrc = (track) => isNonEmptyString(track.qrc);

/**
 * Fetch and parse the best available lyrics for a video across all LiriQo
 * providers.
 *
 * @param {string} videoId YouTube video id
 * @param {object} [options]
 * @param {number} [options.duration] song duration in SECONDS (recommended -
 *        guards against mismatched album/video versions)
 * @param {string} [options.song] song title hint (improves QRC singer filtering)
 * @param {string} [options.artist] artist hint
 * @param {string} [options.baseUrl] LiriQo API base override
 * @param {AbortSignal} [options.signal]
 * @param {number} [options.timeout=15000]
 * @param {number} [options.instrumentalGapMs=5000]
 *
 * @returns {Promise<{
 *   richsynced: {lyrics: Array, source: string, sourceHref: string, cacheAllowed: boolean,
 *                language: string|null, songwriters: string[]|null, provider: string}|null,
 *   synced:     {lyrics: Array, source: string, sourceHref: string, cacheAllowed: boolean,
 *                language: string|null, songwriters: string[]|null, provider: string}|null,
 *   plain:      {lyrics: Array, source: string, sourceHref: string, cacheAllowed: boolean,
 *                language: null, songwriters: null, provider: string}|null,
 *   provider: string|null,
 *   syncedProvider: string|null,
 *   plainProvider: string|null,
 *   route: "ttml"|"qrc"|"words"|"lrc"|"plain"|null
 * }>}
 */
export async function getLiriQoLyrics(videoId, options = {}) {
  const {
    duration = 0,
    song,
    artist,
    instrumentalGapMs = 5000,
  } = options;
  const durationMs = Math.round(1000 * (Number(duration) || 0)) || 600000;

  const data = await fetchLiriQoLyrics(videoId, options);
  const tracks = Array.isArray(data?.tracks) ? data.tracks : [];

  const out = {
    richsynced: null,
    synced: null,
    plain: null,
    provider: null,
    route: null,
  };

  // ---------------- richsynced: Jagorawi (word / syllable) candidates ----------------
  // Candidates are visited in the server's quality order (the `tracks` order).
  const candidates = tracks.filter(
    (t) =>
      t &&
      t.tier === "Jagorawi" &&
      isRealTrack(t, "Jagorawi") &&
      (hasWordData(t) || hasTtml(t) || hasQrc(t)),
  );
  const anchor = candidates[0] ? pickAnchorTrack(tracks, candidates[0], durationMs) : null;

  for (const track of candidates) {
    if (out.richsynced) break;

    if (hasTtml(track)) {
      // Apple Music / Unison: full TTML pipeline.
      const parsed = parseTTML(track.ttml, { durationMs, instrumentalGapMs });
      if (!parsed) continue;
      if (parsed.isWordSynced) {
        const result = createResult(parsed.lyrics, {
          language: parsed.language,
          songwriters: parsed.songwriters,
        });
        attachTranslations(result.lyrics, track.translation);
        out.richsynced = result;
        out.provider = track.provider;
        out.route = "ttml";
        break;
      }
      // Line-synced TTML: keep it for the synced slot, keep looking for a
      // word-synced source.
      if (!out.synced) {
        const result = createResult(parsed.lyrics, {
          language: parsed.language,
          songwriters: parsed.songwriters,
        });
        attachTranslations(result.lyrics, track.translation);
        out.synced = result;
        out.syncedProvider = track.provider;
      }
    } else if (hasQrc(track)) {
      // QQ Music: raw QRC with singer agents.
      const parsed = parseQrc(track.qrc, durationMs, { title: song, artist });
      if (parsed && parsed.lyrics.length > 0) {
        const result = createResult(parsed.lyrics, { songwriters: parsed.songwriters });
        attachTranslations(result.lyrics, track.translation);
        out.richsynced = result;
        out.provider = track.provider;
        out.route = "qrc";
        break;
      }
    } else {
      // KuGou / QQ fallback: build enhanced LRC from the word data.
      const lrc = buildWordSyncedLRC(track, anchor, durationMs, { wantWords: true });
      const lyrics = lrc ? parseLrcLyrics(lrc, durationMs, { instrumentalGapMs }) : null;
      if (lyrics && lyrics.length > 0) {
        const result = createResult(lyrics, {});
        attachTranslations(result.lyrics, track.translation);
        out.richsynced = result;
        out.provider = track.provider;
        out.route = "words";
        break;
      }
    }
  }

  // Safety net: plain builder attempt for a word track whose ttml/qrc failed.
  if (!out.richsynced && candidates[0] && !hasTtml(candidates[0]) && !hasQrc(candidates[0])) {
    const lrc = buildWordSyncedLRC(candidates[0], anchor, durationMs, { wantWords: true });
    const lyrics = lrc ? parseLrcLyrics(lrc, durationMs, { instrumentalGapMs }) : null;
    if (lyrics && lyrics.length > 0) {
      out.richsynced = createResult(lyrics, {});
      out.provider = candidates[0].provider;
      out.route = "words";
    }
  }

  // ---------------- synced: Cipali (line) candidates ----------------
  if (!out.synced) {
    const lineTrack = pickTrack(tracks, "Cipali", { durationMs, requireWordData: false, allowMisfit: false });
    if (lineTrack) {
      const lrc =
        buildWordSyncedLRC(lineTrack, anchor, durationMs, { wantWords: false }) ??
        (isNonEmptyString(lineTrack.lrc) ? lineTrack.lrc : null);
      const lyrics = lrc ? parseLrcLyrics(lrc, durationMs, { instrumentalGapMs }) : null;
      if (lyrics && lyrics.length > 0) {
        const result = createResult(lyrics, {});
        attachTranslations(result.lyrics, lineTrack.translation);
        out.synced = result;
        out.syncedProvider = lineTrack.provider;
      }
    }
    // Last resort: the first richsynced candidate's plain line LRC.
    if (!out.synced && candidates[0] && isNonEmptyString(candidates[0].lrc)) {
      const lyrics = parseLrcLyrics(candidates[0].lrc, durationMs, { instrumentalGapMs });
      if (lyrics && lyrics.length > 0) {
        const result = createResult(lyrics, {});
        attachTranslations(result.lyrics, candidates[0].translation);
        out.synced = result;
        out.syncedProvider = candidates[0].provider;
      }
    }
  }

  // ---------------- plain: Bocimi candidates ----------------
  if (!out.plain) {
    const plainTrack = pickTrack(tracks, "Bocimi", { durationMs, requireWordData: false, allowMisfit: false });
    if (plainTrack) {
      let lyrics = null;
      if (isNonEmptyString(plainTrack.plain) && plainTrack.plain.trim()) {
        lyrics = parsePlain(plainTrack.plain);
      } else if (isNonEmptyString(plainTrack.lrc)) {
        lyrics = parseLrcLyrics(plainTrack.lrc, durationMs, { instrumentalGapMs });
      }
      if (lyrics && lyrics.length > 0) {
        out.plain = createResult(lyrics, { cacheAllowed: false });
        out.plainProvider = plainTrack.provider;
      }
    }
  }

  // Trim internal bookkeeping fields.
  return out;
}

export { isNonEmptyString };

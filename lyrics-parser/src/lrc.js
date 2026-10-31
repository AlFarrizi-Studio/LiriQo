/**
 * Line-synced LRC and plain-text routes (LRCLib / NetEase / YTM / KuGou line
 * fallbacks) - LRC parsing goes through @braccato/parsers' `parseLRC`
 * (A2 word tags, [bg:] background markers, [offset:], instrumental gaps).
 */

import { parseLRC } from "@braccato/parsers";

/**
 * Parse an LRC string into lyric lines.
 * @param {string} lrcText
 * @param {number} songDurationMs
 * @param {object} [options]
 * @param {number} [options.instrumentalGapMs=5000]
 * @returns {Array<{startTimeMs, words, durationMs, parts?}>}
 */
export function parseLrcLyrics(lrcText, songDurationMs, { instrumentalGapMs = 5000 } = {}) {
  return parseLRC(lrcText, songDurationMs, { instrumentalGapMs });
}

/**
 * Parse plain (unsynced) text into zero-timed lines.
 * @param {string} plain
 * @returns {Array<{startTimeMs: number, words: string, durationMs: number}>}
 */
export function parsePlain(plain) {
  return plain.split("\n").map((line) => ({ startTimeMs: 0, words: line, durationMs: 0 }));
}

/** Strip LRC line/word tags - plain text fallback. */
export function stripLrcTimestamps(lrcText) {
  return lrcText
    .replace(/\[[^\]]*\]/g, "")
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean)
    .join("\n");
}

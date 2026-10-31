/**
 * LiriQo Lyrics Parser - shared utilities.
 *
 * Standalone helpers extracted from the Better Lyrics v3 integration of the
 * LiriQo provider: LRC time formatting, CJK-aware word separators, the
 * Better-Lyrics-compatible result wrapper, the bigram string similarity used
 * by the QRC singer filter and the instrumental-line inserter.
 */

export const LIRIQO_API_BASE = "https://api.liriqo-alfarrizi.my.id/v1";
export const LIRIQO_HOMEPAGE = "https://github.com/AlFarrizi-Studio/LiriQo";

/** CJK-ish ranges (Hangul, Kana, Ideographs, fullwidth forms). */
export const CJK_RE =
  /[\u1100-\u11FF\u2E80-\u318F\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF\uFF00-\uFF60]/;

/**
 * Format milliseconds as an LRC timestamp "mm:ss.xx" (no brackets).
 * @param {number} ms
 * @returns {string}
 */
export function formatLrcTime(ms) {
  if (!Number.isFinite(ms) || ms < 0) ms = 0;
  const minutes = Math.floor(ms / 60000);
  const seconds = (ms - 60000 * minutes) / 1000;
  return String(minutes).padStart(2, "0") + ":" + seconds.toFixed(2).padStart(5, "0");
}

/**
 * Separator inserted between two consecutive word fragments when the source
 * data does not carry the spacing itself: nothing between CJK neighbours,
 * a single space otherwise.
 * @param {string} prevText tail of the previous fragment
 * @param {string} nextText  head of the next fragment
 * @returns {string}
 */
export function wordSeparator(prevText, nextText) {
  return CJK_RE.test(prevText) || CJK_RE.test(nextText) ? "" : " ";
}

/**
 * Better Lyrics-compatible lyric result wrapper.
 * `lyrics` entries look like:
 *   { startTimeMs, words, durationMs, parts?, agent?, isInstrumental?,
 *     translations?, translation? }
 * `parts` entries look like:
 *   { startTimeMs, words, durationMs, isBackground?, explicit? }
 */
export function createResult(lyrics, options = {}) {
  const {
    language = null,
    songwriters = null,
    cacheAllowed = true,
    source = "LiriQo",
    sourceHref = LIRIQO_HOMEPAGE,
  } = options;
  return {
    lyrics,
    source,
    sourceHref,
    musicVideoSynced: false,
    cacheAllowed,
    language,
    songwriters,
  };
}

/**
 * Bigram similarity (port of string-similarity-js, MIT) used by the QRC
 * parser to reject lines that merely repeat the song title/artist.
 * @returns {number} 0..1
 */
export function stringSimilarity(str1, str2, substringLength = 2, caseSensitive = false) {
  if (!caseSensitive) {
    str1 = str1.toLowerCase();
    str2 = str2.toLowerCase();
  }
  if (str1.length < substringLength || str2.length < substringLength) return 0;
  const map = new Map();
  for (let i = 0; i < str1.length - (substringLength - 1); i++) {
    const substr = str1.substring(i, i + substringLength);
    map.set(substr, map.has(substr) ? map.get(substr) + 1 : 1);
  }
  let match = 0;
  for (let j = 0; j < str2.length - (substringLength - 1); j++) {
    const substr = str2.substring(j, j + substringLength);
    const count = map.has(substr) ? map.get(substr) : 0;
    if (count > 0) {
      map.set(substr, count - 1);
      match++;
    }
  }
  return (match * 2) / (str1.length + str2.length - (substringLength - 1) * 2);
}

/**
 * Insert instrumental marker lines into silent gaps.
 * Port of Better Lyrics' `ch` / @braccato/parsers `U` post-processor.
 * @param {Array} lines parsed lyric lines (mutated copies returned, original untouched order)
 * @param {number} songDurationMs
 * @param {number} gapMs minimum silent gap that becomes an instrumental line (default 5000)
 */
export function insertInstrumentalLines(lines, songDurationMs, gapMs = 5000) {
  if (lines.length === 0) return lines;
  const result = [];
  const instrumental = (startTimeMs, durationMs) => ({
    startTimeMs,
    durationMs,
    words: "",
    parts: [],
    isInstrumental: true,
  });
  if (lines[0].startTimeMs > gapMs) result.push(instrumental(0, lines[0].startTimeMs));
  for (let i = 0; i < lines.length; i++) {
    result.push(lines[i]);
    if (i < lines.length - 1) {
      const end = lines[i].startTimeMs + lines[i].durationMs;
      const gap = lines[i + 1].startTimeMs - end;
      if (gap > gapMs) result.push(instrumental(end, gap));
    }
  }
  const last = result[result.length - 1];
  const trailing = songDurationMs - (last.startTimeMs + last.durationMs);
  if (trailing > gapMs) result.push(instrumental(last.startTimeMs + last.durationMs, trailing));
  return result;
}

/** @returns {boolean} true when value is a non-empty string */
export function isNonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}

/**
 * Per-line translations (QQ Music / NetEase).
 *
 * LiriQo exposes `track.translation` as a plain string with one translated
 * line per lyric line. When the counts match, translations are attached to
 * each lyric line in the Better Lyrics shape:
 *   line.translations = { [lang]: text }
 *   line.translation  = { text, lang }
 */

import { CJK_RE } from "./util.js";

/**
 * Heuristic language tag for a translation string: CJK-dominant -> "zh",
 * otherwise "en".
 * @param {string} sample
 * @returns {"zh"|"en"}
 */
export function detectTranslationLanguage(sample) {
  if (!sample) return "zh";
  const cjk = (sample.match(/[\u1100-\u11FF\u2E80-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF\uFF00-\uFF60]/g) || []).length;
  return cjk * 2 > sample.length ? "zh" : "en";
}

/**
 * Attach per-line translations. Only applied when the translation line count
 * exactly matches the lyric line count (1:1 alignment is required).
 * @param {Array} lines lyric lines (mutated)
 * @param {string|null} translation raw translation string from the track
 * @param {string} [lang] defaults to detectTranslationLanguage(translation)
 */
export function attachTranslations(lines, translation, lang = detectTranslationLanguage(translation)) {
  if (typeof translation !== "string" || !translation.trim() || !Array.isArray(lines) || lines.length === 0) return;
  const translatedLines = translation.split("\n");
  if (translatedLines.length !== lines.length) return;
  lines.forEach((line, i) => {
    const text = translatedLines[i];
    if (text && text.trim()) {
      if (!line.translations) line.translations = {};
      line.translations[lang] = text;
      if (!line.translation) line.translation = { text, lang };
    }
  });
}

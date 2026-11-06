/**
 * PetitLyrics WSY parser (client-side, pure).
 *
 * PetitLyrics tier-3 payloads are XML documents with per-unit timing:
 *
 *   <line>
 *     <linestring>text</linestring>
 *     <word><wordstring>text</wordstring><starttime>1200</starttime><endtime>1500</endtime></word>
 *     ...
 *   </line>
 *
 * The production backend (termux-server/src/providers/PetitLyricsProvider.js)
 * performs the base64 payload decode and the LSY (tier-2) refusal; this
 * module consumes the decoded UTF-8 XML text only.
 *
 * Native character granularity: every unit carries its own
 * `<starttime>/<endtime>`. Japanese text without spaces is NOT treated as a
 * single word when per-unit timing exists, and no timing is fabricated when
 * only line timestamps are available (per-line fallback).
 */

import { isCueLine, isInstrumentalText, lyricLine, unitGranularity, validTime } from "./provider-formats.js";

const WORD_BLOCK_RE = /<word\b[^>]*>([\s\S]*?)<\/word\s*>/gi;

/** Decode CDATA + numeric/named XML entities (port of the server's xmlText). */
export function xmlText(value) {
  return String(value ?? "").replace(
    /<!\[CDATA\[([\s\S]*?)\]\]>|&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi,
    (raw, cdata, entity) => {
      if (cdata !== undefined) return cdata;
      const named = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
      if (entity[0] !== "#") return named[entity.toLowerCase()];
      const code = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
      return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff)
        ? String.fromCodePoint(code)
        : "\ufffd";
    },
  );
}

/** Extract and decode the text of the first `<tag>` element. */
export function tagText(xml, tag, trim = true) {
  const match = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}\\s*>`, "i").exec(xml);
  const text = match ? xmlText(match[1]) : "";
  return trim ? text.trim() : text;
}

function xmlTime(block, tag) {
  const text = tagText(block, tag);
  return /^\d+$/.test(text) && validTime(Number(text)) ? Number(text) : null;
}

/**
 * Parse a PetitLyrics WSY XML document into normalized timed lines.
 * @param {string} xml decoded WSY XML text
 * @returns {Array} normalized timed lines (native unit timing when validated)
 */
export function parsePetitLyricsWsy(xml) {
  if (typeof xml !== "string") return [];
  const lines = [];
  for (const match of xml.matchAll(/<line\b[^>]*>([\s\S]*?)<\/line\s*>/gi)) {
    const block = match[1];
    const text = tagText(block, "linestring");
    if (!text) continue;
    const units = [...block.matchAll(WORD_BLOCK_RE)].map((word) => ({
      text: tagText(word[1], "wordstring", false),
      start: xmlTime(word[1], "starttime"),
      end: xmlTime(word[1], "endtime"),
    }));
    const starts = units.map((unit) => unit.start).filter(validTime);
    if (!starts.length) continue;
    const start = Math.min(...starts);
    const ends = units.map((unit) => unit.end).filter((end) => validTime(end) && end > start);
    const words = validWsyUnits(text, start, ends.length ? Math.max(...ends) : null, units);
    lines.push({ text, start, ...(ends.length ? { end: Math.max(...ends) } : {}), ...(words ? { words, granularity: unitGranularity(words) } : {}) });
  }
  // Mirror the server's finishLines: lines without native end infer it from
  // the next line's start (or start+5000 for the last line).
  return lines
    .filter((line) => validTime(line.start))
    .sort((a, b) => a.start - b.start)
    .map((line, id, sorted) => {
      const nativeEnd = validTime(line.end) && line.end > line.start;
      return {
        ...line,
        id,
        end: nativeEnd ? line.end : sorted[id + 1]?.start ?? line.start + 5000,
        endTimingOrigin: nativeEnd ? "native" : "inferred",
      };
    });
}

/** Same evidence bar as the server: units rebuild the text, ordered, degenerate sets rejected. */
function validWsyUnits(text, start, end, units) {
  if (!units.length || !validTime(end) || end <= start) return null;
  const comparable = (value) => String(value ?? "").normalize("NFC").replace(/\s+/gu, "");
  if (comparable(units.map((unit) => unit.text).join("")) !== comparable(text)) return null;
  if (!units.every((unit, i) =>
    typeof unit.text === "string" && validTime(unit.start) && validTime(unit.end) &&
    unit.end > unit.start && unit.start >= start && unit.end <= end &&
    (!i || unit.start >= units[i - 1].start))) return null;
  const nonempty = units.filter((unit) => unit.text.trim());
  if (nonempty.length < 2 || new Set(nonempty.map((unit) => unit.start)).size < 2) return null;
  return units.map((unit, id) => ({ text: unit.text, start: unit.start, end: unit.end, id }));
}

/**
 * Classify a decoded PetitLyrics payload: 1 = LRC/LSY text, 3 = WSY XML.
 * (Mirrors the server's `classifyPayload` for already-decoded text.)
 * @param {string} text decoded payload
 * @returns {1|3}
 */
export function classifyPetitLyricsText(text) {
  const head = String(text ?? "").replace(/^\s*(?:<\?xml\b[\s\S]*?\?>)?\s*/i, "");
  return /^<wsy\b/i.test(head) ? 3 : 1;
}

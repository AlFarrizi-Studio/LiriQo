/**
 * Kuwo LRCX parser (client-side, pure).
 *
 * Kuwo ships native word/character timing inside a `[kuwo:XXX]`-keyed LRCX
 * body whose per-unit markers `<a,b[,c]>` encode timing as a function of the
 * octal key digits:
 *
 *   [kuwo:641]                                  <- octal key: k1=64, k2=1
 *   [mm:ss.mmm]text<a,b>c<a,b>c ...
 *   unit.start = lineStart + round(|a+b| / (2*k1))
 *   unit.end   = unit.start + round(|a-b| / (2*k2))
 *
 * The production backend (termux-server/src/providers/KuwoProvider.js)
 * performs the transport-side decoding (zlib inflate + `yeelion` XOR of the
 * base64 payload) via `kuwoDecodeLrcx`; this module consumes the DECODED
 * text only and never performs network access or key retrieval.
 *
 * Output is the shared normalized `timed[]` shape used by
 * `normalizedTrackToLyrics`:
 *   { text, start, end, id, granularity, isCue, isInstrumental,
 *     words: [{ text, start, end, id }] }
 *
 * Native provenance: every unit timestamp comes from the decoded lrcx
 * markers; nothing is proportional or inferred. Lines without decodable
 * units fall back to line timing; plain text is the caller's concern.
 */

import { isCueLine, isInstrumentalText, lyricLine, unitGranularity, validTime } from "./provider-formats.js";

const LRCX_KEY_RE = /^\[kuwo:([0-7]+)\]?\s*$/m;
const LRCX_LINE_RE = /^\[(\d{1,3}):(\d{2})\.(\d{1,3})\](.*)$/;
const LRCX_UNIT_RE = /<(-?\d+),(-?\d+)(?:,-?\d+)?>/g;

/**
 * Parse a decoded Kuwo LRCX body into normalized timed lines.
 * @param {string} text decoded lrcx content (`tp=content` body after inflate+XOR)
 * @returns {Array} normalized timed lines with native unit timing when available
 */
export function parseKuwoLrcx(text) {
  if (typeof text !== "string") return [];
  const key = LRCX_KEY_RE.exec(text);
  if (!key) return [];
  const value = parseInt(key[1], 8);
  const k1 = Math.floor(value / 10);
  const k2 = value % 10;
  if (!k1 || !k2) return [];
  const lines = [];
  for (const raw of text.split(/\r\n?|\n/)) {
    const match = LRCX_LINE_RE.exec(raw.trim());
    if (!match || Number(match[2]) >= 60) continue;
    const start = Number(match[1]) * 60000 + Number(match[2]) * 1000 + Number(match[3].padEnd(3, "0"));
    const body = match[4];
    const markers = [...body.matchAll(LRCX_UNIT_RE)];
    if (!markers.length) continue;
    if (markers.every((marker) => Number(marker[1]) === 0 && Number(marker[2]) === 0)) continue;
    const lineText = body.replace(LRCX_UNIT_RE, "");
    if (!lineText.trim()) continue;
    let invalid = false;
    let previous = start;
    const units = [];
    for (const [index, marker] of markers.entries()) {
      const a = Number(marker[1]);
      const b = Number(marker[2]);
      const unitStart = start + Math.round(Math.abs(a + b) / (2 * k1));
      const unitEnd = unitStart + Math.round(Math.abs(a - b) / (2 * k2));
      const unitText = body.slice(marker.index + marker[0].length, markers[index + 1]?.index ?? body.length);
      if (!validTime(unitStart) || !validTime(unitEnd) || unitEnd < unitStart || unitStart < start || unitStart < previous) {
        invalid = true;
        break;
      }
      previous = unitStart;
      units.push({ text: unitText, start: unitStart, end: unitEnd });
    }
    if (invalid) continue;
    const end = Math.max(start, ...units.map((unit) => unit.end));
    if (!validTime(start) || !validTime(end) || end <= start) continue;
    const words = validKuwoUnits(lineText, start, end, units);
    lines.push({ ...lyricLine(lineText, start, end, lines.length, words), ...(words ? { granularity: unitGranularity(words) } : {}) });
  }
  return lines.sort((a, b) => a.start - b.start).map((line, id) => ({ ...line, id }));
}

/** Same validation the server applies (validatedUnits): units must rebuild the line. */
function validKuwoUnits(text, start, end, units) {
  if (!units.length) return null;
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

export { isInstrumentalText };

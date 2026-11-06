/**
 * Migu MRC parser (client-side, pure).
 *
 * Migu ships native word/character timing in an MRC body laid out like QRC:
 *
 *   [lineStartMs,lineDurationMs]unit(marker)unit(marker)...unit(marker)
 *
 * where each `(startMs,durationMs)` marker times the unit text that PRECEDES
 * it. The production backend (termux-server/src/providers/MiguProvider.js)
 * performs the transport-side XXTEA decryption + UTF-16LE decoding of the
 * hex payload via `miguDecryptMRC`; this module consumes the DECRYPTED text
 * only. It never performs network access or key derivation.
 *
 * Output is the shared normalized `timed[]` shape with native unit timing.
 * Migu unit markers carry ABSOLUTE millisecond starts (unlike Kuwo's key
 * arithmetic); unit text precedes its marker.
 */

import { isCueLine, isInstrumentalText, lyricLine, unitGranularity, validTime } from "./provider-formats.js";

const MRC_LINE_RE = /^\[(\d+),(\d+)\](.*)$/;
const MRC_UNIT_RE = /\((\d+),(\d+)(?:,\d+)?\)/g;

/**
 * Parse a decrypted Migu MRC body into normalized timed lines.
 * @param {string} text decrypted MRC content (UTF-16LE decoded by the backend)
 * @returns {Array} normalized timed lines with native unit timing when available
 */
export function parseMiguMrc(text) {
  if (typeof text !== "string") return [];
  const lines = [];
  for (const raw of text.split(/\r\n?|\n/)) {
    const match = MRC_LINE_RE.exec(raw.trim());
    if (!match) continue;
    const start = Number(match[1]);
    const end = start + Number(match[2]);
    if (!validTime(start) || !validTime(end) || end <= start) continue;
    const body = match[3];
    const markers = [...body.matchAll(MRC_UNIT_RE)];
    if (!markers.length) continue;
    let previous = 0;
    const units = markers.map((marker) => {
      const unitText = body.slice(previous, marker.index);
      previous = marker.index + marker[0].length;
      const unitStart = Number(marker[1]);
      return { text: unitText, start: unitStart, end: unitStart + Number(marker[2]) };
    });
    const lineText = body.replace(MRC_UNIT_RE, "");
    if (!lineText.trim()) continue;
    const words = validMiguUnits(lineText, start, end, units);
    lines.push({ ...lyricLine(lineText, start, end, lines.length, words), ...(words ? { granularity: unitGranularity(words) } : {}) });
  }
  return lines.sort((a, b) => a.start - b.start).map((line, id) => ({ ...line, id }));
}

/** Units must rebuild the line text and stay ordered within the line window. */
function validMiguUnits(text, start, end, units) {
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

/**
 * Strip Migu metadata header lines ("歌曲名:", "歌手名:", "@migu music@").
 * Mirrors the server-side `miguStripMetaLines` preprocessing.
 * @param {string} text raw lyric body (LRC or MRC)
 * @returns {string}
 */
export function stripMiguMetaLines(text) {
  return String(text ?? "")
    .split(/\r\n?|\n/)
    .filter((line) => {
      const clean = line.replace(/\[\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?\]/g, "").trim();
      return !/^(歌曲名|歌手名)(\s|[:：]|$)|^@migu music@$/i.test(clean);
    })
    .join("\n");
}

/**
 * TTML route (Apple Music / Unison) - wraps @braccato/parsers.
 *
 * Produces the full Better Lyrics structure:
 *   - per-syllable `parts` with `isBackground` (background vocals)
 *   - `agent` per line (duet singers v1/v2, group v1000)
 *   - `isInstrumental` lines for silent gaps
 *   - `songwriters`, `language`, translations and romanizations from TTML
 *     metadata when present
 *
 * @braccato/parsers is vendored under /node_modules (offline, zero install).
 */

import { parseTTMLContent, TTMLParser } from "@braccato/parsers";

/**
 * @param {string} ttml raw TTML document
 * @param {object} [options]
 * @param {number} [options.durationMs] song duration, used for the last line
 *        and trailing instrumental markers
 * @param {number} [options.instrumentalGapMs=5000]
 * @returns {{lyrics: Array, isWordSynced: boolean, language: string|null,
 *            songwriters: string[]}|null} null when nothing timed parsed
 */
export function parseTTML(ttml, { durationMs = 0, instrumentalGapMs = 5000 } = {}) {
  const { lyrics, isWordSynced, language } = parseTTMLContent(ttml, {
    songDurationMs: durationMs,
    instrumentalGapMs,
  });
  if (!lyrics || lyrics.length === 0) return null;
  let songwriters = [];
  try {
    songwriters = TTMLParser.metadata(ttml).songwriters ?? [];
  } catch {
    songwriters = [];
  }
  return { lyrics, isWordSynced, language: language ?? null, songwriters };
}

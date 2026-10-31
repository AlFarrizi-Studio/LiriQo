/**
 * Word/syllable LRC builder for LiriQo tracks.
 *
 * Builds a Better-Lyrics-compatible enhanced LRC string
 * (`[mm:ss.xx]<mm:ss.xx>word <mm:ss.xx>word ...`) from a track's word data:
 *
 * 1. native word-tagged LRC      -> used as-is (Apple Music style A2 LRC)
 * 2. embedded `timed[i].words`   -> reconstructed against the line text
 * 3. top-level `words[lineId]`   -> same reconstruction
 * 4. granular (one timed entry per word) -> grouped against `plain` and
 *    re-distributed over the TRUE line windows taken from an anchor
 *    line-synced track (fixes LiriQo's rigid start+5000ms windows)
 *
 * CJK lyrics never get artificial spaces; spacing always comes from the
 * source line text.
 */

import { CJK_RE, formatLrcTime, wordSeparator } from "./util.js";
import { isGranularWordTiming } from "./select.js";

/**
 * Build the enhanced LRC for a track.
 * @param {object} track LiriQo track
 * @param {object|null} anchorTrack line-synced (Cipali) track used as the
 *        timing authority for granular re-distribution
 * @param {number} songDurationMs
 * @param {object} [options]
 * @param {boolean} [options.wantWords=true] when true, a line-level LRC
 *        (without word tags) does NOT short-circuit - word markup is built
 *        from the word data instead
 * @returns {string|null} enhanced LRC text, or null when nothing usable
 */
export function buildWordSyncedLRC(track, anchorTrack, songDurationMs, { wantWords = true } = {}) {
  if (typeof track.lrc === "string" && track.lrc.length > 0 && (!wantWords || track.lrc.includes("<"))) {
    return track.lrc;
  }
  const timed = Array.isArray(track.timed) ? track.timed : null;
  if (!timed || timed.length === 0) return null;
  const topWords = Array.isArray(track.words) ? track.words : null;
  const hasTopWords = topWords && topWords.some((w) => Array.isArray(w) && w.length > 0);
  const hasEmbeddedWords = timed.some((l) => !!l && Array.isArray(l.words) && l.words.length > 0);

  const out = [];

  // ---------- granular (one timed entry per word) ----------
  if (!hasTopWords && !hasEmbeddedWords && isGranularWordTiming(timed)) {
    const words = timed.filter((w) => w && typeof w.text === "string" && w.text.trim());
    let groups = null;
    let anchorLines = null;
    if (anchorTrack && Array.isArray(anchorTrack.timed)) {
      anchorLines = anchorTrack.timed.filter((x) => x && typeof x.text === "string" && x.text.trim());
    }
    if (anchorLines && anchorLines.length > 1) {
      // Walk the flat word list against the anchor's real line texts; each
      // anchor line becomes one group with a true [start, nextStart) window.
      const windows = anchorLines.map((x, idx) => ({
        text: x.text,
        start: Number(x.start) || 0,
        end: idx + 1 < anchorLines.length ? Number(anchorLines[idx + 1].start) || 0 : Number(songDurationMs) || 0,
      }));
      groups = [];
      let gi = 0;
      let pos = 0;
      let current = { words: [], win: windows[0] };
      groups.push(current);
      for (const w of words) {
        let placed = false;
        let guard = 0;
        while (gi < windows.length && !placed && guard <= words.length) {
          guard++;
          const lineText = windows[gi].text;
          const idx = lineText.indexOf(w.text, pos);
          if (idx >= 0) {
            current.words.push({ gap: lineText.slice(pos, idx), text: w.text, start: 0, end: 0 });
            pos = idx + w.text.length;
            placed = true;
          } else {
            current.tail = lineText.slice(pos);
            gi++;
            pos = 0;
            if (gi < windows.length) {
              current = { words: [], win: windows[gi] };
              groups.push(current);
            }
          }
        }
        if (!placed) current.words.push({ gap: null, text: w.text, start: 0, end: 0 });
      }
    } else {
      // No anchor: group via start-time resets, spacing from `plain`.
      const plain = typeof track.plain === "string" && track.plain.length > 0 ? track.plain : null;
      if (plain) {
        groups = [];
        let current = { words: [] };
        groups.push(current);
        let pos = 0;
        for (const w of words) {
          const idx = plain.indexOf(w.text, pos);
          if (idx >= 0) {
            const gap = plain.slice(pos, idx);
            const newlines = gap.split("\n").length - 1;
            for (let x = 0; x < newlines; x++) {
              current = { words: [] };
              groups.push(current);
            }
            current.words.push({
              gap: newlines > 0 ? "" : gap,
              text: w.text,
              start: Number.isFinite(w.start) ? w.start : 0,
              end: Number.isFinite(w.end) ? w.end : 0,
            });
            pos = idx + w.text.length;
          } else {
            current.words.push({ gap: null, text: w.text, start: Number.isFinite(w.start) ? w.start : 0, end: Number.isFinite(w.end) ? w.end : 0 });
          }
        }
      } else {
        groups = [];
        let current = null;
        let prevStart = 0;
        for (const w of words) {
          if (!current || Number(w.start) < prevStart) {
            current = { words: [] };
            groups.push(current);
          }
          prevStart = Number(w.start) || 0;
          current.words.push({
            gap: null,
            text: w.text,
            start: Number(w.start) || 0,
            end: Number.isFinite(w.end) ? w.end : 0,
          });
        }
      }
    }

    for (const group of groups) {
      if (!group.words.length) continue;
      const win = group.win;
      if (win && win.end > win.start) {
        // Re-distribute the words proportionally (by length) over the TRUE
        // line window - fixes the rigid start+5000ms windows.
        let chars = 0;
        for (const w of group.words) chars += w.text.length + 1;
        chars = chars || 1;
        const span = win.end - win.start;
        let cursor = win.start;
        for (const w of group.words) {
          const dur = (span * (w.text.length + 1)) / chars;
          w.start = Math.round(cursor);
          w.end = Math.round(Math.min(cursor + dur, win.end));
          cursor += dur;
        }
      }
      let markup = `[${formatLrcTime(group.words[0].start || 0)}]`;
      let last = null;
      for (const w of group.words) {
        let gap = w.gap;
        if (gap == null) gap = last ? wordSeparator((last.text || "").slice(-1), (w.text || "").slice(0, 1)) : "";
        markup += gap + `<${formatLrcTime(w.start || 0)}>${w.text}`;
        last = w;
      }
      if (last && group.tail) markup += group.tail;
      out.push(markup);
    }
    return out.length > 0 ? out.join("\n") : null;
  }

  // ---------- embedded / top-level words per line ----------
  for (const line of timed) {
    if (!line || typeof line.text !== "string" || !line.text.trim()) continue;
    const words =
      topWords && Array.isArray(topWords[line.id])
        ? topWords[line.id]
        : Array.isArray(line.words) && line.words.length > 0
          ? line.words
          : null;
    if (words && words.length > 0) {
      const fragments = words.filter((w) => w && typeof w.text === "string" && w.text.trim());
      const records = [];
      let pos = 0;
      let aligned = true;
      for (const w of fragments) {
        const idx = line.text.indexOf(w.text, pos);
        if (idx >= 0) {
          records.push({ gap: line.text.slice(pos, idx), text: w.text, start: Number.isFinite(w.start) ? w.start : 0 });
          pos = idx + w.text.length;
        } else {
          records.push({ gap: null, text: w.text, start: Number.isFinite(w.start) ? w.start : 0 });
          aligned = false;
        }
      }
      if (records.length > 0) {
        if (!aligned) records.forEach((r) => (r.gap = null));
        if (aligned && pos < line.text.length) records[records.length - 1].tail = line.text.slice(pos);
        let markup = `[${formatLrcTime(line.start || 0)}]`;
        let last = null;
        for (const r of records) {
          let gap = r.gap;
          if (gap == null) {
            gap = last
              ? wordSeparator((last.text + (last.tail || "")).slice(-1), (r.text || "").slice(0, 1))
              : "";
          }
          markup += gap + `<${formatLrcTime(r.start || 0)}>${r.text}${r.tail || ""}`;
          last = r;
        }
        if (Number.isFinite(line.end) && line.end > 0) markup += ` <${formatLrcTime(line.end)}>`;
        out.push(markup);
        continue;
      }
    }
    // no word data for this line - plain line markup
    out.push(`[${formatLrcTime(line.start || 0)}]${line.text}`);
  }
  return out.length > 0 ? out.join("\n") : null;
}

export { CJK_RE };

/**
 * Track selection helpers for LiriQo `/lyrics` responses.
 *
 * A LiriQo track looks like:
 * {
 *   provider: "apple_music_liriqo" | "unison_community" | "qq_portato"
 *           | "kugou_legato" | "lrclib" | "netease" | "ytm_line",
 *   syncLevel: "syllable" | "word" | "line" | "plain" | ...,
 *   tier: "Jagorawi" (word/syllable) | "Cipali" (line) | "Bocimi" (plain),
 *   timed: [{ text, start, end, id, words?, agent?, songPart?, isCue?, isInstrumental? }],
 *   words?: [[{text,start,end,id}]],      // per-line word timing (top level)
 *   lrc?: string, ttml?: string, qrc?: string, krc?: string,
 *   plain?: string, translation?: string, romanization?: string
 * }
 */

import { CJK_RE } from "./util.js";

/**
 * Detect "granular" word data: the `timed` array holds ONE entry per word
 * (proportional distribution) instead of one per line. Recognised by at least
 * one start-time reset while walking the entries.
 * @param {Array|null} timed
 * @returns {boolean}
 */
export function isGranularWordTiming(timed) {
  if (!Array.isArray(timed) || timed.length < 4) return false;
  for (let i = 1; i < timed.length; i++) {
    if (Number(timed[i] && timed[i].start) < Number(timed[i - 1] && timed[i - 1].start)) return true;
  }
  return false;
}

/**
 * Does the track carry usable word/syllable data?
 * - an LRC string that contains word tags `<mm:ss.xx>`
 * - embedded `timed[i].words` arrays
 * - top-level `words[lineId]` arrays
 * - granular (one-entry-per-word) `timed`
 */
export function hasWordData(track) {
  if (typeof track.lrc === "string" && track.lrc.includes("<")) return true;
  const topWords = Array.isArray(track.words) ? track.words : null;
  return !!(
    Array.isArray(track.timed) &&
    (track.timed.some(
      (line) =>
        !!line &&
        ((Array.isArray(line.words) && line.words.length > 0) ||
          (!!topWords && Array.isArray(topWords[line.id]) && topWords[line.id].length > 0)),
    ) || isGranularWordTiming(track.timed))
  );
}

/**
 * Does the track's timing fit the video duration? The last line must not
 * start more than 10s after the video ends (guards against mismatched
 * album/video versions).
 */
export function fitsDuration(track, durationMs) {
  if (!Number.isFinite(durationMs) || durationMs <= 0 || !Array.isArray(track.timed)) return true;
  return track.timed.every(line => !Number.isFinite(line?.start) || line.start <= durationMs + 10000);
}

/**
 * Is the track a real, non-degenerate lyric payload?
 * (LiriQo occasionally leaks 1-line "probe" placeholders - reject those.)
 * @param {object} track
 * @param {"Jagorawi"|"Cipali"|"Bocimi"} tier
 */
export function isRealTrack(track, tier) {
  if (!track || typeof track !== 'object') return false;
  const timed = Array.isArray(track.timed) ? track.timed : [];
  if (tier === 'Bocimi') {
    return typeof track.plain === 'string' && !!track.plain.trim() ||
      timed.some(line => typeof line?.text === 'string' && !!line.text.trim()) ||
      typeof track.lrc === 'string' && !!track.lrc.trim();
  }
  if (timed.some(line => typeof line?.text === 'string' && !!line.text.trim() &&
      Number.isFinite(line.start) && line.start >= 0 && Number.isFinite(line.end) && line.end > line.start)) return true;
  return ['ttml', 'qrc', 'yrc', 'lrc'].some(key => typeof track[key] === 'string' && !!track[key].trim()) ||
    Array.isArray(track.richsync) && track.richsync.length > 0 || typeof track.richsync === 'string' && !!track.richsync.trim();
}

/**
 * Pick the best track of a tier, honouring the server's quality order
 * (the `tracks` array order). When `requireWordData` is set the track must
 * carry word/syllable data. `allowMisfit` controls whether a track whose
 * timing does not fit the video duration may still be returned.
 */
export function pickTrack(tracks, tier, { requireWordData = false, durationMs = 0, allowMisfit = true } = {}) {
  const candidates = tracks.filter(
    (t) =>
      !!t &&
      t.tier === tier &&
      isRealTrack(t, tier) &&
      (!requireWordData || t.syncLevel === "syllable" || t.syncLevel === "word") &&
      (!requireWordData || hasWordData(t)),
  );
  return candidates.find((t) => fitsDuration(t, durationMs)) ?? (allowMisfit ? (candidates[0] ?? null) : null);
}

/**
 * Pick an "anchor" track for word re-distribution: a line-synced (Cipali)
 * track of the same song whose plain text matches the word track. Its real
 * line timestamps define the true per-line time windows.
 */
export function pickAnchorTrack(tracks, wordTrack, durationMs) {
  const normalized = (t) =>
    typeof t.plain === "string" ? t.plain.replace(/\s+/g, " ").trim().toLowerCase() : "";
  const candidates = tracks.filter(
    (t) => t && t !== wordTrack && t.tier === "Cipali" && isRealTrack(t, "Cipali") && fitsDuration(t, durationMs),
  );
  const wanted = normalized(wordTrack);
  const match = candidates.find((t) => {
    const a = normalized(t);
    return wanted && a === wanted;
  });
  return match ?? candidates[0] ?? null;
}

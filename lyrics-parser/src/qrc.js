/**
 * QQ Music QRC parser with singer/agent detection.
 *
 * Port of the Better Lyrics Portato stream parser (verified against live
 * LiriQo data). A raw QRC payload looks like:
 *
 *   [start,duration]line text syllable(time,duration)syllable(time,duration)...
 *   [start,duration]singer:v1            <- singer markers become agents
 *
 * The parser:
 *  - extracts the `LyricContent="..."` payload
 *  - detects and strips singer labels ("演唱：v1" style) -> `agent: "v1"|"v2"|"v1000"`
 *  - rejects metadata lines (title/artist repeats, uniform-duration probes)
 *  - keeps per-syllable `parts` for karaoke highlighting
 *  - inserts instrumental lines into silent gaps > 5s
 *  - extracts songwriters from the labelled metadata lines
 */

import {
  CJK_RE,
  insertInstrumentalLines,
  stringSimilarity,
} from "./util.js";

/** Songwriter role keywords (CJK + latin). */
export const ROLE_KEYWORDS = [
  "词", "詞", "作词", "作詞", "曲", "作曲", "词曲", "詞曲", "作词作曲", "作詞作曲",
  "writtenby", "lyricsby", "composedby", "lyricist", "composer",
];

/** Extended role keywords that also count as a singer-ish label. */
export const EXTENDED_ROLE_KEYWORDS = [
  ...ROLE_KEYWORDS,
  "编曲", "編曲", "和声", "和聲", "混音", "吉他", "制作人", "製作人", "演唱", "原唱",
  "翻唱", "后期", "後期", "和音", "录音", "錄音", "策划", "策劃", "伴奏", "美工",
  "海报", "海報", "旁白", "producedby", "arrangedby", "mixing", "mastering",
  "vocal", "vocals", "guitar", "bass", "drums", "producer", "arranger",
];

/** Single-character role words. */
const SHORT_ROLE_WORDS = ["词", "詞", "曲", "声", "聲", "音"];

/** Name separators inside songwriter lists. */
const NAME_SPLIT_RE = /[/&、,，・·]/;
const SONGWRITER_SPLIT_RE = /[/、，,]/;
/** "label:rest" line matcher. */
const LABEL_RE = /^([^:：]+)[:：]\s*(.+)$/;
/** Non-latin characters kept when normalising a singer label. */
const LABEL_NORMALIZE_RE = /[^a-z0-9　-鿿가-힯]/g;
/** QRC content payload wrapper. */
const QRC_CONTENT_RE = /LyricContent="([\s\S]*?)"\s*(?:\/?>|[a-zA-Z]+=)/;
/** QRC per-syllable tuple. */
const QRC_SYLLABLE_RE = /\((\d+),(\d+)\)/g;

/** Lowercase + strip spaces (label normalisation). */
function normalizeLabel(label) {
  return label.toLowerCase().replace(/\s+/g, "");
}

/** Short CJK role word test. */
function isShortRoleWord(word) {
  return EXTENDED_ROLE_KEYWORDS.includes(word) || (word.length <= 4 && SHORT_ROLE_WORDS.some((x) => word.endsWith(x)));
}

/** Split a label into its non-latin segments. */
function splitNonLatin(label) {
  return label
    .replace(/[a-z]+/g, "")
    .split(NAME_SPLIT_RE)
    .filter(Boolean);
}

/**
 * Is the label a singer/role label (as opposed to lyric content)?
 * Port of the extension's singer-label validity check.
 */
export function isSingerLabel(label) {
  const normalized = normalizeLabel(label);
  if (EXTENDED_ROLE_KEYWORDS.includes(normalized)) return true;
  const segments = splitNonLatin(normalized);
  return segments.length > 0 && segments.every(isShortRoleWord);
}

/** Split a songwriter name list into individual names. */
function splitSongwriterNames(text) {
  return text
    .split(SONGWRITER_SPLIT_RE)
    .map((x) => x.trim())
    .filter(Boolean);
}

/** Extract songwriters from "role: name1、name2" lines inside a QRC. */
export function extractSongwriters(rawQrc) {
  const names = [];
  for (const line of extractQrcContent(rawQrc).split("\n")) {
    const header = parseQrcLine(line.trim());
    if (!header) continue;
    const text = parseQrcSyllables(header.rest)
      .map((s) => s.text)
      .join("");
    const m = text.trim().match(LABEL_RE);
    if (!m) continue;
    const label = m[1];
    const role = normalizeLabel(label);
    if (
      ROLE_KEYWORDS.includes(role) ||
      (isSingerLabel(label) && splitNonLatin(role).some((x) => ROLE_KEYWORDS.includes(x)))
    ) {
      names.push(...splitSongwriterNames(m[2]));
    }
  }
  const unique = new Set();
  for (const name of names) {
    const trimmed = name.trim();
    if (trimmed) unique.add(trimmed);
  }
  return [...unique];
}

/** Extract the QRC content payload from `LyricContent="..."`. */
export function extractQrcContent(rawQrc) {
  const m = rawQrc.match(QRC_CONTENT_RE);
  return m ? m[1].replace(/"/g, '"').replace(/&/g, "&") : rawQrc;
}

/** Parse a `[start,duration]rest` QRC line header. */
export function parseQrcLine(line) {
  if (line[0] !== "[") return null;
  const close = line.indexOf("]");
  if (close === -1) return null;
  const comma = line.indexOf(",", 1);
  if (comma === -1 || comma > close) return null;
  const startTime = Number.parseInt(line.slice(1, comma), 10);
  const duration = Number.parseInt(line.slice(comma + 1, close), 10);
  if (Number.isNaN(startTime) || Number.isNaN(duration)) return null;
  return { startTime, duration, rest: line.slice(close + 1) };
}

/** Parse `(time,duration)text` syllable tuples. */
export function parseQrcSyllables(rest) {
  const syllables = [];
  let cursor = 0;
  for (const m of rest.matchAll(QRC_SYLLABLE_RE)) {
    syllables.push({
      text: rest.slice(cursor, m.index),
      time: Number.parseInt(m[1], 10),
      duration: Number.parseInt(m[2], 10),
    });
    cursor = m.index + m[0].length;
  }
  return syllables;
}

/** Assign (or reuse) a singer alias: 合/ALL/合唱 -> group "v1000", else "vN". */
function assignSinger(label, line, state) {
  if (!state.aliases[label]) {
    const upper = label.toUpperCase();
    const isGroup = upper === "合" || upper === "ALL" || upper === "合唱";
    state.aliases[label] = isGroup ? "v1000" : `v${state.nextVoiceId++}`;
  }
  line.agent = state.aliases[label];
}

/** Recompute line time/duration from its first/last syllable. */
function finalizeLineTiming(line) {
  if (line.syllables.length > 0) {
    const first = line.syllables[0];
    const last = line.syllables[line.syllables.length - 1];
    line.time = first.time;
    line.duration = last.time + last.duration - first.time;
  }
}

/**
 * Per-line QRC state machine: rejects metadata lines, detects singer labels
 * and splits them off the lyric content. Port of the extension's parser.
 * @returns {boolean} true when the line is real lyric content
 */
function processQrcLine(line, state, isEarlyLine, meta) {
  if (line.syllables.length === 0) {
    if (state.currentSinger) line.agent = state.currentSinger;
    return true;
  }
  if (isEarlyLine) {
    if (meta && (meta.title || meta.artist)) {
      const clean = (x) => x.toLowerCase().replace(LABEL_NORMALIZE_RE, "");
      const text = clean(line.text);
      const title = clean(meta.title ?? "");
      const artist = clean(meta.artist ?? "");
      if (
        (title && text.includes(title) && artist && text.includes(artist)) ||
        (title && text.includes(title) && !artist && text.length < title.length + 15) ||
        (artist && text === artist)
      ) {
        return false;
      }
      const combined = `${meta.title ?? ""} ${meta.artist ?? ""}`;
      if (stringSimilarity(line.text, combined) > 0.5) return false;
    }
    if (
      line.syllables.length > 2 &&
      line.syllables.every((s, _idx, all) => Math.abs(s.duration - all[0].duration) < 10)
    ) {
      return false;
    }
  }
  if (state.currentSinger) line.agent = state.currentSinger;

  // Accumulate syllables to inspect a possible "label:content" header.
  let probe = "";
  let consumed = 0;
  for (const syllable of line.syllables) {
    probe += syllable.text;
    consumed++;
    if (probe.includes(":") || probe.includes("：")) break;
    if (probe.length > 40) return true;
  }
  const whole = probe.match(/^([^:：]+)\s*[:：]\s*$/);
  if (whole) {
    const label = whole[1].trim();
    if (!isSingerLabel(label)) return true;
    if (label.length > 30) return true;
    // singer label on its own line: strip it, remember the singer
    line.syllables = line.syllables.slice(consumed);
    line.text = line.text.substring(probe.length);
    assignSinger(label, line, state);
    state.currentSinger = state.aliases[label];
    finalizeLineTiming(line);
    return true;
  }
  const mixed = probe.match(/^([^:：]+)\s*[:：]\s*([\s\S]*)$/);
  if (!mixed) return true;
  const label = mixed[1].trim();
  if (isSingerLabel(label)) return false;
  if (label.length > 20) return true;
  const restText = mixed[2] || "";
  const idx = consumed - 1;
  const syllable = line.syllables[idx];
  const inline = syllable.text.match(/[:：]\s*([\s\S]*)$/);
  const inlineRest = inline ? inline[1] : "";
  if (inlineRest.length > 0) {
    syllable.text = inlineRest;
    line.syllables = line.syllables.slice(idx);
  } else {
    line.syllables = line.syllables.slice(consumed);
  }
  assignSinger(label, line, state);
  state.currentSinger = state.aliases[label];
  line.text = restText;
  finalizeLineTiming(line);
  return true;
}

/**
 * Parse a raw QQ Music QRC payload into Better-Lyrics-compatible lines.
 * @param {string} rawQrc
 * @param {number} songDurationMs
 * @param {{title?: string, artist?: string}} [meta]
 * @returns {{lyrics: Array, songwriters: string[]}|null}
 */
export function parseQrc(rawQrc, songDurationMs, meta = {}) {
  if (!rawQrc) return null;
  const content = extractQrcContent(rawQrc);
  const lines = [];
  const state = { aliases: {}, nextVoiceId: 1, currentSinger: null };
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || /^[a-zA-Z]+:/.test(line)) continue;
    const header = parseQrcLine(line);
    if (!header) continue;
    const syllables = parseQrcSyllables(header.rest);
    const lineObj = {
      time: header.startTime,
      duration: header.duration,
      text: syllables.map((s) => s.text).join(""),
      syllables,
      agent: null,
    };
    if (processQrcLine(lineObj, state, lines.length < 5, meta)) lines.push(lineObj);
  }
  if (lines.length === 0) return null;
  const songwriters = extractSongwriters(rawQrc);
  const lyrics = insertInstrumentalLines(
    lines.map((line, i) => {
      const parts = line.syllables.map((s) => ({
        startTimeMs: s.time,
        words: s.text,
        durationMs: s.duration,
      }));
      let duration = line.duration;
      if (duration === 0 && i + 1 < lines.length) duration = Math.max(lines[i + 1].time - line.time, 0);
      else if (duration === 0) duration = songDurationMs - line.time;
      if (parts.length > 0) {
        const last = parts[parts.length - 1];
        if (last.durationMs === 0) {
          last.durationMs =
            i + 1 < lines.length ? Math.max(lines[i + 1].time - last.startTimeMs, 0) : songDurationMs - last.startTimeMs;
        }
      }
      return {
        startTimeMs: line.time,
        words: line.text,
        durationMs: duration,
        parts: parts.length > 0 ? parts : undefined,
        agent: line.agent ?? undefined,
      };
    }),
    songDurationMs,
  );
  return { lyrics, songwriters };
}

export { CJK_RE };

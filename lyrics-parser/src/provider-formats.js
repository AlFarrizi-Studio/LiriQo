const CREDIT_LABELS = new Set([
  "词", "作词", "曲", "作曲", "词曲", "编曲", "和声", "合声", "混音", "吉他", "制作人", "演唱", "原唱", "翻唱",
  "后期", "和音", "录音", "策划", "伴奏", "美工", "海报", "旁白", "贝斯", "鼓手", "键盘", "弦乐", "钢琴",
  "配唱", "配唱制作人", "音乐出品", "出品人", "音源", "缩混", "录音师", "混音师", "母带师", "发行", "宣发",
  "作詞", "編曲", "詞曲", "填詞", "譜曲", "和聲", "錄音", "製作人", "發行", "監製", "作编曲",
  "writtenby", "producedby", "composedby", "arrangedby", "mixing", "mastering", "vocal", "vocals",
  "guitar", "bass", "drums", "percussion", "producer", "lyricist", "composer", "arranger", "lyricsby",
  "synths", "pads", "piano", "electricguitars", "programmedhorns", "programmedstrings", "livehorns",
  "recordingengineer", "vocalproduced", "vocalengineer", "mixengineer", "masteringengineer", "synthbass", "bassguitar", "drumsprogramming",
]);
const CREDIT_LABEL_RE = /^(作词|作詞|作曲|编曲|編曲|词曲|填词|填詞|谱曲|譜曲|词：|曲：|监制|監製|出品|制作|製作|和声|和聲|合声|伴唱|混音|混缩|母带|录音|錄音|人声|吉他|贝斯|鼓|键盘|弦乐|钢琴|发行|發行|企划|统筹|翻译|鸣谢|特别感谢|lyrics\s*by|written\s*by|composed\s*by|produced\s*by|arranged\s*by|mixed\s*by|mastered\s*by|vocal[s]?\s*(produced|engineer|by)|guitar[s]?\s*by|bass\s*(guitar\s*)?by|drums\s*by|programming\s*by|engineered\s*by|recorded\s*by|percussion\s*by|synth[s]?\s*by|pads\s*by|live\s*horns|background\s*vocals|remix|producer|director|performed\s*by|co\-?written|co\-?produced)/i;
const CUE_PATTERN = "vocal|vocals|background\\s*vocal|background\\s*vocals|bg\\s*vocal|bg\\s*vocals|instrumental|interlude|inst|chorus|verse|bridge|intro|outro|hook|pre-chorus|post-chorus|refrain|breakdown|build-up|build up|drop|spontaneous|ad-lib|adlib|spoken|rap|whisper|narration|dialogue|lead|backing";
const CUE_RE = new RegExp(`^(${CUE_PATTERN})\\s*\\d*$`, "i");
const CUE_KEYWORD_RE = /\b(vocal|vocals|bg vocal|bg vocals|background vocal|background vocals|instrumental|interlude|inst|chorus|verse|bridge|intro|outro|hook|pre-chorus|post-chorus|refrain|breakdown|build-up|build up|drop|spontaneous|ad-lib|adlib|spoken|rap|whisper|narration|dialogue|lead|backing)\b/i;
const PUNCTUATION_RE = /[()\[\]{},.!?;:'"<>/\\|~`@#$%^&*_+=]/g;

function validTime(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function isCueLine(text) {
  return !/[：:]/.test(text) && CUE_RE.test(text.trim().replace(PUNCTUATION_RE, "").trim());
}

function isInstrumentalText(text) {
  return /^(instrumental|interlude|inst)\s*$/i.test(text.trim().replace(PUNCTUATION_RE, "").trim());
}

function isJunkLine(text) {
  const t = text.trim();
  if (!t) return true;
  if (isCueLine(t)) return false;
  if (/^(\/\/+|——+|···+|…+|\.{3,})$/i.test(t)) return true;
  if (/^纯音乐/i.test(t) || /纯音乐.*欣赏/.test(t)) return true;
  if (/翻译.*提供|译文.*提供|translation provided/i.test(t) && t.length < 40) return true;
  if (/^(QQ音乐|腾讯|.*音乐).*(著作权|版权|版权所有|所有权利)/.test(t) && t.length < 60) return true;
  if (/^.{0,60}\s[-–—]\s.{0,60}$/.test(t) && !/[。．,!?？!：:]/.test(t) && !/\s[.．]\s/.test(t) && t.split(/\s+/).length <= 12 && !CUE_KEYWORD_RE.test(t)) return true;
  const low = t.toLowerCase().replace(/\s+/g, "");
  if (CREDIT_LABELS.has(low) || (/(词|曲|声|音)$/.test(low) && low.length <= 4)) return true;
  const match = /^\s*([^:：]{1,24})[:：]\s*/.exec(t);
  if (match) {
    if (CREDIT_LABELS.has(match[1].trim().toLowerCase().replace(/\s+/g, ""))) return true;
    if (CREDIT_LABEL_RE.test(match[1].trim())) return true;
    if (/^(作词|作曲|编曲|词曲|填词|谱曲|和声|合声|混音|录音|制作|吉他|贝斯|钢琴|母带)/.test(match[1].trim())) return true;
  }
  return CREDIT_LABEL_RE.test(t);
}

function lyricLine(text, start, end, id, words) {
  return {
    text, start, end, id,
    ...(words?.length ? { words } : {}),
    isCue: isCueLine(text),
    isInstrumental: isInstrumentalText(text),
  };
}

function sortLines(lines) {
  return lines.sort((a, b) => a.start - b.start).map((line, id) => ({ ...line, id }));
}

export function parseYrc(raw) {
  if (typeof raw !== "string") return [];
  const timed = [];
  for (const line of raw.split(/\r?\n/)) {
    const header = /^\[(\d+),(\d+)\](.*)$/.exec(line.trim());
    if (!header) continue;
    const start = Number(header[1]);
    const end = start + Number(header[2]);
    if (!validTime(start) || !validTime(end) || end <= start) continue;
    const body = header[3];
    const markers = [...body.matchAll(/\((\d+),(\d+),\d+\)/g)];
    if (!markers.length || markers[0].index !== 0) continue;
    const words = [];
    let invalid = false;
    for (let i = 0; i < markers.length; i++) {
      const marker = markers[i];
      const wordStart = Number(marker[1]);
      const wordEnd = wordStart + Number(marker[2]);
      const text = body.slice(marker.index + marker[0].length, markers[i + 1]?.index ?? body.length);
      if (!validTime(wordStart) || !validTime(wordEnd) || wordStart < start || wordEnd > end || wordEnd < wordStart || (words.length && wordStart < words[words.length - 1].start)) {
        invalid = true;
        break;
      }
      if (text) words.push({ text, start: wordStart, end: wordEnd, id: words.length });
    }
    const text = words.map((word) => word.text).join("");
    if (invalid || !text.trim() || isJunkLine(text) || !words.some((word) => word.text.trim() && word.end > word.start)) continue;
    timed.push(lyricLine(text, start, end, timed.length, words));
  }
  return sortLines(timed);
}

export function parseMusixmatchRichsync(raw) {
  let data;
  try {
    data = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  const timed = [];
  for (const entry of data) {
    if (!entry || typeof entry.ts !== "number" || typeof entry.te !== "number" || !Number.isFinite(entry.ts) || !Number.isFinite(entry.te) || entry.ts < 0 || entry.te < 0) continue;
    const start = Math.round(entry.ts * 1000);
    const end = Math.round(entry.te * 1000);
    if (!validTime(start) || !validTime(end) || end <= start) continue;
    let words = [];
    if (Array.isArray(entry.l) && entry.l.length) {
      const parts = Array.from(entry.l);
      const valid = parts.every((part, i) => part && typeof part.c === "string" && typeof part.o === "number" && Number.isFinite(part.o) && part.o >= 0 && Math.round((entry.ts + part.o) * 1000) <= end && (i === 0 || part.o >= parts[i - 1].o));
      if (valid) {
        words = parts.map((part, id) => ({
          text: part.c,
          start: Math.round((entry.ts + part.o) * 1000),
          end: id + 1 < parts.length ? Math.round((entry.ts + parts[id + 1].o) * 1000) : end,
          id,
        })).filter((word) => word.text.length).map((word, id) => ({ ...word, id }));
      }
    }
    const text = typeof entry.x === "string" && entry.x.trim() ? entry.x : words.map((word) => word.text).join("");
    if (!text.trim() || isJunkLine(text)) continue;
    timed.push(lyricLine(text, start, end, timed.length, words));
  }
  return sortLines(timed);
}

function nativeParts(words, line) {
  if (!Array.isArray(words) || !words.length) return null;
  let previous = line.start;
  for (const word of words) {
    if (!word || typeof word.text !== "string" || !validTime(word.start) || !validTime(word.end) || word.start < previous || word.start < line.start || word.end < word.start || word.end > line.end) return null;
    previous = word.start;
  }
  const parts = words.filter((word) => word.text.length).map((word) => ({
    startTimeMs: word.start,
    durationMs: word.end - word.start,
    words: word.text,
    ...preservedFields(word),
  }));
  return parts.some((part) => part.words.trim() && part.durationMs > 0) ? parts : null;
}

function preservedFields(value) {
  const fields = {};
  for (const key of ["agent", "isBackground", "isCue", "isInstrumental", "explicit", "songPart"]) {
    if (value[key] !== undefined) fields[key] = value[key];
  }
  return fields;
}

function addInstrumentals(lines, durationMs, gapMs) {
  if (!lines.length || !validTime(gapMs) || gapMs === 0) return lines;
  const result = [];
  let end = 0;
  for (const line of lines) {
    if (line.startTimeMs - end > gapMs) {
      result.push({ startTimeMs: end, durationMs: line.startTimeMs - end, words: "", agent: null, isInstrumental: true, isCue: true });
    }
    result.push(line);
    end = Math.max(end, line.startTimeMs + line.durationMs);
  }
  if (validTime(durationMs) && durationMs - end > gapMs) {
    result.push({ startTimeMs: end, durationMs: durationMs - end, words: "", agent: null, isInstrumental: true, isCue: true });
  }
  return result;
}

export function normalizedTrackToLyrics(track, { durationMs, instrumentalGapMs = 5000 } = {}) {
  const input = track && typeof track === "object" ? track : {};
  const topWords = Array.isArray(input.words) ? input.words : [];
  const allowWords = input.nativeWordTiming !== false && input.provider !== "lrclib";
  const lyrics = [];
  for (const [index, line] of (Array.isArray(input.timed) ? input.timed : []).entries()) {
    if (!line || typeof line.text !== "string" || !line.text.trim() || !validTime(line.start) || !validTime(line.end) || line.end <= line.start) continue;
    const lineId = validTime(line.id) ? line.id : index;
    const parts = allowWords ? nativeParts(line.words, line) ?? nativeParts(topWords[lineId], line) : null;
    lyrics.push({
      startTimeMs: line.start,
      durationMs: line.end - line.start,
      words: line.text,
      ...(parts ? { parts } : {}),
      agent: line.agent ?? null,
      isInstrumental: line.isInstrumental ?? isInstrumentalText(line.text),
      isCue: line.isCue ?? isCueLine(line.text),
      ...preservedFields(line),
    });
  }
  lyrics.sort((a, b) => a.startTimeMs - b.startTimeMs);
  const isWordSynced = lyrics.some((line) => !line.isCue && !line.isInstrumental && line.parts?.some((part) => part.words.trim() && part.durationMs > 0));
  return {
    lyrics: addInstrumentals(lyrics, durationMs, instrumentalGapMs),
    isWordSynced,
    language: typeof input.language === "string" && input.language.trim() ? input.language : null,
    songwriters: Array.isArray(input.songwriters) ? input.songwriters.filter((name) => typeof name === "string" && name.trim()) : null,
  };
}

const PROVIDER_NAMES = {
  apple_music_liriqo: "Apple Music",
  apple_music: "Apple Music",
  apple: "Apple Music",
  spicy_apple: "Apple Music",
  qq_portato: "QQ Music",
  qq: "QQ Music",
  qqmusic: "QQ Music",
  kugou_legato: "KuGou",
  kugou: "KuGou",
  netease: "NetEase Cloud Music",
  musixmatch: "Musixmatch",
  lrclib: "LRCLib",
  unison_community: "Unison",
  unison: "Unison",
  ytm_line: "YouTube Music",
  ytm: "YouTube Music",
};

function metadataString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function getTrackAttribution(track) {
  const provider = metadataString(track?.provider);
  const upstreamProvider = metadataString(track?.upstreamProvider);
  const lyricsSource = metadataString(track?.lyricsSource);
  let source = (Object.hasOwn(PROVIDER_NAMES, provider) ? PROVIDER_NAMES[provider] : null) ?? upstreamProvider ?? provider ?? null;
  if (provider === "ytm_line" || provider === "ytm") {
    const evidence = [lyricsSource, upstreamProvider].filter(Boolean);
    const known = evidence.map((text) => /\bmusixmatch\b/i.test(text) ? "Musixmatch" : /\blyricfind\b/i.test(text) ? "LyricFind" : null).find(Boolean);
    source = known ? `YouTube Music (${known})` : "YouTube Music";
  }
  return { provider, upstreamProvider, lyricsSource, source };
}

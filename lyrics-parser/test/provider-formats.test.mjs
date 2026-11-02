import test from "node:test";
import assert from "node:assert/strict";
import {
  parseYrc,
  parseMusixmatchRichsync,
  normalizedTrackToLyrics,
  getTrackAttribution,
} from "../src/provider-formats.js";

const line = (text = "Hello world", start = 1234, end = 2456, extra = {}) => ({ text, start, end, id: 0, ...extra });
const word = (text, start, end, extra = {}) => ({ text, start, end, ...extra });

test("YRC uses absolute word milliseconds and retains the line window", () => {
  const timed = parseYrc("[1234,1222](1234,321,0)Hello (1678,456,0)world");
  assert.deepEqual(timed, [{
    text: "Hello world", start: 1234, end: 2456, id: 0,
    words: [word("Hello ", 1234, 1555, { id: 0 }), word("world", 1678, 2134, { id: 1 })],
    isCue: false, isInstrumental: false,
  }]);
});

test("YRC sorts and reindexes lines without replacing word ends", () => {
  const timed = parseYrc("[6000,1000](6000,300,0)Later\r\n[1000,2000](1000,450,0)Earlier");
  assert.deepEqual(timed.map(({ text, start, end, id }) => ({ text, start, end, id })), [
    { text: "Earlier", start: 1000, end: 3000, id: 0 },
    { text: "Later", start: 6000, end: 7000, id: 1 },
  ]);
  assert.equal(timed[0].words[0].end, 1450);
});

test("YRC preserves cue and instrumental annotations but filters credits", () => {
  const timed = parseYrc("[0,1000](0,1000,0)[Verse 1]\n[1000,1000](1000,1000,0)(Instrumental)\n[2000,1000](2000,1000,0)Lyrics by Writer\n[3000,1000](3000,1000,0)Title - Artist");
  assert.equal(timed.length, 2);
  assert.equal(timed[0].isCue, true);
  assert.equal(timed[0].isInstrumental, false);
  assert.equal(timed[1].isCue, true);
  assert.equal(timed[1].isInstrumental, true);
});

test("YRC malformed input returns [] and rejects invalid or out-of-line timing", () => {
  for (const raw of [null, undefined, {}, [], 123, "", "not yrc", "[0,1000]untimed", "[0,1000]prefix(0,500,0)bad", "[-1,1000](0,100,0)bad", "[1000,1000](0,500,0)relative", "[0,1000](0,1001,0)overflow", "[0,1000](500,100,0)a(400,100,0)b", "[0,0](0,0,0)bad", "[0,1000](0,0,0)zero", "[9007199254740991,1](9007199254740991,0,0)bad", "[0,1000](Infinity,100,0)bad"]) {
    assert.deepEqual(parseYrc(raw), [], String(raw));
  }
});

test("Richsync accepts JSON or arrays and converts relative second offsets", () => {
  const fixture = [{ ts: 1.234, te: 2.456, x: "Hello world", l: [{ c: "Hello ", o: 0 }, { c: "world", o: 0.444 }] }];
  const expected = [{
    text: "Hello world", start: 1234, end: 2456, id: 0,
    words: [word("Hello ", 1234, 1678, { id: 0 }), word("world", 1678, 2456, { id: 1 })],
    isCue: false, isInstrumental: false,
  }];
  assert.deepEqual(parseMusixmatchRichsync(fixture), expected);
  assert.deepEqual(parseMusixmatchRichsync(JSON.stringify(fixture)), expected);
});

test("Richsync preserves empty-fragment boundaries, text fallbacks, and stable sorted ids", () => {
  const timed = parseMusixmatchRichsync([
    { ts: 4, te: 5, x: "[Chorus]", l: [] },
    { ts: 1, te: 3, l: [{ c: "One", o: 0 }, { c: "", o: 0.5 }, { c: " two", o: 1 }] },
    { ts: 4, te: 5, x: "(Interlude)" },
    { ts: 8, te: 9, x: "作词：Writer" },
  ]);
  assert.deepEqual(timed.map((entry) => entry.id), [0, 1, 2]);
  assert.equal(timed[0].text, "One two");
  assert.deepEqual(timed[0].words, [word("One", 1000, 1500, { id: 0 }), word(" two", 2000, 3000, { id: 1 })]);
  assert.equal(timed[1].text, "[Chorus]");
  assert.equal(timed[1].isCue, true);
  assert.equal(timed[2].isInstrumental, true);
});

test("Richsync keeps valid line text without inventing words for invalid offsets", () => {
  for (const l of [null, [], [{ c: "Bad", o: -1 }], [{ c: "Bad", o: Infinity }], [{ c: "Bad", o: 5 }], [{ c: 4, o: 0 }], [{ c: "a", o: 1 }, { c: "b", o: 0.5 }]]) {
    const timed = parseMusixmatchRichsync([{ ts: 1, te: 3, x: "Line only", l }]);
    assert.equal(timed.length, 1);
    assert.equal(timed[0].text, "Line only");
    assert.equal(Object.hasOwn(timed[0], "words"), false);
  }
});

test("Richsync malformed input returns [] and skips invalid entries", () => {
  for (const raw of ["{", "null", "{}", null, undefined, {}, 5, [null], [{ ts: "1", te: 2, x: "Bad" }], [{ ts: -1, te: 2, x: "Bad" }], [{ ts: Infinity, te: 2, x: "Bad" }], [{ ts: 1, te: NaN, x: "Bad" }], [{ ts: 1, te: 1, x: "Bad" }], [{ ts: 1, te: 2 }], [{ ts: Number.MAX_SAFE_INTEGER, te: Number.MAX_SAFE_INTEGER + 1, x: "Bad" }]]) {
    assert.deepEqual(parseMusixmatchRichsync(raw), [], String(raw));
  }
});

test("normalizer preserves exact line and native word milliseconds and metadata without mutation", () => {
  const track = {
    provider: "netease", language: "en", songwriters: ["Writer"],
    timed: [line("Hello world", 1234, 2456, {
      agent: "v2", isBackground: true, songPart: "Verse", isCue: false, isInstrumental: false,
      words: [word("Hello ", 1234, 1667, { agent: "v2", isBackground: true, explicit: true }), word("world", 1701, 2456)],
    })],
  };
  const snapshot = structuredClone(track);
  const parsed = normalizedTrackToLyrics(track);
  assert.deepEqual(parsed, {
    lyrics: [{
      startTimeMs: 1234, durationMs: 1222, words: "Hello world",
      parts: [
        { startTimeMs: 1234, durationMs: 433, words: "Hello ", agent: "v2", isBackground: true, explicit: true },
        { startTimeMs: 1701, durationMs: 755, words: "world" },
      ],
      agent: "v2", isInstrumental: false, isCue: false, isBackground: true, songPart: "Verse",
    }],
    isWordSynced: true, language: "en", songwriters: ["Writer"],
  });
  assert.deepEqual(track, snapshot);
});

test("normalizer maps top-level words by original line id before sorting", () => {
  const parsed = normalizedTrackToLyrics({
    timed: [line("Later", 4000, 5000, { id: 1 }), line("Earlier", 1000, 2000, { id: 0 })],
    words: [[word("Earlier", 1100, 1999)], [word("Later", 4100, 4999)]],
  });
  assert.deepEqual(parsed.lyrics.map((entry) => [entry.words, entry.parts[0].startTimeMs, entry.parts[0].durationMs]), [["Earlier", 1100, 899], ["Later", 4100, 899]]);
  const noId = normalizedTrackToLyrics({ timed: [{ text: "Fallback", start: 0, end: 1000 }], words: [[word("Fallback", 0, 999)]] });
  assert.equal(noId.lyrics[0].parts[0].durationMs, 999);
});

test("normalizer can fall back from absent or invalid embedded words to native top-level words", () => {
  const parsed = normalizedTrackToLyrics({ timed: [line("Hi", 0, 1000, { words: [word("Hi", -1, 500)] })], words: [[word("Hi", 0, 876)]] });
  assert.equal(parsed.lyrics[0].parts[0].durationMs, 876);
});

test("normalizer omits parts for missing, invalid, zero-only, or non-native words", () => {
  const invalidWords = [undefined, [], [word("Hello", -1, 2000)], [word("Hello", 1500, Infinity)], [word("Hello", 1500, 1500)], [word("Hello", 1234, 2500)], [word("Hello", 1600, 1700), word("world", 1500, 1800)], [word("", 1234, 2456)], [word(" ", 1234, 2456)], [word("Hello", 1234.5, 2456)]];
  for (const words of invalidWords) {
    const parsed = normalizedTrackToLyrics({ timed: [line("Hello world", 1234, 2456, { words })] });
    assert.equal(parsed.isWordSynced, false);
    assert.equal(Object.hasOwn(parsed.lyrics[0], "parts"), false);
  }
  for (const metadata of [{ provider: "lrclib" }, { nativeWordTiming: false }]) {
    const parsed = normalizedTrackToLyrics({ ...metadata, timed: [line("Hello world", 1234, 2456, { words: [word("Hello world", 1234, 2456)] })] });
    assert.equal(parsed.isWordSynced, false);
    assert.equal(Object.hasOwn(parsed.lyrics[0], "parts"), false);
  }
});

test("normalizer rejects invalid lines and keeps plain text separate", () => {
  const parsed = normalizedTrackToLyrics({ plain: "Plain text", timed: [null, line("", 0, 100), line("Bad", -1, 100), line("Bad", 100, Infinity), line("Bad", 100, 99), line("Bad", 1.5, 100), line("Bad", 0, 0), line("Fine", 1234, 2456)] });
  assert.equal(parsed.lyrics.length, 1);
  assert.equal(parsed.lyrics[0].words, "Fine");
  assert.equal(parsed.lyrics[0].durationMs, 1222);
  assert.deepEqual(normalizedTrackToLyrics({ plain: "Plain text" }), { lyrics: [], isWordSynced: false, language: null, songwriters: null });
  assert.deepEqual(normalizedTrackToLyrics(null), { lyrics: [], isWordSynced: false, language: null, songwriters: null });
});

test("normalizer preserves explicit flags and agents and does not call cue-only tracks word-synced", () => {
  const parsed = normalizedTrackToLyrics({ timed: [line("[Verse]", 0, 1000, { words: [word("[Verse]", 0, 1000)], agent: "v1000", songPart: "Intro" }), line("Interlude", 1000, 2000, { isCue: false, isInstrumental: false })] });
  assert.equal(parsed.lyrics[0].agent, "v1000");
  assert.equal(parsed.lyrics[0].songPart, "Intro");
  assert.equal(parsed.lyrics[0].isCue, true);
  assert.equal(parsed.lyrics[1].isCue, false);
  assert.equal(parsed.lyrics[1].isInstrumental, false);
  assert.equal(parsed.isWordSynced, false);
});

test("instrumental gaps use actual ends including overlapping lines and optional duration", () => {
  const parsed = normalizedTrackToLyrics({ timed: [line("Long", 0, 10000), line("Overlap", 1000, 2000), line("Next", 13000, 14000)] }, { durationMs: 18000, instrumentalGapMs: 2000 });
  assert.deepEqual(parsed.lyrics.filter((entry) => entry.isInstrumental).map((entry) => [entry.startTimeMs, entry.durationMs]), [[10000, 3000], [14000, 4000]]);
  assert.equal(parsed.lyrics[0].durationMs, 10000);
  assert.equal(parsed.lyrics[1].durationMs, 1000);
  assert.ok(parsed.lyrics.every((entry) => !Object.hasOwn(entry, "parts")));
  const disabled = normalizedTrackToLyrics({ timed: [line("Later", 9000, 10000)] }, { durationMs: Infinity, instrumentalGapMs: Infinity });
  assert.equal(disabled.lyrics.length, 1);
});

test("YTM attribution requires known provider evidence and keeps original metadata", () => {
  assert.deepEqual(getTrackAttribution({ provider: "ytm_line", lyricsSource: "LyricFind", upstreamProvider: "YouTube Music (LyricFind)" }), {
    provider: "ytm_line", upstreamProvider: "YouTube Music (LyricFind)", lyricsSource: "LyricFind", source: "YouTube Music (LyricFind)",
  });
  assert.equal(getTrackAttribution({ provider: "ytm_line", upstreamProvider: "YouTube Music (Musixmatch)" }).source, "YouTube Music (Musixmatch)");
  for (const track of [{ provider: "ytm_line" }, { provider: "ytm_line", upstreamProvider: "YouTube Music (unattributed)" }, { provider: "ytm_line", lyricsSource: "Other" }, { provider: "ytm_line", upstreamProvider: "NotMusixmatch or LyricFindish" }]) {
    assert.equal(getTrackAttribution(track).source, "YouTube Music");
  }
});

test("other provider attribution is accurate without inventing unknown metadata", () => {
  for (const [provider, source] of [["apple_music_liriqo", "Apple Music"], ["qq_portato", "QQ Music"], ["kugou_legato", "KuGou"], ["netease", "NetEase Cloud Music"], ["musixmatch", "Musixmatch"], ["lrclib", "LRCLib"], ["unison_community", "Unison"]]) {
    assert.deepEqual(getTrackAttribution({ provider }), { provider, upstreamProvider: null, lyricsSource: null, source });
  }
  assert.deepEqual(getTrackAttribution(null), { provider: null, upstreamProvider: null, lyricsSource: null, source: null });
});

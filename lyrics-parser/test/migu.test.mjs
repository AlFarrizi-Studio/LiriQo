import test from "node:test";
import assert from "node:assert/strict";
import { parseMiguMrc, stripMiguMetaLines } from "../src/migu.js";
import { normalizedTrackToLyrics, normalizeProviderTrack } from "../src/provider-formats.js";

test("Migu MRC native word timing with absolute millisecond markers", () => {
  const timed = parseMiguMrc("[12000,2200]hello (12000,600)my (12600,900)world (13500,700)");
  assert.equal(timed.length, 1);
  assert.equal(timed[0].start, 12000);
  assert.equal(timed[0].end, 14200);
  assert.equal(timed[0].text, "hello my world ");
  assert.deepEqual(timed[0].words.map((w) => w.text), ["hello ", "my ", "world "]);
  assert.equal(timed[0].words[0].start, 12000);
  assert.equal(timed[0].words[1].start, 12600);
  assert.equal(timed[0].words[2].start, 13500);
  assert.equal(timed[0].granularity, "word");
});

test("Migu MRC CJK character timing survives Unicode and punctuation", () => {
  const timed = parseMiguMrc("[5000,1600]晴(5000,400)天(5400,300)。(5700,300)好(6000,500)！(6500,100)");
  assert.equal(timed[0].text, "晴天。好！");
  assert.deepEqual(timed[0].words.map((w) => w.text), ["晴", "天", "。", "好", "！"]);
  assert.equal(timed[0].granularity, "character");
  assert.ok(timed[0].words.every((w) => w.end > w.start));
});

test("Migu MRC surrogate pairs survive unit extraction", () => {
  const timed = parseMiguMrc("[1000,2000]𝄞(1000,900)𝄢(1900,100)");
  assert.equal(timed.length, 1);
  assert.equal(timed[0].text, "𝄞𝄢");
  assert.equal([...timed[0].words[0].text].length, 1, "astral plane unit is one code point");
  assert.equal(timed[0].granularity, "character");
});

test("Migu MRC zero-duration unit invalidates the set -> line-only fallback", () => {
  const timed = parseMiguMrc("[1000,2000]x(1000,500)a(1500,0)");
  assert.equal(timed.length, 1);
  assert.equal(Object.hasOwn(timed[0], "words"), false);
});

test("Migu MRC line-only fallback when unit validation fails", () => {
  const timed = parseMiguMrc("[1000,2000]only text mismatch(1900,100)");
  assert.equal(timed.length, 1);
  assert.equal(Object.hasOwn(timed[0], "words"), false, "single unit below the 2-unit evidence bar");
  const ok = parseMiguMrc("[1000,3000]one(1000,900)two(2000,100)");
  assert.equal(ok.length, 1);
  assert.equal(ok[0].words.length, 2, "two ordered units are valid evidence");
});

test("Migu MRC malformed input returns empty arrays", () => {
  for (const raw of [null, undefined, "", 7, {}, [], "no headers", "[1,2]unclosed", "[-5,100]x(0,50)"]) {
    assert.deepEqual(parseMiguMrc(raw), [], String(raw));
  }
});

test("Migu translation and mixed-language normalized track parses end-to-end", () => {
  const timed = parseMiguMrc("[1000,1500]晴(1000,700)天好(1700,800)");
  const parsed = normalizeProviderTrack({
    provider: "migu", upstreamProvider: "Migu Music", timingOrigin: "native", nativeWordTiming: true,
    language: "zh", timed,
    translation: "Clear sky\nnice weather",
  }, { instrumentalGapMs: 0 });
  assert.equal(parsed.tier, "Jagorawi");
  assert.equal(parsed.granularity, "word");
  assert.equal(parsed.isWordSynced, true);
  assert.equal(parsed.lyrics[0].parts.length, 2);
  assert.equal(parsed.lyrics[0].words, "晴天好");
});

test("Migu translation with mismatched line counts is not force-aligned", () => {
  const track = {
    provider: "migu", timed: parseMiguMrc("[1000,1500]晴(1000,700)天好(1700,800)"),
    translation: "one\ntwo",
  };
  const result = normalizedTrackToLyrics(track);
  assert.equal(Object.hasOwn(result.lyrics[0], "translations"), false);
});

test("Migu null words and missing units stay null-safe", () => {
  const parsed = normalizedTrackToLyrics({
    provider: "migu",
    timed: [{ id: 0, text: "no units", start: 0, end: 1000, words: null }],
    words: null,
  });
  assert.equal(parsed.lyrics.length, 1);
  assert.equal(parsed.isWordSynced, false);
});

test("Migu meta header stripping mirrors the server preprocessing", () => {
  const raw = "@migu music@\n歌曲名：晴天\n歌手名：周杰伦\n[0:10.000]hello";
  assert.equal(stripMiguMetaLines(raw), "[0:10.000]hello");
});

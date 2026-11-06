import test from "node:test";
import assert from "node:assert/strict";
import { parseKuwoLrcx } from "../src/kuwo.js";
import { normalizedTrackToLyrics, normalizeProviderTrack } from "../src/provider-formats.js";

// Decoded lrcx body (what the backend's kuwoDecodeLrcx returns). Key [kuwo:641]
// is octal: value = 6*64 + 4*8 + 1 = 417 -> k1 = 41, k2 = 7
// (unit.start offset = round(|a+b| / (2*41)); unit duration = round(|a-b| / (2*7))).
const LRCX_KEY = "[kuwo:641]";

test("Kuwo lrcx native word timing keeps exact millisecond arithmetic", () => {
  // line start = 01:02.345 = 62345; key [kuwo:641] -> k1=41, k2=7
  // unit.start = lineStart + round(|a+b|/82); unit.end = start + round(|a-b|/14)
  const timed = parseKuwoLrcx(`${LRCX_KEY}\n[1:02.345]<0,41>你<123,0>好<205,0>世<287,0>界`);
  assert.equal(timed.length, 1);
  assert.equal(timed[0].start, 62345);
  assert.equal(timed[0].text, "你好世界");
  assert.equal(timed[0].words.length, 4);
  assert.equal(timed[0].words[0].start, 62346);
  assert.equal(timed[0].words[0].end, 62349);
  assert.equal(timed[0].words[1].start, 62347);
  assert.equal(timed[0].words[1].end, 62356);
  assert.equal(timed[0].words[3].start, 62349);
  assert.equal(timed[0].words[3].end, 62370);
  assert.equal(timed[0].granularity, "character");
  assert.equal(timed[0].end, 62370);
});

test("Kuwo lrcx multi-character units classify as word granularity", () => {
  const timed = parseKuwoLrcx(`${LRCX_KEY}\n[0:10.000]<0,700>hello <4900,100>world`);
  assert.equal(timed.length, 1);
  assert.equal(timed[0].granularity, "word");
  assert.equal(timed[0].words[0].text, "hello ");
  assert.equal(timed[0].words[0].start, 10009);
  assert.equal(timed[0].words[1].text, "world");
  assert.equal(timed[0].words[1].start, 10061);
  assert.ok(timed[0].words[0].end <= timed[0].words[1].start, "native pauses preserved between units");
});

test("Kuwo lrcx preserves CJK text, whitespace and punctuation in reconstruction", () => {
  const timed = parseKuwoLrcx(`${LRCX_KEY}\n[0:05.000]<0,500>晴天<600,400>，<800,300>你好<1200,200>！`);
  assert.equal(timed[0].text, "晴天，你好！");
  assert.deepEqual(timed[0].words.map((w) => w.text), ["晴天", "，", "你好", "！"]);
  assert.equal(timed[0].words.map((w) => w.text).join(""), "晴天，你好！");
});

test("Kuwo lrcx negative marker offsets stay inside the line window", () => {
  const timed = parseKuwoLrcx(`${LRCX_KEY}\n[0:30.000]<110,-40>a<220,-60>b`);
  assert.equal(timed.length, 1);
  assert.equal(timed[0].words.length, 2);
  assert.equal(timed[0].words[0].start, 30001);
  assert.equal(timed[0].words[1].start, 30002);
  assert.ok(timed[0].words.every((w) => w.start >= timed[0].start));
  assert.ok(timed[0].words.every((w, i, all) => i === 0 || w.start >= all[i - 1].start));
});

test("Kuwo lrcx line-only and zero-only markers skip unit extraction", () => {
  assert.deepEqual(parseKuwoLrcx(`${LRCX_KEY}\n[0:01.000]plain line`), [], "no markers -> no line");
  assert.deepEqual(parseKuwoLrcx(`${LRCX_KEY}\n[0:01.000]<0,0>a<0,0>b`), [], "all-zero markers -> rejected");
});

test("Kuwo lrcx malformed input returns empty arrays", () => {
  for (const raw of [null, undefined, "", 42, {}, [], "no key here\n[0:01.000]x<1,2>y", `${LRCX_KEY}\ngarbage`, `${LRCX_KEY}\n[99:99.000]bad<1,2>x`]) {
    assert.deepEqual(parseKuwoLrcx(raw), [], String(raw));
  }
});

test("Kuwo normalized track parses end-to-end with native provenance", () => {
  const timed = parseKuwoLrcx(`${LRCX_KEY}\n[0:10.000]<0,700>hello <4900,100>world`);
  const parsed = normalizeProviderTrack({
    provider: "kuwo", upstreamProvider: "Kuwo Music", timingOrigin: "native", nativeWordTiming: true,
    language: "zh", timed, plain: timed.map((l) => l.text).join("\n"),
  }, { instrumentalGapMs: 0 });
  assert.equal(parsed.tier, "Jagorawi");
  assert.equal(parsed.timingOrigin, "native");
  assert.equal(parsed.granularity, "word");
  assert.equal(parsed.isWordSynced, true);
  assert.equal(parsed.lyrics[0].startTimeMs, 10000);
  assert.equal(parsed.lyrics[0].parts[0].words, "hello ");
});

test("Kuwo normalized line-only track stays Cipali without invented units", () => {
  const parsed = normalizeProviderTrack({
    provider: "kuwo", timingOrigin: "native", nativeWordTiming: false,
    timed: [{ id: 0, text: "只有行同步", start: 1000, end: 4000, granularity: "line", timingOrigin: "native" }],
  });
  assert.equal(parsed.tier, "Cipali");
  assert.equal(parsed.isWordSynced, false);
  assert.equal(parsed.granularity, null);
  assert.equal(Object.hasOwn(parsed.lyrics[0], "parts"), false);
});

test("Kuwo null word arrays are handled and plain fallback survives", () => {
  const parsed = normalizedTrackToLyrics({
    provider: "kuwo", words: null,
    timed: [{ id: 0, text: "line one", start: 0, end: 2000 }, { id: 1, text: "line two", start: 2000, end: 4000, words: null }],
  });
  assert.equal(parsed.lyrics.length, 2);
  assert.equal(parsed.isWordSynced, false);
  assert.equal(parsed.lyrics[1].words, "line two");
});

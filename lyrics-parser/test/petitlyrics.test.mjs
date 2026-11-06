import test from "node:test";
import assert from "node:assert/strict";
import { parsePetitLyricsWsy, classifyPetitLyricsText, tagText, xmlText } from "../src/petitlyrics.js";
import { normalizeProviderTrack } from "../src/provider-formats.js";

const wsy = (lines) =>
  `<wsy><info><title>fixture</title></info>${lines.join("")}</wsy>`;
const lineXml = (text, units = [], extra = "") =>
  `<line>${extra}<linestring>${text}</linestring>${units.map(([t, s, e]) => `<word><wordstring>${t}</wordstring><starttime>${s}</starttime><endtime>${e}</endtime></word>`).join("")}</line>`;

test("PetitLyrics WSY native per-character timing on Japanese text", () => {
  const xml = wsy([
    lineXml("ハローワールド", [["ハ", 1000, 1300], ["ロ", 1300, 1500], ["ー", 1500, 1700], ["ワ", 1700, 1900], ["ー", 1900, 2100], ["ル", 2100, 2300], ["ド", 2300, 2600]]),
  ]);
  const timed = parsePetitLyricsWsy(xml);
  assert.equal(timed.length, 1);
  assert.equal(timed[0].text, "ハローワールド");
  assert.equal(timed[0].words.length, 7);
  assert.equal(timed[0].granularity, "character");
  assert.equal(timed[0].endTimingOrigin, "native");
  assert.equal(new Set(timed[0].words.map((w) => w.start)).size, 7, "each character has a unique native start");
  assert.equal(timed[0].words.map((w) => w.text).join(""), "ハローワールド", "no character loss");
});

test("PetitLyrics multi-unit Latin words classify as word granularity", () => {
  const xml = wsy([lineXml("hello world", [["hello ", 500, 900], ["world", 1000, 1400]])]);
  const timed = parsePetitLyricsWsy(xml);
  assert.equal(timed[0].granularity, "word");
  assert.equal(timed[0].words[1].start, 1000);
});

test("PetitLyrics WSY drops unit-less lines; line-only arrives via the LRC route", () => {
  // Server parity: a WSY <line> without any timed unit is dropped
  // (buildLinesFromWsy). PetitLyrics line-only content ships as LRC (tier 1).
  const xml = wsy([lineXml("夏の匂い")]);
  assert.deepEqual(parsePetitLyricsWsy(xml), []);
  const parsed = normalizeProviderTrack({
    provider: "petitlyrics", timingOrigin: "native",
    lrc: "[00:10.00]夏の匂い", timed: [{ id: 0, text: "夏の匂い", start: 10000, end: 13000, granularity: "line", timingOrigin: "native" }],
  }, { instrumentalGapMs: 0 });
  assert.equal(parsed.tier, "Cipali", "line-only PetitLyrics stays Cipali");
  assert.equal(parsed.isWordSynced, false);
  assert.equal(Object.hasOwn(parsed.lyrics[0], "parts"), false, "no fabricated character timing");
});

test("PetitLyrics mixed Latin/Japanese and punctuation reconstruct exactly", () => {
  const xml = wsy([lineXml("Say! 夢を見る?", [["Say", 0, 300], ["!", 300, 350], ["夢", 400, 600], ["を", 600, 700], ["見", 700, 900], ["る", 900, 1000], ["?", 1000, 1100]])]);
  const timed = parsePetitLyricsWsy(xml);
  assert.equal(timed[0].text, "Say! 夢を見る?");
  assert.equal(timed[0].words.map((w) => w.text).join(""), "Say!夢を見る?", "unit join matches the visible text");
  assert.equal(timed[0].granularity, "word", "mixed multi-char Latin token keeps word granularity");
});

test("PetitLyrics XML entities and CDATA decode without duplication", () => {
  assert.equal(xmlText("<a> & &#x30CF;"), "<a> & ハ");
  assert.equal(tagText("<linestring><![CDATA[ハ&ロー]]></linestring>", "linestring"), "ハ&ロー");
  const xml = wsy([lineXml("ハ&ロー", [["ハ", 0, 300], ["&", 300, 400], ["ロー", 400, 700]])]);
  const timed = parsePetitLyricsWsy(xml);
  assert.equal(timed[0].text, "ハ&ロー");
  assert.equal(timed[0].words.map((w) => w.text).join(""), "ハ&ロー");
});

test("PetitLyrics invalid or degenerate word timing falls back per line", () => {
  const xml = wsy([
    lineXml("broken", [["b", 100, 90], ["r", 200, 300]]),
    lineXml("single", [["s", 100, 200]]),
    lineXml("empty", []),
    lineXml("noends", [["n", 100, 0], ["o", 200, 0]]),
  ]);
  const timed = parsePetitLyricsWsy(xml);
  assert.equal(timed.length, 3, "empty-unit line dropped; the rest fall back to line timing");
  assert.equal(Object.hasOwn(timed[0], "words"), false);
  assert.equal(Object.hasOwn(timed[1], "words"), false);
  assert.ok(timed[0].end > timed[0].start, "native partial end keeps the line usable");
  assert.equal(timed[0].endTimingOrigin, "native");
  assert.equal(timed[2].endTimingOrigin, "inferred", "no valid unit end -> inferred end");
  assert.ok(timed[2].end > timed[2].start);
});

test("PetitLyrics malformed input returns empty arrays", () => {
  for (const raw of [null, undefined, "", 5, {}, [], "<notwsy><line><linestring>x</linestring></line></notwsy>"]) {
    assert.deepEqual(parsePetitLyricsWsy(raw), [], String(raw));
  }
});

test("PetitLyrics surrogate pairs survive word extraction", () => {
  const xml = wsy([lineXml("𝄞𝄢", [["𝄞", 0, 300], ["𝄢", 300, 600]])]);
  const timed = parsePetitLyricsWsy(xml);
  assert.equal(timed[0].words.length, 2);
  assert.equal([...timed[0].text].length, 2);
  assert.equal(timed[0].granularity, "character", "astral-plane characters count as single code points");
});

test("PetitLyrics normalized track reaches Jagorawi with native provenance", () => {
  const xml = wsy([lineXml("ハロー", [["ハ", 1000, 1300], ["ロ", 1300, 1600], ["ー", 1600, 1900]])]);
  const parsed = normalizeProviderTrack({
    provider: "petitlyrics", upstreamProvider: "PetitLyrics", timingOrigin: "native",
    nativeWordTiming: true, language: "ja", timed: parsePetitLyricsWsy(xml),
  }, { instrumentalGapMs: 0 });
  assert.equal(parsed.tier, "Jagorawi");
  assert.equal(parsed.granularity, "character");
  assert.equal(parsed.timingOrigin, "native");
  assert.equal(parsed.lyrics[0].parts[0].startTimeMs, 1000);
});

test("classifyPetitLyricsText distinguishes WSY from LRC payloads", () => {
  assert.equal(classifyPetitLyricsText('<?xml version="1.0"?><wsy><line></line></wsy>'), 3);
  assert.equal(classifyPetitLyricsText("[00:01.00]line"), 1);
});

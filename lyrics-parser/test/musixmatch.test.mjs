import test from "node:test";
import assert from "node:assert/strict";
import { parseMusixmatchRichsync, normalizedTrackToLyrics, normalizeProviderTrack } from "../src/provider-formats.js";
import { parseLiriQoResponse, canonicalProvider } from "../src/index.js";

test("RichSync word ends are annotated as derived while starts stay native", () => {
  const timed = parseMusixmatchRichsync([
    { ts: 2.5, te: 4, x: "one two", l: [{ c: "one", o: 0 }, { c: "two", o: 1 }] },
  ]);
  assert.deepEqual(timed[0].words.map((w) => [w.text, w.start, w.end, w.derivedEnd]), [
    ["one", 2500, 3500, true],
    ["two", 3500, 4000, true],
  ]);
  // Native starts; ends derived from the next native start / line end.
  const parsed = normalizedTrackToLyrics({ provider: "musixmatch", nativeWordTiming: true, timed });
  assert.deepEqual(parsed.lyrics[0].parts.map((p) => [p.words, p.startTimeMs, p.durationMs, p.derivedEnd]), [
    ["one", 2500, 1000, true],
    ["two", 3500, 500, true],
  ]);
  assert.equal(parsed.lyrics[0].granularity, "word");
  assert.equal(parsed.timingOrigin, "native");
});

test("RichSync phrase-level units are labelled phrase without inventing word splits", () => {
  const timed = parseMusixmatchRichsync([
    { ts: 1, te: 3, x: "gimme that feeling", l: [{ c: "gimme that", o: 0 }, { c: "feeling", o: 1 }] },
  ]);
  const parsed = normalizedTrackToLyrics({ provider: "musixmatch", nativeWordTiming: true, timed });
  // "gimme that" carries an internal space -> phrase granularity for the line.
  assert.equal(parsed.lyrics[0].granularity, "phrase");
  assert.equal(parsed.granularity, "phrase");
  // Mixed track: phrase lines coexist with word lines without downgrading them.
  const mixed = parseMusixmatchRichsync([
    { ts: 1, te: 3, x: "one two", l: [{ c: "one", o: 0 }, { c: "two", o: 1 }] },
    { ts: 4, te: 6, x: "gimme that feeling", l: [{ c: "gimme that", o: 0 }, { c: "feeling", o: 1 }] },
  ]);
  const parsedMixed = normalizedTrackToLyrics({ provider: "musixmatch", nativeWordTiming: true, timed: mixed });
  assert.deepEqual(parsedMixed.lyrics.map((l) => l.granularity), ["word", "phrase"]);
  assert.equal(parsedMixed.granularity, "word", "track granularity follows the best real evidence");
});

test("RichSync mixed granularity keeps word lines and line-only sections separate", () => {
  const timed = parseMusixmatchRichsync([
    { ts: 1, te: 3, x: "one two", l: [{ c: "one", o: 0 }, { c: "two", o: 1 }] },
    { ts: 4, te: 5, x: "line only" },
  ]);
  assert.equal(timed[0].words.length, 2);
  assert.equal(Object.hasOwn(timed[1], "words"), false, "no fabricated words for the line-only section");
});

test("RichSync missing/empty/malformed bodies return empty arrays", () => {
  for (const raw of [null, undefined, "", "{", "null", "{}", [], [null], [{ ts: "x", te: 2 }], [{ ts: 1, te: 0 }]]) {
    assert.deepEqual(parseMusixmatchRichsync(raw), [], String(raw));
  }
});

test("legacy musixmatch alias maps to musixmatch_richsync with the same semantics", () => {
  assert.equal(canonicalProvider("musixmatch"), "musixmatch_richsync");
  assert.equal(canonicalProvider("unison"), "unison_community");
  assert.equal(canonicalProvider("lrclib_wordsync"), "lrclib_wordsync", "derived-timing provider has no alias");
  const legacy = parseLiriQoResponse({
    tracks: [{ provider: "musixmatch", richsync: [{ ts: 1, te: 3, x: "Hello world", l: [{ c: "Hello ", o: 0 }, { c: "world", o: 0.8 }] }] }],
  });
  assert.equal(legacy.richsynced.provider, "musixmatch");
  assert.equal(legacy.richsynced.source, "Musixmatch");
  assert.equal(legacy.route, "richsync");
});

test("Musixmatch normalized track reaches Jagorawi with derived ends preserved", () => {
  const parsed = normalizeProviderTrack({
    provider: "musixmatch_richsync", upstreamProvider: "Musixmatch",
    nativeWordTiming: true, nativeRichsync: true, timingOrigin: "native",
    timed: parseMusixmatchRichsync([{ ts: 1, te: 3, x: "Hello world", l: [{ c: "Hello ", o: 0 }, { c: "world", o: 0.8 }] }]),
  }, { instrumentalGapMs: 0 });
  assert.equal(parsed.tier, "Jagorawi");
  assert.equal(parsed.timingOrigin, "native");
  assert.ok(parsed.lyrics[0].parts.every((part) => part.derivedEnd === true));
});

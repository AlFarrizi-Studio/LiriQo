import test from "node:test";
import assert from "node:assert/strict";
import { parseLiriQoResponse } from "../src/index.js";
import { pickTrack } from "../src/select.js";

const track = (provider, extra = {}) => ({
  provider, syncLevel: "line", tier: "Cipali",
  timed: [{ id: 0, text: "Hello world", start: 1000, end: 3000 }],
  plain: "Hello world",
  ...extra,
});
const wordTrack = (provider, extra = {}) => ({
  provider, syncLevel: "word", tier: "Jagorawi",
  timed: [{ id: 0, text: "Hello world", start: 1000, end: 3000, words: [{ text: "Hello ", start: 1000, end: 1800 }, { text: "world", start: 1800, end: 3000 }] }],
  plain: "Hello world",
  nativeWordTiming: true,
  ...extra,
});

test("Jagorawi (native word) outranks Cipali regardless of provider priority", () => {
  const result = parseLiriQoResponse({ tracks: [track("apple_music_liriqo"), wordTrack("netease")] }, { instrumentalGapMs: 0 });
  assert.equal(result.richsynced.provider, "netease");
  assert.equal(result.synced.provider, "apple_music_liriqo");
});

test("native word beats an invalid word claim from a higher-priority provider", () => {
  const brokenWord = wordTrack("apple_music_liriqo", {
    timed: [{ id: 0, text: "Hello world", start: 1000, end: 3000, words: [{ text: "Hello ", start: 1800, end: 900 }] }],
  });
  const result = parseLiriQoResponse({ tracks: [brokenWord, wordTrack("netease")] }, { instrumentalGapMs: 0 });
  assert.equal(result.richsynced.provider, "netease", "invalid word timing from Apple must not win");
});

test("canonical provider priority applies within the same evidence tier", () => {
  const result = parseLiriQoResponse({ tracks: [wordTrack("qq_portato"), wordTrack("kugou_legato"), wordTrack("netease")] }, { instrumentalGapMs: 0 });
  assert.equal(result.richsynced.provider, "netease", "registry order: netease before petitlyrics/kugou/qq");
  const petit = parseLiriQoResponse({ tracks: [wordTrack("qq_portato"), wordTrack("kugou_legato"), wordTrack("petitlyrics")] }, { instrumentalGapMs: 0 });
  assert.equal(petit.richsynced.provider, "petitlyrics");
  const kuwo = parseLiriQoResponse({ tracks: [wordTrack("migu"), wordTrack("kuwo")] }, { instrumentalGapMs: 0 });
  assert.equal(kuwo.richsynced.provider, "kuwo");
});

test("unknown providers rank after every known provider of equal claim strength", () => {
  const result = parseLiriQoResponse({ tracks: [wordTrack("brand_new_provider"), wordTrack("qq_portato")] }, { instrumentalGapMs: 0 });
  assert.equal(result.richsynced.provider, "qq_portato");
  // ...but still win the tier race against lower-tier known providers.
  const vsLine = parseLiriQoResponse({ tracks: [track("apple_music_liriqo"), wordTrack("brand_new_provider")] }, { instrumentalGapMs: 0 });
  assert.equal(vsLine.richsynced.provider, "brand_new_provider");
});

test("primary-only payload parses without double counting tracks", () => {
  const result = parseLiriQoResponse({ primary: wordTrack("netease") }, { instrumentalGapMs: 0 });
  assert.equal(result.richsynced.provider, "netease");
  assert.equal(result.richsynced.lyrics.length, 1);
  // primary duplicated inside tracks is not parsed twice
  const dup = parseLiriQoResponse({ primary: wordTrack("netease"), tracks: [wordTrack("netease")] }, { instrumentalGapMs: 0 });
  assert.equal(dup.richsynced.provider, "netease");
});

test("fast partial and empty responses stay stable", () => {
  assert.deepEqual(parseLiriQoResponse({ tracks: [], primary: null, mode: "fast", partial: true }),
    { richsynced: null, synced: null, plain: null, provider: null, syncedProvider: null, plainProvider: null, route: null });
  const partial = parseLiriQoResponse({ tracks: [track("kuwo")], mode: "fast", partial: true }, { instrumentalGapMs: 0 });
  assert.equal(partial.synced.provider, "kuwo");
});

test("new provider routes parse from raw payloads (lrcx, mrc, wsy, krc)", () => {
  const lrcx = parseLiriQoResponse({
    tracks: [{ provider: "kuwo", lrcx: "[kuwo:641]\n[0:10.000]<0,41>你<123,0>好<205,0>世<287,0>界" }],
  }, { instrumentalGapMs: 0 });
  assert.equal(lrcx.route, "lrcx");
  assert.equal(lrcx.richsynced.provider, "kuwo");
  const mrc = parseLiriQoResponse({
    tracks: [{ provider: "migu", mrc: "[12000,2200]hello (12000,600)my (12600,900)world (13500,700)" }],
  }, { instrumentalGapMs: 0 });
  assert.equal(mrc.route, "mrc");
  assert.equal(mrc.richsynced.provider, "migu");
  const wsy = parseLiriQoResponse({
    tracks: [{ provider: "petitlyrics", wsy: "<wsy><line><linestring>ハロー</linestring><word><wordstring>ハ</wordstring><starttime>1000</starttime><endtime>1300</endtime></word><word><wordstring>ロ</wordstring><starttime>1300</starttime><endtime>1600</endtime></word><word><wordstring>ー</wordstring><starttime>1600</starttime><endtime>1900</endtime></word></line></wsy>" }],
  }, { instrumentalGapMs: 0 });
  assert.equal(wsy.route, "wsy");
  assert.equal(wsy.richsynced.provider, "petitlyrics");
  const krc = parseLiriQoResponse({
    tracks: [{ provider: "kugou_legato", krc: "[1000,2000](1000,800,0)Hello (1800,1200,0)world" }],
  }, { instrumentalGapMs: 0 });
  assert.equal(krc.route, "krc");
  assert.equal(krc.richsynced.provider, "kugou_legato");
});

test("pickTrack honours quality then canonical priority with stable tie-break", () => {
  const tracks = [wordTrack("qq_portato"), wordTrack("netease", { syncLevel: "line" }), wordTrack("kugou_legato")];
  assert.equal(pickTrack(tracks, "Jagorawi", { requireWordData: true }).provider, "kugou_legato",
    "line-level claim from netease does not outrank true word claims");
});

test("plain extraction covers new providers and keeps attribution", () => {
  const result = parseLiriQoResponse({
    tracks: [
      track("migu", { plain: "Migu text" }),
      track("kuwo", { plain: "Kuwo text" }),
      track("petitlyrics", { plain: "PetitLyrics text" }),
    ],
  });
  assert.equal(result.plainProvider, "kuwo", "canonical TEXT order: kuwo before migu");
  assert.equal(result.plain.source, "Kuwo Music");
  assert.equal(result.synced.provider, "kuwo");
  assert.equal(result.route, "timed", "line-timed payload routes as timed, plain slot still filled");
});

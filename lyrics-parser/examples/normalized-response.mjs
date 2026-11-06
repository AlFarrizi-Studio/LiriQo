/**
 * Example 4 - handle a full normalized API response offline: tiers, partial
 * fast results, plain fallback, translations, background vocals.
 *
 * Run: node examples/normalized-response.mjs
 */
import { parseLiriQoResponse } from "../src/index.js";

const payload = {
  metadata: { title: "Fixture song", artist: "Fixture artist", duration: 240 },
  tier: "Jagorawi",
  count: 2,
  mode: "fast",
  partial: true,
  tracks: [
    {
      provider: "apple_music_liriqo",
      syncLevel: "syllable",
      tier: "Jagorawi",
      // TTML omitted for brevity - this track falls through to its normalized timing
      nativeWordTiming: true,
      language: "en",
      timed: [
        { id: 0, text: "[Verse]", start: 0, end: 900, isCue: true },
        { id: 1, text: "First line", start: 1000, end: 3500, agent: "v1",
          words: [{ text: "First ", start: 1000, end: 2000, id: 0 }, { text: "line", start: 2000, end: 3500, id: 1 }] },
        { id: 2, text: "(background) oooh", start: 3600, end: 5200, isBackground: true },
      ],
      translation: "Baris pertama\nLatar oooh",
    },
    {
      provider: "kuwo",
      syncLevel: "line",
      tier: "Cipali",
      timingOrigin: "native",
      plain: "[Verse]\nFirst line\n(Background)",
      timed: [{ id: 0, text: "First line", start: 1000, end: 3500, timingOrigin: "native" }],
    },
  ],
};

const result = parseLiriQoResponse(payload);

console.log(`mode=fast partial=true -> parsed anyway; route=${result.route}`);
console.log(`richsynced provider: ${result.richsynced?.provider}`);
console.log(`synced provider:     ${result.synced?.provider}`);
console.log(`plain provider:      ${result.plain?.provider}`);

const selected = result.richsynced;
for (const line of selected.lyrics) {
  const flags = [
    line.isCue && "cue", line.isInstrumental && "instrumental",
    line.isBackground && "background", line.agent && `agent=${line.agent}`,
  ].filter(Boolean).join(",");
  console.log(`@${line.startTimeMs} ${JSON.stringify(line.words)}${flags ? ` (${flags})` : ""}`);
  if (line.translations) console.log(`   translation: ${JSON.stringify(line.translations)}`);
  if (line.parts) console.log(`   parts: ${line.parts.map((p) => `${p.words}@${p.startTimeMs}`).join(" | ")}`);
}
console.log("cacheAllowed:", selected.cacheAllowed);
console.log("language:", selected.language);

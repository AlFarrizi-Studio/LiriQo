/**
 * Example 3 - iterate native CHARACTER timing (Kuwo lrcx / PetitLyrics WSY).
 *
 * No network access. The lrcx body below is what LiriQo's backend emits after
 * its zlib+XOR decoding step; the client parser receives decoded text.
 * Run: node examples/native-character.mjs
 */
import { parseLiriQoResponse } from "../src/index.js";

const payload = {
  tier: "Jagorawi",
  tracks: [
    {
      provider: "kuwo",
      upstreamProvider: "Kuwo Music",
      syncLevel: "word",
      tier: "Jagorawi",
      nativeWordTiming: true,
      timingOrigin: "native",
      language: "zh",
      // [kuwo:641] key -> k1=41, k2=7: unit.start = line + round(|a+b|/82)
      lrcx: "[kuwo:641]\n[0:10.000]<0,41>你<123,0>好<205,0>世<287,0>界",
      timed: [
        { id: 0, text: "你好世界", start: 10000, end: 10370, granularity: "character", timingOrigin: "native",
          words: [
            { text: "你", start: 10001, end: 10004, id: 0 },
            { text: "好", start: 10002, end: 10011, id: 1 },
            { text: "世", start: 10003, end: 10018, id: 2 },
            { text: "界", start: 10004, end: 10025, id: 3 },
          ] },
      ],
    },
  ],
};

const result = parseLiriQoResponse(payload);
const rich = result.richsynced;
console.log(`route: ${result.route}  provider: ${result.provider}`);

for (const line of rich.lyrics) {
  console.log(`line @${line.startTimeMs}: ${line.words}`);
  console.log(`  granularity: ${line.granularity}`);
  for (const part of line.parts ?? []) {
    // per-character sweep: each part is one CJK character with native timing
    console.log(`  "${part.words}" @${part.startTimeMs} for ${part.durationMs}ms`);
  }
}

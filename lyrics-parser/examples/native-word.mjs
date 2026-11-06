/**
 * Example 2 - iterate native word/syllable timing offline.
 *
 * No network access: parses a recorded (sanitized) LiriQo response payload.
 * Run: node examples/native-word.mjs
 */
import { parseLiriQoResponse } from "../src/index.js";

// Shape of a normalized native word track as shipped by the API
// (NetEase YRC-style: line words are validated native millisecond units).
const payload = {
  tier: "Jagorawi",
  count: 1,
  mode: "full",
  partial: false,
  tracks: [
    {
      provider: "netease",
      syncLevel: "word",
      tier: "Jagorawi",
      nativeWordTiming: true,
      language: "en",
      plain: "Say hello world",
      timed: [
        { id: 0, text: "Say hello world", start: 1000, end: 4600, agent: "v1",
          words: [
            { text: "Say ", start: 1000, end: 1500, id: 0 },
            { text: "hello ", start: 1500, end: 2600, id: 1 },
            { text: "world", start: 2600, end: 4600, id: 2 },
          ] },
      ],
      words: [[
        { text: "Say ", start: 1000, end: 1500, id: 0 },
        { text: "hello ", start: 1500, end: 2600, id: 1 },
        { text: "world", start: 2600, end: 4600, id: 2 },
      ]],
    },
  ],
};

const result = parseLiriQoResponse(payload);
const rich = result.richsynced ?? result.synced;

console.log(`route: ${result.route}  provider: ${result.provider}`);
for (const line of rich.lyrics) {
  console.log(`line @${line.startTimeMs}: ${line.words} (agent ${line.agent})`);
  if (!line.parts) {
    console.log("  (line-synced only - no native units on this line)");
    continue;
  }
  console.log(`  granularity: ${line.granularity}`);
  let cursor = line.startTimeMs;
  for (const part of line.parts) {
    if (part.startTimeMs > cursor) console.log(`  [${cursor}..${part.startTimeMs}] (pause)`);
    console.log(`  [${part.startTimeMs}..${part.startTimeMs + part.durationMs}] "${part.words}"`);
    cursor = part.startTimeMs + part.durationMs;
  }
}

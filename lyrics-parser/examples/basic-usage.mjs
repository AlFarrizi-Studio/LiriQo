/**
 * Example 1 - fetch from the LiriQo API and parse the response.
 *
 * Requires network access to the public API. Run:
 *   node examples/basic-usage.mjs <youtube-video-id>
 */
import { getLiriQoLyrics, ApiError } from "../src/index.js";

const videoId = process.argv[2] ?? "gdZLi9oWNZg"; // BTS - Dynamite (example)

try {
  const result = await getLiriQoLyrics(videoId, { full: true });

  const selected = result.richsynced ?? result.synced ?? result.plain;
  console.log(`provider: ${result.provider}  route: ${result.route}`);

  if (!selected) {
    console.log("no lyrics available for this video");
    process.exit(0);
  }

  for (const line of selected.lyrics) {
    if (line.isInstrumental) continue;
    console.log(`[${line.startTimeMs}] ${line.words}`);
    for (const part of line.parts ?? []) {
      // parts exist on word/character/phrase-synced lines
      console.log(`    +${part.startTimeMs} (${part.durationMs}ms) ${part.words}`);
    }
  }
} catch (error) {
  if (error instanceof ApiError) {
    console.error(`API error [${error.code}] status=${error.status} retryAfter=${error.retryAfter}`);
    // Never auto-retry HTTP 429 - honour retryAfter manually if at all.
    process.exit(1);
  }
  throw error;
}

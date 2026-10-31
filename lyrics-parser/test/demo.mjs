/**
 * Live demo: parse real LiriQo data end-to-end for a few songs covering the
 * different providers.
 *
 *   node test/demo.mjs
 */

import { getLiriQoLyrics } from "../src/index.js";

const SONGS = [
  { videoId: "HaEYUJ2aRHs", duration: 200, song: "Dynamite", artist: "BTS", label: "Dynamite - BTS (apple ttml: bg vocals + agents + songwriters)" },
  { videoId: "n5Mo9hC9d_Y", duration: 220, song: "Astaga Bercanda", artist: "Akbar Chalay, Mingse", label: "Astaga Bercanda (unison ttml: agents)" },
  { videoId: "ZSRzCbpIxZo", duration: 166, song: "Snowman", artist: "Sia", label: "Snowman - Sia (kugou words / lrclib line)" },
  { videoId: "uziIDxPrjJc", duration: 180, song: "SNAP", artist: "Rosa Linn", label: "SNAP - Rosa Linn (apple syllable)" },
  { videoId: "aaFUjDAgd-k", duration: 178, song: "Cerita Malam", artist: "Karnamereka", label: "Cerita Malam (unison ttml)" },
];

for (const song of SONGS) {
  console.log(`\n===== ${song.label} (${song.videoId}) =====`);
  try {
    const result = await getLiriQoLyrics(song.videoId, {
      duration: song.duration,
      song: song.song,
      artist: song.artist,
    });
    console.log(`  route=${result.route} provider=${result.provider ?? "-"} | syncedProvider=${result.syncedProvider ?? "-"} | plainProvider=${result.plainProvider ?? "-"}`);
    for (const slot of ["richsynced", "synced", "plain"]) {
      const r = result[slot];
      if (!r) {
        console.log(`  ${slot}: -`);
        continue;
      }
      const agents = new Set();
      let bg = 0;
      let instrumental = 0;
      let translations = 0;
      for (const L of r.lyrics) {
        if (L.agent) agents.add(L.agent);
        if (L.isInstrumental) instrumental++;
        if (L.translation) translations++;
        if (L.parts) for (const p of L.parts) if (p.isBackground) bg++;
      }
      console.log(
        `  ${slot}: lines=${r.lyrics.length} agents=[${[...agents]}] bgParts=${bg} instrumental=${instrumental} translated=${translations} songwriters=${JSON.stringify(r.songwriters ?? [])}`,
      );
      const sample = r.lyrics.find((L) => L.words && L.words.trim());
      if (sample) {
        console.log(`    sample: [${sample.startTimeMs}] ${JSON.stringify(sample.words.slice(0, 60))}`);
        if (sample.translation) console.log(`    terjemahan: ${JSON.stringify(sample.translation.text)}`);
      }
    }
  } catch (err) {
    console.log("  ERROR:", err.message);
  }
}

# LiriQo Lyrics Parser

Official client-side lyrics parser for the **LiriQo API** — supports all 7 providers
and produces Better-Lyrics-compatible lyric objects: syllable/word sync,
**background vocals**, **singer agents (duets v1/v2/group)**, **instrumental
lines**, **songwriters**, and **per-line translations**.

This folder is ready to be dropped into the LiriQo repo root (sits next to
`public/`, `README.md`, and the root `LICENSE` — the root MIT license covers it).

> Not the worker code — this is a client-side parsing library (Node.js >= 16 /
> browser bundlers). All third-party dependencies are vendored under
> `node_modules/`, so it runs **offline with no `npm install`**.

## Supported providers

| Provider | Source data | Parsing route | Features |
|---|---|---|---|
| Apple Music (`apple_music_liriqo`) | raw TTML | `@braccato/parsers` (TTML) | per-syllable parts, background vocals (`isBackground`), agents (`v1`/`v2`), instrumentals, songwriters, TTML translations/romanizations |
| Unison (`unison_community`) | raw TTML | `@braccato/parsers` (TTML) | intact word text, agents, instrumentals |
| QQ Music (`qq_portato`) | raw QRC | built-in QRC parser (singer detection) | per-syllable, **duet agents** (`v1`/`v2`, group → `v1000`), instrumentals, songwriters, translations |
| KuGou (`kugou_legato`) | `timed[].words` | word markup builder | per-syllable word sync |
| LRCLib (`lrclib`) | line LRC | `@braccato/parsers` (LRC) | line sync |
| NetEase (`netease`) | line LRC | `@braccato/parsers` (LRC) | line sync + **per-line translations** |
| YTM (`ytm_line`) | line LRC / plain | `@braccato/parsers` (LRC) / plain parser | line sync / unsynced |

Provider order **follows the server's quality order** (the `tracks` array), with
a fallback chain for the `richsynced` slot: `TTML → QRC → word builder`; the
`synced` slot comes from tier `Cipali` and the `plain` slot from tier `Bocimi`.

## Usage

```js
import { getLiriQoLyrics } from "./lyrics-parser/src/index.js";

const result = await getLiriQoLyrics("HaEYUJ2aRHs", {
  duration: 200,          // song duration in SECONDS (recommended)
  song: "Dynamite",       // title hint (improves QRC singer filtering)
  artist: "BTS",          // artist hint
  // baseUrl: "https://api.liriqo-alfarrizi.my.id/v1",
  // signal: abortSignal, timeout: 15000, instrumentalGapMs: 5000
});

if (result.richsynced) {
  console.log("Source:", result.provider);            // apple_music_liriqo, etc.
  for (const line of result.richsynced.lyrics) {
    console.log(line.startTimeMs, line.words);
    if (line.agent) console.log("  singer:", line.agent);          // v1 / v2 / v1000
    for (const part of line.parts ?? []) {
      if (part.isBackground) console.log("  [background]", part.words);
    }
  }
}
```

Live demo (requires connection to the API):

```
node lyrics-parser/test/demo.mjs
```

## Result shape

```js
{
  richsynced: { lyrics: [...], source, sourceHref, cacheAllowed, language, songwriters, provider } | null,
  synced:     { ... } | null,
  plain:      { ... } | null,
  provider:      "apple_music_liriqo" | ...,   // winner of the richsynced slot
  syncedProvider: "netease" | ...,             // winner of the synced slot
  plainProvider:  "..." | null,                // winner of the plain slot
  route:         "ttml" | "qrc" | "words" | "lrc" | "plain" | null
}
```

Each lyric line (`lyrics[i]`):

```js
{
  startTimeMs: 200,          // line start (ms)
  words: "'Cause, ah-ah...", // line text
  durationMs: 2968,
  parts: [                   // karaoke units (per word/syllable)
    { startTimeMs: 200, words: "'Cause,", durationMs: 344 },
    { startTimeMs: 544, words: " ",  durationMs: 0 },              // explicit space
    { startTimeMs: 544, words: "ah-", durationMs: 470, isBackground: true } // background vocal
  ],
  agent: "v1",               // singer (duet): v1 / v2, group: v1000
  isInstrumental: false,     // instrumental line (gap > instrumentalGapMs)
  translation: { text: "...", lang: "zh" },   // translation (QQ/NetEase)
  translations: { zh: "..." }
}
```

## Individual functions

| Function | File | Purpose |
|---|---|---|
| `getLiriQoLyrics(videoId, options)` | `src/index.js` | full orchestrator |
| `fetchLiriQoLyrics(videoId, options)` | `src/api.js` | `/lyrics` client (in-flight dedup, timeout) |
| `searchLiriQoVideoId(query, options)` | `src/api.js` | resolve `/search` → videoId |
| `parseTTML(ttml, options)` | `src/ttml.js` | TTML → lyrics (agents, background vocals, instrumentals, songwriters) |
| `parseQrc(qrc, durationMs, meta)` | `src/qrc.js` | QRC → lyrics (singer agents, parts, songwriters) |
| `extractSongwriters(qrc)` | `src/qrc.js` | songwriters from QRC metadata |
| `buildWordSyncedLRC(track, anchor, durationMs, {wantWords})` | `src/words.js` | build enhanced-LRC from word data (embedded/granular + anchor re-distribution) |
| `parseLrcLyrics(lrc, durationMs, options)` | `src/lrc.js` | LRC → lyrics (A2 word tags, `[bg:]`, `[offset:]`, instrumentals) |
| `parsePlain(plain)` / `stripLrcTimestamps(lrc)` | `src/lrc.js` | unsynced |
| `attachTranslations(lines, translation, lang)` | `src/translations.js` | attach per-line translations (1:1) |
| `pickTrack(tracks, tier, options)` | `src/select.js` | best track per tier (`Jagorawi`/`Cipali`/`Bocimi`) |
| `pickAnchorTrack(tracks, wordTrack, durationMs)` | `src/select.js` | line track used as the word-sync window authority |
| `hasWordData` / `isRealTrack` / `fitsDuration` / `isGranularWordTiming` | `src/select.js` | track validators |
| `insertInstrumentalLines(lines, durationMs, gapMs)` | `src/util.js` | insert instrumental lines for gaps > gapMs |
| `formatLrcTime` / `wordSeparator` / `stringSimilarity` / `createResult` | `src/util.js` | utilities |

### Word-sync note (KuGou/LRCLib)

Word timing from some providers is distributed inside a rigid time window
(`start + 5000ms`) that can overflow into the next line. This parser rebuilds
the timing using the **true line windows** from a line-synced track
(`pickAnchorTrack`) and distributes the words proportionally inside them, so
line starts are always accurate.

## Structure

```
lyrics-parser/
├── src/
│   ├── index.js         # orchestrator (getLiriQoLyrics)
│   ├── api.js           # API client + in-flight dedup
│   ├── select.js        # track selection & validation
│   ├── ttml.js          # Apple Music / Unison route (TTML)
│   ├── qrc.js           # QQ Music route (QRC + singer agents)
│   ├── words.js         # word-sync builder (embedded/granular + anchor)
│   ├── lrc.js           # line-sync / plain route
│   ├── translations.js  # per-line translations
│   └── util.js          # shared utilities
├── node_modules/        # vendored dependencies (offline)
├── test/demo.mjs        # live demo
└── package.json
```

## Attribution

Vendored dependencies under `node_modules/` (their own MIT/Apache-2.0 licenses apply):

- [`@braccato/parsers`](https://github.com/better-lyrics) — TTML/LRC/QRC/SRT/plain parsers
- [`fast-xml-parser`](https://github.com/NaturalIntelligence/fast-xml-parser) + sub-dependencies
  (`xml-naming`, `path-expression-matcher`, `@nodable/entities`, `is-unsafe`, `strnum`, `anynum`)

Overall license: **MIT** (see the [`LICENSE`](../LICENSE) at the repo root).

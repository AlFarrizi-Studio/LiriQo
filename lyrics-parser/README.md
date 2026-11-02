# LiriQo Lyrics Parser 1.1.0

Client-side adapter for the current LiriQo API (`v1.5.1`). It converts provider payloads into Better-Lyrics-compatible objects. **This package is not the provider backend**: it does not retrieve Musixmatch tokens, decrypt encrypted QRC/KRC blobs, or fetch provider endpoints directly.

## Requirements

- Node.js **20.3+**, or a browser bundler with `fetch`, `AbortController` and compatible dependencies.
- Existing dependencies in this folder's `node_modules` are locally vendored. Keep that directory when copying the folder. It is not a self-contained npm-published package; `package.json` is intentionally private. A fresh checkout without those dependencies needs the same compatible parser dependencies supplied before use.
- Parsing an existing payload is offline. `getLiriQoLyrics`, `fetchLiriQoLyrics`, `searchLiriQoVideoId`, and the live demo require network access.

## Choose the operation

| Need | Function | Network? |
|---|---|---|
| Fetch a video and parse its lyrics | `getLiriQoLyrics(videoId, options)` | LiriQo API only |
| Fetch the original API JSON | `fetchLiriQoLyrics(videoId, options)` | LiriQo API only |
| Parse saved/already-fetched JSON | `parseLiriQoResponse(payload, options)` | No |
| Parse raw native NetEase YRC | `parseYrc(yrc)` | No |
| Parse raw Musixmatch richsync JSON/array | `parseMusixmatchRichsync(richsync)` | No |
| Convert normalized `timed[]` and native words | `normalizedTrackToLyrics(track, options)` | No |
| Read actual provider attribution | `getTrackAttribution(track)` | No |

## 1. Fetch and parse

From the parent folder, save an ESM script:

```js
import { getLiriQoLyrics, ApiError } from './lyrics-parser/src/index.js';

try {
  const result = await getLiriQoLyrics('HaEYUJ2aRHs', {
    duration: 199,
    song: 'Dynamite',
    artist: 'BTS',
    timeout: 30000,
    instrumentalGapMs: 5000,
  });

  const chosen = result.richsynced ?? result.synced ?? result.plain;
  if (!chosen) {
    console.log('No usable lyrics');
  } else {
    console.log(chosen.provider, chosen.source, chosen.lyricsSource);
    for (const line of chosen.lyrics) {
      console.log(line.startTimeMs, line.words);
      for (const part of line.parts ?? []) {
        console.log(part.startTimeMs, part.durationMs, part.words);
      }
    }
  }
} catch (error) {
  if (error instanceof ApiError && [429, 503].includes(error.status)) {
    console.log('Retry later:', error.retryAfter, 'seconds');
  } else {
    throw error;
  }
}
```

`duration` is **seconds**. Returned line/word timestamps and durations are **milliseconds**. Do not multiply the returned values by 1000. `instrumentalGapMs: 0` disables generated gap markers on the normalized timing route.

The client does not automatically retry throttled requests or fetch challenge tokens. It exposes `ApiError.status`, `ApiError.retryAfter` (seconds or null), and `ApiError.code` so the calling application controls retries. A `429` is not missing lyrics.

## 2. Parse an existing response without fetching

```js
import { parseLiriQoResponse } from './lyrics-parser/src/index.js';

const payload = {
  metadata: { duration: 120 },
  tracks: [{
    provider: 'netease',
    syncLevel: 'word',
    tier: 'Jagorawi',
    upstreamProvider: 'NetEase Cloud Music',
    timed: [{
      id: 0,
      text: 'Hello world',
      start: 1234,
      end: 3456,
      words: [
        { text: 'Hello ', start: 1234, end: 1765 },
        { text: 'world', start: 1900, end: 3456 },
      ],
    }],
  }],
};

const result = parseLiriQoResponse(payload, { instrumentalGapMs: 0 });
console.log(result.richsynced.lyrics[0]);
```

Native word ends and gaps remain intact. For example, `1234..1765` becomes `startTimeMs: 1234, durationMs: 531`; it is not converted through centisecond LRC or stretched proportionally.

## 3. Parse raw provider formats

```js
import {
  parseYrc,
  parseMusixmatchRichsync,
  normalizedTrackToLyrics,
} from './lyrics-parser/src/index.js';

const yrcLines = parseYrc(
  '[1000,2000](1000,800,0)Hello (1800,1200,0)world',
);
const richsyncLines = parseMusixmatchRichsync([
  { ts: 1, te: 3, x: 'Hello world', l: [
    { o: 0, c: 'Hello ' },
    { o: 0.8, c: 'world' },
  ] },
]);

const parsed = normalizedTrackToLyrics({
  provider: 'musixmatch',
  timed: richsyncLines,
}, { instrumentalGapMs: 0 });
console.log(parsed.isWordSynced, parsed.lyrics);
```

- YRC line and word timestamps are native **absolute milliseconds**.
- Musixmatch `ts`/`te` and word offsets `o` are **seconds** in the input; offsets are relative to the line start. They are converted once to absolute milliseconds.
- Raw malformed inputs return an empty array; invalid word offsets may preserve valid line text without inventing words.
- QRC input must already be decrypted. KRC input must already be decoded/normalized; encrypted blobs are not handled by this client parser.

## Provider support and selection

| Provider | Accepted payloads | Notes |
|---|---|---|
| Apple Music | TTML, native normalized words/lines, LRC, plain | TTML background vocals, singer agents and metadata retained where supplied |
| Musixmatch | Native richsync or normalized words | Actual word boundaries, not proportional timing |
| Unison | TTML, normalized timing, LRC/plain | Native fields retained |
| NetEase | **YRC**, normalized words, LRC, plain | Word-sync and translations |
| KuGou | Normalized KRC words/lines, plain | No encrypted KRC decoder in this package |
| QQ Music | Decrypted QRC, normalized words/lines, plain | QRC singer/metadata support |
| LRCLib | Line timing/LRC and plain | No invented word timing; legacy `lrclib_wordsync` tracks are ignored |
| YTM | Normalized line/plain timing, LRC/plain | Preserves `lyricsSource` and `upstreamProvider` evidence |

High-quality candidates are ordered **Apple Music → Musixmatch → Unison → NetEase → KuGou → QQ Music**. Line/plain slots use **Apple Music → LRCLib → Unison → NetEase → KuGou → QQ Music → YTM**. Unknown providers follow known ones; no missing provider is fabricated.

Each track tries its usable representations: TTML, decrypted QRC, raw YRC/richsync, normalized native timing, then LRC. A failed raw representation no longer prevents that same track's normalized fallback. The `richsynced` slot requires actual word parts, rather than trusting a `Jagorawi` label. Duration mismatch checks also apply to rich candidates.

A `synced` slot can be derived from the chosen provider's line windows even when its richsync exists. A `plain` slot can use `plain`, stripped LRC, or timed-line text. Empty input yields stable null slots, not an exception.

## Attribution

Every non-null slot includes `provider`, `upstreamProvider`, `lyricsSource`, and `source`, in addition to the existing result fields. For `ytm_line`, attribution such as `YouTube Music (LyricFind)` or `YouTube Music (Musixmatch)` is based only on `lyricsSource`/`upstreamProvider` metadata in the API response. Missing evidence stays `YouTube Music`; the parser does not guess a licensor from the lyric text.

## Result contract

```js
{
  richsynced: null,
  synced: null,
  plain: null,
  provider: null,
  syncedProvider: null,
  plainProvider: null,
  route: null,
}
```

A populated slot contains `{ lyrics, source, sourceHref, cacheAllowed, language, songwriters, provider, upstreamProvider, lyricsSource, musicVideoSynced }`. `route` identifies the best parsed representation: `ttml`, `qrc`, `yrc`, `richsync`, `words`, `timed`, `lrc`, or `plain`.

Each line contains `startTimeMs`, `durationMs`, and `words` (line text). Word/syllable units are in `parts[]`; native `agent`, `isBackground`, `songPart`, cue/instrumental and explicit flags are preserved when provided. Plain lines have zero timing. Translation attachment remains line-count based; unmatched translations are not arbitrarily aligned. `romanization` remains available in the raw API payload and is not automatically positioned by this wrapper.

## Client cancellation and coalescing

Identical fetches share an upstream request using base URL, video ID, timeout and output-affecting metadata. One caller's cancellation does not cancel other consumers; if all consumers leave, upstream is aborted. Distinct in-flight requests and response-body size are bounded. Invalid URLs, timeout values and malformed responses produce sanitized `ApiError`s.

## Tests

Run **inside this folder**:

```sh
npm test
npm run check
```

Tests use mocked fetch and documentation fixtures, not live API/provider traffic. There is no configured lint or TypeScript typecheck command. The separate live demo is explicitly opt-in:

```sh
npm run demo
```

## Compatibility and dependencies

Existing named exports such as `parseTTML`, `parseQrc`, `parseLrcLyrics`, `buildWordSyncedLRC`, `pickTrack`, and `getLiriQoLyrics` remain. Legacy word-building/anchor helpers are still exported for callers that explicitly need them, but the main response parser no longer redistributes native word timing through them.

Vendored third-party dependencies retain their own license terms. This update does not relicense those dependencies or imply that package metadata alone licenses every bundled artifact. This is a local source update; it was not published to npm or pushed to GitHub.

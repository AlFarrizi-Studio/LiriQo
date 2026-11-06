# LiriQo Lyrics Parser 1.2.0

Client-side adapter for the current LiriQo API (`v1.5.1`+). It converts provider payloads into Better-Lyrics-compatible objects. **This package is not the provider backend**: it does not retrieve Musixmatch tokens, decrypt encrypted QRC/KRC/LRCX/MRC blobs, or fetch provider endpoints directly.

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
| Normalize one provider track with quality metadata | `normalizeProviderTrack(track, options)` | No |
| Parse raw native NetEase YRC / KuGou KRC | `parseYrc(yrc)` | No |
| Parse raw Musixmatch richsync JSON/array | `parseMusixmatchRichsync(richsync)` | No |
| Parse decoded Kuwo LRCX | `parseKuwoLrcx(text)` | No |
| Parse decrypted Migu MRC | `parseMiguMrc(text)` | No |
| Parse PetitLyrics WSY XML | `parsePetitLyricsWsy(xml)` | No |
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

Runnable examples live in `examples/`: `basic-usage.mjs` (fetch + parse), `native-word.mjs` (offline word iteration), `native-character.mjs` (offline CJK character sweep), `normalized-response.mjs` (tiers, partial fast results, translations, background vocals).

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

Responses are accepted in every shape the API produces: full results, `mode: 'fast'` partial results (`partial: true`), `primary`-only envelopes (parsed when `primary` is not already duplicated inside `tracks`), and empty payloads (stable null slots, no exception).

## 3. Parse raw provider formats

```js
import {
  parseYrc,
  parseMusixmatchRichsync,
  parseKuwoLrcx,
  parseMiguMrc,
  parsePetitLyricsWsy,
  normalizedTrackToLyrics,
} from './lyrics-parser/src/index.js';

const yrcLines = parseYrc('[1000,2000](1000,800,0)Hello (1800,1200,0)world');
const richsyncLines = parseMusixmatchRichsync([
  { ts: 1, te: 3, x: 'Hello world', l: [{ o: 0, c: 'Hello ' }, { o: 0.8, c: 'world' }] },
]);
const kuwoLines = parseKuwoLrcx('[kuwo:641]\n[0:10.000]<0,41>你<123,0>好<205,0>世<287,0>界');
const miguLines = parseMiguMrc('[12000,2200]hello (12000,600)my (12600,900)world (13500,700)');
const petitLines = parsePetitLyricsWsy(
  '<wsy><line><linestring>ハロー</linestring>' +
  '<word><wordstring>ハ</wordstring><starttime>1000</starttime><endtime>1300</endtime></word>' +
  '<word><wordstring>ロ</wordstring><starttime>1300</starttime><endtime>1600</endtime></word>' +
  '<word><wordstring>ー</wordstring><starttime>1600</starttime><endtime>1900</endtime></word></line></wsy>',
);
```

### Raw vs normalized parsing — the two capabilities

- **Normalized parsing (always available for every provider)**: the API ships provider tracks with a normalized `timed[]` array (line `start`/`end` ms) and native `words` units. `normalizedTrackToLyrics` / `normalizeProviderTrack` / `parseLiriQoResponse` consume this directly. This is the primary, production path — **the Termux backend already decodes/decrypts everything upstream**.
- **Raw parsing (optional helpers)**: `parseYrc` (NetEase YRC), `parseQrc` (already-decrypted QQ QRC), `parseMusixmatchRichsync`, `parseKuwoLrcx` (already zlib/XOR-decoded Kuwo LRCX body), `parseMiguMrc` (already XXTEA/UTF-16LE-decrypted Migu MRC body), `parsePetitLyricsWsy` (decoded PetitLyrics WSY XML). These consume **decoded text only** — encrypted/transport layers (token minting, zlib, XOR, XXTEA) intentionally stay in the backend and are not duplicated here. `parseTrack` also accepts raw payloads exposed on a track (`krc`, `lrcx`, `mrc`, `wsy` keys) as alternate routes.

Format notes:

- YRC/KRC line and unit timestamps are native **absolute milliseconds** (KRC's `(start,dur,0)` tuples parse like YRC).
- Kuwo LRCX: per-unit `<a,b[,c]>` markers encode timing through the octal `[kuwo:NNN]` key (`unit.start = lineStart + round(|a+b|/(2*k1))`, `unit.end = start + round(|a-b|/(2*k2))`). CJK character segmentation and negative markers are preserved; null word arrays and all-zero markers fall back to line timing.
- Migu MRC: units are `text(startMs,durationMs)` with absolute milliseconds; each marker times the text **preceding** it, and the last unit needs its own trailing marker.
- PetitLyrics WSY: `<word>` units carry native `<starttime>/<endtime>`; a Japanese line without unit timing is never treated as one giant word and never receives fabricated character timing (unit-less WSY lines are dropped, mirroring the backend; line-only PetitLyrics arrives via LRC).
- Musixmatch `ts`/`te` and word offsets `o` are **seconds** in the input; offsets are relative to the line start and are converted once to absolute milliseconds. RichSync `o` offsets are native unit starts; unit **ends are derived** (next native start or the line end) and every unit is annotated `derivedEnd: true`.
- Raw malformed inputs return an empty array; invalid unit sets preserve valid line text without inventing words.

## Provider support and selection

| Provider | Canonical ID | Accepted payloads | Native sync | Notes |
|---|---|---|---|---|
| Apple Music | `apple_music_liriqo` | TTML, native normalized words/lines, LRC, plain | Syllable (TTML) | background vocals, singer agents and metadata retained where supplied |
| Musixmatch | `musixmatch_richsync` (alias `musixmatch`) | Native richsync or normalized words | Word (derived ends labelled) | client-side parsing only; no token/auth handling |
| Unison | `unison_community` (alias `unison`) | TTML, normalized timing, LRC/plain | Syllable/Line | native fields retained |
| NetEase | `netease` | **YRC**, normalized words, LRC, plain | Word | word-sync and translations |
| PetitLyrics | `petitlyrics` | WSY XML, normalized character/word/line, LRC/plain | Character | Japanese Unicode, surrogate pairs, inferred ends |
| KuGou | `kugou_legato` | **KRC**, normalized KRC words/lines, plain | Word | no encrypted KRC decoder in this package |
| Kuwo | `kuwo` | **LRCX** (decoded), normalized words/lines, LRC, plain | Character/Word | CJK reconstruction, negative markers, line/plain fallback |
| Migu | `migu` | **MRC** (decrypted), normalized words/lines, LRC, plain | Character/Word | translation only when line counts match; Chinese Unicode preserved |
| QQ Music | `qq_portato` | Decrypted QRC, normalized words/lines, plain | Word | QRC singer/metadata support |
| LRCLib | `lrclib` | Line timing/LRC and plain | Line | no invented word timing; legacy `lrclib_wordsync` tracks are ignored (derived timing is never native) |
| YTM | `ytm_line` | Normalized line/plain timing, LRC/plain | Line | preserves `lyricsSource` and `upstreamProvider` evidence |

`lrclib_wordsync` (derived proportional timing) has **no alias and no rich route** in this parser.

### Selection order (v1.2.0)

1. **Evidence-based sync quality first**: a track whose parsed lines carry validated native granular units (word/syllable/character) beats a track with only line timing or an invalid `words[]` claim — provider priority never overrides real evidence.
2. **Canonical provider priority** from the registry (mirrors the production scheduler):
   - Rich (Jagorawi-capable): Apple Music → Musixmatch → Unison → NetEase → PetitLyrics → KuGou → Kuwo → Migu → QQ Music.
   - Line/plain slots: Apple Music → LRCLib → Unison → NetEase → KuGou → Kuwo → Migu → QQ Music → YTM (+ PetitLyrics, Musixmatch for plain).
3. **Stable tie-break** on the server's response order.

Unknown providers rank after every known provider of equal claim strength; they can still win the tier race (native word from an unknown provider beats line timing from Apple Music). Each track tries its usable representations: TTML, decrypted QRC, raw YRC/KRC/LRCX/MRC/WSY/richsync, normalized native timing, then LRC. A failed raw representation never prevents that same track's normalized fallback. The `richsynced` slot requires actual validated word parts rather than trusting a `Jagorawi` label. Duration mismatch checks also apply to rich candidates.

## Timing integrity (native vs derived)

- **Native**: every unit timestamp originates from the provider format (TTML spans, YRC/KRC/QRC/LRCX/MRC markers, WSY words, normalized `timed[].words` validated server-side). Pauses and overlaps between units are preserved.
- **Derived**: only Musixmatch unit *ends* (next native start or line end), annotated `derivedEnd: true` on each part. Proportional/estimated timing (e.g. legacy `lrclib_wordsync`) is rejected outright and can never masquerade as native.
- A line whose units are multi-token chunks (coarse RichSync phrases) is labelled `granularity: "phrase"` — the timing stays unit-native but coarse granularity is reported honestly instead of being sold as word-level.
- Invalid values are rejected end-to-end: NaN/Infinity, negative or non-integer ms, zero-duration unit sets, descending starts, units outside their line window, and duration overflow never reach the output.

## Attribution

Every non-null slot includes `provider`, `upstreamProvider`, `lyricsSource`, and `source`, in addition to the existing result fields. For `ytm_line`, attribution such as `YouTube Music (LyricFind)` or `YouTube Music (Musixmatch)` is based only on `lyricsSource`/`upstreamProvider` metadata in the API response. Missing evidence stays `YouTube Music`; the parser does not guess a licensor from the lyric text. Kuwo attributes to `Kuwo Music`, Migu to `Migu Music`, PetitLyrics to `PetitLyrics`.

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

A populated slot contains `{ lyrics, source, sourceHref, cacheAllowed, language, songwriters, provider, upstreamProvider, lyricsSource, musicVideoSynced }`. `route` identifies the best parsed representation: `ttml`, `qrc`, `yrc`, `krc`, `lrcx`, `mrc`, `wsy`, `richsync`, `words`, `timed`, `lrc`, or `plain`.

Each line contains `startTimeMs`, `durationMs`, and `words` (line text). Word/syllable/character units are in `parts[]`; native `agent`, `isBackground`, `songPart`, cue/instrumental and explicit flags are preserved when provided. Lines with native units also carry `granularity` (`"word"`, `"character"` or `"phrase"`). Plain lines have zero timing. Translation attachment is line-count based against the pre-instrumental source lines; unmatched translations are not arbitrarily aligned. `romanization` remains available in the raw API payload and is not automatically positioned by this wrapper.

## Client cancellation and coalescing

Identical fetches share an upstream request using base URL, video ID, timeout and output-affecting metadata. One caller's cancellation does not cancel other consumers; if all consumers leave, upstream is aborted. Distinct in-flight requests and response-body size are bounded. Invalid URLs, timeout values and malformed responses produce sanitized `ApiError`s.

## Tests

Run **inside this folder**:

```sh
npm test      # 82 deterministic tests
npm run check # syntax check over every module
npm run examples
```

Tests use mocked fetch and documentation fixtures, not live API/provider traffic. There is no configured lint or TypeScript typecheck command. The separate live demo is explicitly opt-in:

```sh
npm run demo
```

## Compatibility and dependencies

All 1.1.0 named exports (`getLiriQoLyrics`, `fetchLiriQoLyrics`, `parseLiriQoResponse`, `parseTTML`, `parseQrc`, `parseYrc`, `parseMusixmatchRichsync`, `normalizedTrackToLyrics`, `getTrackAttribution`, `parseLrcLyrics`, `parsePlain`, `buildWordSyncedLRC`, `pickTrack`, `ApiError`, …) keep their names, signatures and result contracts. New exports (`parseKuwoLrcx`, `parseMiguMrc`, `parsePetitLyricsWsy`, `normalizeProviderTrack`, `unitGranularity`, registry helpers) are additive. The two additive output fields are per-line `granularity` (only when native parts exist) and result-level `timingOrigin`/`granularity`.

Vendored third-party dependencies (`@braccato/parsers` and its transitive dependencies) retain their own license terms; this package adds no new runtime dependencies. This update does not relicense those dependencies or imply that package metadata alone licenses every bundled artifact. This is a local source update; it was not published to npm or pushed to GitHub.

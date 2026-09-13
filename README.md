# LiriQo Lyrics API

> Real-time multi-provider lyrics resolver. Pull **syllable / word / line-synced** lyrics and karaoke timing from **Apple Music, QQ Music, KuGou, NetEase Cloud Music, Musixmatch, LyricFind, LRCLib** and more — via a single endpoint. Auto-detect from videoId, ISRC, title+artist, or any music provider URL (Spotify, Apple Music, Tidal, YouTube, song.link, Rythm, etc).

🌐 **Website & Live Demo:** [https://api-liriqo.web.app/](https://api-liriqo.web.app/)
⚡ **API:** [https://api.liriqo-alfarrizi.workers.dev/v1](https://api.liriqo-alfarrizi.workers.dev/v1)

---

## ✨ Features

- 🎯 **One endpoint to rule them all** — `/lyrics` accepts videoId, ISRC, title+artist, or any music provider URL
- ⚡ **Smart auto-detection** — accepts `?v=`, `?Q=`, `?isrc=`, `?url=`, or `?title=&artist=` and routes accordingly
- 🎤 **Word & syllable karaoke timing** — Apple Music-style syllable sync (via [binimum/am-lyrics](https://github.com/binimum/am-lyrics) LyricsPlus/KPoe), QQ Music QRC word-by-word + translation, KuGou KRC word-by-word
- 🇨🇳 **CJK providers built-in** — QQ Music, KuGou, NetEase Cloud Music via direct API ([LDDC](https://github.com/chenmozhijin/LDDC) technique — no third-party proxy, QRC/KRC decrypted in-worker)
- 🎵 **Multi-provider URL support** — Spotify, Apple Music, Tidal, YouTube, song.link, Rythm, generic web pages
- 📊 **Live stats dashboard** — request log, per-provider success rate & latency, error breakdown
- 🛡️ **Resilient fallback chain** — 9 tracks from 9 providers run in **parallel** with per-provider timeout, sorted by sync quality: syllable → word → line → plain
- 🔓 **No auth, CORS-enabled** — works from any client (browser, mobile, server)

### Lyric providers (9)

| Provider | Sync level | Source | Extras |
|---|---|---|---|
| **AMLyrics** (Apple Music) | syllable | LyricsPlus/KPoe — [am-lyrics](https://github.com/binimum/am-lyrics) | words array, songParts, songwriters |
| **GoLyrics** (Apple Music) | syllable | Boidu lyrics-api | raw TTML |
| **BiniLyrics** (Apple Music) | word | lyrics-api.binimum.org | raw TTML, ISRC |
| **QQ Music** | word | direct `musicu.fcg` (LDDC) | karaoke words, translation, romanization |
| **KuGou** | word | direct `lyrics.kugou.com` (LDDC) | karaoke words |
| **LRCLib** | line + word | lrclib.net | word timing via proportional distribution |
| **NetEase Cloud Music** | line | music.163.com | translation |
| **YTM Line** | line | YouTube Music `timedLyricsData` (Musixmatch / LyricFind sourced) | multi-client InnerTube (web/android/ios) |
| **Unison** | any | community DB (unison.boidu.dev) | vote counts |

---

## 📡 API Endpoints

Base URL: `https://api.liriqo-alfarrizi.workers.dev/v1`

| Method | Short Path | Full Path | Description |
|---|---|---|---|
| `GET` | `/lyrics` | `/v1/lyrics` | All available lyrics from 9 providers (sorted by sync quality) |
| `GET` | `/lrc` | `/v1/lrc` | LRC synced lyrics only (text/plain) |
| `GET` | `/plain` | `/v1/plain` | Plain text lyrics only (JSON) |
| `GET` | `/ttml` | `/v1/ttml` | Raw TTML — Apple Music syllable format |
| `GET` | `/search` | `/v1/search` | Resolve videoId + metadata only (no lyrics fetch) |
| `GET` | `/stats` | `/v1/stats` | Live stats: requests, per-provider perf, request log |
| `GET` | `/health` | `/v1/health` | Health check (`?upstream=1` tests all 7 upstreams) |
| `GET` | `/` | `/v1` | Endpoint list / docs (JSON or HTML) |

### Smart params — accepted by `/lyrics` & `/search`

| Param | Example | Behavior |
|---|---|---|
| `?v=` | `?v=HaEYUJ2aRHs` | Direct videoId → fetch lyrics |
| `?Q=` | `?Q=Dynamite+BTS` | Title search → resolve metadata → fetch lyrics |
| `?isrc=` | `?isrc=QM7282022872` | ISRC lookup (MusicBrainz) → resolve → fetch |
| `?url=` | `?url=https://open.spotify.com/track/...` | Any provider URL → resolve → fetch |
| `?title=&artist=` | `?title=Dynamite&artist=BTS&duration=199` | Explicit metadata → search → fetch |

Extra: `&debug=1` on `/lyrics` shows per-provider debug status.

---

## 🚀 Quick start

### Get all lyrics by YouTube videoId
```bash
curl "https://api.liriqo-alfarrizi.workers.dev/v1/lyrics?v=HaEYUJ2aRHs"
```

### Get LRC synced lyrics
```bash
curl "https://api.liriqo-alfarrizi.workers.dev/v1/lrc?v=HaEYUJ2aRHs"
```

### Get Apple Music TTML (syllable)
```bash
curl "https://api.liriqo-alfarrizi.workers.dev/v1/ttml?v=HaEYUJ2aRHs"
```

### Search by song title (auto-resolves metadata)
```bash
curl "https://api.liriqo-alfarrizi.workers.dev/v1/lyrics?Q=Dynamite+BTS"
```

### Lookup by ISRC
```bash
curl "https://api.liriqo-alfarrizi.workers.dev/v1/lyrics?isrc=QM7282022872"
```

### JavaScript fetch example
```js
const res = await fetch('https://api.liriqo-alfarrizi.workers.dev/v1/lyrics?v=HaEYUJ2aRHs');
const data = await res.json();

// Available fields:
// data.videoId, data.metadata     // { title, artist, album, duration, isrc }
// data.count                      // number of tracks found
// data.primary                    // best track (highest sync quality)
// data.tracks[]                   // all tracks, each:
//   .provider                     // "amlyrics_apple_music" | "qq_portato" | "kugou_legato" | ...
//   .syncLevel                     // "syllable" | "word" | "line" | "plain"
//   .plain                        // plain text lyrics
//   .timed[]                      // [{ text, start, end, id, words? }]
//   .words?[]                     // per-word timing: [{ text, start, end }]
//   .translation?                 // translated lyrics (QQ/NetEase)
//   .qrc? / .krc? / .ttml?        // raw upstream formats
```

---

## 📊 Response format

### `/lyrics` — full payload (abridged)
```json
{
  "videoId": "HaEYUJ2aRHs",
  "metadata": { "title": "Dynamite", "artist": "BTS", "album": "BE", "duration": 199, "isrc": "QM7282022872" },
  "count": 9,
  "tookMs": 2140,
  "primary": { "provider": "golyrics_apple_music", "syncLevel": "syllable", "...": "..." },
  "tracks": [
    { "provider": "golyrics_apple_music", "syncLevel": "syllable", "timed": [ "... 62 lines" ], "ttml": "<tt ..." },
    { "provider": "amlyrics_apple_music",  "syncLevel": "syllable", "timed": [ "..." ], "words": [ "..." ], "songwriters": [ "David Stewart", "Jessica Agombar" ] },
    { "provider": "lrclib_wordsync",       "syncLevel": "word", "timed": [ "..." ] },
    { "provider": "binimum_apple_music",   "syncLevel": "word", "timed": [ "..." ] },
    { "provider": "qq_portato",            "syncLevel": "word", "timed": [ "..." ], "words": [ "..." ], "translation": "..." },
    { "provider": "kugou_legato",          "syncLevel": "word", "timed": [ "..." ], "words": [ "..." ] },
    { "provider": "lrclib",                "syncLevel": "line", "timed": [ "..." ] },
    { "provider": "netease",               "syncLevel": "line", "timed": [ "..." ], "translation": "..." },
    { "provider": "ytm_line",              "syncLevel": "line", "timed": [ "..." ], "upstreamProvider": "YouTube Music (Musixmatch)" }
  ]
}
```

### `/stats` — live stats
```json
{
  "totalRequests": 734,
  "successCount": 595,
  "failedCount": 139,
  "errorRate": "18.9",
  "avgLatency": 3138,
  "p99Latency": 11135,
  "providers": [
    { "name": "Apple Music", "avgLatency": 1650, "successRate": 96, "total": 45, "statuses": [ 200 ] },
    { "name": "QQ Music", "avgLatency": 1180, "successRate": 92, "total": 40, "statuses": [ 200 ] },
    { "name": "KuGou", "...": "..." },
    { "name": "NetEase Cloud Music", "...": "..." },
    { "name": "Musixmatch", "...": "..." },
    { "name": "LRCLib", "...": "..." },
    { "name": "Unison", "...": "..." },
    { "name": "LyricFind", "...": "..." }
  ],
  "errorCounts": { "provider error": 16 },
  "recentLog": [
    { "status": "ok", "title": "Dynamite", "artist": "BTS", "provider": "Apple Music", "endpoint": "/lyrics", "timeMs": 2140, "timestamp": "8:02:31 AM" }
  ]
}
```

---

## 🔍 How it works

```
Input (videoId | ISRC | title+artist | URL)
        ↓
   buildTracksResponse() — resolve videoId & metadata
        ↓
   YouTube Music search / MusicBrainz ISRC / URL parser
        ↓
   LyricsService.getLyricsUnified()
        ↓
   ┌─ Phase 1: LRCLib (fills missing duration)
   │
   └─ Phase 2: all providers in PARALLEL (per-provider timeout)
       ├─ Unison (community)
       ├─ NetEase Cloud Music (music.163.com)
       ├─ YTM Line (InnerTube: web + android + ios clients)
       ├─ BiniLyrics (Apple Music TTML)
       ├─ GoLyrics (Boidu)
       ├─ AMLyrics (LyricsPlus/KPoe — am-lyrics)
       ├─ QQ Music (musicu.fcg → QRC → custom-3DES decrypt)
       └─ KuGou (lyrics.kugou.com → KRC → XOR+zlib decrypt)
        ↓
   Sort by sync quality: syllable (4) > word (3) > line (2) > plain (1)
        ↓
   { tracks, primary, count }
```

**QQ Music word-by-word**: encrypted QRC from `GetPlayLyricInfo` is decrypted in-worker using a custom non-standard 3DES (ported from [LDDC](https://github.com/chenmozhijin/LDDC) / [qrc-decoder](https://github.com/apoint123/qrc-decoder)) + zlib, yielding per-word karaoke timing, translations and romanization — no third-party API key needed.

**YTM Line**: `ANDROID_MUSIC` InnerTube client (`timedLyricsData`) returns line-timed lyrics sourced from Musixmatch/LyricFind — no PO token required. Fallback to `IOS_MUSIC`, then `WEB_REMIX` (plain).

---

## 📄 License

MIT — see [LICENSE](LICENSE).

© 2026 AlFarrizi-Studio. All Rights Reserved.

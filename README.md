# LiriQo Lyrics API

> Real-time lyrics resolver powered by YouTube Music InnerTube. Pull LRC-synced or plain lyrics from **LyricFind** and **Musixmatch** via a single endpoint. Auto-detect from videoId, ISRC, title+artist, or any music provider URL (Spotify, Apple Music, Tidal, YouTube, song.link, Rythm, etc).

🌐 **Website & Live Demo:** [https://api-liriqo.pages.dev/](https://api-liriqo.pages.dev/)
📦 **Dashboard:** [https://alfarrizi-studio.github.io/Liriqo/](https://alfarrizi-studio.github.io/LiriQo/)

---

## ✨ Features

- 🎯 **One endpoint to rule them all** — `/search` accepts videoId, ISRC, song title, or any music provider URL
- ⚡ **Smart auto-detection** — base URL `/alfarrizi/v1` accepts `?v=`, `?Q=`, `?isrc=`, or `?url=` and routes accordingly
- 🎵 **Multi-provider URL support** — Spotify, Apple Music, Tidal, YouTube, song.link, Rythm, generic web pages
- 📊 **Live stats dashboard** — request log, performance charts (LyricFind vs Musixmatch), error breakdown by category
- 🛡️ **Resilient fallback chain** — YTM InnerTube → Deezer + iTunes → MusicBrainz + ListenBrainz → Apple Music iTunes → web scrape JSON-LD/OpenGraph
- 🚀 **Cloudflare Pages** — global edge, no cold start, free forever
- 🔓 **No auth, CORS-enabled** — works from any client (browser, mobile, server)

---

## 📡 API Endpoints

Base URL: `https://api-liriqo.pages.dev/alfarrizi/v1`

| Method | Short Path | Full Path | Description |
|---|---|---|---|
| `GET` | `/lyrics` | `/alfarrizi/v1/lyrics` | Full lyrics (plain + LRC) by YT Music videoId |
| `GET` | `/plain` | `/alfarrizi/v1/plain` | Plain text lyrics only (JSON) |
| `GET` | `/lrc` | `/alfarrizi/v1/lrc` | LRC synced lyrics (text/plain) |
| `GET` | `/search` | `/alfarrizi/v1/search` | Unified search — auto-detect from videoId/ISRC/title/URL |
| `GET` | `/lyricfind` | `/alfarrizi/v1/lyricfind` | Force LyricFind provider |
| `GET` | `/musixmatch` | `/alfarrizi/v1/musixmatch` | Force Musixmatch provider |
| `GET` | `/stats` | `/alfarrizi/v1/stats` | Live stats: total requests, success rate, provider hits, performance, request log |
| `GET` | `/scrape` | `/alfarrizi/v1/scrape` | Generic web scrape (debug tool) |
| `GET` | `/multi` | `/alfarrizi/v1/multi` | Multi-provider search (Deezer + iTunes) |
| `GET` | `/spotify` | `/alfarrizi/v1/spotify` | Resolve Spotify track via embed scrape |

### Smart base URL — `/alfarrizi/v1`

The base URL itself is a smart endpoint. Pass **any** of these query params and it auto-routes:

| Param | Example | Behavior |
|---|---|---|
| `?v=` | `?v=HaEYUJ2aRHs` | Direct videoId → fetch lyrics |
| `?Q=` | `?Q=Dynamite+BTS` | Title search → resolve metadata → fetch lyrics |
| `?isrc=` | `?isrc=QM7282022872` | ISRC lookup → resolve → fetch lyrics |
| `?url=` | `?url=https://open.spotify.com/track/...` | Any provider URL → resolve → fetch lyrics |

---

## 🚀 Quick start

### Get full lyrics by YouTube videoId
```bash
curl "https://api-liriqo.pages.dev/alfarrizi/v1/lyrics?videoId=HaEYUJ2aRHs"
```

### Get LRC synced lyrics
```bash
curl "https://api-liriqo.pages.dev/alfarrizi/v1/lyrics/lrc?videoId=HaEYUJ2aRHs"
```

### Search by song title (auto-resolves metadata)
```bash
curl "https://api-liriqo.pages.dev/alfarrizi/v1/search?Q=Dynamite+BTS"
```

### Lookup by ISRC
```bash
curl "https://api-liriqo.pages.dev/alfarrizi/v1/search?isrc=QM7282022872"
```

### Resolve Spotify track
```bash
curl "https://api-liriqo.pages.dev/alfarrizi/v1/search?url=https://open.spotify.com/track/3n3Ppam7vgaVa1iaRUc9Lp"
```

### JavaScript fetch example
```js
const res = await fetch('https://api-liriqo.pages.dev/alfarrizi/v1/lyrics?videoId=HaEYUJ2aRHs');
const data = await res.json();

// Available fields:
// data.videoId, data.title, data.artist, data.album, data.duration
// data.provider     // "LyricFind" | "Musixmatch" | null
// data.plain        // Plain text lyrics
// data.timed        // Array of { text, start, end, id }
// data.synced       // boolean
// data.lrc          // LRC-formatted string (if synced)
```

---

## 📊 Response format

### `/lyrics` — full payload
```json
{
  "videoId": "HaEYUJ2aRHs",
  "title": "Dynamite",
  "artist": "BTS",
  "album": "BE",
  "duration": 199,
  "provider": "Musixmatch",
  "trackId": "t_M6GxuQGhwkR-8",
  "browseId": "MPLYt_M6GxuQGhwkR-8",
  "plain": "'Cause I, I, I'm in the stars tonight\n...",
  "timed": [
    { "text": "'Cause I, I, I'm in the stars tonight", "start": 20000, "end": 25000, "id": 0 },
    ...
  ],
  "synced": true,
  "lrc": "[ti:Dynamite]...",
  "error": null
}
```

### `/stats` — live stats
```json
{
  "total_requests": 734,
  "successful_requests": 595,
  "failed_requests": 139,
  "success_rate": "81.1%",
  "avg_ms": 3295,
  "started_at": "2026-09-04T22:58:22.320Z",
  "uptime_ms": 140083780,
  "live_status": "up",
  "providers": {
    "LyricFind": { "hits": 30, "success_rate": "78.2%" },
    "Musixmatch": { "hits": 28, "success_rate": "85.4%" }
  },
  "performance": { "LyricFind": [...], "Musixmatch": [...] },
  "error_breakdown": [
    { "key": "Lyrics not available", "count": 8, "pct": 47.1 },
    { "key": "ISRC not found", "count": 4, "pct": 23.5 },
    ...
  ],
  "logs": [...]
}
```

Query params for `/stats`:
- `?limit=N` (max 500) — number of logs returned
- `?offset=N` — pagination offset
- `?sort=desc|asc` — newest or oldest first (default `desc`)
- `?logsOnly=1` — return only logs (no full stats)
- `?since=<ISO timestamp>` — filter logs since timestamp

---

## 🔍 How it works

```
Input (videoId | ISRC | title | URL)
        ↓
   unifiedSearch()
        ↓
   parseInputAsQuery() — detect input type
        ↓
   ┌─────────┬──────────┬───────────┐
   ↓         ↓          ↓         ↓
 YT search  Spotify   Tidal     Web scrape
            embed      (HTML
            scrape     JSON-LD)
   ↓         ↓          ↓         ↓
   YTM InnerTube (next + browse)
        ↓
   browseId → lyrics data
        ↓
   getLyrics() — 3 client fallback (web/android/ios)
        ↓
   Result with provider metadata
```
---

## 📄 License

MIT — see [LICENSE](LICENSE).

© 2026 AlFarrizi-Studio. All Rights Reserved.

<div align="center">

<img src="https://raw.githubusercontent.com/AlFarrizi-Studio/LiriQo/refs/heads/main/public/liriqo.png" alt="LiriQo" width="200" />

# LiriQo Lyrics API

### Real-time multi-provider lyrics resolver

**Syllable · Word · Line-synced** lyrics & karaoke timing from **9 providers** — through a **single endpoint**.

[![Live Demo](https://img.shields.io/badge/%F0%9F%8C%90_Live_Demo-api--liriqo.web.app-7c3aed?style=for-the-badge&labelColor=1e1b4b)](https://api-liriqo.web.app/)
[![API Base](https://img.shields.io/badge/%E2%9A%A1_API_Endpoint-v1-0ea5e9?style=for-the-badge&labelColor=082f49)](https://api.liriqo-alfarrizi.workers.dev/v1)
[![Providers](https://img.shields.io/badge/Providers-9-22c55e?style=for-the-badge&labelColor=052e16)](#-lyric-providers)
[![Auth](https://img.shields.io/badge/Auth-None%20Required-f59e0b?style=for-the-badge&labelColor=451a03)](#-features)
[![CORS](https://img.shields.io/badge/CORS-Enabled-ec4899?style=for-the-badge&labelColor=500724)](#-features)
[![License](https://img.shields.io/badge/License-MIT-blueviolet?style=for-the-badge&labelColor=2e1065)](LICENSE)

**Auto-detect from:** `videoId` · `ISRC` · `title + artist` · or **any** music provider URL
(Spotify, Apple Music, Tidal, YouTube, song.link, Rythm, generic web pages)

</div>

---

## 📑 Table of Contents

<details>
<summary><b>Click to expand navigation</b></summary>

- [✨ Features](#-features)
- [🎵 Lyric Providers](#-lyric-providers)
- [📡 API Endpoints](#-api-endpoints)
  - [Smart Parameters](#-smart-parameters)
- [🚀 Quick Start](#-quick-start)
  - [cURL](#curl)
  - [JavaScript / Fetch](#javascript--fetch)
- [📊 Response Format](#-response-format)
  - [`/lyrics` Payload](#lyrics--full-payload)
  - [`/stats` Payload](#stats--live-dashboard)
- [🔍 How It Works](#-how-it-works)
  - [Pipeline Flow](#pipeline-flow)
  - [QRC Decryption](#qrc-decryption-qq-music)
  - [YTM InnerTube Strategy](#ytm-innertube-strategy)
- [📜 License](#-license)

</details>

---

## ✨ Features

<table>
<tr>
<td width="50%" valign="top">

### 🎯 One Endpoint to Rule Them All
`/lyrics` accepts `videoId`, `ISRC`, `title+artist`, or **any** music provider URL. No juggling different APIs.

### ⚡ Smart Auto-Detection
Pass `?v=`, `?Q=`, `?isrc=`, `?url=`, or `?title=&artist=` — the router figures out the rest.

### 🎤 True Karaoke Timing
- **Apple Music** syllable-level sync (LyricsPlus / KPoe)
- **QQ Music** word-by-word QRC + translation
- **KuGou** word-by-word KRC

</td>
<td width="50%" valign="top">

### 🇨🇳 CJK Providers Built-In
QQ Music, KuGou & NetEase Cloud Music via **direct API** using the [LDDC](https://github.com/chenmozhijin/LDDC) technique — QRC/KRC decrypted **in-worker**. No third-party proxy, no API keys.

### 🛡️ Resilient Fallback Chain
9 tracks from 9 providers run in **parallel** with per-provider timeouts, then sorted by sync quality:
`syllable → word → line → plain`

### 📊 Live Stats Dashboard
Request log, per-provider success rate, latency metrics & error breakdown.

</td>
</tr>
</table>

> 🔓 **Zero auth, CORS-enabled** — works from any client: browser, mobile app, or server.

---

## 🎵 Lyric Providers

<details open>
<summary><b>All 9 providers & their capabilities</b></summary>

<br>

| # | Provider | Sync Level | Source | Extras |
|:-:|:--|:--:|:--|:--|
| 🍎 | **AMLyrics** *(Apple Music)* | 🥇 `syllable` | LyricsPlus / KPoe — [am-lyrics](https://github.com/binimum/am-lyrics) | `words[]`, `songParts`, `songwriters` |
| 🍏 | **GoLyrics** *(Apple Music)* | 🥇 `syllable` | Boidu lyrics-api | Raw TTML |
| 🎧 | **BiniLyrics** *(Apple Music)* | 🥈 `word` | lyrics-api.binimum.org | Raw TTML, ISRC |
| 🐧 | **QQ Music** | 🥈 `word` | Direct `musicu.fcg` (LDDC) | Karaoke words, translation, romanization |
| 🎼 | **KuGou** | 🥈 `word` | Direct `lyrics.kugou.com` (LDDC) | Karaoke words |
| 📚 | **LRCLib** | 🥈 `word` + 🥉 `line` | lrclib.net | Word timing via proportional distribution |
| ☁️ | **NetEase Cloud Music** | 🥉 `line` | music.163.com | Translation |
| ▶️ | **YTM Line** | 🥉 `line` | YouTube Music `timedLyricsData`<br>(Musixmatch / LyricFind) | Multi-client InnerTube<br>(web / android / ios) |
| 🤝 | **Unison** | `any` | Community DB (unison.boidu.dev) | Vote counts |

<br>
</details>

<sub>🥇 = highest fidelity · 🥈 = word-level · 🥉 = line-level</sub>

---

## 📡 API Endpoints

**Base URL:**
```
https://api.liriqo-alfarrizi.workers.dev/v1
```

| Method | Path | Description |
|:--:|:--|:--|
| `GET` | [`/lyrics`](https://api.liriqo-alfarrizi.workers.dev/v1/lyrics?v=HaEYUJ2aRHs) | 🌟 **All available lyrics** from 9 providers, sorted by sync quality |
| `GET` | [`/lrc`](https://api.liriqo-alfarrizi.workers.dev/v1/lrc?v=HaEYUJ2aRHs) | LRC synced lyrics only (`text/plain`) |
| `GET` | [`/plain`](https://api.liriqo-alfarrizi.workers.dev/v1/plain?v=HaEYUJ2aRHs) | Plain text lyrics only (JSON) |
| `GET` | [`/ttml`](https://api.liriqo-alfarrizi.workers.dev/v1/ttml?v=HaEYUJ2aRHs) | Raw TTML — Apple Music syllable format |
| `GET` | [`/search`](https://api.liriqo-alfarrizi.workers.dev/v1/search?Q=Dynamite+BTS) | Resolve `videoId` + metadata only (no lyrics fetch) |
| `GET` | [`/stats`](https://api.liriqo-alfarrizi.workers.dev/v1/stats) | 📊 Live stats: requests, per-provider perf, request log |
| `GET` | [`/health`](https://api.liriqo-alfarrizi.workers.dev/v1/health) | Health check (`?upstream=1` tests all 7 upstreams) |
| `GET` | [`/`](https://api.liriqo-alfarrizi.workers.dev/v1) | Endpoint list / docs (JSON or HTML) |

### 🔧 Smart Parameters

Accepted by `/lyrics` & `/search`:

| Param | Example | Behavior |
|:--|:--|:--|
| `?v=` | `?v=HaEYUJ2aRHs` | Direct **videoId** → fetch lyrics |
| `?Q=` | `?Q=Dynamite+BTS` | **Title search** → resolve metadata → fetch lyrics |
| `?isrc=` | `?isrc=QM7282022872` | **ISRC lookup** (MusicBrainz) → resolve → fetch |
| `?url=` | `?url=https://open.spotify.com/track/...` | **Any provider URL** → resolve → fetch |
| `?title=`<br>`&artist=` | `?title=Dynamite&artist=BTS&duration=199` | **Explicit metadata** → search → fetch |

> 💡 **Debug mode:** append `&debug=1` to `/lyrics` for per-provider status details.

---

## 🚀 Quick Start

### cURL

<details open>
<summary><b>▸ By YouTube videoId (all lyrics)</b></summary>

```bash
curl "https://api.liriqo-alfarrizi.workers.dev/v1/lyrics?v=HaEYUJ2aRHs"
```
</details>

<details>
<summary><b>▸ LRC synced lyrics</b></summary>

```bash
curl "https://api.liriqo-alfarrizi.workers.dev/v1/lrc?v=HaEYUJ2aRHs"
```
</details>

<details>
<summary><b>▸ Apple Music TTML (syllable-level)</b></summary>

```bash
curl "https://api.liriqo-alfarrizi.workers.dev/v1/ttml?v=HaEYUJ2aRHs"
```
</details>

<details>
<summary><b>▸ Search by song title (auto-resolves metadata)</b></summary>

```bash
curl "https://api.liriqo-alfarrizi.workers.dev/v1/lyrics?Q=Dynamite+BTS"
```
</details>

<details>
<summary><b>▸ Lookup by ISRC</b></summary>

```bash
curl "https://api.liriqo-alfarrizi.workers.dev/v1/lyrics?isrc=QM7282022872"
```
</details>

<details>
<summary><b>▸ Resolve from a Spotify URL</b></summary>

```bash
curl "https://api.liriqo-alfarrizi.workers.dev/v1/lyrics?url=https://open.spotify.com/track/3a1lNhkSLSkpJE4MSHpDu9"
```
</details>

### JavaScript / Fetch

```js
const res = await fetch('https://api.liriqo-alfarrizi.workers.dev/v1/lyrics?v=HaEYUJ2aRHs');
const data = await res.json();
```

<details>
<summary><b>📦 Available response fields</b></summary>

<br>

| Field | Type | Description |
|:--|:--|:--|
| `data.videoId` | `string` | Resolved YouTube video ID |
| `data.metadata` | `object` | `{ title, artist, album, duration, isrc }` |
| `data.count` | `number` | Number of tracks found across providers |
| `data.primary` | `object` | 🌟 Best track (highest sync quality) |
| `data.tracks[]` | `array` | All tracks returned by every provider |
| `└ .provider` | `string` | `"amlyrics_apple_music"` · `"qq_portato"` · `"kugou_legato"` · … |
| `└ .syncLevel` | `string` | `"syllable"` · `"word"` · `"line"` · `"plain"` |
| `└ .plain` | `string` | Plain-text lyrics |
| `└ .timed[]` | `array` | `[{ text, start, end, id, words? }]` |
| `└ .words?[]` | `array` | Per-word timing: `[{ text, start, end }]` |
| `└ .translation?` | `string` | Translated lyrics (QQ / NetEase) |
| `└ .qrc?` / `.krc?` / `.ttml?` | `string` | Raw upstream formats |

<br>
</details>

**Rendering word-level karaoke:**

```js
const { primary } = data;

for (const line of primary.timed) {
  console.log(`[${line.start.toFixed(2)}s] ${line.text}`);

  if (line.words) {
    for (const w of line.words) {
      // highlight syllable-by-syllable, Apple Music style
      scheduleHighlight(w.text, w.start, w.end);
    }
  }
}
```

---

## 📊 Response Format

### `/lyrics` — full payload

<details>
<summary><b>Click to expand example JSON</b></summary>

```jsonc
{
  "videoId": "HaEYUJ2aRHs",
  "metadata": {
    "title": "Dynamite",
    "artist": "BTS",
    "album": "BE",
    "duration": 199,
    "isrc": "QM7282022872"
  },
  "count": 9,
  "tookMs": 2140,

  // 🌟 Best available track — use this for playback
  "primary": {
    "provider": "golyrics_apple_music",
    "syncLevel": "syllable",
    "...": "..."
  },

  "tracks": [
    { "provider": "golyrics_apple_music", "syncLevel": "syllable", "timed": [ "... 62 lines" ], "ttml": "<tt ..." },
    { "provider": "amlyrics_apple_music", "syncLevel": "syllable", "timed": [ "..." ], "words": [ "..." ],
      "songwriters": [ "David Stewart", "Jessica Agombar" ] },
    { "provider": "lrclib_wordsync",      "syncLevel": "word",     "timed": [ "..." ] },
    { "provider": "binimum_apple_music",  "syncLevel": "word",     "timed": [ "..." ] },
    { "provider": "qq_portato",           "syncLevel": "word",     "timed": [ "..." ], "words": [ "..." ], "translation": "..." },
    { "provider": "kugou_legato",         "syncLevel": "word",     "timed": [ "..." ], "words": [ "..." ] },
    { "provider": "lrclib",               "syncLevel": "line",     "timed": [ "..." ] },
    { "provider": "netease",              "syncLevel": "line",     "timed": [ "..." ], "translation": "..." },
    { "provider": "ytm_line",             "syncLevel": "line",     "timed": [ "..." ],
      "upstreamProvider": "YouTube Music (Musixmatch)" }
  ]
}
```
</details>

### `/stats` — live dashboard

<details>
<summary><b>Click to expand example JSON</b></summary>

```jsonc
{
  "totalRequests": 734,
  "successCount": 595,
  "failedCount": 139,
  "errorRate": "18.9",
  "avgLatency": 3138,
  "p99Latency": 11135,

  "providers": [
    { "name": "Apple Music",         "avgLatency": 1650, "successRate": 96, "total": 45, "statuses": [200] },
    { "name": "QQ Music",            "avgLatency": 1180, "successRate": 92, "total": 40, "statuses": [200] },
    { "name": "KuGou",               "...": "..." },
    { "name": "NetEase Cloud Music", "...": "..." },
    { "name": "Musixmatch",          "...": "..." },
    { "name": "LRCLib",              "...": "..." },
    { "name": "Unison",              "...": "..." },
    { "name": "LyricFind",           "...": "..." }
  ],

  "errorCounts": { "provider error": 16 },

  "recentLog": [
    {
      "status": "ok",
      "title": "Dynamite",
      "artist": "BTS",
      "provider": "Apple Music",
      "endpoint": "/lyrics",
      "timeMs": 2140,
      "timestamp": "8:02:31 AM"
    }
  ]
}
```
</details>

---

## 🔍 How It Works

### Pipeline Flow

```
┌──────────────────────────────────────────────────────────────┐
│  INPUT:  videoId  │  ISRC  │  title + artist  │  provider URL │
└───────────────────────────────┬──────────────────────────────┘
                                ▼
              buildTracksResponse()  ── resolve videoId & metadata
                                ▼
       YouTube Music search  /  MusicBrainz ISRC  /  URL parser
                                ▼
              LyricsService.getLyricsUnified()
                                ▼
   ┌────────────────────────────────────────────────────────┐
   │  PHASE 1 ── LRCLib (fills in missing duration)         │
   └────────────────────────────────────────────────────────┘
                                ▼
   ┌────────────────────────────────────────────────────────┐
   │  PHASE 2 ── ALL PROVIDERS IN PARALLEL (per-provider TO)│
   │                                                        │
   │   ├─ Unison ................. community DB             │
   │   ├─ NetEase Cloud Music .... music.163.com            │
   │   ├─ YTM Line ............... InnerTube web/android/ios│
   │   ├─ BiniLyrics ............. Apple Music TTML         │
   │   ├─ GoLyrics ............... Boidu                    │
   │   ├─ AMLyrics ............... LyricsPlus / KPoe        │
   │   ├─ QQ Music ............... musicu.fcg → QRC → 3DES  │
   │   └─ KuGou .................. lyrics.kugou.com → KRC   │
   └────────────────────────────────────────────────────────┘
                                ▼
        SORT BY SYNC QUALITY
        syllable (4) ▸ word (3) ▸ line (2) ▸ plain (1)
                                ▼
                { tracks, primary, count }
```

### 🧩 QRC Decryption *(QQ Music)*

The encrypted QRC blob from `GetPlayLyricInfo` is decrypted **entirely in-worker**:

```
QRC (base64) → custom non-standard 3DES → zlib inflate → parsed word timings
```

Ported from [LDDC](https://github.com/chenmozhijin/LDDC) & [qrc-decoder](https://github.com/apoint123/qrc-decoder) — yielding **per-word karaoke timing, translations, and romanization** with **no third-party API key**.

### 📱 YTM InnerTube Strategy

```
ANDROID_MUSIC  ──▶  timedLyricsData (Musixmatch / LyricFind)   ✅ no PO token required
      │ fail
      ▼
IOS_MUSIC      ──▶  timedLyricsData
      │ fail
      ▼
WEB_REMIX      ──▶  plain lyrics (last resort)
```

---

## 🙏 Credits

Built on the shoulders of excellent open-source work:

| Project | Used For |
|:--|:--|
| [binimum/am-lyrics](https://github.com/binimum/am-lyrics) | Apple Music LyricsPlus / KPoe syllable sync |
| [chenmozhijin/LDDC](https://github.com/chenmozhijin/LDDC) | QRC / KRC decryption technique |
| [apoint123/qrc-decoder](https://github.com/apoint123/qrc-decoder) | QRC 3DES implementation reference |
| [lrclib.net](https://lrclib.net) | Open synced-lyrics database |
| [unison.boidu.dev](https://unison.boidu.dev) | Community lyrics database |

---

## 📜 License

**MIT** — see [LICENSE](LICENSE).

<div align="center">

<br>

**© 2026 AlFarrizi-Studio. All Rights Reserved.**

[⬆ Back to top](#-liriqo-lyrics-api)

</div>

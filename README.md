<div align="center">

<img src="https://raw.githubusercontent.com/AlFarrizi-Studio/LiriQo/refs/heads/main/public/liriqo.png" alt="LiriQo" width="200" />


# LiriQo Lyrics API


### Real-time multi-provider lyrics resolver


**Syllable · Word · Line-synced** lyrics & karaoke timing from **7 providers** — through a **single endpoint**.


[![Live Demo](https://img.shields.io/badge/%F0%9F%8C%90_Live_Demo-api--liriqo.web.app-7c3aed?style=for-the-badge&labelColor=1e1b4b)](https://api-liriqo.web.app/)
[![API Base](https://img.shields.io/badge/%E2%9A%A1_API_Endpoint-v1-0ea5e9?style=for-the-badge&labelColor=082f49)](https://api.liriqo-alfarrizi.my.id/v1)
[![Providers](https://img.shields.io/badge/Providers-7-22c55e?style=for-the-badge&labelColor=052e16)](#-lyric-providers)
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
- [🛣️ Sync Tiers](#%EF%B8%8F-sync-tiers--jagorawicipalibocimi)
- [📡 API Endpoints](#-api-endpoints)
  - [Smart Parameters](#smart-parameters)
- [🚀 Quick Start](#-quick-start)
  - [cURL](#curl)
  - [JavaScript / Fetch](#javascript--fetch)
- [📊 Response Format](#response-format)
  - [`/lyrics` Payload](#lyrics--full-payload)
  - [`/stats` Payload](#stats--live-dashboard)
- [🔍 How It Works](#how-it-works)
  - [Pipeline Flow](#pipeline-flow)
  - [QRC Decryption](#qrc-decryption-qq-music)
  - [YTM InnerTube Strategy](#ytm-innertube-strategy)
- [🙏 Credits](#-credits)
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
- **Apple Music** syllable-level TTML with word-level span timing
- **QQ Music** word-by-word QRC + translation + romanization
- **KuGou** word-by-word KRC
- **LRCLib** proportional word-sync distribution


</td>
<td width="50%" valign="top">


### 🇨🇳 CJK Providers Built-In
QQ Music, KuGou & NetEase Cloud Music via **direct API** using the [LDDC](https://github.com/chenmozhijin/LDDC) technique — QRC/KRC decrypted **in-worker**. No third-party proxy, no API keys.


### 🛡️ Resilient Fallback Chain
All providers run in **parallel** with per-provider timeouts, then sorted by sync quality:
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
<summary><b>All 7 providers & their capabilities</b></summary>


<br>


| # | Provider | Sync Level | Source | Extras |
|:-:|:--|:--:|:--|:--|
| 🍎 | **Apple Music** *(apple_music_liriqo)* | 🥇 `syllable` · `word` · `line` · `plain` | Native Apple Music TTML (raw upstream lyrics) | `words[]`, `songParts`, LRC word-timing, direct ISRC lookup |
| 🤝 | **Unison** *(unison_community)* | `any` | Community DB (unison.boidu.dev) | Vote counts |
| 🐧 | **QQ Music** *(qq_portato)* | 🥈 `word` | Direct `musicu.fcg` (LDDC) | Karaoke words, translation, romanization |
| 🎼 | **KuGou** *(kugou_legato)* | 🥈 `word` | Direct `lyrics.kugou.com` (LDDC) | Karaoke words |
| 📚 | **LRCLib** *(lrclib + lrclib_wordsync)* | 🥈 `word` + 🥉 `line` | lrclib.net | Word timing via proportional distribution |
| ▶️ | **YTM Line** *(ytm_line)* | 🥉 `line` | YouTube Music `timedLyricsData`<br>(Musixmatch / LyricFind) | Multi-client InnerTube<br>(web / android / ios) |
| ☁️ | **NetEase Cloud Music** *(netease)* | 🥉 `line` | music.163.com | Translation |


<br>


> 💡 Each provider can return **one or more tracks** (e.g. LRCLib emits two variants: `lrclib` line + `lrclib_wordsync` word) — up to **9 tracks** per song in total.


</details>


<sub>🥇 = highest fidelity · 🥈 = word-level · 🥉 = line-level</sub>


## 🛣️ Sync Tiers — Jagorawi / Cipali / Bocimi


Every track is labeled with a `tier` — a quality-order name for the sync level (named after Indonesian toll roads):


| Tier | Sync Level | Meaning |
|:--|:--|:--|
| 🥇 **Jagorawi** | `syllable` / `word` | Highest — word/syllable-level karaoke timing |
| 🥈 **Cipali** | `line` | Line-synced, per bar |
| 🥉 **Bocimi** | `plain` | Plain text without timing |


```jsonc
{
  "primary": { "provider": "apple_music_liriqo", "syncLevel": "syllable", "tier": "Jagorawi" },
  "tier": "Jagorawi"
}
```


---


## 📡 API Endpoints


**Base URL:**
```
https://api.liriqo-alfarrizi.my.id/v1
```


| Method | Path | Description |
|:--:|:--|:--|
| `GET` | [`/lyrics`](https://api.liriqo-alfarrizi.my.id/v1/lyrics?v=HaEYUJ2aRHs) | 🌟 **All available lyrics** from 7 providers, sorted by sync quality |
| `GET` | [`/lrc`](https://api.liriqo-alfarrizi.my.id/v1/lrc?v=HaEYUJ2aRHs) | LRC synced lyrics only (`text/plain`) |
| `GET` | [`/plain`](https://api.liriqo-alfarrizi.my.id/v1/plain?v=HaEYUJ2aRHs) | Plain text lyrics only (JSON) |
| `GET` | [`/ttml`](https://api.liriqo-alfarrizi.my.id/v1/ttml?v=HaEYUJ2aRHs) | Raw TTML — Apple Music syllable format |
| `GET` | [`/search`](https://api.liriqo-alfarrizi.my.id/v1/search?Q=Dynamite+BTS) | Resolve `videoId` + metadata only (no lyrics fetch) |
| `GET` | [`/stats`](https://api.liriqo-alfarrizi.my.id/v1/stats) | 📊 Live stats: requests, per-provider perf, request log |
| `GET` | [`/health`](https://api.liriqo-alfarrizi.my.id/v1/health) | Health check (`?upstream=1` tests all 5 upstreams) |
| `GET` | [`/`](https://api.liriqo-alfarrizi.my.id/v1) | Endpoint list / docs (JSON or HTML) |


### 🔧 Smart Parameters


Accepted by `/lyrics` & `/search`:


| Param | Example | Behavior |
|:--|:--|:--|
| `?v=` | `?v=HaEYUJ2aRHs` | Direct **videoId** → fetch lyrics |
| `?Q=` | `?Q=Dynamite+BTS` | **Title search** → resolve metadata → fetch lyrics |
| `?isrc=` | `?isrc=QM7282022872` | **ISRC lookup** (MusicBrainz) → resolve → fetch |
| `?url=` | `?url=https://open.spotify.com/track/...` | **Any provider URL** → resolve → fetch |
| `?title=`<br>`&artist=` | `?title=Dynamite&artist=BTS&duration=199` | **Explicit metadata** → search → fetch |


> 💡 **Debug mode:** append `&debug=1` to `/lyrics` for per-provider status details (`_dbg`).


---


## 🚀 Quick Start


### cURL


<details open>
<summary><b>▸ By YouTube videoId (all lyrics)</b></summary>


```bash
curl "https://api.liriqo-alfarrizi.my.id/v1/lyrics?v=HaEYUJ2aRHs"
```
</details>


<details>
<summary><b>▸ LRC synced lyrics</b></summary>


```bash
curl "https://api.liriqo-alfarrizi.my.id/v1/lrc?v=HaEYUJ2aRHs"
```
</details>


<details>
<summary><b>▸ Apple Music TTML (syllable-level)</b></summary>


```bash
curl "https://api.liriqo-alfarrizi.my.id/v1/ttml?v=HaEYUJ2aRHs"
```
</details>


<details>
<summary><b>▸ Search by song title (auto-resolves metadata)</b></summary>


```bash
curl "https://api.liriqo-alfarrizi.my.id/v1/lyrics?Q=Dynamite+BTS"
```
</details>


<details>
<summary><b>▸ Lookup by ISRC</b></summary>


```bash
curl "https://api.liriqo-alfarrizi.my.id/v1/lyrics?isrc=QM7282022872"
```
</details>


<details>
<summary><b>▸ Resolve from a Spotify URL</b></summary>


```bash
curl "https://api.liriqo-alfarrizi.my.id/v1/lyrics?url=https://open.spotify.com/track/3a1lNhkSLSkpJE4MSHpDu9"
```
</details>


### JavaScript / Fetch


```js
const res = await fetch('https://api.liriqo-alfarrizi.my.id/v1/lyrics?v=HaEYUJ2aRHs');
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
| `data.tier` | `string` | 🛣️ Tier of the primary track: `Jagorawi` · `Cipali` · `Bocimi` |
| `data.primary` | `object` | 🌟 Best track (highest sync quality) |
| `data.tracks[]` | `array` | All tracks returned by every provider |
| `└ .provider` | `string` | `"apple_music_liriqo"` · `"qq_portato"` · `"kugou_legato"` · `"lrclib_wordsync"` · `"unison_community"` · `"ytm_line"` · `"netease"` |
| `└ .syncLevel` | `string` | `"syllable"` · `"word"` · `"line"` · `"plain"` |
| `└ .tier` | `string` | `Jagorawi` · `Cipali` · `Bocimi` |
| `└ .plain` | `string` | Plain-text lyrics |
| `└ .timed[]` | `array` | `[{ text, start, end, id, songPart?, words? }]` |
| `└ .words?[]` | `array` | Per-word timing per line: `[[{ text, start, end }]]` |
| `└ .lrc?` / `.ttml?` | `string` | Apple Music raw LRC / TTML |
| `└ .qrc?` / `.krc?` | `string` | QQ / KuGou raw karaoke format |
| `└ .translation?` | `string` | Translated lyrics (QQ / NetEase) |
| `└ .upstreamProvider` | `string` | e.g. `"Apple Music"`, `"YouTube Music (Musixmatch)"` |


<br>
</details>


**Rendering word-level karaoke:**


```js
const { primary } = data;


for (const line of primary.timed) {
  console.log(`[${(line.start / 1000).toFixed(2)}s] ${line.text}`);


  if (primary.words) {
    for (const w of primary.words[line.id] || []) {
      // highlight word-by-word, Apple Music style
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
  "tier": "Jagorawi",


  // 🌟 Best available track — use this for playback
  "primary": {
    "provider": "apple_music_liriqo",
    "syncLevel": "syllable",
    "tier": "Jagorawi",
    "...": "..."
  },


  "tracks": [
    { "provider": "apple_music_liriqo", "syncLevel": "syllable", "tier": "Jagorawi",
      "timed": [ "… lines with words[]" ], "lrc": "[ti:…]", "ttml": "<tt …>",
      "upstreamProvider": "Apple Music" },
    { "provider": "unison_community",   "syncLevel": "word",     "tier": "Jagorawi", "timed": [ "..." ] },
    { "provider": "lrclib_wordsync",    "syncLevel": "word",     "tier": "Jagorawi", "timed": [ "..." ] },
    { "provider": "qq_portato",         "syncLevel": "word",     "tier": "Jagorawi",
      "timed": [ "..." ], "words": [ "..." ], "translation": "...", "romanization": "..." },
    { "provider": "kugou_legato",       "syncLevel": "word",     "tier": "Jagorawi", "timed": [ "..." ] },
    { "provider": "lrclib",             "syncLevel": "line",     "tier": "Cipali", "timed": [ "..." ] },
    { "provider": "netease",            "syncLevel": "line",     "tier": "Cipali", "timed": [ "..." ], "translation": "..." },
    { "provider": "ytm_line",           "syncLevel": "line",     "tier": "Cipali", "timed": [ "..." ],
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
    { "name": "Unison",              "...": "..." }
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
   │   ├─ Apple Music ............ native TTML + LRC word   │
   │   │     ISRC direct ▸ name match ▸ search fallback     │
   │   ├─ Unison ................. community DB             │
   │   ├─ NetEase Cloud Music .... music.163.com            │
   │   ├─ YTM Line ............... InnerTube web/android/ios│
   │   ├─ QQ Music ............... musicu.fcg → QRC → 3DES  │
   │   └─ KuGou .................. lyrics.kugou.com → KRC   │
   └────────────────────────────────────────────────────────┘
                                ▼
        SORT BY SYNC QUALITY (then label tiers)
        syllable (4) ▸ word (3) ▸ line (2) ▸ plain (1)
             ▸ Jagorawi    ▸ Cipali   ▸ Bocimi
                                ▼
           { tracks, primary, tier, count, tookMs }
```


> 🍎 **Apple Music provider** serves native Apple Music TTML — syllable/word timing intact, plus a matching word-timed LRC. ISRC is used **directly** when available (most accurate); without an ISRC it falls back to layered name matching (full artist → base artist without `feat.` → per-segment title variants → artist-only search), always strictly filtered on **title + artist** so the requested version wins — e.g. asking for `"A$AP Forever"` never picks `"A$AP Forever REMIX"`.


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
| [chenmozhijin/LDDC](https://github.com/chenmozhijin/LDDC) | QRC / KRC decryption technique |
| [apoint123/qrc-decoder](https://github.com/apoint123/qrc-decoder) | QRC 3DES implementation reference |
| [lrclib.net](https://lrclib.net) | Open synced-lyrics database |
| [unison.boidu.dev](https://unison.boidu.dev) | Community lyric database |


---


## 📜 License


**MIT** — see [LICENSE](LICENSE).


<div align="center">


<br>


[⬆ Back to top](#-liriqo-lyrics-api)


</div> 

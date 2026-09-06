// Liriqo Lyrics API — Frontend (Live data from Cloudflare Pages)
const _cfg = (typeof window !== "undefined" && window.__LIRIQO_CONFIG__) || {};
const LYRICS_API = _cfg.lyricsApi || "https://api-liriqo.pages.dev/alfarrizi/v1/lyrics";
const STATS_API  = _cfg.statsApi  || "https://api-liriqo.pages.dev/alfarrizi/v1/stats";

const ENDPOINTS = [
  { provider: "Full lyrics (plain + LRC) by YT Music videoId", method: "GET", path: "/lyrics" },
  { provider: "Service stats + recent logs", method: "GET", path: "/stats" },
  { provider: "Plain lyrics only", method: "GET", path: "/plain" },
  { provider: "LRC synced lyrics only", method: "GET", path: "/lrc" },
  { provider: "Unified endpoint. Auto-detect videoId / URL / ISRC / song title. Resolve metadata + find YT videoId + fetch lyrics in one go.", method: "GET", path: "/search" },
  { provider: "Force LyricFind provider (if available)", method: "GET", path: "/lyricfind" },
  { provider: "Force Musixmatch provider (if available)", method: "GET", path: "/musixmatchD" },
];

const API_BASE_URL = "https://api-liriqo.pages.dev/alfarrizi/v1";

// ===== Render Endpoints =====
function renderEndpoints() {
  const grid = document.getElementById("endpoint-grid");
  grid.innerHTML = "";
  ENDPOINTS.forEach((ep) => {
    const badgeCls = ep.method === "POST" ? "badge-post" : "badge-get";
    const card = document.createElement("div");
    card.className = "endpoint-card";
    card.innerHTML = `
      <span class="method-badge ${badgeCls}">${ep.method}</span>
      <div class="endpoint-info">
        <div class="endpoint-path">${ep.path}</div>
        <div class="endpoint-provider">${ep.provider}</div>
      </div>
    `;
    grid.appendChild(card);
  });

  const copyBtn = document.getElementById("api-endpoint-copy");
  if (copyBtn) {
    copyBtn.addEventListener("click", () => {
      navigator.clipboard.writeText(API_BASE_URL).then(() => {
        copyBtn.classList.add("copied");
        const original = copyBtn.innerHTML;
        copyBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> Copied!`;
        setTimeout(() => {
          copyBtn.classList.remove("copied");
          copyBtn.innerHTML = original;
        }, 1500);
      });
    });
  }
}

// ===== Render Lyric Providers (static info card, stats pulled live) =====
const LYRIC_PROVIDER_INFO = {
  LyricFind: {
    key: "lyricfind",
    name: "LyricFind",
    desc: "Official lyrics from musicians, music labels, and publishers. Accurate and fully licensed for the commercial market.",
  },
  Musixmatch: {
    key: "musixmatch",
    name: "Musixmatch",
    desc: "Synced lyrics from the Musixmatch community. Extensive coverage for Western and K-Pop tracks. Accurate LRC format.",
  },
};

function renderLyricProviders() {
  const grid = document.getElementById("lyric-provider-grid");
  grid.innerHTML = "";
  const logos = {
    lyricfind: `<img src="https://images.squarespace-cdn.com/content/v1/5f972a7c930e1b7910954135/bc30c843-deca-4279-8c2f-5fd86336b97d/Press-Image_LF.jpg" alt="LyricFind" class="provider-logo-img" referrerpolicy="no-referrer" />`,
    musixmatch: `<img src="https://thumb.wikimedia.org/wikipedia/commons/thumb/e/e3/Musixmatch_logo_icon_only.svg/3840px-Musixmatch_logo_icon_only.svg.png" alt="Musixmatch" class="provider-logo-img" referrerpolicy="no-referrer" />`,
  };
  Object.values(LYRIC_PROVIDER_INFO).forEach((p) => {
    const card = document.createElement("div");
    card.className = "lyric-provider-card " + p.key;
    card.innerHTML = `
      <div class="lyric-provider-header">
        <div class="lyric-provider-logo">${logos[p.key] || ""}</div>
        <div class="lyric-provider-name">${p.name}</div>
      </div>
      <div class="lyric-provider-desc">${p.desc}</div>
      <div class="lyric-provider-stats" data-provider="${p.name}">
        <div class="lyric-stat">
          <div class="lyric-stat-value" data-hits>0</div>
          <div class="lyric-stat-label">total hits</div>
        </div>
        <div class="lyric-stat">
          <div class="lyric-stat-value" data-success>—</div>
          <div class="lyric-stat-label">success rate</div>
        </div>
        <div class="lyric-stat">
          <div class="lyric-stat-value" data-avg>—</div>
          <div class="lyric-stat-label">avg response</div>
        </div>
      </div>
    `;
    grid.appendChild(card);
  });
}

function updateLyricProviderStats(providers) {
  if (!providers) return;
  Object.entries(providers).forEach(([name, info]) => {
    const card = document.querySelector(`.lyric-provider-stats[data-provider="${name}"]`);
    if (!card) return;
    card.querySelector("[data-hits]").textContent = info.hits ?? 0;
    card.querySelector("[data-success]").textContent = info.success_rate ?? "100%";
    const avgMs = Math.round(info.avg_ms ?? 0);
    card.querySelector("[data-avg]").textContent = avgMs ? (avgMs / 1000).toFixed(1) + "s" : "—";
  });
}

// ===== Stats Animation =====
function animateValue(el, to, duration = 700) {
  const from = parseFloat(el.dataset.rawValue ?? to);
  el.dataset.rawValue = to;
  if (isNaN(to)) {
    el.textContent = to;
    return;
  }
  if (from === to) {
    el.textContent = to;
    return;
  }
  const startTime = performance.now();
  el.classList.add("counting");
  el.classList.remove("changed");
  void el.offsetWidth;
  function step(now) {
    const progress = Math.min((now - startTime) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(from + (to - from) * eased).toLocaleString();
    if (progress < 1) {
      requestAnimationFrame(step);
    } else {
      el.classList.remove("counting");
      el.classList.add("changed");
    }
  }
  requestAnimationFrame(step);
}

// ===== Request Log (realtime append) =====
const LOG_MAX = 100;
let _log = [];
let _logInitialised = false;
let _logLastTimestamp = null;

function sortLogsDesc(a, b) {
  const ai = typeof a?.id === "number" ? a.id : 0;
  const bi = typeof b?.id === "number" ? b.id : 0;
  if (bi !== ai) return bi - ai;
  const at = Date.parse(a?.timestamp) || 0;
  const bt = Date.parse(b?.timestamp) || 0;
  return bt - at;
}

function setLog(entries, opts = {}) {
  const tbody = document.getElementById("log-tbody");
  const emptyEl = document.getElementById("log-empty");
  const countEl = document.getElementById("log-count");

  if (!_logInitialised) {
    const sorted = (entries || []).slice(0, LOG_MAX).sort(sortLogsDesc);
    _log = sorted.slice().reverse();
    _logInitialised = true;
    _logLastTimestamp = sorted.length ? sorted[0].timestamp : null;
    tbody.innerHTML = "";
    for (let i = sorted.length - 1; i >= 0; i--) {
      if (tbody.firstChild) tbody.insertBefore(buildLogRow(sorted[i], false), tbody.firstChild);
      else tbody.appendChild(buildLogRow(sorted[i], false));
    }
    if (countEl) countEl.textContent = `${_log.length} entr${_log.length === 1 ? "y" : "ies"} · live · max 100`;
    if (emptyEl) emptyEl.style.display = _log.length ? "none" : "block";
    return;
  }

  const incoming = (entries || []).filter((e) => {
    if (!_logLastTimestamp) return true;
    return e.timestamp > _logLastTimestamp;
  });
  if (!incoming.length) return;

  const newer = incoming.slice().sort(sortLogsDesc);
  for (const entry of newer) {
    const tr = buildLogRow(entry, true);
    if (tbody.firstChild) tbody.insertBefore(tr, tbody.firstChild);
    else tbody.appendChild(tr);
    _log.unshift(entry);
  }
  _logLastTimestamp = newer[0].timestamp;

  while (_log.length > LOG_MAX) {
    _log.pop();
    if (tbody.lastChild) tbody.removeChild(tbody.lastChild);
  }

  if (countEl) countEl.textContent = `${_log.length} entr${_log.length === 1 ? "y" : "ies"} · live · max 100`;
  if (emptyEl) emptyEl.style.display = "none";
}

function buildLogRow(entry, isNew) {
  const tr = document.createElement("tr");
  tr.dataset.ts = entry.timestamp;
  if (isNew) tr.classList.add("log-row-new");

  const statusHtml = entry.status === "ok"
    ? `<span class="log-status ok">200 OK</span>`
    : `<span class="log-status err">ERR</span>`;

  const providerKey = (entry.provider || "none").toLowerCase();
  const providerHtml = entry.provider
    ? `<span class="log-provider-tag ${providerKey}">${entry.provider}</span>`
    : `<span class="log-provider-tag none">none</span>`;

  const time = new Date(entry.timestamp);
  const timeStr = time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  const esc = (s) => String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

  tr.innerHTML = `
    <td>${statusHtml}</td>
    <td><div class="log-track">${esc(entry.title || entry.track || "—")}</div></td>
    <td><div class="log-track-artist">${esc(entry.artist || "")}</div></td>
    <td>${providerHtml}</td>
    <td class="log-endpoint" title="${esc(entry.endpoint || "")}">${esc(entry.endpoint || "")}</td>
    <td class="log-ms">${entry.ms ?? 0}</td>
    <td title="${esc(entry.timestamp)}">${timeStr}</td>
  `;
  return tr;
}

function initLogToggle() {}

// ===== Performance Charts (live data) =====
const PERF_WINDOW = 30;
const perfData = {
  lyricfind: [],
  musixmatch: [],
};

function calcStats(arr) {
  if (!arr.length) return { current: 0, avg: 0, trend: 0 };
  const half = Math.floor(arr.length / 2);
  const recent = arr.slice(half);
  const older = arr.slice(0, half);
  const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
  const recentAvg = recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : avg;
  const olderAvg = older.length ? older.reduce((a, b) => a + b, 0) / older.length : avg;
  const change = olderAvg ? ((recentAvg - olderAvg) / olderAvg) * 100 : 0;
  return { current: arr.length, avg: Math.round(avg), trend: change };
}

function buildPath(points, w, h) {
  if (!points.length) return "";
  const max = Math.max(...points, 100);
  const min = Math.min(...points, 0);
  const range = max - min || 1;
  const stepX = w / Math.max(points.length - 1, 1);
  return points
    .map((v, i) => {
      const x = i * stepX;
      const y = h - ((v - min) / range) * h;
      return (i === 0 ? "M" : "L") + x.toFixed(1) + "," + y.toFixed(1);
    })
    .join(" ");
}

function buildAreaPath(points, w, h) {
  const line = buildPath(points, w, h);
  if (!line) return "";
  return line + ` L${w.toFixed(1)},${h} L0,${h} Z`;
}

function renderChart(provider) {
  const svg = document.getElementById("perf-svg");
  if (!svg) return;

  const w = 600;
  const h = 180;
  const data = perfData[provider];
  const color = provider === "lyricfind" ? "#22c55e" : "#eab308";

  if (provider === "lyricfind") {
    const grid = svg.querySelector(".perf-grid");
    grid.innerHTML = "";
    const yLines = svg.querySelector(".perf-yaxis-lines");
    yLines.innerHTML = "";
    for (let i = 0; i < 6; i++) {
      const y = (h / 5) * i;
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", 0);
      line.setAttribute("y1", y);
      line.setAttribute("x2", w);
      line.setAttribute("y2", y);
      grid.appendChild(line);
    }
  }

  const linePath = svg.querySelector(`.${provider === "lyricfind" ? "lyricfind" : "musixmatch"}-line`);
  const areaPath = svg.querySelector(`.${provider === "lyricfind" ? "lf" : "mxm"}-area`);
  linePath.setAttribute("d", buildPath(data, w, h));
  areaPath.setAttribute("d", buildAreaPath(data, w, h));
  linePath.style.animation = "none";
  void linePath.getBoundingClientRect();
  linePath.style.animation = "";

  const pointsG = svg.querySelector(`.${provider === "lyricfind" ? "lf" : "mxm"}-points`);
  pointsG.innerHTML = "";
  if (data.length) {
    const max = Math.max(...data, 100);
    const min = Math.min(...data, 0);
    const range = max - min || 1;
    const stepX = w / Math.max(data.length - 1, 1);
    data.forEach((v, i) => {
      const x = i * stepX;
      const y = h - ((v - min) / range) * h;
      const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      c.setAttribute("cx", x);
      c.setAttribute("cy", y);
      c.setAttribute("r", 2);
      c.setAttribute("fill", color);
      c.setAttribute("opacity", 0.6);
      pointsG.appendChild(c);
    });
  }

  const stats = calcStats(data);
  const prefix = provider === "lyricfind" ? "lf" : "mxm";
  document.getElementById(prefix + "-current").textContent = stats.current;
  document.getElementById(prefix + "-avg").textContent = stats.avg;
  const trendEl = document.getElementById(prefix + "-trend");
  const trendVal = stats.trend;
  const arrow = trendVal > 0.5 ? "↑" : trendVal < -0.5 ? "↓" : "—";
  if (trendVal > 5) {
    trendEl.className = "trend-down";
    trendEl.textContent = `${arrow} ${Math.abs(trendVal).toFixed(1)}%`;
  } else if (trendVal < -5) {
    trendEl.className = "trend-up";
    trendEl.textContent = `${arrow} ${Math.abs(trendVal).toFixed(1)}%`;
  } else {
    trendEl.className = "trend-neutral";
    trendEl.textContent = `${arrow} ${Math.abs(trendVal).toFixed(1)}%`;
  }
}

function renderAllCharts() {
  renderChart("lyricfind");
  renderChart("musixmatch");
}

function applyPerformance(perf) {
  if (!perf) return;
  perfData.lyricfind = (perf.LyricFind || []).slice(-PERF_WINDOW);
  perfData.musixmatch = (perf.Musixmatch || []).slice(-PERF_WINDOW);
  renderAllCharts();
}

// ===== Top stats bar =====
function formatUptime(seconds) {
  if (!seconds || seconds < 0) return "—";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function applyTopStats(s) {
  const total = s.total_requests ?? 0;
  const failed = s.failed_requests ?? 0;
  const success = s.successful_requests ?? (total - failed);
  const avg = s.avg_ms ?? 0;

  animateValue(document.getElementById("stat-total"), total, 500);

  const successRate = total > 0 ? ((success / total) * 100).toFixed(1) : "100.0";
  document.getElementById("stat-success").textContent = successRate + "%";
  document.getElementById("stat-success-sub").textContent =
    successRate === "100.0" ? "all requests passed" : "since deploy";

  animateValue(document.getElementById("stat-failed"), failed, 500);
  animateValue(document.getElementById("stat-uptime"), avg, 500);

  const uptimeSec = s.uptime_seconds ?? 0;
  const liveupEl = document.getElementById("stat-liveup");
  const liveupSubEl = document.getElementById("stat-liveup-sub");
  if (liveupEl) {
    liveupEl.textContent = uptimeSec > 0 ? formatUptime(uptimeSec) : "—";
    liveupEl.classList.remove("status-up", "status-down", "status-starting");
    const status = s.status || "starting";
    liveupEl.classList.add(`status-${status}`);
  }
  if (liveupSubEl) {
    const status = s.status || "starting";
    const labels = {
      up: "service live",
      down: "no heartbeat",
      starting: "initializing",
      unknown: "unknown",
    };
    liveupSubEl.textContent = labels[status] || "—";
  }
}

// ===== Live polling from Netlify Blobs =====
let _polling = false;

async function fetchFullStats() {
  try {
    const r = await fetch(`${STATS_API}?t=${Date.now()}`);
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

async function fetchLogsSince(ts) {
  try {
    const sinceParam = ts ? `&since=${encodeURIComponent(ts)}` : "";
    const r = await fetch(`${STATS_API}?t=${Date.now()}&logsOnly=1${sinceParam}`);
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

async function pollStats() {
  if (_polling) return;
  _polling = true;
  try {
    const [full, delta] = await Promise.all([
      fetchFullStats(),
      fetchLogsSince(_logLastTimestamp),
    ]);
    if (full) {
      applyTopStats(full);
      const providers = {
        LyricFind: {
          hits: full.providers?.LyricFind?.hits ?? 0,
          success_rate: full.providers?.LyricFind?.success_rate ?? "100%",
          avg_ms: full.performance?.LyricFind?.length
            ? full.performance.LyricFind.reduce((a, b) => a + b, 0) / full.performance.LyricFind.length
            : 0,
        },
        Musixmatch: {
          hits: full.providers?.Musixmatch?.hits ?? 0,
          success_rate: full.providers?.Musixmatch?.success_rate ?? "100%",
          avg_ms: full.performance?.Musixmatch?.length
            ? full.performance.Musixmatch.reduce((a, b) => a + b, 0) / full.performance.Musixmatch.length
            : 0,
        },
      };
      updateLyricProviderStats(providers);
      applyPerformance(full.performance);
    }
    if (delta) {
      setLog(delta.logs || []);
    }
  } finally {
    _polling = false;
  }
}

function startLivePolling() {
  pollStats();
  setInterval(pollStats, 1000);
}

// ===== Init =====
renderEndpoints();
renderLyricProviders();
initLogToggle();
renderAllCharts();
startLivePolling();

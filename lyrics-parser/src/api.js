import { LIRIQO_API_BASE } from "./util.js";

const pending = new Map();
const MAX_INFLIGHT = 128;
const MAX_BODY_BYTES = 8 * 1024 * 1024;
let activeRequests = 0;

export class ApiError extends Error {
  constructor(message, { code = "API_ERROR", status = null, retryAfter = null } = {}) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

function abortError() {
  return new ApiError("LiriQo API request aborted", { code: "ABORTED" });
}

function validateOptions({ baseUrl = LIRIQO_API_BASE, timeout = 15000, signal } = {}) {
  if (!Number.isInteger(timeout) || timeout < 1 || timeout > 120000) {
    throw new ApiError("Invalid API timeout", { code: "INVALID_OPTIONS" });
  }
  let base;
  try {
    base = new URL(baseUrl);
  } catch {
    throw new ApiError("Invalid API base URL", { code: "INVALID_OPTIONS" });
  }
  const loopback = base.hostname === "localhost" || base.hostname === "[::1]" || /^127(?:\.\d{1,3}){3}$/.test(base.hostname);
  if ((base.protocol !== "https:" && !(base.protocol === "http:" && loopback)) || base.username || base.password || base.search || base.hash) {
    throw new ApiError("Invalid API base URL", { code: "INVALID_OPTIONS" });
  }
  if (signal != null && (typeof signal.aborted !== "boolean" || typeof signal.addEventListener !== "function" || typeof signal.removeEventListener !== "function")) {
    throw new ApiError("Invalid API signal", { code: "INVALID_OPTIONS" });
  }
  base.pathname = base.pathname.replace(/\/+$/, "");
  return { base: base.href.replace(/\/$/, ""), timeout, signal };
}

function retryAfterSeconds(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const trimmed = value.trim();
  if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
    const seconds = Number(trimmed);
    return Number.isFinite(seconds) ? seconds : null;
  }
  if (!/^[A-Za-z]{3},?\s/.test(trimmed)) return null;
  const date = Date.parse(trimmed);
  return Number.isFinite(date) ? Math.max(0, Math.ceil((date - Date.now()) / 1000)) : null;
}

function cancelBody(response) {
  try {
    const cancelled = response.body?.cancel();
    cancelled?.catch(() => {});
  } catch {}
}

async function readJson(response, signal) {
  const length = response.headers.get("content-length");
  if (length && Number(length) > MAX_BODY_BYTES) {
    cancelBody(response);
    throw new ApiError("LiriQo API response exceeds size limit", { code: "BODY_TOO_LARGE" });
  }
  if (!response.body) throw new ApiError("Invalid LiriQo API response", { code: "INVALID_RESPONSE" });
  const reader = response.body.getReader();
  const cancel = () => { reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", cancel, { once: true });
  const chunks = [];
  let bytes = 0;
  let complete = false;
  try {
    while (true) {
      if (signal.aborted) throw signal.reason;
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BODY_BYTES) throw new ApiError("LiriQo API response exceeds size limit", { code: "BODY_TOO_LARGE" });
      chunks.push(value);
    }
    complete = true;
  } finally {
    signal.removeEventListener("abort", cancel);
    if (!complete) cancel();
    reader.releaseLock();
  }
  const buffer = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    const json = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(buffer));
    if (!json || typeof json !== "object" || Array.isArray(json)) throw new Error();
    return json;
  } catch {
    throw new ApiError("Invalid LiriQo API response", { code: "INVALID_RESPONSE" });
  }
}

async function requestJson(url, timeout, controller, search = false) {
  if (activeRequests >= MAX_INFLIGHT) throw new ApiError("LiriQo API client is busy", { code: "CAPACITY" });
  activeRequests++;
  const { signal } = controller;
  const timer = setTimeout(() => controller.abort(new ApiError("LiriQo API request timed out", { code: "TIMEOUT" })), timeout);
  let onAbort;
  const aborted = new Promise((_, reject) => {
    onAbort = () => reject(signal.reason instanceof ApiError ? signal.reason : abortError());
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) onAbort();
  });
  try {
    return await Promise.race([aborted, (async () => {
      if (signal.aborted) throw abortError();
      const response = await fetch(url, { signal, redirect: "error" });
      if (signal.aborted) {
        cancelBody(response);
        throw abortError();
      }
      if (!response.ok) {
        cancelBody(response);
        if (search && response.status !== 429 && response.status !== 503) return null;
        throw new ApiError(`LiriQo API request failed: ${response.status}`, {
          code: "HTTP_ERROR",
          status: response.status,
          retryAfter: response.status === 429 || response.status === 503 ? retryAfterSeconds(response.headers.get("retry-after")) : null,
        });
      }
      return readJson(response, signal);
    })()]);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError("LiriQo API request failed", { code: "NETWORK_ERROR" });
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", onAbort);
    activeRequests--;
  }
}

function consume(entry, signal, key) {
  if (signal?.aborted) return Promise.reject(abortError());
  entry.consumers++;
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", onAbort);
      entry.consumers--;
      callback(value);
      if (entry.consumers === 0 && !entry.done) {
        if (pending.get(key) === entry) pending.delete(key);
        entry.controller.abort(abortError());
      }
    };
    const onAbort = () => finish(reject, abortError());
    signal?.addEventListener("abort", onAbort, { once: true });
    entry.promise.then(value => finish(resolve, value), error => finish(reject, error));
    if (signal?.aborted) onAbort();
  });
}

export async function fetchLiriQoLyrics(videoId, options = {}) {
  const { base, timeout, signal } = validateOptions(options);
  if (typeof videoId !== "string" || !videoId.trim() || videoId.length > 256 || /[/:]/.test(videoId)) {
    throw new ApiError("Invalid video id", { code: "INVALID_OPTIONS" });
  }
  if (signal?.aborted) throw abortError();
  const url = new URL(`${base}/lyrics`);
  url.searchParams.set("v", videoId);
  const metadata = { title: options.title ?? options.song, artist: options.artist, duration: options.duration, isrc: options.isrc, full: options.full, language: options.language };
  for (const [name, value] of Object.entries(metadata)) {
    if (value == null) continue;
    if (!["string", "number", "boolean"].includes(typeof value) || String(value).length > 4096 || (typeof value === "number" && !Number.isFinite(value))) {
      throw new ApiError("Invalid API metadata", { code: "INVALID_OPTIONS" });
    }
    url.searchParams.set(name, String(value));
  }
  const key = JSON.stringify([url.href, timeout]);
  let entry = pending.get(key);
  if (!entry) {
    if (pending.size >= MAX_INFLIGHT) throw new ApiError("LiriQo API client is busy", { code: "CAPACITY" });
    entry = { controller: new AbortController(), consumers: 0, done: false };
    entry.promise = requestJson(url.href, timeout, entry.controller).finally(() => {
      entry.done = true;
      if (pending.get(key) === entry) pending.delete(key);
    });
    pending.set(key, entry);
  }
  return consume(entry, signal, key);
}

export async function searchLiriQoVideoId(query, options = {}) {
  const { base, timeout, signal } = validateOptions(options);
  if (typeof query !== "string" || !query.trim() || query.length > 4096) {
    throw new ApiError("Invalid search query", { code: "INVALID_OPTIONS" });
  }
  if (signal?.aborted) throw abortError();
  const controller = new AbortController();
  const onAbort = () => controller.abort(abortError());
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const url = new URL(`${base}/search`);
    url.searchParams.set("Q", query);
    const json = await requestJson(url.href, timeout, controller, true);
    return typeof json?.videoId === "string" && json.videoId.trim() ? json.videoId : null;
  } finally {
    signal?.removeEventListener("abort", onAbort);
  }
}

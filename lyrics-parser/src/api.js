/**
 * LiriQo API client with per-video in-flight deduplication.
 */

import { LIRIQO_API_BASE } from "./util.js";

/** @type {Map<string, Promise<object>>} */
const pending = new Map();

/**
 * Fetch (and deduplicate) the `/lyrics` payload of a video.
 * @param {string} videoId YouTube video id
 * @param {object} [options]
 * @param {string} [options.baseUrl] API base, defaults to the public LiriQo API
 * @param {AbortSignal} [options.signal] caller cancellation signal
 * @param {number} [options.timeout=15000] request timeout in ms
 * @returns {Promise<object>} raw `/lyrics` payload
 */
export async function fetchLiriQoLyrics(videoId, { baseUrl = LIRIQO_API_BASE, signal, timeout = 15000 } = {}) {
  if (pending.has(videoId)) return pending.get(videoId);
  const request = (async () => {
    const url = `${baseUrl}/lyrics?v=${encodeURIComponent(videoId)}`;
    const signals = signal ? [signal, AbortSignal.timeout(timeout)] : [AbortSignal.timeout(timeout)];
    const response = await fetch(url, { signal: AbortSignal.any(signals) });
    if (!response.ok) throw new Error(`LiriQo API request failed: ${response.status}`);
    return response.json();
  })();
  pending.set(videoId, request);
  try {
    return await request;
  } finally {
    pending.delete(videoId);
  }
}

/**
 * Resolve a search query to a YouTube video id via `/search`.
 * @param {string} query
 * @param {object} [options]
 * @param {string} [options.baseUrl]
 * @param {number} [options.timeout=15000]
 * @returns {Promise<string|null>}
 */
export async function searchLiriQoVideoId(query, { baseUrl = LIRIQO_API_BASE, timeout = 15000 } = {}) {
  const response = await fetch(`${baseUrl}/search?Q=${encodeURIComponent(query)}`, {
    signal: AbortSignal.timeout(timeout),
  });
  if (!response.ok) return null;
  const json = await response.json();
  return json.videoId ?? null;
}

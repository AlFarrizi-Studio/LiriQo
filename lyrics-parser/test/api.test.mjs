import test from "node:test";
import assert from "node:assert/strict";
import { ApiError, fetchLiriQoLyrics, searchLiriQoVideoId } from "../src/api.js";

const baseUrl = "https://api.example.test";
const json = (value = { tracks: [] }, init) => new Response(JSON.stringify(value), init);
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};

function mockFetch(t, implementation) {
  const original = globalThis.fetch;
  globalThis.fetch = implementation;
  t.after(() => { globalThis.fetch = original; });
}

function hasCode(code) {
  return error => error instanceof ApiError && error.code === code;
}

test("100 concurrent identical requests share one fetch and settled entries are removed", async t => {
  const gate = deferred();
  let calls = 0;
  mockFetch(t, async () => {
    calls++;
    await gate.promise;
    return json();
  });
  const requests = Array.from({ length: 100 }, () => fetchLiriQoLyrics("same", { baseUrl }));
  assert.equal(calls, 1);
  gate.resolve();
  const results = await Promise.all(requests);
  assert.ok(results.every(result => result === results[0]));
  await fetchLiriQoLyrics("same", { baseUrl });
  assert.equal(calls, 2);
});

test("deduplication includes normalized base URL, timeout and all metadata", async t => {
  const gate = deferred();
  const urls = [];
  mockFetch(t, async url => {
    urls.push(new URL(url));
    await gate.promise;
    return json();
  });
  const common = { baseUrl, song: "Song & title", artist: "Artist", duration: 0, isrc: "CODE", full: false, language: "id" };
  const requests = [
    fetchLiriQoLyrics("metadata", common),
    fetchLiriQoLyrics("metadata", { ...common, baseUrl: `${baseUrl}/` }),
    fetchLiriQoLyrics("metadata", { ...common, title: common.song, song: "ignored" }),
    fetchLiriQoLyrics("metadata", { ...common, baseUrl: "https://other.example.test" }),
    fetchLiriQoLyrics("metadata", { ...common, timeout: 20000 }),
    ...Object.entries({ title: "Different", artist: "Different", duration: 1, isrc: "OTHER", full: true, language: "en" }).map(([name, value]) => fetchLiriQoLyrics("metadata", { ...common, [name]: value })),
  ];
  assert.equal(urls.length, 9);
  assert.deepEqual(Object.fromEntries(urls[0].searchParams), { v: "metadata", title: common.song, artist: "Artist", duration: "0", isrc: "CODE", full: "false", language: "id" });
  gate.resolve();
  await Promise.all(requests);
});

test("one consumer abort leaves the shared request available to other callers", async t => {
  const gate = deferred();
  const caller = new AbortController();
  let calls = 0;
  let upstream;
  mockFetch(t, async (_, { signal }) => {
    calls++;
    upstream = signal;
    await gate.promise;
    return json();
  });
  const cancelled = fetchLiriQoLyrics("cancel-one", { baseUrl, signal: caller.signal });
  const remaining = fetchLiriQoLyrics("cancel-one", { baseUrl });
  caller.abort(new Error("private abort reason"));
  await assert.rejects(cancelled, hasCode("ABORTED"));
  assert.equal(upstream.aborted, false);
  gate.resolve();
  assert.deepEqual(await remaining, { tracks: [] });
  assert.equal(calls, 1);
});

test("all consumers abort the upstream and pre-aborted consumers do not fetch", async t => {
  const caller = new AbortController();
  let upstream;
  let calls = 0;
  mockFetch(t, async (_, { signal }) => {
    calls++;
    upstream = signal;
    return new Promise((_, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
  });
  const request = fetchLiriQoLyrics("cancel-all", { baseUrl, signal: caller.signal });
  caller.abort();
  await assert.rejects(request, hasCode("ABORTED"));
  assert.equal(upstream.aborted, true);
  await assert.rejects(fetchLiriQoLyrics("cancel-all", { baseUrl, signal: caller.signal }), hasCode("ABORTED"));
  assert.equal(calls, 1);
});

test("timeouts bound stalled fetches and body reads", async t => {
  let upstream;
  mockFetch(t, async (_, { signal }) => {
    upstream = signal;
    return new Promise(() => {});
  });
  await assert.rejects(fetchLiriQoLyrics("timeout", { baseUrl, timeout: 5 }), hasCode("TIMEOUT"));
  assert.equal(upstream.aborted, true);
  let cancelled = false;
  globalThis.fetch = async () => new Response(new ReadableStream({ cancel() { cancelled = true; } }));
  await assert.rejects(fetchLiriQoLyrics("body-timeout", { baseUrl, timeout: 5 }), hasCode("TIMEOUT"));
  assert.equal(cancelled, true);
});

test("at most 128 distinct requests are active while existing keys still deduplicate", async t => {
  const gate = deferred();
  let calls = 0;
  mockFetch(t, async () => {
    calls++;
    await gate.promise;
    return json();
  });
  const requests = Array.from({ length: 128 }, (_, index) => fetchLiriQoLyrics(`capacity-${index}`, { baseUrl }));
  requests.push(fetchLiriQoLyrics("capacity-0", { baseUrl }));
  await assert.rejects(fetchLiriQoLyrics("capacity-extra", { baseUrl }), hasCode("CAPACITY"));
  await assert.rejects(searchLiriQoVideoId("capacity-search", { baseUrl }), hasCode("CAPACITY"));
  assert.equal(calls, 128);
  gate.resolve();
  await Promise.all(requests);
  await fetchLiriQoLyrics("capacity-extra", { baseUrl });
  assert.equal(calls, 129);
});

test("HTTP errors expose status and Retry-After seconds without leaking URLs or bodies", async t => {
  const responses = [
    new Response("SECRET", { status: 429, headers: { "retry-after": "12" } }),
    new Response("SECRET", { status: 503, headers: { "retry-after": new Date(Date.now() + 60000).toUTCString() } }),
    new Response("SECRET", { status: 503, headers: { "retry-after": "invalid SECRET" } }),
    new Response("SECRET", { status: 500 }),
  ];
  let calls = 0;
  mockFetch(t, async () => responses[calls++]);
  for (const [index, status] of [429, 503, 503, 500].entries()) {
    await assert.rejects(fetchLiriQoLyrics(`error-${index}`, { baseUrl, title: "SECRET", authorization: "SECRET" }), error => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.status, status);
      if (index === 0) assert.equal(error.retryAfter, 12);
      else if (index === 1) assert.ok(error.retryAfter >= 58 && error.retryAfter <= 60);
      else assert.equal(error.retryAfter, null);
      assert.equal(error.message, `LiriQo API request failed: ${status}`);
      assert.doesNotMatch(JSON.stringify(error), /SECRET|example/);
      return true;
    });
  }
  assert.equal(calls, 4);
});

test("search honors cancellation and throws 429/503 but preserves null for other HTTP errors", async t => {
  let count = 0;
  mockFetch(t, async url => {
    assert.equal(new URL(url).searchParams.get("Q"), "query & artist");
    count++;
    if (count === 1) return json({ videoId: "result" });
    if (count === 2) return json({});
    return new Response("SECRET", { status: [404, 429, 503][count - 3], headers: { "retry-after": "3" } });
  });
  assert.equal(await searchLiriQoVideoId("query & artist", { baseUrl }), "result");
  assert.equal(await searchLiriQoVideoId("query & artist", { baseUrl }), null);
  assert.equal(await searchLiriQoVideoId("query & artist", { baseUrl }), null);
  for (const status of [429, 503]) {
    await assert.rejects(searchLiriQoVideoId("query & artist", { baseUrl }), error => error instanceof ApiError && error.status === status && error.retryAfter === 3);
  }
  const caller = new AbortController();
  let upstream;
  globalThis.fetch = async (_, { signal }) => {
    upstream = signal;
    return new Promise(() => {});
  };
  const request = searchLiriQoVideoId("cancel", { baseUrl, signal: caller.signal });
  caller.abort();
  await assert.rejects(request, hasCode("ABORTED"));
  assert.equal(upstream.aborted, true);
  await assert.rejects(searchLiriQoVideoId("cancel", { baseUrl, signal: caller.signal }), hasCode("ABORTED"));
});

test("response bodies reject malformed JSON, invalid UTF-8 and non-object JSON", async t => {
  const bodies = ["{broken SECRET", "null", "[]", "42", '"text"', new Uint8Array([0xff])];
  mockFetch(t, async () => new Response(bodies.shift()));
  for (let index = 0; index < 6; index++) {
    await assert.rejects(fetchLiriQoLyrics(`malformed-${index}`, { baseUrl }), error => {
      assert.ok(hasCode("INVALID_RESPONSE")(error));
      assert.doesNotMatch(error.message, /SECRET|broken/);
      return true;
    });
  }
});

test("8 MiB body limit applies to declared and streamed response sizes", async t => {
  let cancelled = 0;
  let count = 0;
  mockFetch(t, async () => {
    count++;
    const body = new ReadableStream({
      start(controller) {
        if (count === 2) controller.enqueue(new Uint8Array(8 * 1024 * 1024 + 1));
      },
      cancel() { cancelled++; },
    });
    return new Response(body, count === 1 ? { headers: { "content-length": String(8 * 1024 * 1024 + 1) } } : undefined);
  });
  for (const id of ["declared", "streamed"]) {
    await assert.rejects(fetchLiriQoLyrics(id, { baseUrl }), hasCode("BODY_TOO_LARGE"));
  }
  assert.equal(cancelled, 2);
});

test("options reject unsafe URLs and invalid timeouts without fetching", async t => {
  let calls = 0;
  mockFetch(t, async () => { calls++; return json(); });
  for (const timeout of [0, -1, 120001, 1.5, NaN, Infinity, "15000"]) {
    await assert.rejects(fetchLiriQoLyrics("invalid", { baseUrl, timeout }), hasCode("INVALID_OPTIONS"));
    await assert.rejects(searchLiriQoVideoId("query", { baseUrl, timeout }), hasCode("INVALID_OPTIONS"));
  }
  for (const invalid of ["http://api.example.test", "ftp://localhost", "not-a-url", "https://user:SECRET@api.example.test", `${baseUrl}?token=SECRET`, `${baseUrl}#SECRET`]) {
    await assert.rejects(fetchLiriQoLyrics("invalid", { baseUrl: invalid }), error => {
      assert.ok(hasCode("INVALID_OPTIONS")(error));
      assert.doesNotMatch(error.message, /SECRET|example/);
      return true;
    });
  }
  await assert.rejects(fetchLiriQoLyrics("https://secret.test", { baseUrl }), hasCode("INVALID_OPTIONS"));
  assert.equal(calls, 0);
  for (const allowed of ["http://localhost:8080", "http://127.0.0.1:8080", "http://[::1]:8080", `${baseUrl}/api/`]) {
    await fetchLiriQoLyrics("allowed", { baseUrl: allowed });
  }
  assert.equal(calls, 4);
});

test("network errors are sanitized and redirects are not followed", async t => {
  mockFetch(t, async (_, options) => {
    assert.equal(options.redirect, "error");
    assert.equal(options.headers, undefined);
    throw new Error("SECRET request to https://user:pass@example.test");
  });
  await assert.rejects(fetchLiriQoLyrics("network", { baseUrl }), error => {
    assert.ok(hasCode("NETWORK_ERROR")(error));
    assert.equal(error.message, "LiriQo API request failed");
    assert.equal(error.cause, undefined);
    return true;
  });
});

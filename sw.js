// 自動生成ファイル: src/sw.ts を編集して npm run build で作り直す
"use strict";
(() => {
  // src/sw.ts
  var VERSION = "v1";
  var SHELL_CACHE = `customsound-shell-${VERSION}`;
  var AUDIO_CACHE = "customsound-audio-v1";
  var AUDIO_MAX_ENTRIES = 60;
  var SCOPE = new URL(self.registration.scope);
  var OFFLINE_URL = new URL("offline.html", SCOPE).href;
  var SHELL_URLS = [
    "./",
    "offline.html",
    "manifest.webmanifest",
    "assets/styles.css",
    "vendor/fontawesome/css/fontawesome.min.css",
    "vendor/fontawesome/css/solid.min.css",
    "vendor/fontawesome/webfonts/fa-solid-900.woff2",
    "icons/toro-avatar.png",
    "icons/favicon-32.png",
    "icons/apple-touch-icon.png",
    "icons/icon-192.png",
    "icons/icon-512.png",
    "icons/icon-maskable-512.png"
  ].map((p) => new URL(p, SCOPE).href);
  self.addEventListener("install", (event) => {
    event.waitUntil(
      (async () => {
        const cache = await caches.open(SHELL_CACHE);
        await cache.addAll(SHELL_URLS.map((url) => new Request(url, { cache: "reload" })));
        await self.skipWaiting();
      })()
    );
  });
  self.addEventListener("activate", (event) => {
    event.waitUntil(
      (async () => {
        const keep = /* @__PURE__ */ new Set([SHELL_CACHE, AUDIO_CACHE]);
        const names = await caches.keys();
        await Promise.all(names.filter((n) => n.startsWith("customsound-") && !keep.has(n)).map((n) => caches.delete(n)));
        await self.clients.claim();
      })()
    );
  });
  self.addEventListener("fetch", (event) => {
    const req = event.request;
    if (req.method !== "GET") return;
    const url = new URL(req.url);
    if (url.origin !== SCOPE.origin) return;
    if (!url.pathname.startsWith(SCOPE.pathname)) return;
    if (req.mode === "navigate") {
      event.respondWith(handleNavigation(event));
      return;
    }
    if (url.pathname.startsWith(new URL("audio/", SCOPE).pathname)) {
      event.respondWith(handleAudio(req));
      return;
    }
    event.respondWith(handleStatic(event));
  });
  async function handleNavigation(event) {
    const req = event.request;
    try {
      const res = await fetch(req);
      if (res.ok && res.type === "basic") {
        const copy = res.clone();
        event.waitUntil(caches.open(SHELL_CACHE).then((c) => c.put(req.url.split("#")[0], copy)));
      }
      return res;
    } catch {
      const cache = await caches.open(SHELL_CACHE);
      return await cache.match(req, { ignoreSearch: true }) ?? await cache.match(SCOPE.href) ?? await cache.match(OFFLINE_URL) ?? new Response("\u30AA\u30D5\u30E9\u30A4\u30F3\u3067\u3059", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }
  }
  async function handleStatic(event) {
    const req = event.request;
    const cache = await caches.open(SHELL_CACHE);
    const cached = await cache.match(req, { ignoreSearch: true });
    const update = fetch(req).then(async (res) => {
      if (res.ok && res.status === 200 && res.type === "basic") await cache.put(req, res.clone());
      return res;
    });
    if (cached) {
      event.waitUntil(update.catch(() => void 0));
      return cached;
    }
    return update;
  }
  var inflight = /* @__PURE__ */ new Map();
  async function handleAudio(req) {
    const key = new URL(req.url);
    key.search = "";
    key.hash = "";
    const cache = await caches.open(AUDIO_CACHE);
    let full = await cache.match(key.href);
    if (!full) {
      let job = inflight.get(key.href);
      if (!job) {
        job = fetchAndStoreAudio(cache, key.href).finally(() => inflight.delete(key.href));
        inflight.set(key.href, job);
      }
      try {
        full = await job;
      } catch {
        full = void 0;
      }
      if (!full) return fetch(req);
    }
    return req.headers.has("range") ? rangeResponse(req.headers.get("range"), full) : full;
  }
  async function fetchAndStoreAudio(cache, url) {
    const res = await fetch(url, { credentials: "same-origin" });
    if (res.status !== 200 || res.type !== "basic") return void 0;
    await cache.put(url, res.clone());
    await trimCache(cache, AUDIO_MAX_ENTRIES);
    return res;
  }
  async function trimCache(cache, max) {
    const keys = await cache.keys();
    for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
  }
  async function rangeResponse(range, full) {
    const blob = await full.blob();
    const size = blob.size;
    const type = full.headers.get("Content-Type") ?? "audio/ogg";
    const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    let start = NaN;
    let end = NaN;
    if (m) {
      if (m[1] === "" && m[2] !== "") {
        start = Math.max(0, size - Number(m[2]));
        end = size - 1;
      } else if (m[1] !== "") {
        start = Number(m[1]);
        end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
      }
    }
    if (!(start >= 0) || !(end >= start) || start >= size) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    }
    return new Response(blob.slice(start, end + 1, type), {
      status: 206,
      statusText: "Partial Content",
      headers: {
        "Content-Type": type,
        "Content-Length": String(end - start + 1),
        "Content-Range": `bytes ${start}-${end}/${size}`,
        "Accept-Ranges": "bytes"
      }
    });
  }
})();

/// <reference lib="webworker" />
// カスタムサウンド配布所の Service Worker
// - シェル (/, manifest, アイコン, CSS, フォント) とオフラインページを事前キャッシュ
// - ページ遷移はネットワーク優先 → キャッシュ → オフラインページ
// - audio/ は再生したものだけキャッシュ (以後はキャッシュ優先, 件数上限あり)
// - Range リクエストはキャッシュした全体から 206 を組み立てて返す (シーク対応)
// - 別オリジンには一切触らない
// 変更したら `npm run build` で sw.js を作り直してコミットする

declare const self: ServiceWorkerGlobalScope

// シェルの中身を変えたら上げる (古いキャッシュは activate で消える)
const VERSION = 'v1'
const SHELL_CACHE = `customsound-shell-${VERSION}`
// 音声は内容が変わらないので、シェルとは別に世代管理する
const AUDIO_CACHE = 'customsound-audio-v1'
const AUDIO_MAX_ENTRIES = 60

const SCOPE = new URL(self.registration.scope)
const OFFLINE_URL = new URL('offline.html', SCOPE).href
const SHELL_URLS = [
  './',
  'offline.html',
  'manifest.webmanifest',
  'assets/styles.css',
  'vendor/fontawesome/css/fontawesome.min.css',
  'vendor/fontawesome/css/solid.min.css',
  'vendor/fontawesome/webfonts/fa-solid-900.woff2',
  'icons/toro-avatar.png',
  'icons/favicon-32.png',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
].map((p) => new URL(p, SCOPE).href)

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE)
      // HTTP キャッシュを通さず最新を取る
      await cache.addAll(SHELL_URLS.map((url) => new Request(url, { cache: 'reload' })))
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL_CACHE, AUDIO_CACHE])
      const names = await caches.keys()
      await Promise.all(names.filter((n) => n.startsWith('customsound-') && !keep.has(n)).map((n) => caches.delete(n)))
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  // 別オリジン (Google Fonts など) はブラウザに任せる。キャッシュもしない
  if (url.origin !== SCOPE.origin) return
  if (!url.pathname.startsWith(SCOPE.pathname)) return

  if (req.mode === 'navigate') {
    event.respondWith(handleNavigation(event))
    return
  }
  if (url.pathname.startsWith(new URL('audio/', SCOPE).pathname)) {
    event.respondWith(handleAudio(req))
    return
  }
  event.respondWith(handleStatic(event))
})

// ページ遷移: ネットワーク優先。成功したら控えておき、失敗したらキャッシュ → オフラインページ
async function handleNavigation(event: FetchEvent): Promise<Response> {
  const req = event.request
  try {
    const res = await fetch(req)
    if (res.ok && res.type === 'basic') {
      const copy = res.clone()
      event.waitUntil(caches.open(SHELL_CACHE).then((c) => c.put(req.url.split('#')[0], copy)))
    }
    return res
  } catch {
    const cache = await caches.open(SHELL_CACHE)
    return (
      (await cache.match(req, { ignoreSearch: true })) ??
      (await cache.match(SCOPE.href)) ??
      (await cache.match(OFFLINE_URL)) ??
      new Response('オフラインです', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
    )
  }
}

// CSS / アイコンなど: キャッシュがあればすぐ返し、裏で更新する (stale-while-revalidate)
async function handleStatic(event: FetchEvent): Promise<Response> {
  const req = event.request
  const cache = await caches.open(SHELL_CACHE)
  const cached = await cache.match(req, { ignoreSearch: true })
  const update = fetch(req).then(async (res) => {
    if (res.ok && res.status === 200 && res.type === 'basic') await cache.put(req, res.clone())
    return res
  })
  if (cached) {
    event.waitUntil(update.catch(() => undefined))
    return cached
  }
  return update
}

// 同じ音声を同時に何本も取りに行かないようにする
const inflight = new Map<string, Promise<Response | undefined>>()

// 音声: 1 回再生したらキャッシュに入れ、以後はキャッシュから返す
async function handleAudio(req: Request): Promise<Response> {
  const key = new URL(req.url)
  key.search = ''
  key.hash = ''
  const cache = await caches.open(AUDIO_CACHE)

  let full = await cache.match(key.href)
  if (!full) {
    let job = inflight.get(key.href)
    if (!job) {
      job = fetchAndStoreAudio(cache, key.href).finally(() => inflight.delete(key.href))
      inflight.set(key.href, job)
    }
    try {
      full = await job
    } catch {
      full = undefined
    }
    // 保存できなかった (エラー応答・オフライン) ときは元のリクエストをそのまま流す
    if (!full) return fetch(req)
  }
  return req.headers.has('range') ? rangeResponse(req.headers.get('range')!, full) : full
}

// Range を付けずに全体を取り、200 なら保存する。保存したもののコピーを返す
async function fetchAndStoreAudio(cache: Cache, url: string): Promise<Response | undefined> {
  const res = await fetch(url, { credentials: 'same-origin' })
  if (res.status !== 200 || res.type !== 'basic') return undefined
  await cache.put(url, res.clone())
  await trimCache(cache, AUDIO_MAX_ENTRIES)
  return res
}

// 古いものから消して上限件数に収める (keys() は追加順)
async function trimCache(cache: Cache, max: number): Promise<void> {
  const keys = await cache.keys()
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i])
}

// 全体のレスポンスから Range に合う 206 を組み立てる
async function rangeResponse(range: string, full: Response): Promise<Response> {
  const blob = await full.blob()
  const size = blob.size
  const type = full.headers.get('Content-Type') ?? 'audio/ogg'
  const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim())
  let start = NaN
  let end = NaN
  if (m) {
    if (m[1] === '' && m[2] !== '') {
      // bytes=-N (末尾 N バイト)
      start = Math.max(0, size - Number(m[2]))
      end = size - 1
    } else if (m[1] !== '') {
      start = Number(m[1])
      end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1)
    }
  }
  if (!(start >= 0) || !(end >= start) || start >= size) {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } })
  }
  return new Response(blob.slice(start, end + 1, type), {
    status: 206,
    statusText: 'Partial Content',
    headers: {
      'Content-Type': type,
      'Content-Length': String(end - start + 1),
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Accept-Ranges': 'bytes',
    },
  })
}

/**
 * service-worker.js – VKU Facility Check Service Worker
 * 
 * Chiến lược cache: Cache First cho static assets.
 * Ứng dụng hoạt động hoàn toàn offline sau lần đầu mở.
 * 
 * KHÔNG phụ thuộc CDN – tất cả assets được cache local.
 */

const CACHE_NAME = 'VKU-CACHE-v2';

// Danh sách files cần cache ngay khi install
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './css/responsive.css',
  './js/app.js',
  './js/db.js',
  './js/auth.js',
  './js/network.js',
  './js/sync.js',
  './js/survey.js',
  './js/history.js',
  './js/statistics.js',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
];

// ── Install Event ───────────────────────────────────────────────
// Cache tất cả static assets khi Service Worker được cài đặt
self.addEventListener('install', (event) => {
  console.log('[SW] Installing version:', CACHE_NAME);

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Pre-caching assets...');
        return cache.addAll(PRECACHE_URLS);
      })
      .then(() => {
        console.log('[SW] Pre-cache complete');
        // Kích hoạt ngay, không chờ tab cũ đóng
        return self.skipWaiting();
      })
      .catch((err) => {
        console.error('[SW] Pre-cache failed:', err);
      })
  );
});

// ── Activate Event ──────────────────────────────────────────────
// Xóa cache cũ khi version mới được kích hoạt
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating:', CACHE_NAME);

  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        console.log('[SW] Active and controlling all tabs');
        // Kiểm soát tất cả tab ngay lập tức
        return self.clients.claim();
      })
  );
});

// ── Fetch Event ─────────────────────────────────────────────────
// Chiến lược: Cache First, fallback to Network
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Chỉ xử lý GET requests
  if (event.request.method !== 'GET') return;

  // Bỏ qua requests từ chrome-extension và browser internals
  if (!url.protocol.startsWith('http')) return;

  // Bỏ qua requests tới CDN bên ngoài (không có trong cache)
  // Ứng dụng này không dùng CDN nên không cần lo

  event.respondWith(cacheFirst(event.request));
});

/**
 * Cache First Strategy:
 * 1. Kiểm tra cache trước
 * 2. Nếu có → trả về từ cache (nhanh, hoạt động offline)
 * 3. Nếu không có → fetch từ network → lưu vào cache → trả về
 * 4. Nếu network thất bại và không có cache → trả về offline page
 */
async function cacheFirst(request) {
  try {
    // Tìm trong cache
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }

    // Không có cache → fetch từ network
    const networkResponse = await fetch(request);

    // Lưu vào cache nếu là response thành công
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      // Clone vì response chỉ đọc được 1 lần
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;

  } catch (err) {
    // Network thất bại và không có cache
    console.warn('[SW] Fetch failed, serving offline fallback:', request.url);

    // Nếu là navigate request (HTML), trả về index.html từ cache
    if (request.mode === 'navigate') {
      const cachedIndex = await caches.match('./index.html');
      if (cachedIndex) return cachedIndex;
    }

    // Trả về response lỗi 503
    return new Response(
      JSON.stringify({ error: 'Offline', message: 'Không có kết nối mạng' }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

// ── Background Sync ─────────────────────────────────────────────
// Hỗ trợ Background Sync API (nếu trình duyệt hỗ trợ)
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-surveys') {
    console.log('[SW] Background sync triggered');
    // Logic sync sẽ chạy trong app.js khi tab online
    // Service Worker chỉ cần thông báo cho app
    event.waitUntil(
      self.clients.matchAll().then(clients => {
        clients.forEach(client => {
          client.postMessage({ type: 'BACKGROUND_SYNC', tag: event.tag });
        });
      })
    );
  }
});

// ── Push Notifications ─────────────────────────────────────────
// Sẵn sàng cho push notifications trong tương lai
self.addEventListener('push', (event) => {
  if (!event.data) return;

  const data = event.data.json();
  const options = {
    body: data.body || 'Thông báo từ VKU Facility Check',
    icon: './assets/icons/icon-192.png',
    badge: './assets/icons/icon-192.png',
    data: data,
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'VKU Facility Check', options)
  );
});

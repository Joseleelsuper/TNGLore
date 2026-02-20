// Service Worker para caché de imágenes y recursos estáticos

const CACHE_NAME = 'tnglore-cache-v3';
const IMAGE_CACHE_NAME = 'tnglore-images-v3';
const CARD_CACHE_NAME = 'tnglore-cards-v2';

// Todos los cachés válidos — cualquier otro se elimina en activate
const VALID_CACHES = [CACHE_NAME, IMAGE_CACHE_NAME, CARD_CACHE_NAME];

// Recursos para cachear inmediatamente
const STATIC_RESOURCES = [
    '/static/css/style.css',
    '/static/js/utils/header.js',
    '/static/assets/icons/El_Super.ico'
];

// Patrones de URLs de imágenes genéricas
const IMAGE_PATTERNS = [
    /\.(?:png|jpg|jpeg|svg|webp|gif)$/i,
    /cdn\.jsdelivr\.net.*\.(?:png|jpg|jpeg|svg|webp|gif)/i,
    /assets\/images\/cofre-.*\.webp/i
];

// Patrones específicos para imágenes de cartas (más estables, caché propio)
const CARD_PATTERNS = [
    /assets\/collections\/.*\.(?:png|jpg|jpeg|webp)/i,
    /collections\/.*\/.*\.(?:png|jpg|jpeg|webp)/i
];

// ─── Install ───────────────────────────────────────────────
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(STATIC_RESOURCES))
            .then(() => self.skipWaiting())
    );
});

// ─── Activate ──────────────────────────────────────────────
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames =>
            Promise.all(
                cacheNames
                    .filter(name => !VALID_CACHES.includes(name))
                    .map(name => caches.delete(name))
            )
        ).then(() => self.clients.claim())
    );
});

// ─── Fetch ─────────────────────────────────────────────────
self.addEventListener('fetch', event => {
    const { request } = event;
    if (request.method !== 'GET') return;

    // Cartas → Cache First (caché dedicado, muy estable)
    if (isCardRequest(request)) {
        event.respondWith(cacheFirst(request, CARD_CACHE_NAME));
        return;
    }

    // Imágenes genéricas → Cache First
    if (isImageRequest(request)) {
        event.respondWith(cacheFirst(request, IMAGE_CACHE_NAME));
        return;
    }

    // Recursos estáticos → Stale-While-Revalidate
    if (isStaticResource(request)) {
        event.respondWith(staleWhileRevalidate(request, CACHE_NAME));
        return;
    }

    // APIs → Network Only (no cachear datos dinámicos en SW)
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return;

    // Todo lo demás → Network First
    event.respondWith(networkFirst(request, CACHE_NAME));
});

// ─── Helpers ───────────────────────────────────────────────
function isCardRequest(request) {
    return CARD_PATTERNS.some(p => p.test(request.url));
}

function isImageRequest(request) {
    return IMAGE_PATTERNS.some(p => p.test(request.url));
}

function isStaticResource(request) {
    const url = new URL(request.url);
    return url.pathname.startsWith('/static/') ||
           STATIC_RESOURCES.includes(url.pathname);
}

// ─── Strategies ────────────────────────────────────────────

/** Cache First — ideal para recursos inmutables (imágenes, cartas) */
async function cacheFirst(request, cacheName) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    if (cached) return cached;

    try {
        const response = await fetch(request);
        if (response && response.ok) {
            cache.put(request, response.clone());
        }
        return response;
    } catch {
        return new Response('Image not available', { status: 404 });
    }
}

/** Stale-While-Revalidate — sirve caché al instante, refresca de fondo */
async function staleWhileRevalidate(request, cacheName) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);

    const fetchPromise = fetch(request).then(response => {
        if (response && response.ok) {
            cache.put(request, response.clone());
        }
        return response;
    }).catch(() => cached);

    return cached || fetchPromise;
}

/** Network First — para HTML y contenido dinámico */
async function networkFirst(request, cacheName) {
    try {
        const response = await fetch(request);
        if (response && response.ok) {
            const cache = await caches.open(cacheName);
            cache.put(request, response.clone());
        }
        return response;
    } catch {
        const cache = await caches.open(cacheName);
        const cached = await cache.match(request);
        return cached || new Response('Content not available', { status: 503 });
    }
}

// ─── Cache maintenance ────────────────────────────────────
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'CLEAN_IMAGE_CACHE') {
        cleanCache(IMAGE_CACHE_NAME, 200);
    }
    if (event.data && event.data.type === 'CLEAN_CARD_CACHE') {
        cleanCache(CARD_CACHE_NAME, 500);
    }
});

async function cleanCache(cacheName, maxEntries) {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    if (keys.length > maxEntries) {
        const toDelete = keys.slice(0, keys.length - maxEntries);
        await Promise.all(toDelete.map(k => cache.delete(k)));
    }
}

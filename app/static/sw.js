// Service Worker para caché de imágenes y recursos estáticos

const CACHE_NAME = 'tnglore-cache-v2';
const IMAGE_CACHE_NAME = 'tnglore-images-v2';
const CARD_CACHE_NAME = 'tnglore-cards-v1';

// Recursos para cachear inmediatamente
const STATIC_RESOURCES = [
    '/static/css/style.css',
    '/static/js/utils/header.js',
    '/static/assets/icons/El_Super.ico'
];

// Patrones de URLs de imágenes para cachear
const IMAGE_PATTERNS = [
    /\.(?:png|jpg|jpeg|svg|webp|gif)$/i,
    /cdn\.jsdelivr\.net.*\.(png|jpg|jpeg|svg|webp|gif)/i,
    /assets\/images\/cofre-.*\.webp/i
];

// Patrones específicos para imágenes de cartas
const CARD_PATTERNS = [
    /assets\/collections\/.*\.(png|jpg|jpeg|webp)/i,
    /collections\/.*\/.*\.(png|jpg|jpeg|webp)/i
];

// Instalar Service Worker
self.addEventListener('install', event => {
    console.log('Service Worker: Instalando...');
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Service Worker: Cacheando recursos estáticos');
                return cache.addAll(STATIC_RESOURCES);
            })
            .then(() => self.skipWaiting())
    );
});

// Activar Service Worker
self.addEventListener('activate', event => {
    console.log('Service Worker: Activando...');
    
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    // Eliminar cachés antiguos
                    if (cacheName !== CACHE_NAME && cacheName !== IMAGE_CACHE_NAME) {
                        console.log('Service Worker: Eliminando caché antiguo', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            console.log('Service Worker: Activado y listo');
            return self.clients.claim();
        })
    );
});

// Interceptar peticiones
self.addEventListener('fetch', event => {
    const request = event.request;
    const url = new URL(request.url);
    
    // Solo cachear requests GET
    if (request.method !== 'GET') {
        return;
    }
    
    // Estrategia para imágenes: Cache First
    if (isImageRequest(request)) {
        event.respondWith(handleImageRequest(request));
        return;
    }
    
    // Estrategia para recursos estáticos: Cache First con fallback
    if (isStaticResource(request)) {
        event.respondWith(handleStaticRequest(request));
        return;
    }
    
    // Estrategia para APIs: Network First
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(handleApiRequest(request));
        return;
    }
    
    // Para todo lo demás: Network First con fallback a cache
    event.respondWith(handleGenericRequest(request));
});

// Verificar si es una petición de imagen
function isImageRequest(request) {
    return IMAGE_PATTERNS.some(pattern => pattern.test(request.url));
}

// Verificar si es un recurso estático
function isStaticResource(request) {
    const url = new URL(request.url);
    return url.pathname.startsWith('/static/') || 
           STATIC_RESOURCES.includes(url.pathname);
}

// Manejar peticiones de imágenes (Cache First)
async function handleImageRequest(request) {
    try {
        const cache = await caches.open(IMAGE_CACHE_NAME);
        const cachedResponse = await cache.match(request);
        
        if (cachedResponse) {
            console.log('Service Worker: Imagen servida desde caché', request.url);
            return cachedResponse;
        }
        
        // Si no está en caché, obtener de la red
        const networkResponse = await fetch(request);
        
        if (networkResponse && networkResponse.status === 200) {
            // Cachear la respuesta para futuras peticiones
            cache.put(request, networkResponse.clone());
            console.log('Service Worker: Imagen cacheada', request.url);
        }
        
        return networkResponse;
    } catch (error) {
        console.error('Service Worker: Error manejando imagen', error);
        
        // Fallback a imagen placeholder si está disponible
        const cache = await caches.open(IMAGE_CACHE_NAME);
        const fallback = await cache.match('/static/assets/images/placeholder.webp');
        return fallback || new Response('Image not available', { status: 404 });
    }
}

// Manejar recursos estáticos (Cache First)
async function handleStaticRequest(request) {
    try {
        const cache = await caches.open(CACHE_NAME);
        const cachedResponse = await cache.match(request);
        
        if (cachedResponse) {
            return cachedResponse;
        }
        
        const networkResponse = await fetch(request);
        
        if (networkResponse && networkResponse.status === 200) {
            cache.put(request, networkResponse.clone());
        }
        
        return networkResponse;
    } catch (error) {
        console.error('Service Worker: Error con recurso estático', error);
        const cache = await caches.open(CACHE_NAME);
        return cache.match(request) || new Response('Resource not available', { status: 404 });
    }
}

// Manejar peticiones API (Network First)
async function handleApiRequest(request) {
    try {
        const networkResponse = await fetch(request);
        return networkResponse;
    } catch (error) {
        console.error('Service Worker: Error API, intentando caché', error);
        const cache = await caches.open(CACHE_NAME);
        const cachedResponse = await cache.match(request);
        return cachedResponse || new Response('API not available', { status: 503 });
    }
}

// Manejar peticiones genéricas (Network First)
async function handleGenericRequest(request) {
    try {
        const networkResponse = await fetch(request);
        return networkResponse;
    } catch (error) {
        console.error('Service Worker: Error de red, intentando caché', error);
        const cache = await caches.open(CACHE_NAME);
        return cache.match(request) || new Response('Content not available', { status: 503 });
    }
}

// Limpiar caché de imágenes cuando se llena demasiado
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'CLEAN_IMAGE_CACHE') {
        cleanImageCache();
    }
});

async function cleanImageCache() {
    const cache = await caches.open(IMAGE_CACHE_NAME);
    const keys = await cache.keys();
    
    if (keys.length > 100) { // Límite de 100 imágenes
        console.log('Service Worker: Limpiando caché de imágenes...');
        // Eliminar las más antiguas (primeras 20)
        const keysToDelete = keys.slice(0, 20);
        await Promise.all(keysToDelete.map(key => cache.delete(key)));
        console.log(`Service Worker: ${keysToDelete.length} imágenes eliminadas del caché`);
    }
}

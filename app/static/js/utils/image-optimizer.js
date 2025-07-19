// File: app/static/js/utils/image-optimizer.js
// Optimizador de imágenes con lazy loading y caché

class ImageOptimizer {
    constructor() {
        this.cache = new Map();
        this.loadingImages = new Set();
        this.observer = null;
        this.preloadQueue = [];
        this.initLazyLoading();
    }

    /**
     * Inicializa el lazy loading con Intersection Observer
     */
    initLazyLoading() {
        if ('IntersectionObserver' in window) {
            this.observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        this.loadImage(entry.target);
                        this.observer.unobserve(entry.target);
                    }
                });
            }, {
                root: null,
                rootMargin: '50px',
                threshold: 0.1
            });
        }
    }

    /**
     * Observa una imagen para lazy loading
     * @param {HTMLImageElement} img - Elemento de imagen
     */
    observeImage(img) {
        if (this.observer && img.hasAttribute('data-src')) {
            this.observer.observe(img);
        }
    }

    /**
     * Carga una imagen de forma optimizada
     * @param {HTMLImageElement} img - Elemento de imagen
     * @returns {Promise<HTMLImageElement>}
     */
    async loadImage(img) {
        const src = img.getAttribute('data-src') || img.src;
        
        if (!src) return img;

        // Verificar caché
        if (this.cache.has(src)) {
            const cachedData = this.cache.get(src);
            if (cachedData.blob) {
                img.src = cachedData.url;
                img.classList.add('loaded');
                return img;
            }
        }

        // Evitar cargas duplicadas
        if (this.loadingImages.has(src)) {
            return img;
        }

        this.loadingImages.add(src);

        try {
            // Mostrar placeholder mientras carga
            this.showPlaceholder(img);

            const response = await fetch(src);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const blob = await response.blob();
            const objectUrl = URL.createObjectURL(blob);

            // Guardar en caché
            this.cache.set(src, {
                blob: blob,
                url: objectUrl,
                timestamp: Date.now(),
                size: blob.size
            });

            // Aplicar imagen
            img.src = objectUrl;
            img.classList.add('loaded');
            img.removeAttribute('data-src');

            // Limpiar caché si es muy grande
            this.cleanupCache();

        } catch (error) {
            console.error('Error loading image:', src, error);
            this.showErrorPlaceholder(img);
        } finally {
            this.loadingImages.delete(src);
        }

        return img;
    }

    /**
     * Muestra un placeholder mientras la imagen carga
     * @param {HTMLImageElement} img - Elemento de imagen
     */
    showPlaceholder(img) {
        img.style.backgroundColor = '#f0f0f0';
        img.style.minHeight = '150px';
        img.classList.add('loading');
    }

    /**
     * Muestra un placeholder de error
     * @param {HTMLImageElement} img - Elemento de imagen
     */
    showErrorPlaceholder(img) {
        img.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjE1MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZTBlMGUwIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzk5OTk5OSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPkVycm9yIGFsIGNhcmdhcjwvdGV4dD48L3N2Zz4=';
        img.classList.add('error');
    }

    /**
     * Precarga una lista de imágenes
     * @param {string[]} urls - URLs de imágenes
     */
    async preloadImages(urls) {
        const promises = urls.map(url => this.preloadSingleImage(url));
        return Promise.allSettled(promises);
    }

    /**
     * Precarga una imagen individual
     * @param {string} url - URL de la imagen
     * @returns {Promise<void>}
     */
    async preloadSingleImage(url) {
        if (this.cache.has(url)) return;

        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const blob = await response.blob();
            const objectUrl = URL.createObjectURL(blob);

            this.cache.set(url, {
                blob: blob,
                url: objectUrl,
                timestamp: Date.now(),
                size: blob.size
            });

        } catch (error) {
            console.warn('Error preloading image:', url, error);
        }
    }

    /**
     * Limpia el caché cuando excede el límite
     */
    cleanupCache() {
        const maxCacheSize = 50 * 1024 * 1024; // 50MB
        const maxEntries = 100;

        let totalSize = 0;
        this.cache.forEach(entry => {
            totalSize += entry.size || 0;
        });

        if (totalSize > maxCacheSize || this.cache.size > maxEntries) {
            // Ordenar por timestamp y eliminar los más antiguos
            const entries = Array.from(this.cache.entries())
                .sort((a, b) => a[1].timestamp - b[1].timestamp);

            const toDelete = Math.max(
                entries.length - maxEntries,
                Math.ceil(entries.length * 0.3) // Eliminar 30%
            );

            for (let i = 0; i < toDelete; i++) {
                const [url, data] = entries[i];
                if (data.url) {
                    URL.revokeObjectURL(data.url);
                }
                this.cache.delete(url);
            }
        }
    }

    /**
     * Procesa todas las imágenes de la página para lazy loading
     */
    processPageImages() {
        // Temporalmente desactivado para debugging
        // const images = document.querySelectorAll('img[data-src]');
        // images.forEach(img => this.observeImage(img));

        // // También procesar imágenes con loading="lazy"
        // const lazyImages = document.querySelectorAll('img[loading="lazy"]:not([data-src])');
        // lazyImages.forEach(img => {
        //     if (img.src) {
        //         img.setAttribute('data-src', img.src);
        //         img.removeAttribute('src');
        //         this.observeImage(img);
        //     }
        // });
    }

    /**
     * Optimiza imágenes de cartas específicamente
     * @param {HTMLElement} container - Contenedor de cartas
     */
    optimizeCardImages(container) {
        // Temporalmente desactivado para debugging
        // const cardImages = container.querySelectorAll('.card-image, .carta-image, .carta img');
        
        // cardImages.forEach(img => {
        //     if (!img.hasAttribute('data-src') && img.src) {
        //         img.setAttribute('data-src', img.src);
        //         img.removeAttribute('src');
        //         this.observeImage(img);
        //     }
        // });
    }

    /**
     * Obtiene estadísticas del caché
     * @returns {Object} Estadísticas del caché
     */
    getCacheStats() {
        let totalSize = 0;
        this.cache.forEach(entry => {
            totalSize += entry.size || 0;
        });

        return {
            entries: this.cache.size,
            totalSize: totalSize,
            totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2)
        };
    }

    /**
     * Limpia completamente el caché
     */
    clearCache() {
        this.cache.forEach(data => {
            if (data.url) {
                URL.revokeObjectURL(data.url);
            }
        });
        this.cache.clear();
    }
}

// Instancia global del optimizador de imágenes
const imageOptimizer = new ImageOptimizer();

// Auto-inicializar cuando el DOM esté listo
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        imageOptimizer.processPageImages();
    });
} else {
    imageOptimizer.processPageImages();
}

// Exportar para uso global
window.imageOptimizer = imageOptimizer;

export default imageOptimizer;

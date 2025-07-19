// File: app/static/js/pages/performance-integration.js
// Script de integración para optimización de rendimiento

import imageOptimizer from '../utils/image-optimizer.js';
import { cache, fetchData, preloadCriticalData } from '../utils/shared.js';

class PerformanceManager {
    constructor() {
        this.initialized = false;
        this.pageLoadTime = performance.now();
        this.metrics = {
            cacheHits: 0,
            cacheMisses: 0,
            imagesLoaded: 0,
            apiCalls: 0
        };
        
        this.init();
    }

    async init() {
        if (this.initialized) return;
        
        // Precargar datos críticos según la página actual
        await this.preloadCriticalDataForPage();
        
        // Optimizar imágenes existentes
        this.optimizeExistingImages();
        
        // Configurar observers para contenido dinámico
        this.setupDynamicContentObserver();
        
        // Configurar métricas de rendimiento
        this.setupPerformanceMetrics();
        
        this.initialized = true;
        console.log('Performance Manager inicializado');
    }

    /**
     * Precarga datos críticos según la página actual
     */
    async preloadCriticalDataForPage() {
        const pathname = window.location.pathname;
        
        try {
            switch (true) {
                case pathname.includes('/colecciones'):
                    await preloadCriticalData();
                    await this.preloadCollectionImages();
                    break;
                    
                case pathname.includes('/mi-coleccion'):
                    await this.preloadUserCollectionData();
                    break;
                    
                case pathname.includes('/cofres'):
                    await this.preloadChestData();
                    break;
                    
                case pathname.includes('/admin'):
                    await this.preloadAdminData();
                    break;
                    
                default:
                    // Página de inicio u otras
                    await this.preloadCommonData();
            }
        } catch (error) {
            console.warn('Error precargando datos críticos:', error);
        }
    }

    /**
     * Precarga imágenes de colecciones
     */
    async preloadCollectionImages() {
        try {
            const collections = await fetchData('/api/colecciones');
            if (collections?.data) {
                const imageUrls = collections.data
                    .map(col => col.image)
                    .filter(Boolean)
                    .slice(0, 6); // Solo las primeras 6 imágenes
                
                await imageOptimizer.preloadImages(imageUrls);
            }
        } catch (error) {
            console.warn('Error precargando imágenes de colecciones:', error);
        }
    }

    /**
     * Precarga datos de la colección del usuario
     */
    async preloadUserCollectionData() {
        try {
            await fetchData('/api/user_collectibles');
        } catch (error) {
            console.warn('Error precargando datos de usuario:', error);
        }
    }

    /**
     * Precarga datos de cofres
     */
    async preloadChestData() {
        try {
            await fetchData('/api/chests/data');
            await fetchData('/api/chests/config');
        } catch (error) {
            console.warn('Error precargando datos de cofres:', error);
        }
    }

    /**
     * Precarga datos de administración
     */
    async preloadAdminData() {
        try {
            await Promise.all([
                fetchData('/api/cartas'),
                fetchData('/api/collections'),
                fetchData('/api/users')
            ]);
        } catch (error) {
            console.warn('Error precargando datos de admin:', error);
        }
    }

    /**
     * Precarga datos comunes
     */
    async preloadCommonData() {
        try {
            await fetchData('/api/colecciones');
        } catch (error) {
            console.warn('Error precargando datos comunes:', error);
        }
    }

    /**
     * Optimiza imágenes existentes en la página
     */
    optimizeExistingImages() {
        // Procesar todas las imágenes de la página
        imageOptimizer.processPageImages();
        
        // Configurar observador para imágenes de cartas específicamente
        const cardContainers = document.querySelectorAll('.cartas-container, .chest-container, .collection-grid');
        cardContainers.forEach(container => {
            imageOptimizer.optimizeCardImages(container);
        });
    }

    /**
     * Configura observer para contenido dinámico
     */
    setupDynamicContentObserver() {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        // Optimizar imágenes en el nuevo contenido
                        const images = node.querySelectorAll ? node.querySelectorAll('img') : [];
                        images.forEach(img => imageOptimizer.observeImage(img));
                        
                        // Si es un contenedor de cartas, optimizar específicamente
                        if (node.classList?.contains('carta') || node.querySelector?.('.carta')) {
                            imageOptimizer.optimizeCardImages(node);
                        }
                    }
                });
            });
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    /**
     * Configura métricas de rendimiento
     */
    setupPerformanceMetrics() {
        // Interceptar fetch para contar llamadas API
        const originalFetch = window.fetch;
        window.fetch = async (...args) => {
            this.metrics.apiCalls++;
            return originalFetch.apply(window, args);
        };

        // Contar hits/misses del caché
        const originalGet = cache.get;
        cache.get = (key) => {
            const result = originalGet.call(cache, key);
            if (result !== undefined) {
                this.metrics.cacheHits++;
            } else {
                this.metrics.cacheMisses++;
            }
            return result;
        };

        // Mostrar métricas en desarrollo
        if (window.location.hostname === 'localhost') {
            this.showDevelopmentMetrics();
        }
    }

    /**
     * Muestra métricas de desarrollo
     */
    showDevelopmentMetrics() {
        const metricsDiv = document.createElement('div');
        metricsDiv.id = 'performance-metrics';
        metricsDiv.style.cssText = `
            position: fixed;
            top: 10px;
            left: 10px;
            background: rgba(0,0,0,0.8);
            color: white;
            padding: 10px;
            border-radius: 5px;
            font-size: 12px;
            z-index: 1000;
            display: none;
        `;
        document.body.appendChild(metricsDiv);

        // Mostrar/ocultar con Ctrl+Shift+M
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.shiftKey && e.key === 'M') {
                const isVisible = metricsDiv.style.display !== 'none';
                metricsDiv.style.display = isVisible ? 'none' : 'block';
                
                if (!isVisible) {
                    this.updateMetricsDisplay(metricsDiv);
                }
            }
        });

        // Actualizar métricas cada 5 segundos
        setInterval(() => {
            if (metricsDiv.style.display !== 'none') {
                this.updateMetricsDisplay(metricsDiv);
            }
        }, 5000);
    }

    /**
     * Actualiza la visualización de métricas
     */
    updateMetricsDisplay(container) {
        const cacheStats = imageOptimizer.getCacheStats();
        const totalCacheOps = this.metrics.cacheHits + this.metrics.cacheMisses;
        const cacheHitRate = totalCacheOps > 0 ? (this.metrics.cacheHits / totalCacheOps * 100).toFixed(1) : 0;
        
        container.innerHTML = `
            <strong>Performance Metrics</strong><br>
            Cache Hit Rate: ${cacheHitRate}% (${this.metrics.cacheHits}/${totalCacheOps})<br>
            API Calls: ${this.metrics.apiCalls}<br>
            Images Cached: ${cacheStats.entries}<br>
            Cache Size: ${cacheStats.totalSizeMB} MB<br>
            Page Load: ${(performance.now() - this.pageLoadTime).toFixed(0)}ms
        `;
    }

    /**
     * Optimiza la carga de overlays de cartas
     */
    optimizeCardOverlay() {
        // Precargar imágenes relacionadas cuando se abre un overlay
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE && 
                        (node.classList?.contains('overlay') || node.querySelector?.('.overlay'))) {
                        
                        // Precargar imágenes del overlay
                        setTimeout(() => {
                            const overlayImages = node.querySelectorAll('img[data-src], img[src]');
                            const urls = Array.from(overlayImages)
                                .map(img => img.getAttribute('data-src') || img.src)
                                .filter(Boolean);
                            
                            imageOptimizer.preloadImages(urls);
                        }, 100);
                    }
                });
            });
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    /**
     * Obtiene métricas de rendimiento
     */
    getMetrics() {
        return {
            ...this.metrics,
            imageCache: imageOptimizer.getCacheStats(),
            dataCache: {
                size: cache.size,
                hitRate: this.metrics.cacheHits / (this.metrics.cacheHits + this.metrics.cacheMisses)
            }
        };
    }
}

// Inicializar el Performance Manager
const performanceManager = new PerformanceManager();

// Optimizar overlays de cartas
performanceManager.optimizeCardOverlay();

// Exportar para uso global
window.performanceManager = performanceManager;

export default performanceManager;

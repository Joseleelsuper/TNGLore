// Polyfill para lazy loading de imágenes en navegadores que no lo soporten nativamente
// app/static/js/utils/lazy-loading-polyfill.js

(function() {
    'use strict';
    
    // Verificar si el navegador soporta IntersectionObserver
    if (!('IntersectionObserver' in window)) {
        console.warn('IntersectionObserver no soportado, cargando todas las imágenes inmediatamente');
        loadAllImages();
        return;
    }
    
    const imageObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                loadImage(img);
                observer.unobserve(img);
            }
        });
    }, {
        // Cargar imágenes cuando estén a 50px de ser visibles
        rootMargin: '50px 0px',
        threshold: 0.01
    });
    
    function loadImage(img) {
        // Crear una nueva imagen para precargar
        const imageLoader = new Image();
        
        imageLoader.onload = function() {
            // Una vez cargada, actualizar el src de la imagen real
            img.src = imageLoader.src;
            img.classList.remove('lazy');
            img.classList.add('loaded');
            
            // Disparar evento personalizado
            img.dispatchEvent(new CustomEvent('imageLoaded', {
                detail: { src: imageLoader.src }
            }));
        };
        
        imageLoader.onerror = function() {
            img.classList.add('error');
            console.error('Error cargando imagen:', img.dataset.src);
        };
        
        // Usar data-src si está disponible, sino usar src
        const srcToLoad = img.dataset.src || img.src;
        
        if (srcToLoad) {
            imageLoader.src = srcToLoad;
        }
    }
    
    function loadAllImages() {
        // Fallback: cargar todas las imágenes inmediatamente
        const images = document.querySelectorAll('img[loading="lazy"], img[data-src]');
        images.forEach(img => {
            if (img.dataset.src) {
                img.src = img.dataset.src;
                img.removeAttribute('data-src');
            }
            img.classList.remove('lazy');
            img.classList.add('loaded');
        });
    }
    
    function observeImages() {
        // Observar imágenes que tengan atributo loading="lazy" o data-src
        const lazyImages = document.querySelectorAll('img[loading="lazy"], img[data-src]');
        
        lazyImages.forEach(img => {
            // Añadir clase para styling
            img.classList.add('lazy');
            
            // Si la imagen ya está en el viewport, cargarla inmediatamente
            const rect = img.getBoundingClientRect();
            if (rect.top < window.innerHeight && rect.bottom > 0) {
                loadImage(img);
            } else {
                imageObserver.observe(img);
            }
        });
    }
    
    // Inicializar cuando el DOM esté listo
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', observeImages);
    } else {
        observeImages();
    }
    
    // Reobservar imágenes cuando se añada contenido dinámico
    window.lazyLoadPolyfill = {
        observe: observeImages,
        loadImage: loadImage
    };
    
})();

// CSS básico para lazy loading (se puede mover a un archivo CSS)
const style = document.createElement('style');
style.textContent = `
    img.lazy {
        opacity: 0;
        transition: opacity 0.3s ease-in-out;
        background-color: #f0f0f0;
        background-image: linear-gradient(45deg, #f0f0f0 25%, transparent 25%), 
                          linear-gradient(-45deg, #f0f0f0 25%, transparent 25%), 
                          linear-gradient(45deg, transparent 75%, #f0f0f0 75%), 
                          linear-gradient(-45deg, transparent 75%, #f0f0f0 75%);
        background-size: 20px 20px;
        background-position: 0 0, 0 10px, 10px -10px, -10px 0px;
        animation: loading 2s linear infinite;
    }
    
    img.lazy.loaded {
        opacity: 1;
        background: none;
        animation: none;
    }
    
    img.lazy.error {
        opacity: 0.5;
        background: #ffebee;
        animation: none;
    }
    
    @keyframes loading {
        0% { background-position: 0 0, 0 10px, 10px -10px, -10px 0px; }
        100% { background-position: 20px 20px, 20px 30px, 30px 10px, 10px 20px; }
    }
    
    /* Optimización para reducir layout shift */
    img[width][height] {
        height: auto;
    }
    
    /* Placeholder para imágenes sin dimensiones específicas */
    .image-placeholder {
        display: inline-block;
        min-height: 200px;
        background: #f5f5f5;
        border-radius: 4px;
    }
`;

document.head.appendChild(style);

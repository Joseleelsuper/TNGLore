// Función auxiliar para extraer ID de un objeto o string
function extraerID(objeto) {
    if (!objeto) return null;
    
    if (typeof objeto === 'string') {
        return objeto;
    }
    
    if (typeof objeto === 'object' && objeto !== null) {
        // Verificar múltiples campos posibles para el ID
        return objeto._id || objeto.id || objeto.ID || null;
    }
    
    return null;
}

// Función auxiliar para comparar IDs de manera segura
function compararIDs(id1, id2) {
    const extractedId1 = extraerID(id1);
    const extractedId2 = extraerID(id2);
    
    return extractedId1 && extractedId2 && extractedId1 === extractedId2;
}

const cache = {
    data: new Map(),
    timestamps: new Map(),
    TTL: {
        collections: 30 * 60 * 1000,      // 30 minutos
        cards: 20 * 60 * 1000,           // 20 minutos
        collectionCards: 15 * 60 * 1000, // 15 minutos
        cardDetails: 10 * 60 * 1000      // 10 minutos
    },

    set(key, value, ttl = 10 * 60 * 1000) {
        this.data.set(key, value);
        this.timestamps.set(key, Date.now() + ttl);
        this.cleanup();
    },

    get(key) {
        const timestamp = this.timestamps.get(key);
        if (!timestamp || Date.now() > timestamp) {
            this.data.delete(key);
            this.timestamps.delete(key);
            return null;
        }
        return this.data.get(key);
    },

    has(key) {
        return this.get(key) !== null;
    },

    invalidate(pattern) {
        const keys = Array.from(this.data.keys());
        keys.forEach(key => {
            if (key.includes(pattern)) {
                this.data.delete(key);
                this.timestamps.delete(key);
            }
        });
    },

    cleanup() {
        const now = Date.now();
        const expiredKeys = [];
        for (const [key, timestamp] of this.timestamps.entries()) {
            if (now > timestamp) {
                expiredKeys.push(key);
            }
        }
        expiredKeys.forEach(key => {
            this.data.delete(key);
            this.timestamps.delete(key);
        });
    },

    clear() {
        this.data.clear();
        this.timestamps.clear();
    },

    getStats() {
        return {
            size: this.data.size,
            keys: Array.from(this.data.keys())
        };
    }
};

async function fetchData(url, method = 'GET', body = null, useCache = true) {
    const cacheKey = `${method}:${url}:${body ? JSON.stringify(body) : ''}`;
    
    // Si es GET y tenemos caché, usarlo
    if (method === 'GET' && useCache && cache.has(cacheKey)) {
        return cache.get(cacheKey);
    }

    const options = {
        method,
        headers: {
            'Content-Type': 'application/json',
        },
    };

    if (body) {
        options.body = JSON.stringify(body);
    }

    try {
        const response = await fetch(url, options);
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Error en la solicitud');
        }
        
        const data = await response.json();
        
        // Cachear solo las respuestas exitosas de GET
        if (method === 'GET' && useCache) {
            let ttl = cache.TTL.cardDetails; // TTL por defecto
            
            if (url.includes('/api/colecciones') && !url.includes('/cartas')) {
                ttl = cache.TTL.collections;
            } else if (url.includes('/cartas')) {
                ttl = cache.TTL.collectionCards;
            }
            
            cache.set(cacheKey, data, ttl);
        }
        
        return data;
    } catch (error) {
        console.error('Error in fetchData:', error);
        
        // En caso de error, intentar usar caché aunque esté expirado
        if (method === 'GET' && useCache && cache.data.has(cacheKey)) {
            return cache.data.get(cacheKey);
        }
        
        throw error;
    }
}

// Función para precargar datos críticos
async function preloadCriticalData() {
    try {
        await cargarColecciones();
    } catch (error) {
        console.error('Error precargando datos:', error);
    }
}

async function cargarColecciones() {
    try {
        return await fetchData('/api/colecciones', 'GET', null, true);
    } catch (error) {
        console.error('Error al cargar colecciones:', error);
        return [];
    }
}

async function cargarCartas() {
    try {
        return await fetchData('/api/cartas', 'GET', null, true);
    } catch (error) {
        console.error('Error al cargar cartas:', error);
        return [];
    }
}

async function obtenerCartasColeccion(coleccionId) {
    try {
        // Usar endpoint específico para cartas de colección
        return await fetchData(`/api/colecciones/${coleccionId}/cartas`, 'GET', null, true);
    } catch (error) {
        console.error('Error al obtener cartas de colección:', error);
        return [];
    }
}

async function obtenerCartasRelacionadas(cardId) {
    try {
        return await fetchData(`/api/cartas/${cardId}/relacionadas`, 'GET', null, true);
    } catch (error) {
        console.error('Error al obtener cartas relacionadas:', error);
        return [];
    }
}

async function obtenerDetallesCarta(cardId) {
    try {
        return await fetchData(`/api/cartas/${cardId}`, 'GET', null, true);
    } catch (error) {
        console.error('Error al obtener detalles de carta:', error);
        return null;
    }
}

async function obtenerOtrasColecciones(coleccionId) {
    try {
        const colecciones = await cargarColecciones();
        return colecciones.filter(c => c._id !== coleccionId);
    } catch (error) {
        console.error('Error al obtener otras colecciones:', error);
        return [];
    }
}

function crearElementoCarta(carta) {
    const div = document.createElement('div');
    div.className = 'card carta-card';
    div.dataset.carta = JSON.stringify(carta);
    const rarityColors = {
        'comun': '#b0b0b0',
        'rara': '#007bff',
        'epica': '#6f42c1',
        'legendaria': '#fd7e14'
    };

    const rarityColor = rarityColors[carta.rareza.toLowerCase()] || '#000';

    div.innerHTML = `
        <div class="card-image-container">
            <img src="${carta.image || '/static/assets/images/placeholder-card.svg'}" 
                 alt="${carta.nombre}" 
                 class="card-image"
                 loading="lazy"
                 decoding="async">
        </div>
        <div class="card-content">
            <h3 class="card-title">${carta.nombre}</h3>
            <p class="card-rarity" style="color: ${rarityColor};"><strong>${carta.rareza}</strong></p>
        </div>
    `;
    return div;
}

function crearElementoColeccion(coleccion) {
    const div = document.createElement('div');
    div.className = 'card coleccion-card';
    div.dataset.coleccion = JSON.stringify(coleccion);
    div.innerHTML = `
        <div class="card-image-container">
            <img src="${coleccion.image || '/static/images/placeholder-collection.png'}" 
                 alt="${coleccion.nombre}" 
                 class="card-image"
                 loading="lazy"
                 decoding="async">
        </div>
        <div class="card-content">
            <h3 class="card-title">${coleccion.nombre}</h3>
        </div>
    `;
    return div;
}

async function abrirOverlayCarta(carta) {
    const overlay = document.getElementById('overlay');
    const overlayContent = document.querySelector('.overlay-content');

    // Asegurarse de que carta sea un objeto
    if (typeof carta === 'string') {
        try {
            carta = JSON.parse(carta);
        } catch (e) {
            console.error('Error al parsear datos de la carta:', e);
            return;
        }
    }

    // Mostrar loading inmediatamente
    overlayContent.innerHTML = `
        <span class="close-btn">&times;</span>
        <div class="overlay-main">
            <div class="overlay-loading">
                <div class="loading-spinner"></div>
                <p>Cargando detalles de la carta...</p>
            </div>
        </div>
    `;

    overlay.style.display = 'block';
    document.querySelector('.close-btn').onclick = cerrarOverlay;

    try {
        // Obtener detalles completos de la carta si solo tenemos datos básicos
        let cartaCompleta = carta;
        if (!carta.descripcion && carta._id) {
            try {
                const response = await fetch(`/api/cartas/${carta._id}`);
                if (response.ok) {
                    cartaCompleta = await response.json();
                }
            } catch (error) {
                console.warn('Error obteniendo detalles de carta:', error);
            }
        }

        // Si tenemos ID de colección, obtener el nombre de la colección
        let nombreColeccion = 'No asignada';
        let coleccionId = extraerID(cartaCompleta.coleccion);
        
        // Verificar si el coleccionId es válido
        if (coleccionId && typeof coleccionId === 'object') {
            coleccionId = null;
        }
        
        if (coleccionId) {
            // Si ya tenemos el nombre de la colección en el objeto, usarlo
            if (cartaCompleta.coleccion && typeof cartaCompleta.coleccion === 'object' && cartaCompleta.coleccion.nombre) {
                nombreColeccion = cartaCompleta.coleccion.nombre;
            } else if (coleccionId && typeof coleccionId === 'string') {
                try {
                    const response = await fetch(`/api/colecciones/${encodeURIComponent(coleccionId)}`);
                    if (response.ok) {
                        const coleccionInfo = await response.json();
                        nombreColeccion = coleccionInfo.nombre;
                    }
                } catch (error) {
                    // silently ignore
                }
            }
        } else {
        }

        overlayContent.innerHTML = `
            <span class="close-btn">&times;</span>
            <div class="overlay-main">
                <div class="overlay-image-container">
                    <a href="${cartaCompleta.image || '/static/assets/images/placeholder-card.svg'}" target="_blank">
                        <img src="${cartaCompleta.image || '/static/assets/images/placeholder-card.svg'}" 
                             alt="${cartaCompleta.nombre}" 
                             loading="eager"
                             class="loaded">
                    </a>
                </div>
                <div class="overlay-details">
                    <h2>${cartaCompleta.nombre}</h2>
                    <p><strong>Rareza:</strong> ${cartaCompleta.rareza}</p>
                    <p><strong>Colección:</strong> ${nombreColeccion}</p>
                    <p><strong>Descripción:</strong> ${cartaCompleta.descripcion || 'Sin descripción'}</p>
                </div>
            </div>
            <div class="overlay-section">
                <h3>Otras cartas de la misma colección</h3>
                <div class="overlay-cards" id="cartas-relacionadas-container">
                    <div class="loading-spinner-small"></div>
                    <p>Cargando cartas relacionadas...</p>
                </div>
            </div>
        `;

        document.querySelector('.close-btn').onclick = cerrarOverlay;

        // Cargar cartas relacionadas de forma asíncrona
        if (coleccionId && typeof coleccionId === 'string') {
            try {
                const response = await fetch(`/api/colecciones/${encodeURIComponent(coleccionId)}/cartas`);
                if (response.ok) {
                    const cartasRelacionadas = await response.json();
                    const cartasRelacionadasContainer = document.getElementById('cartas-relacionadas-container');
                    
                    if (cartasRelacionadas && cartasRelacionadas.length > 0) {
                        // Filtrar la carta actual
                        const cartasFiltradas = cartasRelacionadas.filter(c => c._id !== cartaCompleta._id);
                        
                        if (cartasFiltradas.length > 0) {
                            cartasRelacionadasContainer.innerHTML = cartasFiltradas
                                .map(c => `
                                    <div class="overlay-card" onclick="window.abrirOverlayCarta(${JSON.stringify(c).replace(/"/g, '&quot;')})">
                                        <img src="${c.image || '/static/assets/images/placeholder-card.svg'}" 
                                             alt="${c.nombre}"
                                             loading="eager"
                                             class="loaded">
                                        <p>${c.nombre}</p>
                                    </div>
                                `).join('');
                            
                            // Procesar las nuevas imágenes lazy loading
                            const newLazyImages = cartasRelacionadasContainer.querySelectorAll('img[loading="lazy"]:not(.loaded)');
                            newLazyImages.forEach(img => {
                                if (img.complete && img.naturalHeight !== 0) {
                                    img.classList.add('loaded');
                                } else {
                                    img.addEventListener('load', function() {
                                        this.classList.add('loaded');
                                    }, { once: true });
                                    
                                    img.addEventListener('error', function() {
                                        this.classList.add('loaded');
                                        console.warn('Error cargando imagen:', this.src);
                                    }, { once: true });
                                }
                            });
                        } else {
                            cartasRelacionadasContainer.innerHTML = '<p>No hay otras cartas en esta colección.</p>';
                        }
                    } else {
                        cartasRelacionadasContainer.innerHTML = '<p>No hay cartas relacionadas.</p>';
                    }
                } else {
                    throw new Error(`Error ${response.status}: ${response.statusText}`);
                }
            } catch (error) {
                console.error('Error cargando cartas relacionadas:', error);
                const cartasRelacionadasContainer = document.getElementById('cartas-relacionadas-container');
                if (cartasRelacionadasContainer) {
                    cartasRelacionadasContainer.innerHTML = '<p>Error cargando cartas relacionadas.</p>';
                }
            }
        } else {
            const cartasRelacionadasContainer = document.getElementById('cartas-relacionadas-container');
            if (cartaCompleta.coleccion && typeof cartaCompleta.coleccion === 'object') {
                cartasRelacionadasContainer.innerHTML = '<p>Esta carta pertenece a una colección pero hay un problema con el ID.</p>';
            } else {
                cartasRelacionadasContainer.innerHTML = '<p>Esta carta no pertenece a ninguna colección.</p>';
            }
        }

    } catch (error) {
        console.error('Error en abrirOverlayCarta:', error);
        overlayContent.innerHTML = `
            <span class="close-btn">&times;</span>
            <div class="overlay-main">
                <div class="overlay-error">
                    <p>Error cargando los detalles de la carta.</p>
                    <button onclick="cerrarOverlay()">Cerrar</button>
                </div>
            </div>
        `;
        document.querySelector('.close-btn').onclick = cerrarOverlay;
    }
}

async function abrirOverlayColeccion(coleccion) {
    // Asegurarse de que coleccion sea un objeto
    if (typeof coleccion === 'string') {
        try {
            coleccion = JSON.parse(coleccion);
        } catch(e) {
            console.error('Error al parsear datos de la colección:', e);
            return;
        }
    }
    
    // Extraer el id de la colección usando la función auxiliar
    const coleccionId = extraerID(coleccion);
    if (!coleccionId) {
        console.error('El id de la colección no está definido', coleccion);
        return;
    }
    
    const overlay = document.getElementById('overlay');
    const overlayContent = document.querySelector('.overlay-content');

    // Mostrar loading inmediatamente
    overlayContent.innerHTML = `
        <span class="close-btn">&times;</span>
        <div class="overlay-main">
            <div class="overlay-loading">
                <div class="loading-spinner"></div>
                <p>Cargando colección...</p>
            </div>
        </div>
    `;

    overlay.style.display = 'block';
    document.querySelector('.close-btn').onclick = cerrarOverlay;

    try {
        // Obtener datos completos de la colección si es necesario
        let coleccionCompleta = coleccion;
        if (!coleccion.count) {
            try {
                const response = await fetch(`/api/colecciones/${encodeURIComponent(coleccionId)}`);
                if (response.ok) {
                    coleccionCompleta = await response.json();
                }
            } catch (error) {
                console.warn('Error obteniendo detalles de colección:', error);
            }
        }

        // Crear el HTML del overlay
        const overlayHTML = `
            <span class="close-btn">&times;</span>
            <div class="overlay-main">
                <div class="overlay-image-container">
                    <a href="${coleccionCompleta.image || '/static/images/placeholder-collection.png'}" target="_blank">
                        <img src="${coleccionCompleta.image || '/static/images/placeholder-collection.png'}" 
                             alt="${coleccionCompleta.nombre}" 
                             style="max-height: 200px; width: auto;"
                             loading="eager">
                    </a>
                </div>
                <div class="overlay-details">
                    <h2>${coleccionCompleta.nombre}</h2>
                    <p><strong>Descripción:</strong> ${coleccionCompleta.descripcion || 'Sin descripción'}</p>
                </div>
            </div>
            <div class="overlay-section">
                <h3>Cartas de la Colección ${coleccionCompleta.nombre}</h3>
                <div class="overlay-cards" id="cartas-coleccion-container">
                    <div class="loading-spinner-small"></div>
                    <p>Cargando cartas de la colección...</p>
                </div>
            </div>
        `;
        
        overlayContent.innerHTML = overlayHTML;
        document.querySelector('.close-btn').onclick = cerrarOverlay;

        // Cargar cartas de la colección de forma asíncrona
        try {
            const response = await fetch(`/api/colecciones/${encodeURIComponent(coleccionId)}/cartas`);
            if (response.ok) {
                const cartasColeccion = await response.json();
                const cartasColeccionContainer = document.getElementById('cartas-coleccion-container');
                
                if (cartasColeccion && cartasColeccion.length > 0) {
                    const cartasHTML = cartasColeccion
                        .map(c => {
                            const cartaJSON = JSON.stringify(c).replace(/"/g, '&quot;');
                            return `
                                <div class="overlay-card" onclick="window.abrirOverlayCarta(${cartaJSON})">
                                    <img src="${c.image || '/static/assets/images/placeholder-card.svg'}" 
                                         alt="${c.nombre}"
                                         loading="eager"
                                         class="loaded">
                                    <p>${c.nombre}</p>
                                </div>
                            `;
                        }).join('');
                    cartasColeccionContainer.innerHTML = cartasHTML;
                    
                    // Procesar las nuevas imágenes lazy loading
                    const newLazyImages = cartasColeccionContainer.querySelectorAll('img[loading="lazy"]:not(.loaded)');
                    newLazyImages.forEach(img => {
                        if (img.complete && img.naturalHeight !== 0) {
                            img.classList.add('loaded');
                        } else {
                            img.addEventListener('load', function() {
                                this.classList.add('loaded');
                            }, { once: true });
                            
                            img.addEventListener('error', function() {
                                this.classList.add('loaded');
                                console.warn('Error cargando imagen:', this.src);
                            }, { once: true });
                        }
                    });
                } else {
                    cartasColeccionContainer.innerHTML = '<p>No hay cartas disponibles en esta colección.</p>';
                }
            } else {
                throw new Error('Error al cargar cartas de la colección');
            }
        } catch (error) {
            console.error('Error cargando cartas de colección:', error);
            const cartasColeccionContainer = document.getElementById('cartas-coleccion-container');
            if (cartasColeccionContainer) {
                cartasColeccionContainer.innerHTML = '<p>Error cargando cartas de la colección.</p>';
            }
        }

    } catch (error) {
        console.error('Error en abrirOverlayColeccion:', error);
        overlayContent.innerHTML = `
            <span class="close-btn">&times;</span>
            <div class="overlay-main">
                <div class="overlay-error">
                    <p>Error cargando los detalles de la colección.</p>
                    <button onclick="cerrarOverlay()">Cerrar</button>
                </div>
            </div>
        `;
        document.querySelector('.close-btn').onclick = cerrarOverlay;
    }
}
function cerrarOverlay() {
    document.getElementById('overlay').style.display = 'none';
}

// Funciones de utilidad adicionales
function limpiarCache() {
    cache.clear();
}

function invalidarCacheColeccion(coleccionId) {
    cache.invalidate(coleccionId);
}

function obtenerEstadisticasCache() {
    return cache.getStats();
}

// Inicialización automática
document.addEventListener('DOMContentLoaded', function() {
    // Precargar datos críticos cuando la página esté lista
    preloadCriticalData();
    
    // Limpiar caché expirado cada 5 minutos
    setInterval(() => {
        cache.cleanup();
    }, 5 * 60 * 1000);
});

// Invalidar caché cuando el usuario se desconecte/conecte
window.addEventListener('online', function() {
    cache.invalidate('api');
});

// Exponer funciones globalmente
window.abrirOverlayCarta = abrirOverlayCarta;
window.abrirOverlayColeccion = abrirOverlayColeccion;
window.cerrarOverlay = cerrarOverlay;

export {
    cache,
    fetchData,
    cargarColecciones,
    cargarCartas,
    obtenerCartasColeccion,
    obtenerCartasRelacionadas,
    obtenerDetallesCarta,
    obtenerOtrasColecciones,
    crearElementoCarta,
    crearElementoColeccion,
    abrirOverlayCarta,
    abrirOverlayColeccion,
    cerrarOverlay,
    preloadCriticalData,
    limpiarCache,
    invalidarCacheColeccion,
    obtenerEstadisticasCache,
    extraerID,
    compararIDs
};

// Función para manejar la carga de imágenes lazy
function setupLazyImageLoading() {
    // Agregar event listeners para imágenes lazy loading
    const observerLazyImages = () => {
        const lazyImages = document.querySelectorAll('img[loading="lazy"]:not(.loaded)');
        
        lazyImages.forEach(img => {
            // Agregar la clase loaded cuando la imagen se carga
            if (img.complete && img.naturalHeight !== 0) {
                img.classList.add('loaded');
            } else {
                img.addEventListener('load', function() {
                    // Asegurarse de que la imagen esté dentro de su contenedor y no flotante
                    this.classList.add('loaded');
                    this.style.position = 'relative'; // Mantener dentro del flujo del documento
                }, { once: true });
                
                img.addEventListener('error', function() {
                    this.classList.add('loaded'); // Mostrar incluso si hay error
                    console.warn('Error cargando imagen:', this.src);
                }, { once: true });
            }
        });
    };

    // Ejecutar cuando el DOM esté listo
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', observerLazyImages);
    } else {
        observerLazyImages();
    }

    // Observar cambios en el DOM para nuevas imágenes
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === 'childList') {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        const newLazyImages = node.querySelectorAll ? 
                            node.querySelectorAll('img[loading="lazy"]:not(.loaded)') : [];
                        
                        if (node.tagName === 'IMG' && node.getAttribute('loading') === 'lazy' && !node.classList.contains('loaded')) {
                            newLazyImages.push(node);
                        }
                        
                        newLazyImages.forEach(img => {
                            if (img.complete && img.naturalHeight !== 0) {
                                img.classList.add('loaded');
                            } else {
                                img.addEventListener('load', function() {
                                    this.classList.add('loaded');
                                }, { once: true });
                                
                                img.addEventListener('error', function() {
                                    this.classList.add('loaded');
                                    console.warn('Error cargando imagen:', this.src);
                                }, { once: true });
                            }
                        });
                    }
                });
            }
        });
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}

// Inicializar la carga lazy de imágenes
setupLazyImageLoading();

// Funciones globales para compatibilidad
window.abrirOverlayCarta = abrirOverlayCarta;
window.abrirOverlayColeccion = abrirOverlayColeccion;
window.cerrarOverlay = cerrarOverlay;
window.limpiarCache = limpiarCache;
window.obtenerEstadisticasCache = obtenerEstadisticasCache;
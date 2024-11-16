// Funciones de utilidad básicas
async function fetchData(url, method = 'GET', body = null) {
    const options = {
        method,
        headers: {
            'Content-Type': 'application/json',
        },
    };

    if (body) {
        options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error en la solicitud');
    }
    return await response.json();
}

async function cargarColecciones() {
    try {
        return await fetchData('/api/colecciones');
    } catch (error) {
        console.error('Error al cargar colecciones:', error);
        return [];
    }
}

async function cargarCartas() {
    try {
        return await fetchData('/api/cartas');
    } catch (error) {
        console.error('Error al cargar cartas:', error);
        return [];
    }
}

async function obtenerCartasColeccion(coleccionId) {
    return await fetchData(`/api/cartas?coleccion=${coleccionId}`);
}

async function obtenerOtrasColecciones(coleccionId) {
    const colecciones = await fetchData('/api/colecciones');
    return colecciones.filter(c => c._id !== coleccionId);
}

function crearElementoCarta(carta) {
    const div = document.createElement('div');
    div.className = 'card carta-card';
    div.dataset.carta = JSON.stringify(carta);
    div.innerHTML = `
        <div class="card-image-container">
            <img src="${carta.image || '/static/images/placeholder-card.png'}" alt="${carta.nombre}" class="card-image">
        </div>
        <div class="card-content">
            <h3 class="card-title">${carta.nombre}</h3>
            <p class="card-rarity">Rareza: ${carta.rareza}</p>
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
            <img src="${coleccion.image || '/static/images/placeholder-collection.png'}" alt="${coleccion.nombre}" class="card-image">
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

    overlayContent.innerHTML = `
        <span class="close-btn">&times;</span>
        <div class="overlay-main">
            <div class="overlay-image-container">
                <a href="${carta.image || '/static/images/placeholder-card.png'}" target="_blank">
                    <img src="${carta.image || '/static/images/placeholder-card.png'}" alt="${carta.nombre}" style="max-height: 400px; width: auto;">
                </a>
            </div>
            <div class="overlay-details">
                <h2>${carta.nombre}</h2>
                <p><strong>Rareza:</strong> ${carta.rareza}</p>
                <p><strong>Colección:</strong> ${carta.coleccion ? carta.coleccion.nombre : 'No asignada'}</p>
                <p><strong>Descripción:</strong> ${carta.descripcion || 'Sin descripción'}</p>
            </div>
        </div>
        <div class="overlay-section">
            <h3>Colección a la que pertenece</h3>
            <div class="overlay-cards" id="coleccion-container"></div>
        </div>
        <div class="overlay-section">
            <h3>Otras cartas de la misma colección</h3>
            <div class="overlay-cards" id="cartas-relacionadas-container"></div>
        </div>
    `;

    overlay.style.display = 'block';

    // Obtener el ID de la colección correctamente
    const coleccionId = carta.coleccion ? (carta.coleccion._id || carta.coleccion.id) : null;
    
    if (coleccionId) {
        const coleccionContainer = document.getElementById('coleccion-container');
        coleccionContainer.innerHTML = `
            <div class="overlay-card" onclick="window.abrirOverlayColeccion(${JSON.stringify(carta.coleccion).replace(/"/g, '&quot;')})">
                <img src="${carta.coleccion.image || '/static/images/placeholder-collection.png'}" alt="${carta.coleccion.nombre}">
                <p>${carta.coleccion.nombre}</p>
            </div>
        `;

        const cartasRelacionadas = await obtenerCartasColeccion(coleccionId);
        const cartasRelacionadasContainer = document.getElementById('cartas-relacionadas-container');
        cartasRelacionadasContainer.innerHTML = cartasRelacionadas
            .filter(c => c._id !== carta._id)
            .map(c => `
                <div class="overlay-card" onclick="window.abrirOverlayCarta(${JSON.stringify(c).replace(/"/g, '&quot;')})">
                    <img src="${c.image || '/static/images/placeholder-card.png'}" alt="${c.nombre}">
                    <p>${c.nombre}</p>
                </div>
            `).join('');
    }

    document.querySelector('.close-btn').onclick = cerrarOverlay;
}

async function abrirOverlayColeccion(coleccion) {
    const overlay = document.getElementById('overlay');
    const overlayContent = document.querySelector('.overlay-content');

    overlayContent.innerHTML = `
        <span class="close-btn">&times;</span>
        <div class="overlay-main">
            <div class="overlay-image-container">
                <a href="${coleccion.image || '/static/images/placeholder-collection.png'}" target="_blank">
                    <img src="${coleccion.image || '/static/images/placeholder-collection.png'}" alt="${coleccion.nombre}" style="max-height: 200px; width: auto;">
                </a>
            </div>
            <div class="overlay-details">
                <h2>${coleccion.nombre}</h2>
                <p><strong>Descripción:</strong> ${coleccion.descripcion || 'Sin descripción'}</p>
            </div>
        </div>
        <div class="overlay-section">
            <h3>Cartas de la Colección ${coleccion.nombre}</h3>
            <div class="overlay-cards" id="cartas-coleccion-container"></div>
        </div>
    `;

    overlay.style.display = 'block';

    const cartasColeccion = await obtenerCartasColeccion(coleccion._id);
    const cartasColeccionContainer = document.getElementById('cartas-coleccion-container');
    cartasColeccionContainer.innerHTML = cartasColeccion.map(c => `
        <div class="overlay-card" onclick="window.abrirOverlayCarta(${JSON.stringify(c).replace(/"/g, '&quot;')})">
            <img src="${c.image || '/static/images/placeholder-card.png'}" alt="${c.nombre}">
            <p>${c.nombre}</p>
        </div>
    `).join('');

    document.querySelector('.close-btn').onclick = cerrarOverlay;
}

function cerrarOverlay() {
    document.getElementById('overlay').style.display = 'none';
}

export {
    fetchData,
    cargarColecciones,
    cargarCartas,
    crearElementoCarta,
    crearElementoColeccion,
    abrirOverlayCarta,
    abrirOverlayColeccion,
    cerrarOverlay,
    obtenerCartasColeccion,
    obtenerOtrasColecciones
};

// Hacer las funciones de overlay disponibles globalmente
window.abrirOverlayCarta = abrirOverlayCarta;
window.abrirOverlayColeccion = abrirOverlayColeccion;
window.cerrarOverlay = cerrarOverlay;
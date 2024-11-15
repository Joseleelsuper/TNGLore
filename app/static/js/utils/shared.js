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

function crearElementoCarta(carta, onClick) {
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
    div.querySelector('.card-image-container').addEventListener('click', (e) => {
        e.stopPropagation();
        onClick(carta);
    });
    return div;
}

function crearElementoColeccion(coleccion, onClick) {
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
    div.querySelector('.card-image-container').addEventListener('click', (e) => {
        e.stopPropagation();
        onClick(coleccion);
    });
    return div;
}

async function abrirOverlayCarta(carta) {
    const overlay = document.getElementById('overlay');
    const overlayContent = document.querySelector('.overlay-content');
    
    overlayContent.innerHTML = `
        <span class="close-btn">&times;</span>
        <div class="overlay-main">
            <div class="overlay-image-container">
                <img src="${carta.image || '/static/images/placeholder-card.png'}" alt="${carta.nombre}" style="max-height: 400px; width: auto;">
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

    if (carta.coleccion && carta.coleccion.id) {
        const coleccionContainer = document.getElementById('coleccion-container');
        coleccionContainer.innerHTML = `
            <div class="overlay-card" onclick="abrirOverlayColeccion('${carta.coleccion.id}')">
                <img src="${carta.coleccion.image || '/static/images/placeholder-collection.png'}" alt="${carta.coleccion.nombre}">
                <p>${carta.coleccion.nombre}</p>
            </div>
        `;

        const cartasRelacionadas = await cargarCartas();
        const cartasRelacionadasContainer = document.getElementById('cartas-relacionadas-container');
        cartasRelacionadasContainer.innerHTML = cartasRelacionadas
            .filter(c => c.coleccion.id === carta.coleccion.id && c._id !== carta._id)
            .map(c => `
                <div class="overlay-card" onclick="abrirOverlayCarta(${JSON.stringify(c).replace(/"/g, '&quot;')})">
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
    
    const coleccionCompleta = typeof coleccion === 'string' 
        ? await fetchData(`/api/colecciones/${coleccion}`)
        : coleccion;

    overlayContent.innerHTML = `
        <span class="close-btn">&times;</span>
        <div class="overlay-main">
            <div class="overlay-image-container">
                <img src="${coleccionCompleta.image || '/static/images/placeholder-collection.png'}" alt="${coleccionCompleta.nombre}" style="max-height: 400px; width: auto;">
            </div>
            <div class="overlay-details">
                <h2>${coleccionCompleta.nombre}</h2>
                <p><strong>Descripción:</strong> ${coleccionCompleta.descripcion || 'Sin descripción'}</p>
            </div>
        </div>
        <div class="overlay-section">
            <h3>Cartas de la Colección ${coleccionCompleta.nombre}</h3>
            <div class="overlay-cards" id="cartas-coleccion-container"></div>
        </div>
    `;

    overlay.style.display = 'block';

    const cartas = await cargarCartas();
    const cartasColeccion = cartas.filter(c => c.coleccion.id === coleccionCompleta._id);
    const cartasColeccionContainer = document.getElementById('cartas-coleccion-container');
    cartasColeccionContainer.innerHTML = cartasColeccion.map(c => `
        <div class="overlay-card" onclick="abrirOverlayCarta(${JSON.stringify(c).replace(/"/g, '&quot;')})">
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
    cerrarOverlay
};
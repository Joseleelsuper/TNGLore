document.addEventListener('DOMContentLoaded', initializeAdminPanel);

function initializeAdminPanel() {
    loadInitialData();
    setupEventListeners();
    setupOverlay();
}

function loadInitialData() {
    cargarCartas();
    cargarColecciones();
    cargarUsuarios();
}

function setupEventListeners() {
    document.getElementById('nueva-carta-btn').addEventListener('click', () => abrirModal('carta'));
    document.getElementById('nueva-coleccion-btn').addEventListener('click', () => abrirModal('coleccion'));
    document.getElementById('carta-form').addEventListener('submit', manejarSubmitCarta);
    document.getElementById('coleccion-form').addEventListener('submit', manejarSubmitColeccion);
    document.getElementById('usuario-form').addEventListener('submit', manejarSubmitUsuario);
    document.getElementById('eliminar-usuario-btn').addEventListener('click', confirmarEliminarUsuario);
    document.querySelectorAll('.cancel-btn').forEach(btn => btn.addEventListener('click', cerrarModal));

    // Añadir event listeners para los desplegables de ordenación
    document.getElementById('cartas-sort').addEventListener('change', ordenarCartas);
    document.getElementById('colecciones-sort').addEventListener('change', ordenarColecciones);
    document.getElementById('usuarios-sort').addEventListener('change', ordenarUsuarios);
}

function setupOverlay() {
    const overlay = document.getElementById('overlay');
    const closeBtn = document.querySelector('.close-btn');
    closeBtn.onclick = () => overlay.style.display = 'none';
    window.onclick = (event) => {
        if (event.target == overlay) {
            overlay.style.display = 'none';
        }
    };
}

async function abrirModal(tipo, id = null) {
    const modal = document.getElementById(`${tipo}-modal`);
    const titulo = document.getElementById(`${tipo}-modal-title`);
    const form = document.getElementById(`${tipo}-form`);

    if (tipo === 'carta') {
        await cargarColeccionesEnSelect();
    }

    if (id) {
        titulo.textContent = `Editar ${tipo}`;
        await cargarDatosExistentes(tipo, id);
    } else {
        titulo.textContent = `Crear nueva ${tipo}`;
        form.reset();
    }

    modal.style.display = 'block';
}

async function cargarColeccionesEnSelect() {
    const select = document.getElementById('carta-coleccion');
    select.innerHTML = '<option value="">Seleccione colección</option>';

    try {
        const colecciones = await fetchData('/api/colecciones');
        colecciones.forEach(coleccion => {
            const option = document.createElement('option');
            option.value = coleccion._id;
            option.textContent = coleccion.nombre;
            select.appendChild(option);
        });
    } catch (error) {
        console.error('Error al cargar colecciones:', error);
    }
}

function cerrarModal() {
    document.querySelectorAll('.modal').forEach(modal => {
        modal.style.display = 'none';
    });
}

async function cargarCartas() {
    try {
        const cartas = await fetchData('/api/cartas');
        renderizarLista('cartas-list', cartas, crearElementoCarta);
    } catch (error) {
        console.error('Error al cargar cartas:', error);
        document.getElementById('cartas-list').innerHTML = '<p>Error al cargar las cartas.</p>';
    }
}

async function cargarColecciones() {
    try {
        const colecciones = await fetchData('/api/colecciones');
        renderizarLista('colecciones-list', colecciones, crearElementoColeccion);
    } catch (error) {
        console.error('Error al cargar colecciones:', error);
        document.getElementById('colecciones-list').innerHTML = '<p>Error al cargar las colecciones.</p>';
    }
}

async function cargarUsuarios() {
    try {
        const usuarios = await fetchData('/api/usuarios');
        renderizarLista('usuarios-list', usuarios, crearElementoUsuario);
    } catch (error) {
        console.error('Error al cargar usuarios:', error);
        document.getElementById('usuarios-list').innerHTML = '<p>Error al cargar los usuarios.</p>';
    }
}

function renderizarLista(containerId, items, createElementFunction) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    if (items.length === 0) {
        container.innerHTML = `<p>No hay ${containerId.split('-')[0]} disponibles.</p>`;
    } else {
        items.forEach(item => {
            const element = createElementFunction(item);
            container.appendChild(element);
        });
    }
}

function ordenarCartas() {
    const sortBy = document.getElementById('cartas-sort').value;
    const cartasList = document.getElementById('cartas-list');
    const cartas = Array.from(cartasList.children);

    cartas.sort((a, b) => {
        const cartaA = JSON.parse(a.dataset.carta);
        const cartaB = JSON.parse(b.dataset.carta);

        switch (sortBy) {
            case 'nombre':
                return cartaA.nombre.localeCompare(cartaB.nombre) || cartaA._id.localeCompare(cartaB._id);
            case 'rareza':
                const rarezaOrder = ['comun', 'rara', 'epica', 'legendaria'];
                const rarezaCompare = rarezaOrder.indexOf(cartaA.rareza) - rarezaOrder.indexOf(cartaB.rareza);
                return rarezaCompare || cartaA.nombre.localeCompare(cartaB.nombre);
            case 'coleccion':
                const coleccionCompare = (cartaA.coleccion?.nombre || '').localeCompare(cartaB.coleccion?.nombre || '');
                return coleccionCompare || cartaA.nombre.localeCompare(cartaB.nombre) || cartaA._id.localeCompare(cartaB._id);
            default:
                return 0;
        }
    });

    cartas.forEach(carta => cartasList.appendChild(carta));
}

function ordenarColecciones() {
    const coleccionesList = document.getElementById('colecciones-list');
    const colecciones = Array.from(coleccionesList.children);

    colecciones.sort((a, b) => {
        const coleccionA = JSON.parse(a.dataset.coleccion);
        const coleccionB = JSON.parse(b.dataset.coleccion);
        return coleccionA.nombre.localeCompare(coleccionB.nombre) || coleccionA._id.localeCompare(coleccionB._id);
    });

    colecciones.forEach(coleccion => coleccionesList.appendChild(coleccion));
}

function ordenarUsuarios() {
    const sortBy = document.getElementById('usuarios-sort').value;
    const usuariosList = document.getElementById('usuarios-list');
    const usuarios = Array.from(usuariosList.children);

    usuarios.sort((a, b) => {
        const usuarioA = JSON.parse(a.dataset.usuario);
        const usuarioB = JSON.parse(b.dataset.usuario);

        switch (sortBy) {
            case 'nombre':
                return usuarioA.username.localeCompare(usuarioB.username) || usuarioA._id.localeCompare(usuarioB._id);
            case 'cartas':
                const cartasCompare = usuarioB.numCartas - usuarioA.numCartas;
                return cartasCompare || usuarioA.username.localeCompare(usuarioB.username);
            case 'cofres':
                const cofresCompare = usuarioB.numCofres - usuarioA.numCofres;
                return cofresCompare || usuarioA.username.localeCompare(usuarioB.username);
            default:
                return 0;
        }
    });

    usuarios.forEach(usuario => usuariosList.appendChild(usuario));
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
            <p class="card-collection">Colección: ${carta.coleccion ? carta.coleccion.nombre : 'No asignada'}</p>
        </div>
        <div class="card-actions">
            <button onclick="abrirModal('carta', '${carta._id}')" class="admin-btn editar-btn">Editar</button>
            <button onclick="eliminarCarta('${carta._id}')" class="admin-btn eliminar-btn">Eliminar</button>
        </div>
    `;
    div.querySelector('.card-image-container').addEventListener('click', (e) => {
        e.stopPropagation();
        abrirOverlayCarta(carta);
    });
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
        <div class="card-actions">
            <button onclick="abrirModal('coleccion', '${coleccion._id}')" class="admin-btn editar-btn">Editar</button>
            <button onclick="eliminarColeccion('${coleccion._id}')" class="admin-btn eliminar-btn">Eliminar</button>
        </div>
    `;
    div.querySelector('.card-image-container').addEventListener('click', (e) => {
        e.stopPropagation();
        abrirOverlayColeccion(coleccion);
    });
    return div;
}

function crearElementoUsuario(usuario) {
    const div = document.createElement('div');
    div.className = 'card usuario-card';
    div.dataset.usuario = JSON.stringify(usuario);
    const imagenPerfil = usuario.pfp || 'https://fonts.gstatic.com/s/i/materialicons/person/v6/24px.svg';
    div.innerHTML = `
        <img src="${imagenPerfil}" alt="Imagen de perfil" class="usuario-pfp">
        <h3>${usuario.username}</h3>
        <p>Cartas: ${usuario.numCartas}</p>
        <p>Cofres: ${usuario.numCofres}</p>
        <button onclick="abrirModal('usuario', '${usuario._id}')" class="admin-btn gestionar-btn">Gestionar</button>
    `;
    return div;
}

async function manejarSubmitCarta(event) {
    event.preventDefault();
    const formData = new FormData(event.target);
    const cartaId = formData.get('id');
    const url = cartaId ? `/api/cartas/${cartaId}` : '/api/cartas';
    const method = cartaId ? 'PUT' : 'POST';

    try {
        const data = await fetchDataWithFormData(url, method, formData);
        if (data) {
            await subirImagen(formData, 'carta', data.id || cartaId);
            cerrarModal();
            cargarCartas();
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Error al guardar la carta: ' + error.message);
    }
}

async function manejarSubmitColeccion(event) {
    event.preventDefault();
    const form = event.target;
    const formData = new FormData(form);
    const coleccionId = form.getAttribute('data-id');
    const url = coleccionId ? `/api/colecciones/${coleccionId}` : '/api/colecciones';
    const method = coleccionId ? 'PUT' : 'POST';

    try {
        const data = await fetchDataWithFormData(url, method, formData);
        if (data) {
            await subirImagen(formData, 'coleccion', data.id || coleccionId);
            cerrarModal();
            cargarColecciones();
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Error al guardar la colección: ' + error.message);
    }
}

async function manejarSubmitUsuario(event) {
    event.preventDefault();
    const formData = new FormData(event.target);
    const usuarioId = formData.get('id');
    const nuevaContrasena = formData.get('password');

    try {
        await fetchData(`/api/usuarios/${usuarioId}/cambiar-contrasena`, 'POST', { password: nuevaContrasena });
        cerrarModal();
        alert('Contraseña cambiada exitosamente');
    } catch (error) {
        console.error('Error al cambiar contraseña:', error);
        alert('Error al cambiar contraseña: ' + error.message);
    }
}

function eliminarCarta(id) {
    if (confirm('¿Estás seguro de que quieres eliminar esta carta?')) {
        fetchData(`/api/cartas/${id}`, 'DELETE')
            .then(() => cargarCartas())
            .catch(error => console.error('Error al eliminar carta:', error));
    }
}

function eliminarColeccion(id) {
    if (confirm('¿Estás seguro de que quieres eliminar esta colección? Esto también eliminará todas las cartas asociadas.')) {
        fetchData(`/api/colecciones/${id}`, 'DELETE')
            .then(() => {
                cargarColecciones();
                cargarCartas();
            })
            .catch(error => console.error('Error al eliminar colección:', error));
    }
}

function confirmarEliminarUsuario() {
    const usuarioId = document.getElementById('usuario-form').getAttribute('data-id');
    if (confirm('¿Estás seguro de que quieres eliminar este usuario? Esta acción no se puede deshacer.')) {
        fetchData(`/api/usuarios/${usuarioId}`, 'DELETE')
            .then(() => {
                cerrarModal();
                cargarUsuarios();
            })
            .catch(error => console.error('Error al eliminar usuario:', error));
    }
}

async function cargarDatosExistentes(tipo, id) {
    try {
        const data = await fetchData(`/api/${tipo}s/${id}`);
        const form = document.getElementById(`${tipo}-form`);
        form.setAttribute('data-id', id);
        Object.keys(data).forEach(key => {
            const input = form.elements[key];
            if (input) {
                input.value = data[key];
            }
        });
    } catch (error) {
        console.error(`Error al cargar datos de ${tipo}:`, error);
    }
}

async function abrirOverlayCarta(carta) {
    const overlay = document.getElementById('overlay');
    const overlayContent = document.querySelector('.overlay-content');
    
    // Asegurarse de que carta sea un objeto y no una cadena JSON
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

    // Cargar la colección a la que pertenece
    if (carta.coleccion && carta.coleccion.id) {
        const coleccionContainer = document.getElementById('coleccion-container');
        coleccionContainer.innerHTML = `
            <div class="overlay-card" onclick="abrirOverlayColeccion(${JSON.stringify(carta.coleccion).replace(/"/g, '&quot;')})">
                <img src="${carta.coleccion.image || '/static/images/placeholder-collection.png'}" alt="${carta.coleccion.nombre}">
                <p>${carta.coleccion.nombre}</p>
            </div>
        `;
    }

    // Cargar cartas relacionadas
    if (carta.coleccion && carta.coleccion.id) {
        const cartasRelacionadas = await obtenerCartasRelacionadas(carta.coleccion.id);
        const cartasRelacionadasContainer = document.getElementById('cartas-relacionadas-container');
        cartasRelacionadasContainer.innerHTML = cartasRelacionadas
            .filter(c => c._id !== carta._id)  // Excluir la carta actual
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
    
    // Asegurarse de que coleccion sea un objeto y no una cadena JSON
    if (typeof coleccion === 'string') {
        try {
            coleccion = JSON.parse(coleccion);
        } catch (e) {
            console.error('Error al parsear datos de la colección:', e);
            return;
        }
    }

    overlayContent.innerHTML = `
        <span class="close-btn">&times;</span>
        <div class="overlay-main">
            <div class="overlay-image-container">
                <img src="${coleccion.image || '/static/images/placeholder-collection.png'}" alt="${coleccion.nombre}" style="max-height: 400px; width: auto;">
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
        <div class="overlay-section">
            <h3>Otras colecciones</h3>
            <div class="overlay-cards" id="otras-colecciones-container"></div>
        </div>
    `;

    overlay.style.display = 'block';

    // Cargar cartas de la colección
    const cartasColeccion = await obtenerCartasColeccion(coleccion.id);
    const cartasColeccionContainer = document.getElementById('cartas-coleccion-container');
    cartasColeccionContainer.innerHTML = cartasColeccion.map(c => `
        <div class="overlay-card" onclick="abrirOverlayCarta(${JSON.stringify(c).replace(/"/g, '&quot;')})">
            <img src="${c.image || '/static/images/placeholder-card.png'}" alt="${c.nombre}">
            <p>${c.nombre}</p>
        </div>
    `).join('');

    // Cargar otras colecciones
    const otrasColecciones = await obtenerOtrasColecciones(coleccion.id);
    const otrasColeccionesContainer = document.getElementById('otras-colecciones-container');
    otrasColeccionesContainer.innerHTML = otrasColecciones.map(c => `
        <div class="overlay-card" onclick="abrirOverlayColeccion(${JSON.stringify(c).replace(/"/g, '&quot;')})">
            <img src="${c.image || '/static/images/placeholder-collection.png'}" alt="${c.nombre}">
            <p>${c.nombre}</p>
        </div>
    `).join('');

    document.querySelector('.close-btn').onclick = cerrarOverlay;
}

function cerrarOverlay() {
    document.getElementById('overlay').style.display = 'none';
}

async function obtenerCartasRelacionadas(coleccionId) {
    if (!coleccionId) return [];
    return await fetchData(`/api/cartas?coleccion=${coleccionId}`);
}

async function obtenerCartasColeccion(coleccionId) {
    return await fetchData(`/api/cartas?coleccion=${coleccionId}`);
}

async function obtenerOtrasColecciones(coleccionId) {
    const colecciones = await fetchData('/api/colecciones');
    return colecciones.filter(c => c.id !== coleccionId);
}

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

async function fetchDataWithFormData(url, method, formData) {
    const response = await fetch(url, {
        method,
        body: formData
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error en la solicitud');
    }
    return await response.json();
}

async function subirImagen(formData, tipo, id) {
    const imageFile = formData.get('imagen');
    if (imageFile && imageFile.size > 0) {
        const imageFormData = new FormData();
        imageFormData.append('image', imageFile);
        imageFormData.append('tipo', tipo);
        imageFormData.append('id', id);

        const response = await fetch('/api/upload-image', {
            method: 'POST',
            body: imageFormData
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Error al subir la imagen');
        }
    }
}
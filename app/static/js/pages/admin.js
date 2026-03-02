// Funciones auxiliares para manejo seguro de IDs
function extraerID(objeto) {
    if (!objeto) return null;
    
    if (typeof objeto === 'string') {
        return objeto;
    }
    
    if (typeof objeto === 'object' && objeto !== null) {
        return objeto._id || objeto.id || null;
    }
    
    return null;
}

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
    cargarCodigos();
    cargarEventos();
}

function setupEventListeners() {
    document.getElementById('nueva-carta-btn').addEventListener('click', () => abrirModal('carta'));
    document.getElementById('nueva-coleccion-btn').addEventListener('click', () => abrirModal('coleccion'));
    document.getElementById('nuevo-codigo-btn').addEventListener('click', () => abrirModal('codigo'));
    document.getElementById('nuevo-evento-btn').addEventListener('click', () => abrirModalEvento());
    document.getElementById('carta-form').addEventListener('submit', manejarSubmitCarta);
    document.getElementById('coleccion-form').addEventListener('submit', manejarSubmitColeccion);
    document.getElementById('usuario-form').addEventListener('submit', manejarSubmitUsuario);
    document.getElementById('codigo-form').addEventListener('submit', manejarSubmitCodigo);
    document.getElementById('evento-form').addEventListener('submit', manejarSubmitEvento);
    document.getElementById('eliminar-usuario-btn').addEventListener('click', confirmarEliminarUsuario);
    document.querySelectorAll('.cancel-btn').forEach(btn => btn.addEventListener('click', cerrarModal));

    // Añadir event listeners para los desplegables de ordenación
    document.getElementById('cartas-sort').addEventListener('change', ordenarCartas);
    document.getElementById('colecciones-sort').addEventListener('change', ordenarColecciones);
    document.getElementById('usuarios-sort').addEventListener('change', ordenarUsuarios);
    document.getElementById('codigos-filter').addEventListener('change', filtrarCodigos);
    document.getElementById('eventos-filter').addEventListener('change', filtrarEventos);

    // Days count change -> rebuild rewards
    document.getElementById('evento-days').addEventListener('change', reconstruirRewards);

    // Deny-code toggle
    document.getElementById('usuario-deny-code').addEventListener('change', manejarToggleDenyCode);

    // Reset buttons
    document.getElementById('reset-chests-btn').addEventListener('click', () => resetUsuario('chests'));
    document.getElementById('reset-cards-btn').addEventListener('click', () => resetUsuario('cards'));
    document.getElementById('reset-all-btn').addEventListener('click', () => resetUsuario('all'));
}

function setupOverlay() {
    const overlay = document.getElementById('overlay');
    // close-btn is created dynamically; use delegation instead
    if (overlay) {
        overlay.addEventListener('click', (event) => {
            if (event.target === overlay || event.target.classList.contains('close-btn')) {
                overlay.style.display = 'none';
            }
        });
    }
}

function cerrarOverlay() {
    const overlay = document.getElementById('overlay');
    overlay.style.display = 'none';
}

async function abrirModal(tipo, id = null) {
    const modal = document.getElementById(`${tipo}-modal`);
    const titulo = document.getElementById(`${tipo}-modal-title`);
    const form = document.getElementById(`${tipo}-form`);

    if (tipo === 'carta') {
        await cargarColeccionesEnSelect();
    }

    if (tipo === 'codigo') {
        if (id) {
            titulo.textContent = 'Editar Código';
            form.setAttribute('data-id', id);
        } else {
            titulo.textContent = 'Añadir Código';
            form.removeAttribute('data-id');
            form.reset();
        }
        modal.style.display = 'block';
        return;
    }

    if (id) {
        titulo.textContent = `Editar ${tipo}`;
        form.setAttribute('data-id', id);
        await cargarDatosExistentes(tipo, id);

        // Cargar deny_code_reward para usuarios
        if (tipo === 'usuario') {
            try {
                const userData = await fetchData(`/api/usuarios/${id}`);
                document.getElementById('usuario-deny-code').checked = !!userData.deny_code_reward;
            } catch (e) {
                document.getElementById('usuario-deny-code').checked = false;
            }
            cargarEventosUsuario(id);
        }
    } else {
        titulo.textContent = `Crear nueva ${tipo}`;
        form.removeAttribute('data-id');
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
        alert('Error al cargar las colecciones. Por favor, recarga la página.');
    }
}

function cerrarModal() {
    document.querySelectorAll('.modal').forEach(modal => {
        modal.style.display = 'none';
    });
}

async function cargarCartas() {
    try {
        const cartas = await fetchData('/api/admin/cartas');
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
        const batchSize = 20;
        let index = 0;
        function renderBatch() {
            const fragment = document.createDocumentFragment();
            for (let i = index; i < Math.min(index + batchSize, items.length); i++) {
                const element = createElementFunction(items[i]);
                fragment.appendChild(element);
            }
            container.appendChild(fragment);
            index += batchSize;
            if (index < items.length) {
                setTimeout(renderBatch, 100);
            }
        }
        renderBatch();
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
            <img src="${carta.image || '/static/assets/images/placeholder-card.svg'}" alt="${carta.nombre}" class="card-image">
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
    const numCartas = usuario.guilds.reduce((total, guild) => total + (guild.coleccionables ? guild.coleccionables.length : 0), 0);
    div.innerHTML = `
        <img src="${imagenPerfil}" alt="Imagen de perfil" class="usuario-pfp">
        <h3>${usuario.username}</h3>
        <p>Cartas: ${numCartas || 0}</p>
        <p>Cofres: ${usuario.chests.length || 0}</p>
        <button onclick="abrirModal('usuario', '${usuario._id}')" class="admin-btn gestionar-btn">Gestionar</button>
    `;
    return div;
}

async function manejarSubmitCarta(event) {
    event.preventDefault();
    const form = event.target;
    const formData = new FormData(form);
    const cartaId = form.getAttribute('data-id');
    const url = cartaId ? `/api/admin/cartas/${cartaId}` : '/api/admin/cartas';
    const method = cartaId ? 'PUT' : 'POST';

    // Asegurarnos de que tenemos un valor válido para la colección
    const coleccionId = form.querySelector('[name="coleccion"]').value;
    if (!coleccionId) {
        alert('Por favor, selecciona una colección para la carta.');
        return;
    }
    formData.set('coleccion', coleccionId);

    // Verificar si se ha seleccionado una nueva imagen
    const imageFile = formData.get('imagen');
    const hasNewImage = imageFile && imageFile.size > 0;

    // Si no hay nueva imagen, eliminar el campo 'imagen' del FormData
    if (!hasNewImage) {
        formData.delete('imagen');
    }

    try {
        const response = await fetch(url, {
            method: method,
            body: formData
        });

        const responseData = await response.json();

        if (!response.ok) {
            throw new Error(responseData.error || `Error ${response.status}: ${response.statusText}`);
        }

        if (responseData && (responseData.id || cartaId)) {
            const cartaIdFinal = responseData.id || cartaId;
            if (hasNewImage) {
                await subirImagen(formData, 'carta', cartaIdFinal);
            }
            cerrarModal();
            await cargarCartas();
        } else {
            throw new Error('No se recibió un ID válido del servidor');
        }
    } catch (error) {
        console.error('Error al guardar la carta:', error);
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

    // Verificar si se ha seleccionado una nueva imagen
    const imageFile = formData.get('imagen');
    const hasNewImage = imageFile && imageFile.size > 0;

    // Si no hay nueva imagen, eliminar el campo 'imagen' del FormData
    if (!hasNewImage) {
        formData.delete('imagen');
    }

    try {
        const response = await fetch(url, {
            method: method,
            body: formData
        });

        const responseData = await response.json();

        if (!response.ok) {
            throw new Error(responseData.error || `Error ${response.status}: ${response.statusText}`);
        }

        if (responseData && (responseData.id || coleccionId)) {
            const coleccionIdFinal = responseData.id || coleccionId;
            if (hasNewImage) {
                await subirImagen(formData, 'coleccion', coleccionIdFinal);
            }
            cerrarModal();
            await cargarColecciones();
        } else {
            throw new Error('No se recibió un ID válido del servidor');
        }
    } catch (error) {
        console.error('Error al guardar la colección:', error);
        alert('Error al guardar la colección: ' + error.message);
    }
}

async function manejarSubmitUsuario(event) {
    event.preventDefault();
    const usuarioId = event.target.getAttribute('data-id');
    const nuevaContrasena = document.getElementById('usuario-password').value;

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
        fetchData(`/api/admin/cartas/${id}`, 'DELETE')
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
        // Corregimos la URL para que use el singular 'coleccion' en lugar de 'coleccions'
        const url = tipo === 'coleccion' ? `/api/colecciones/${id}` : `/api/${tipo}s/${id}`;
        const data = await fetchData(url);
        const form = document.getElementById(`${tipo}-form`);
        Object.keys(data).forEach(key => {
            const input = form.elements[key];
            if (input) {
                if (input.type === 'select-one' && key === 'coleccion') {
                    input.value = data[key].id || data[key];
                } else {
                    input.value = data[key];
                }
            }
        });
    } catch (error) {
        console.error(`Error al cargar datos de ${tipo}:`, error);
    }
}

async function obtenerColeccionCompleta(id) {
    try {
        const response = await fetch(`/api/colecciones/${id}`);
        if (!response.ok) {
            throw new Error('No se pudo obtener la información de la colección');
        }
        return await response.json();
    } catch (error) {
        console.error('Error al obtener la colección:', error);
        return null;
    }
}

async function abrirOverlayCarta(carta) {
    const overlay = document.getElementById('overlay');
    const overlayContent = document.querySelector('.overlay-content');

    // Si se recibe un string (ID), obtener datos completos
    if (typeof carta === 'string') {
        try {
            carta = await fetchData(`/api/admin/cartas/${carta}`);
        } catch (error) {
            console.error('Error al obtener la carta:', error);
            return;
        }
    }

    if (!carta) return;

    const coleccionNombre = carta.coleccion?.nombre || 'No asignada';

    overlayContent.innerHTML = `
        <span class="close-btn">&times;</span>
        <div class="overlay-main">
            <div class="overlay-image-container">
                <a href="${carta.image || '/static/assets/images/placeholder-card.svg'}" target="_blank">
                    <img src="${carta.image || '/static/assets/images/placeholder-card.svg'}" alt="${carta.nombre}" style="max-height: 400px; width: auto;">
                </a>
            </div>
            <div class="overlay-details">
                <h2>${carta.nombre}</h2>
                <p><strong>Rareza:</strong> ${carta.rareza || 'Sin rareza'}</p>
                <p><strong>Colección:</strong> ${coleccionNombre}</p>
                ${carta.descripcion ? `<p><strong>Descripción:</strong> ${carta.descripcion}</p>` : ''}
            </div>
        </div>
        ${carta.coleccion?._id || carta.coleccion?.id ? `
        <div class="overlay-section">
            <h3>Otras cartas de ${coleccionNombre}</h3>
            <div class="overlay-cards" id="cartas-relacionadas-container"></div>
        </div>` : ''}
    `;

    overlay.style.display = 'block';
    document.querySelector('.close-btn').onclick = cerrarOverlay;

    // Cargar cartas relacionadas de la misma colección
    const coleccionId = carta.coleccion?._id || carta.coleccion?.id;
    if (coleccionId) {
        const cartasRelacionadas = await obtenerCartasColeccion(coleccionId);
        const container = document.getElementById('cartas-relacionadas-container');
        if (container) {
            container.innerHTML = cartasRelacionadas
                .filter(c => c._id !== carta._id)
                .map(c => `
                    <div class="overlay-card" onclick="abrirOverlayCarta(${JSON.stringify(c).replace(/"/g, '&quot;')})">
                        <img src="${c.image || '/static/assets/images/placeholder-card.svg'}" alt="${c.nombre}">
                        <p>${c.nombre}</p>
                    </div>
                `).join('');
        }
    }
}

async function abrirOverlayColeccion(coleccion) {
    const overlay = document.getElementById('overlay');
    const overlayContent = document.querySelector('.overlay-content');
    
    // Asegurarse de que tenemos el ID de la colección usando la función auxiliar
    const coleccionId = extraerID(coleccion);

    // Obtener los datos completos de la colección
    const coleccionCompleta = await obtenerColeccionCompleta(coleccionId);

    if (!coleccionCompleta) {
        console.error('No se pudo obtener la información completa de la colección');
        return;
    }

    overlayContent.innerHTML = `
        <span class="close-btn">&times;</span>
        <div class="overlay-main">
            <div class="overlay-image-container">
                <a href="${coleccionCompleta.image || '/static/images/placeholder-collection.png'}" target="_blank">
                    <img src="${coleccionCompleta.image || '/static/images/placeholder-collection.png'}" alt="${coleccionCompleta.nombre}" style="max-height: 400px; width: auto;">
                </a>
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
        <div class="overlay-section">
            <h3>Otras colecciones</h3>
            <div class="overlay-cards" id="otras-colecciones-container"></div>
        </div>
    `;

    overlay.style.display = 'block';

    // Cargar cartas de la colección
    const cartasColeccion = await obtenerCartasColeccion(coleccionCompleta._id);
    const cartasColeccionContainer = document.getElementById('cartas-coleccion-container');
    cartasColeccionContainer.innerHTML = cartasColeccion.map(c => `
        <div class="overlay-card" onclick="abrirOverlayCarta(${JSON.stringify(c).replace(/"/g, '&quot;')})">
            <img src="${c.image || '/static/assets/images/placeholder-card.svg'}" alt="${c.nombre}">
            <p>${c.nombre}</p>
        </div>
    `).join('');

    // Cargar otras colecciones
    const otrasColecciones = await obtenerOtrasColecciones(coleccionCompleta._id);
    const otrasColeccionesContainer = document.getElementById('otras-colecciones-container');
    otrasColeccionesContainer.innerHTML = otrasColecciones
        .filter(c => c._id !== coleccionCompleta._id)
        .map(c => `
            <div class="overlay-card" onclick="abrirOverlayColeccion('${c._id}')">
                <img src="${c.image || '/static/images/placeholder-collection.png'}" alt="${c.nombre}">
                <p>${c.nombre}</p>
            </div>
        `).join('');

    document.querySelector('.close-btn').onclick = cerrarOverlay;
}

async function obtenerCartasRelacionadas(coleccionId) {
    if (!coleccionId) return [];
    return await fetchData(`/api/admin/cartas?coleccion=${coleccionId}`);
}

async function obtenerCartasColeccion(coleccionId) {
    return await fetchData(`/api/admin/cartas?coleccion=${coleccionId}`);
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
    try {
        const response = await fetch(url, {
            method,
            body: formData
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Error ${response.status}: ${response.statusText}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Error en fetchDataWithFormData:', error);
        throw error;
    }
}

async function subirImagen(formData, tipo, id) {
    const imageFile = formData.get('imagen');
    if (imageFile && imageFile.size > 0) {
        const imageFormData = new FormData();
        imageFormData.append('image', imageFile);
        imageFormData.append('tipo', tipo);
        imageFormData.append('id', id);

        try {
            const response = await fetch('/api/upload-image', {
                method: 'POST',
                body: imageFormData
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `Error ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            return data.url;
        } catch (error) {
            console.error('Error al subir la imagen:', error);
            throw error;
        }
    }
}


// ─── Códigos (pool día 7) ─────────────────────────────────────────

let _allCodigos = [];

async function cargarCodigos() {
    try {
        _allCodigos = await fetchData('/api/admin/codigos');
        renderizarCodigos(_allCodigos);
    } catch (error) {
        console.error('Error al cargar códigos:', error);
        document.getElementById('codigos-list').innerHTML = '<p>Error al cargar los códigos.</p>';
    }
}

function renderizarCodigos(codigos) {
    const container = document.getElementById('codigos-list');
    container.innerHTML = '';
    if (codigos.length === 0) {
        container.innerHTML = '<p>No hay códigos disponibles.</p>';
        return;
    }
    const fragment = document.createDocumentFragment();
    codigos.forEach(code => {
        fragment.appendChild(crearElementoCodigo(code));
    });
    container.appendChild(fragment);
}

function crearElementoCodigo(code) {
    const div = document.createElement('div');
    div.className = 'card codigo-card';
    const isAssigned = !!code.assigned_to;
    const statusClass = isAssigned ? 'status-assigned' : (code.active ? 'status-available' : 'status-inactive');
    const statusText = isAssigned ? `Asignado a ${code.assigned_to}` : (code.active ? 'Disponible' : 'Inactivo');
    const expiresText = code.expires_at ? `Expira: ${new Date(code.expires_at).toLocaleDateString('es')}` : '';

    div.innerHTML = `
        <div class="card-content">
            <h3 class="card-title codigo-value">${code.code}</h3>
            <p class="codigo-description">${code.description || 'Sin descripción'}</p>
            ${code.link ? `<a class="codigo-link" href="${code.link}" target="_blank" rel="noopener">🔗 Enlace de canje</a>` : ''}
            <span class="codigo-status ${statusClass}">${statusText}</span>
            ${expiresText ? `<p class="codigo-expires">${expiresText}</p>` : ''}
        </div>
        <div class="card-actions">
            <button onclick="editarCodigo('${code._id}')" class="admin-btn editar-btn">Editar</button>
            <button onclick="eliminarCodigo('${code._id}')" class="admin-btn eliminar-btn">Eliminar</button>
        </div>
    `;
    return div;
}

function filtrarCodigos() {
    const filter = document.getElementById('codigos-filter').value;
    let filtered = _allCodigos;
    if (filter === 'available') {
        filtered = _allCodigos.filter(c => c.active && !c.assigned_to);
    } else if (filter === 'assigned') {
        filtered = _allCodigos.filter(c => !!c.assigned_to);
    }
    renderizarCodigos(filtered);
}

function editarCodigo(id) {
    const code = _allCodigos.find(c => c._id === id);
    if (!code) return;
    const modal = document.getElementById('codigo-modal');
    const title = document.getElementById('codigo-modal-title');
    const form = document.getElementById('codigo-form');
    title.textContent = 'Editar Código';
    form.setAttribute('data-id', id);
    document.getElementById('codigo-code').value = code.code;
    document.getElementById('codigo-description').value = code.description || '';
    document.getElementById('codigo-link').value = code.link || '';
    document.getElementById('codigo-expires').value = code.expires_at ? code.expires_at.slice(0, 16) : '';
    modal.style.display = 'block';
}

async function manejarSubmitCodigo(event) {
    event.preventDefault();
    const form = event.target;
    const codigoId = form.getAttribute('data-id');
    const code = document.getElementById('codigo-code').value.trim();
    const description = document.getElementById('codigo-description').value.trim();
    const link = document.getElementById('codigo-link').value.trim() || null;
    const expires = document.getElementById('codigo-expires').value || null;

    if (!code) {
        alert('El código es obligatorio.');
        return;
    }

    try {
        if (codigoId) {
            await fetchData(`/api/admin/codigos/${codigoId}`, 'PUT', {
                code, description, link, expires_at: expires
            });
        } else {
            await fetchData('/api/admin/codigos', 'POST', {
                code, description, link, expires_at: expires
            });
        }
        cerrarModal();
        await cargarCodigos();
    } catch (error) {
        console.error('Error al guardar código:', error);
        alert('Error al guardar código: ' + error.message);
    }
}

function eliminarCodigo(id) {
    if (confirm('¿Estás seguro de que quieres eliminar este código?')) {
        fetchData(`/api/admin/codigos/${id}`, 'DELETE')
            .then(() => cargarCodigos())
            .catch(error => console.error('Error al eliminar código:', error));
    }
}


// ─── Deny-code toggle per usuario ─────────────────────────────────

async function manejarToggleDenyCode() {
    const checkbox = document.getElementById('usuario-deny-code');
    const usuarioId = document.getElementById('usuario-form').getAttribute('data-id');
    if (!usuarioId) return;

    try {
        await fetchData(`/api/admin/usuarios/${usuarioId}/deny-code`, 'PUT', {
            deny_code_reward: checkbox.checked
        });
    } catch (error) {
        console.error('Error toggling deny_code:', error);
        checkbox.checked = !checkbox.checked; // revert
        alert('Error al cambiar configuración de código.');
    }
}


// ─── Reset usuario data ─────────────────────────────────────────

const RESET_LABELS = {
    chests: 'los cofres',
    cards: 'las cartas',
    all: 'todos los cofres y cartas',
};

async function resetUsuario(type) {
    const usuarioId = document.getElementById('usuario-form').getAttribute('data-id');
    if (!usuarioId) return;

    const label = RESET_LABELS[type] || type;
    if (!confirm(`¿Estás seguro de que quieres resetear ${label} de este usuario? Esta acción no se puede deshacer.`)) {
        return;
    }

    try {
        const result = await fetchData(`/api/admin/usuarios/${usuarioId}/reset`, 'PUT', { type });
        const summary = result.summary || {};
        const parts = [];
        if (summary.chests_removed !== undefined) parts.push(`${summary.chests_removed} cofre(s)`);
        if (summary.cards_removed !== undefined) parts.push(`${summary.cards_removed} carta(s)`);
        alert(`Datos reseteados: ${parts.join(', ') || 'sin cambios'}`);
    } catch (error) {
        console.error('Error resetting user:', error);
        alert('Error al resetear: ' + error.message);
    }
}


// ═══════════════════════════════════════════════════════════════════
// EVENTOS – CRUD
// ═══════════════════════════════════════════════════════════════════

let _allEventos = [];
let _allCartasCache = null;

async function cargarEventos() {
    try {
        _allEventos = await fetchData('/api/admin/eventos');
        renderizarEventos(_allEventos);
    } catch (error) {
        console.error('Error al cargar eventos:', error);
        document.getElementById('eventos-list').innerHTML = '<p>Error al cargar los eventos.</p>';
    }
}

function renderizarEventos(eventos) {
    const container = document.getElementById('eventos-list');
    container.innerHTML = '';
    if (eventos.length === 0) {
        container.innerHTML = '<p>No hay eventos disponibles.</p>';
        return;
    }
    const fragment = document.createDocumentFragment();
    eventos.forEach(ev => fragment.appendChild(crearElementoEvento(ev)));
    container.appendChild(fragment);
}

function crearElementoEvento(ev) {
    const div = document.createElement('div');
    div.className = 'card evento-card';
    const statusClass = ev.active ? 'status-available' : 'status-inactive';
    const statusText = ev.active ? 'Activo' : 'Inactivo';
    const startStr = ev.start_date ? new Date(ev.start_date).toLocaleDateString('es') : '—';
    const endStr = ev.end_date ? new Date(ev.end_date).toLocaleDateString('es') : 'Sin fin';

    const rewardsSummary = (ev.rewards || []).map((r, i) => {
        const icon = r.type === 'chest' ? '📦' : r.type === 'code' ? '🔑' : '🃏';
        return `${icon}`;
    }).join(' ');

    div.innerHTML = `
        <div class="card-content">
            <h3 class="card-title">${ev.name}</h3>
            <p class="evento-dates">${startStr} — ${endStr}</p>
            <p class="evento-days">${ev.days_count} día(s)</p>
            <div class="evento-rewards-preview">${rewardsSummary}</div>
            <span class="codigo-status ${statusClass}">${statusText}</span>
        </div>
        <div class="card-actions">
            <button class="admin-btn editar-btn" data-action="edit">Editar</button>
            <button class="admin-btn eliminar-btn" data-action="delete">Eliminar</button>
        </div>
    `;
    div.querySelector('[data-action="edit"]').addEventListener('click', () => abrirModalEvento(ev._id));
    div.querySelector('[data-action="delete"]').addEventListener('click', () => eliminarEvento(ev._id));
    return div;
}

function filtrarEventos() {
    const filter = document.getElementById('eventos-filter').value;
    let filtered = _allEventos;
    if (filter === 'active') filtered = _allEventos.filter(e => e.active);
    else if (filter === 'inactive') filtered = _allEventos.filter(e => !e.active);
    renderizarEventos(filtered);
}

async function abrirModalEvento(id = null) {
    const modal = document.getElementById('evento-modal');
    const title = document.getElementById('evento-modal-title');
    const form = document.getElementById('evento-form');

    if (id) {
        title.textContent = 'Editar Evento';
        form.setAttribute('data-id', id);
        try {
            const ev = await fetchData(`/api/admin/eventos/${id}`);
            document.getElementById('evento-nombre').value = ev.name || '';
            document.getElementById('evento-descripcion').value = ev.description || '';
            document.getElementById('evento-start').value = ev.start_date ? ev.start_date.slice(0, 16) : '';
            document.getElementById('evento-end').value = ev.end_date ? ev.end_date.slice(0, 16) : '';
            document.getElementById('evento-days').value = ev.days_count || 7;
            document.getElementById('evento-active').checked = ev.active !== false;
            construirRewardRows(ev.rewards || []);
        } catch (error) {
            console.error('Error al cargar evento:', error);
            alert('Error al cargar el evento.');
            return;
        }
    } else {
        title.textContent = 'Crear Evento';
        form.removeAttribute('data-id');
        form.reset();
        document.getElementById('evento-active').checked = true;
        document.getElementById('evento-days').value = 7;
        reconstruirRewards();
    }

    modal.style.display = 'block';
}

function reconstruirRewards() {
    const days = parseInt(document.getElementById('evento-days').value) || 7;
    const container = document.getElementById('evento-rewards-list');
    const existing = obtenerRewardsActuales();

    const rewards = [];
    for (let i = 0; i < days; i++) {
        rewards.push(existing[i] || { day: i + 1, type: 'chest', rarity: 'comun' });
    }
    construirRewardRows(rewards);
}

function construirRewardRows(rewards) {
    const container = document.getElementById('evento-rewards-list');
    container.innerHTML = '';

    rewards.forEach((rw, i) => {
        const row = document.createElement('div');
        row.className = 'reward-row';
        row.dataset.day = i + 1;

        row.innerHTML = `
            <span class="reward-day-label">Día ${i + 1}</span>
            <select class="reward-type" data-idx="${i}">
                <option value="chest" ${rw.type === 'chest' ? 'selected' : ''}>Cofre</option>
                <option value="code" ${rw.type === 'code' ? 'selected' : ''}>Código</option>
                <option value="card" ${rw.type === 'card' ? 'selected' : ''}>Carta</option>
            </select>
            <select class="reward-rarity" data-idx="${i}" ${rw.type === 'code' ? 'style="display:none"' : ''}>
                <option value="comun" ${rw.rarity === 'comun' ? 'selected' : ''}>Común</option>
                <option value="rara" ${rw.rarity === 'rara' ? 'selected' : ''}>Rara</option>
                <option value="epica" ${rw.rarity === 'epica' ? 'selected' : ''}>Épica</option>
                <option value="legendaria" ${rw.rarity === 'legendaria' ? 'selected' : ''}>Legendaria</option>
            </select>
            <input type="text" class="reward-card-search" data-idx="${i}" placeholder="Buscar carta..."
                   value="${rw.card_name || ''}"
                   style="${rw.type === 'card' && rw.card_id ? 'display:inline-block' : 'display:none'}">
            <input type="hidden" class="reward-card-id" data-idx="${i}" value="${rw.card_id || ''}">
        `;

        const typeSelect = row.querySelector('.reward-type');
        const raritySelect = row.querySelector('.reward-rarity');
        const cardSearch = row.querySelector('.reward-card-search');

        typeSelect.addEventListener('change', () => {
            const t = typeSelect.value;
            raritySelect.style.display = t === 'code' ? 'none' : '';
            cardSearch.style.display = t === 'card' ? 'inline-block' : 'none';
        });

        cardSearch.addEventListener('input', (e) => manejarBusquedaCarta(e, row));

        container.appendChild(row);
    });
}

async function manejarBusquedaCarta(event, row) {
    const query = event.target.value.trim().toLowerCase();
    if (query.length < 2) {
        // Remove any existing dropdown
        row.querySelector('.card-search-dropdown')?.remove();
        return;
    }

    if (!_allCartasCache) {
        try {
            _allCartasCache = await fetchData('/api/admin/cartas');
        } catch {
            _allCartasCache = [];
        }
    }

    const matches = _allCartasCache.filter(c =>
        c.nombre.toLowerCase().includes(query)
    ).slice(0, 8);

    row.querySelector('.card-search-dropdown')?.remove();

    if (matches.length === 0) return;

    const dropdown = document.createElement('div');
    dropdown.className = 'card-search-dropdown';
    matches.forEach(card => {
        const opt = document.createElement('div');
        opt.className = 'card-search-option';
        opt.textContent = `${card.nombre} (${card.rareza})`;
        opt.addEventListener('click', () => {
            row.querySelector('.reward-card-search').value = card.nombre;
            row.querySelector('.reward-card-id').value = card._id;
            dropdown.remove();
        });
        dropdown.appendChild(opt);
    });

    const searchInput = row.querySelector('.reward-card-search');
    searchInput.parentNode.style.position = 'relative';
    searchInput.insertAdjacentElement('afterend', dropdown);

    // Close on click outside
    setTimeout(() => {
        document.addEventListener('click', function handler(e) {
            if (!dropdown.contains(e.target) && e.target !== searchInput) {
                dropdown.remove();
                document.removeEventListener('click', handler);
            }
        });
    }, 0);
}

function obtenerRewardsActuales() {
    const rows = document.querySelectorAll('#evento-rewards-list .reward-row');
    return Array.from(rows).map((row, i) => {
        const type = row.querySelector('.reward-type').value;
        const rarity = row.querySelector('.reward-rarity').value;
        const cardId = row.querySelector('.reward-card-id').value;
        const cardName = row.querySelector('.reward-card-search').value;
        const reward = { day: i + 1, type };
        if (type === 'chest') reward.rarity = rarity;
        if (type === 'card') {
            if (cardId) {
                reward.card_id = cardId;
                reward.card_name = cardName;
            } else {
                reward.rarity = rarity;
            }
        }
        return reward;
    });
}

async function manejarSubmitEvento(event) {
    event.preventDefault();
    const form = event.target;
    const eventoId = form.getAttribute('data-id');

    const name = document.getElementById('evento-nombre').value.trim();
    const description = document.getElementById('evento-descripcion').value.trim();
    const startDate = document.getElementById('evento-start').value || null;
    const endDate = document.getElementById('evento-end').value || null;
    const daysCount = parseInt(document.getElementById('evento-days').value) || 7;
    const active = document.getElementById('evento-active').checked;
    const rewards = obtenerRewardsActuales();

    if (!name) {
        alert('El nombre del evento es obligatorio.');
        return;
    }

    if (rewards.length !== daysCount) {
        alert(`Se esperan ${daysCount} recompensas pero hay ${rewards.length}.`);
        return;
    }

    const body = {
        name, description,
        start_date: startDate, end_date: endDate,
        days_count: daysCount, active, rewards,
    };

    try {
        if (eventoId) {
            await fetchData(`/api/admin/eventos/${eventoId}`, 'PUT', body);
        } else {
            await fetchData('/api/admin/eventos', 'POST', body);
        }
        cerrarModal();
        await cargarEventos();
    } catch (error) {
        console.error('Error al guardar evento:', error);
        alert('Error al guardar evento: ' + error.message);
    }
}

function eliminarEvento(id) {
    if (!confirm('¿Estás seguro de que quieres eliminar este evento? Se borrará también el progreso de todos los usuarios.')) return;
    fetchData(`/api/admin/eventos/${id}`, 'DELETE')
        .then(() => cargarEventos())
        .catch(error => {
            console.error('Error al eliminar evento:', error);
            alert('Error al eliminar: ' + error.message);
        });
}


// ─── Gestión de progreso de eventos por usuario ──────────────────

async function cargarEventosUsuario(usuarioId) {
    const container = document.getElementById('usuario-events-list');
    container.innerHTML = '<p style="font-size:0.85em;color:#999">Cargando eventos...</p>';

    try {
        const events = await fetchData(`/api/admin/usuarios/${usuarioId}/events`);
        if (events.length === 0) {
            container.innerHTML = '<p style="font-size:0.85em;color:#999">No hay eventos.</p>';
            return;
        }

        container.innerHTML = '';
        events.forEach(ev => {
            const row = document.createElement('div');
            row.className = 'user-event-row';

            const pct = ev.days_count > 0 ? Math.round((ev.progress / ev.days_count) * 100) : 0;
            const statusClass = ev.completed ? 'status-assigned' : (ev.active ? 'status-available' : 'status-inactive');
            const statusText = ev.completed ? 'Completado' : `Día ${ev.progress}/${ev.days_count}`;

            row.innerHTML = `
                <div class="user-event-info">
                    <strong>${ev.name}</strong>
                    <span class="codigo-status ${statusClass}" style="font-size:0.7em">${statusText}</span>
                </div>
                <div class="user-event-bar">
                    <div class="user-event-bar-fill" style="width:${pct}%"></div>
                </div>
                <div class="user-event-actions">
                    <button class="mini-btn" title="Retroceder" data-action="rewind">◀</button>
                    <button class="mini-btn" title="Resetear" data-action="reset">↺</button>
                    <button class="mini-btn" title="Avanzar" data-action="advance">▶</button>
                </div>
            `;

            row.querySelectorAll('.mini-btn').forEach(btn => {
                btn.type = 'button';
                btn.addEventListener('click', async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const action = btn.dataset.action;
                    try {
                        await fetchData(`/api/admin/usuarios/${usuarioId}/events/${ev.event_id}`, 'PUT', { action });
                        await cargarEventosUsuario(usuarioId);
                    } catch (e) {
                        alert('Error: ' + e.message);
                    }
                });
            });

            container.appendChild(row);
        });
    } catch (error) {
        console.error('Error al cargar eventos del usuario:', error);
        container.innerHTML = '<p style="font-size:0.85em;color:#c00">Error al cargar eventos.</p>';
    }
}
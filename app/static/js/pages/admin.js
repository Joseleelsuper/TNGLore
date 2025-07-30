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
        form.setAttribute('data-id', id);
        await cargarDatosExistentes(tipo, id);
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
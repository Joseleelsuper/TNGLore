document.addEventListener('DOMContentLoaded', () => {
    // Cargar datos iniciales
    cargarCartas();
    cargarColecciones();
    cargarUsuarios();

    // Event listeners para botones de creación
    document.getElementById('nueva-carta-btn').addEventListener('click', () => abrirModal('carta'));
    document.getElementById('nueva-coleccion-btn').addEventListener('click', () => abrirModal('coleccion'));

    // Event listeners para formularios
    document.getElementById('carta-form').addEventListener('submit', manejarSubmitCarta);
    document.getElementById('coleccion-form').addEventListener('submit', manejarSubmitColeccion);
    document.getElementById('usuario-form').addEventListener('submit', manejarSubmitUsuario);

    // Event listener para botón de eliminar usuario
    document.getElementById('eliminar-usuario-btn').addEventListener('click', confirmarEliminarUsuario);

    // Cerrar modales
    document.querySelectorAll('.cancel-btn').forEach(btn => {
        btn.addEventListener('click', cerrarModal);
    });
});

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
        const response = await fetch('/api/colecciones');
        const colecciones = await response.json();

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

function cargarCartas() {
    fetch('/api/cartas')
        .then(response => response.json())
        .then(cartas => {
            const cartasList = document.getElementById('cartas-list');
            cartasList.innerHTML = '';
            if (cartas.length === 0) {
                cartasList.innerHTML = '<p>No hay cartas disponibles.</p>';
            } else {
                cartas.forEach(carta => {
                    const cartaElement = crearElementoCarta(carta);
                    cartasList.appendChild(cartaElement);
                });
            }
        })
        .catch(error => {
            console.error('Error al cargar cartas:', error);
            document.getElementById('cartas-list').innerHTML = '<p>Error al cargar las cartas.</p>';
        });
}

function cargarColecciones() {
    fetch('/api/colecciones')
        .then(response => response.json())
        .then(colecciones => {
            const coleccionesList = document.getElementById('colecciones-list');
            coleccionesList.innerHTML = '';
            if (colecciones.length === 0) {
                coleccionesList.innerHTML = '<p>No hay colecciones disponibles.</p>';
            } else {
                colecciones.forEach(coleccion => {
                    const coleccionElement = crearElementoColeccion(coleccion);
                    coleccionesList.appendChild(coleccionElement);
                });
            }
        })
        .catch(error => {
            console.error('Error al cargar colecciones:', error);
            document.getElementById('colecciones-list').innerHTML = '<p>Error al cargar las colecciones.</p>';
        });
}

function cargarUsuarios() {
    fetch('/api/usuarios')
        .then(response => response.json())
        .then(usuarios => {
            const usuariosList = document.getElementById('usuarios-list');
            usuariosList.innerHTML = '';
            if (usuarios.length === 0) {
                usuariosList.innerHTML = '<p>No hay usuarios disponibles.</p>';
            } else {
                usuarios.forEach(usuario => {
                    const usuarioElement = crearElementoUsuario(usuario);
                    usuariosList.appendChild(usuarioElement);
                });
            }
        })
        .catch(error => {
            console.error('Error al cargar usuarios:', error);
            document.getElementById('usuarios-list').innerHTML = '<p>Error al cargar los usuarios.</p>';
        });
}

function crearElementoCarta(carta) {
    const div = document.createElement('div');
    div.className = 'card carta-card';
    div.innerHTML = `
        <div class="card-image-container">
            <img src="${carta.image || '/static/images/placeholder-card.png'}" alt="${carta.nombre}" class="card-image">
        </div>
        <div class="card-content">
            <h3 class="card-title">${carta.nombre}</h3>
            <p class="card-rarity">Rareza: ${carta.rareza}</p>
        </div>
        <div class="card-actions">
            <button onclick="abrirModal('carta', '${carta._id}')" class="admin-btn editar-btn">Editar</button>
            <button onclick="eliminarCarta('${carta._id}')" class="admin-btn eliminar-btn">Eliminar</button>
        </div>
    `;
    return div;
}

function crearElementoColeccion(coleccion) {
    const div = document.createElement('div');
    div.className = 'card coleccion-card';
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
    return div;
}

function crearElementoUsuario(usuario) {
    const div = document.createElement('div');
    div.className = 'card usuario-card';
    const imagenPerfil = usuario.pfp ? usuario.pfp : 'https://fonts.gstatic.com/s/i/materialicons/person/v6/24px.svg';
    div.innerHTML = `
        <img src="${imagenPerfil}" alt="Imagen de perfil" class="usuario-pfp">
        <h3>${usuario.username}</h3>
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
        const response = await fetch(url, {
            method: method,
            body: formData
        });
        const data = await response.json();
        
        if (response.ok) {
            // Subir imagen
            const imageFormData = new FormData();
            imageFormData.append('image', formData.get('imagen'));
            imageFormData.append('tipo', 'carta');
            imageFormData.append('id', data.id || cartaId);

            const imageResponse = await fetch('/api/upload-image', {
                method: 'POST',
                body: imageFormData
            });

            if (imageResponse.ok) {
                cerrarModal();
                cargarCartas();
            } else {
                console.error('Error al subir la imagen');
            }
        } else {
            console.error('Error al guardar la carta');
        }
    } catch (error) {
        console.error('Error:', error);
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
        const response = await fetch(url, {
            method: method,
            body: formData
        });
        const data = await response.json();
        
        if (response.ok) {
            // Subir imagen
            const imageFormData = new FormData();
            imageFormData.append('image', formData.get('imagen'));
            imageFormData.append('tipo', 'coleccion');
            imageFormData.append('id', data.id || coleccionId);

            const imageResponse = await fetch('/api/upload-image', {
                method: 'POST',
                body: imageFormData
            });

            if (imageResponse.ok) {
                cerrarModal();
                cargarColecciones();
            } else {
                const errorData = await imageResponse.json();
                console.error('Error al subir la imagen:', errorData.error);
                alert('Error al subir la imagen: ' + errorData.error);
            }
        } else {
            const errorData = await response.json();
            console.error('Error al guardar la colección:', errorData.error);
            alert('Error al guardar la colección: ' + errorData.error);
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Error de conexión: ' + error.message);
    }
}

function manejarSubmitUsuario(event) {
    event.preventDefault();
    const formData = new FormData(event.target);
    const usuarioId = formData.get('id');
    const nuevaContrasena = formData.get('password');

    fetch(`/api/usuarios/${usuarioId}/cambiar-contrasena`, {
        method: 'POST',
        body: JSON.stringify({ password: nuevaContrasena }),
        headers: {
            'Content-Type': 'application/json'
        }
    })
    .then(response => response.json())
    .then(() => {
        cerrarModal();
        alert('Contraseña cambiada exitosamente');
    })
    .catch(error => console.error('Error al cambiar contraseña:', error));
}

function eliminarCarta(id) {
    if (confirm('¿Estás seguro de que quieres eliminar esta carta?')) {
        fetch(`/api/cartas/${id}`, { method: 'DELETE' })
            .then(() => cargarCartas())
            .catch(error => console.error('Error al eliminar carta:', error));
    }
}

function eliminarColeccion(id) {
    if (confirm('¿Estás seguro de que quieres eliminar esta colección? Esto también eliminará todas las cartas asociadas.')) {
        fetch(`/api/colecciones/${id}`, { method: 'DELETE' })
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
        fetch(`/api/usuarios/${usuarioId}`, { method: 'DELETE' })
            .then(() => {
                cerrarModal();
                cargarUsuarios();
            })
            .catch(error => console.error('Error al eliminar usuario:', error));
    }
}

function cargarDatosExistentes(tipo, id) {
    fetch(`/api/${tipo}s/${id}`)
        .then(response => response.json())
        .then(data => {
            const form = document.getElementById(`${tipo}-form`);
            form.setAttribute('data-id', id);
            Object.keys(data).forEach(key => {
                const input = form.elements[key];
                if (input) {
                    input.value = data[key];
                }
            });
        })
        .catch(error => console.error(`Error al cargar datos de ${tipo}:`, error));
}
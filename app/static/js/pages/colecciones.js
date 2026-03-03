import {
    cargarColecciones,
    cargarCartas,
    crearElementoColeccion,
    crearElementoCarta,
    cerrarOverlay,
    extraerID,
    compararIDs
} from '../utils/shared.js';

// ── Estado de módulo ────────────────────────────────────────────────
/** @type {Array<Object>} */
let todasLasCartas = [];
/** @type {Array<Object>} */
let todasLasColecciones = [];

document.addEventListener('DOMContentLoaded', initializeColeccionesPage);

function initializeColeccionesPage() {
    loadInitialData().then(() => {
        setupOverlay();
        setupFiltros();
    });
}

async function loadInitialData() {
    try {
        [todasLasColecciones, todasLasCartas] = await Promise.all([
            cargarColecciones(),
            cargarCartas()
        ]);

        // Poblar filtro de colección
        const filtroColeccion = document.getElementById('filtro-coleccion');
        if (filtroColeccion) {
            todasLasColecciones.forEach(col => {
                const opt = document.createElement('option');
                opt.value = extraerID(col);
                opt.textContent = col.nombre;
                filtroColeccion.appendChild(opt);
            });
        }

        renderizarTodo(todasLasColecciones, todasLasCartas);
    } catch (error) {
        console.error('Error al cargar datos:', error);
        document.getElementById('contenedor-colecciones').innerHTML =
            '<p>Error al cargar las colecciones. Por favor, recarga la página.</p>';
    }
}

/**
 * Renderiza colecciones con sus cartas, aplicando filtros.
 * @param {Array<Object>} colecciones
 * @param {Array<Object>} cartas
 */
function renderizarTodo(colecciones, cartas) {
    const contenedor = document.getElementById('contenedor-colecciones');
    contenedor.innerHTML = '';

    let algunaSeccion = false;

    colecciones.forEach(coleccion => {
        const cartasColeccion = cartas.filter(carta => compararIDs(carta.coleccion, coleccion));
        if (cartasColeccion.length === 0) return;

        algunaSeccion = true;

        const elementoColeccion = crearElementoColeccion(coleccion);
        elementoColeccion.onclick = () => window.abrirOverlayColeccion(coleccion);

        const contenedorCartas = document.createElement('div');
        contenedorCartas.className = 'contenedor-cartas';

        cartasColeccion.forEach(carta => {
            const elementoCarta = crearElementoCarta(carta);
            elementoCarta.onclick = () => window.abrirOverlayCarta(carta);
            contenedorCartas.appendChild(elementoCarta);
        });

        const seccionColeccion = document.createElement('div');
        seccionColeccion.className = 'seccion-coleccion';
        seccionColeccion.appendChild(elementoColeccion);
        seccionColeccion.appendChild(contenedorCartas);

        contenedor.appendChild(seccionColeccion);

        // Aplicar truncado después del render (2 frames para que el layout esté listo)
        _aplicarTruncado(contenedorCartas, cartasColeccion.length);
    });

    if (!algunaSeccion) {
        contenedor.innerHTML = '<p class="no-results">No se encontraron cartas con los filtros seleccionados.</p>';
    }
}

/**
 * Aplica truncado de 2 filas al contenedor y añade botón "Ver más" si es necesario.
 * @param {HTMLElement} contenedor
 * @param {number} total
 */
function _aplicarTruncado(contenedor, total) {
    contenedor.classList.add('contenedor-cartas--truncado');

    // Doble rAF para asegurar que el layout esté calculado
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            if (contenedor.scrollHeight <= contenedor.offsetHeight + 4) {
                // Sin overflow → quitar clase, no hace falta botón
                contenedor.classList.remove('contenedor-cartas--truncado');
                return;
            }

            const btn = document.createElement('button');
            btn.className = 'btn-expandir';
            btn.textContent = `Ver más (${total})`;
            btn.addEventListener('click', () => {
                const estaTruncado = contenedor.classList.toggle('contenedor-cartas--truncado');
                btn.textContent = estaTruncado ? `Ver más (${total})` : 'Ver menos';
                btn.classList.toggle('expanded', !estaTruncado);
            });
            contenedor.parentElement.appendChild(btn);
        });
    });
}

// ── Filtros ─────────────────────────────────────────────────────────

function aplicarFiltros() {
    const texto = (document.getElementById('buscar-cartas')?.value || '').toLowerCase().trim();
    const rareza = document.getElementById('filtro-rareza')?.value || '';
    const coleccionId = document.getElementById('filtro-coleccion')?.value || '';

    let cartasFiltradas = todasLasCartas;

    if (texto) {
        cartasFiltradas = cartasFiltradas.filter(c =>
            c.nombre.toLowerCase().includes(texto)
        );
    }
    if (rareza) {
        cartasFiltradas = cartasFiltradas.filter(c => c.rareza === rareza);
    }

    let coleccionesFiltradas = todasLasColecciones;
    if (coleccionId) {
        coleccionesFiltradas = coleccionesFiltradas.filter(col => extraerID(col) === coleccionId);
    }

    renderizarTodo(coleccionesFiltradas, cartasFiltradas);
}

function setupFiltros() {
    document.getElementById('buscar-cartas')?.addEventListener('input', aplicarFiltros);
    document.getElementById('filtro-rareza')?.addEventListener('change', aplicarFiltros);
    document.getElementById('filtro-coleccion')?.addEventListener('change', aplicarFiltros);
    document.getElementById('limpiar-filtros')?.addEventListener('click', () => {
        const buscar = document.getElementById('buscar-cartas');
        const rareza = document.getElementById('filtro-rareza');
        const coleccion = document.getElementById('filtro-coleccion');
        if (buscar) buscar.value = '';
        if (rareza) rareza.value = '';
        if (coleccion) coleccion.value = '';
        renderizarTodo(todasLasColecciones, todasLasCartas);
    });
}

function setupOverlay() {
    const overlay = document.getElementById('overlay');
    const closeBtn = document.querySelector('.close-btn');
    if (closeBtn) {
        closeBtn.onclick = cerrarOverlay;
    }
    window.onclick = (event) => {
        if (event.target == overlay) {
            cerrarOverlay();
        }
    };
}

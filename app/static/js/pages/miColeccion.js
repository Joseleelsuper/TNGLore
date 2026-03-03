import { cargarCartas, abrirOverlayCarta } from '../utils/shared.js';

export const PLACEHOLDER_ICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'%3E%3Ccircle cx='24' cy='24' r='24' fill='%23dee2e6'/%3E%3Ctext x='24' y='30' text-anchor='middle' font-size='20' fill='%23868e96'%3E%F0%9F%8F%A0%3C/text%3E%3C/svg%3E";

export function fixGuildIcon(url) {
    if (!url) return PLACEHOLDER_ICON;
    if (url.includes('cdn.discordapp.com') && !/\.(png|jpg|jpeg|webp|gif)(\?.*)?$/i.test(url)) {
        return url + '.png';
    }
    return url;
}

// ── Estado de módulo ────────────────────────────────────────────────
/** @type {Array<Object>} */
let todasLasCartas = [];
/** @type {{ guilds: Array<Object> }} */
let userData = { guilds: [] };

// ── Utilidades ──────────────────────────────────────────────────────

async function cargarDatosUsuario() {
    try {
        return await fetch('/api/coleccion/usuario').then(res => res.json());
    } catch (e) {
        console.error('Error al cargar datos del usuario:', e);
        return { guilds: [] };
    }
}

/**
 * Ordena un array de cartas in-place según el criterio.
 * @param {Array<Object>} cards
 * @param {string} criterio
 * @returns {Array<Object>}
 */
function sortCards(cards, criterio) {
    const rarezaOrder = ['comun', 'rara', 'epica', 'legendaria'];
    return cards.slice().sort((a, b) => {
        if (criterio === 'rareza') {
            const diff = rarezaOrder.indexOf(a.rareza) - rarezaOrder.indexOf(b.rareza);
            return diff || a.nombre.localeCompare(b.nombre);
        }
        const valA = a[criterio] || '';
        const valB = b[criterio] || '';
        return typeof valA === 'string' ? valA.localeCompare(valB) : valA - valB;
    });
}

/**
 * Aplica truncado de 2 filas al contenedor de cartas del guild.
 * @param {HTMLElement} contenedor
 * @param {number} total
 */
function _aplicarTruncado(contenedor, total) {
    contenedor.classList.add('contenedor-cartas--truncado');
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            if (contenedor.scrollHeight <= contenedor.offsetHeight + 4) {
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

// ── Renderizado ─────────────────────────────────────────────────────

/**
 * Renderiza un guild con sus cartas (tenidas + apagadas de las mismas colecciones).
 * Respeta los filtros activos en el DOM.
 * @param {Object} guild
 * @param {Array<Object>} cartas - todas las cartas del juego
 * @param {string} sortCriterio
 * @param {string} textoBusqueda
 * @param {string} filtroRareza
 * @param {string} filtroEstado - '' | 'tengo' | 'no-tengo'
 * @returns {HTMLElement|null}
 */
function renderGuildSection(guild, cartas, sortCriterio, textoBusqueda, filtroRareza, filtroEstado) {
    if (!guild.coleccionables || guild.coleccionables.length === 0) return null;

    // Mapa de duplicados: cardId → count
    const countMap = guild.coleccionables.reduce((acc, id) => {
        acc[id] = (acc[id] || 0) + 1;
        return acc;
    }, {});

    // IDs de cartas que el usuario posee en este guild
    const ownedIds = new Set(Object.keys(countMap));

    // Colecciones presentes en este guild (para mostrar cartas apagadas)
    const coleccionIdsEnGuild = new Set(
        cartas
            .filter(c => ownedIds.has(c._id))
            .map(c => typeof c.coleccion === 'object' ? (c.coleccion?._id || c.coleccion) : c.coleccion)
            .filter(Boolean)
            .map(String)
    );

    // Todas las cartas de esas colecciones
    let cartasAMostrar = cartas.filter(c => {
        const cid = typeof c.coleccion === 'object' ? (c.coleccion?._id || c.coleccion) : c.coleccion;
        return coleccionIdsEnGuild.has(String(cid));
    });

    // Aplicar filtro de texto
    if (textoBusqueda) {
        cartasAMostrar = cartasAMostrar.filter(c =>
            c.nombre.toLowerCase().includes(textoBusqueda)
        );
    }

    // Aplicar filtro de rareza
    if (filtroRareza) {
        cartasAMostrar = cartasAMostrar.filter(c => c.rareza === filtroRareza);
    }

    // Aplicar filtro de estado
    if (filtroEstado === 'tengo') {
        cartasAMostrar = cartasAMostrar.filter(c => ownedIds.has(c._id));
    } else if (filtroEstado === 'no-tengo') {
        cartasAMostrar = cartasAMostrar.filter(c => !ownedIds.has(c._id));
    }

    if (cartasAMostrar.length === 0) return null;

    cartasAMostrar = sortCards(cartasAMostrar, sortCriterio);

    // ── Construir el elemento del guild ────────────────────────────
    const guildContainer = document.createElement('div');
    guildContainer.className = 'guild-section';
    guildContainer.dataset.guildId = guild.id;
    guildContainer.innerHTML = `
        <div class="guild-header">
            <img class="guild-icon" src="${fixGuildIcon(guild.icon)}" alt="${guild.name}"
                 onerror="this.src='${PLACEHOLDER_ICON}'">
            <h2 class="guild-title">${guild.name}</h2>
        </div>
    `;

    const cardsContainer = document.createElement('div');
    cardsContainer.className = 'cards-container contenedor-cartas';

    const esApagada = (carta) => !ownedIds.has(carta._id);

    cartasAMostrar.forEach(carta => {
        const apagada = esApagada(carta);
        const div = document.createElement('div');
        div.className = `card carta-card${apagada ? ' carta--apagada' : ''}`;
        div.dataset.carta = JSON.stringify(carta);
        div.dataset.apagada = apagada ? '1' : '0';
        div.innerHTML = `
            <div class="card-image-container" style="position: relative;">
                <img src="${carta.image || '/static/assets/images/placeholder-card.svg'}"
                     alt="${carta.nombre}" class="card-image" loading="lazy" decoding="async">
                ${countMap[carta._id] > 1 ? `<span class="card-count">${countMap[carta._id]}</span>` : ''}
            </div>
            <div class="card-content">
                <h3 class="card-title">${carta.nombre}</h3>
                <p class="card-rarity ${carta.rareza.toLowerCase()}">${carta.rareza}</p>
            </div>
        `;

        if (!apagada) {
            div.addEventListener('click', () => abrirOverlayCarta(carta));
        }
        cardsContainer.appendChild(div);
    });

    guildContainer.appendChild(cardsContainer);

    // Aplicar truncado (solo cartas visibles)
    _aplicarTruncado(cardsContainer, cartasAMostrar.length);

    return guildContainer;
}

function renderAllGuilds() {
    const container = document.getElementById('guilds-container');
    const noCards = document.getElementById('no-cards-message');

    const sortCriterio = document.getElementById('sort-select')?.value || 'nombre';
    const textoBusqueda = (document.getElementById('buscar-cartas')?.value || '').toLowerCase().trim();
    const filtroRareza = document.getElementById('filtro-rareza')?.value || '';
    const filtroServidor = document.getElementById('filtro-servidor')?.value || '';
    const filtroEstado = document.getElementById('filtro-estado')?.value || '';

    if (!userData?.guilds?.length) {
        if (noCards) noCards.style.display = '';
        if (container) container.innerHTML = '';
        return;
    }

    if (noCards) noCards.style.display = 'none';
    container.innerHTML = '';

    let algoMostrado = false;

    userData.guilds.forEach(guild => {
        // Filtro por servidor
        if (filtroServidor && guild.id !== filtroServidor) return;

        const section = renderGuildSection(guild, todasLasCartas, sortCriterio, textoBusqueda, filtroRareza, filtroEstado);
        if (section) {
            container.appendChild(section);
            algoMostrado = true;
        }
    });

    if (!algoMostrado) {
        container.innerHTML = '<p class="no-results" style="text-align:center;color:#999;padding:2rem">No se encontraron cartas con los filtros seleccionados.</p>';
    }
}

// ── Filtros ─────────────────────────────────────────────────────────

function poblarFiltroServidor() {
    const select = document.getElementById('filtro-servidor');
    if (!select) return;
    userData.guilds.forEach(guild => {
        if (guild.coleccionables && guild.coleccionables.length) {
            const opt = document.createElement('option');
            opt.value = guild.id;
            opt.textContent = guild.name;
            select.appendChild(opt);
        }
    });
}

function setupFiltros() {
    const ids = ['buscar-cartas', 'sort-select', 'filtro-rareza', 'filtro-servidor', 'filtro-estado'];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener(el.tagName === 'INPUT' ? 'input' : 'change', renderAllGuilds);
    });

    document.getElementById('limpiar-filtros')?.addEventListener('click', () => {
        document.getElementById('buscar-cartas') && (document.getElementById('buscar-cartas').value = '');
        document.getElementById('filtro-rareza') && (document.getElementById('filtro-rareza').value = '');
        document.getElementById('filtro-servidor') && (document.getElementById('filtro-servidor').value = '');
        document.getElementById('filtro-estado') && (document.getElementById('filtro-estado').value = '');
        renderAllGuilds();
    });
}

// ── Inicialización ──────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
    [todasLasCartas, userData] = await Promise.all([cargarCartas(), cargarDatosUsuario()]);

    poblarFiltroServidor();
    setupFiltros();
    renderAllGuilds();
});


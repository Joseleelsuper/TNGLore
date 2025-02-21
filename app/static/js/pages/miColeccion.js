import { cargarCartas, abrirOverlayCarta } from '../utils/shared.js';

// Obtiene datos del usuario (guilds y sus coleccionables)
async function cargarDatosUsuario() {
    try {
        return await fetch('/api/coleccion/usuario').then(res => res.json());
    } catch (e) {
        console.error('Error al cargar datos del usuario:', e);
        return { guilds: [] };
    }
}

// Ordena las cartas según el criterio
function sortCards(cards, criterio) {
    return cards.sort((a, b) => {
        const valA = a[criterio] || '';
        const valB = b[criterio] || '';
        return typeof valA === 'string' ? valA.localeCompare(valB) : valA - valB;
    });
}

// Renderiza las cartas para un servidor (guild)
function renderGuildCards(guild, cards, sortCriterio) {
    // Se cuentan duplicados en el array de coleccionables del guild
    const countMap = guild.coleccionables.reduce((acc, id) => {
        acc[id] = (acc[id] || 0) + 1;
        return acc;
    }, {});

    // Filtrar las cartas que están en este guild (según su ID)
    let cardsGuild = cards.filter(carta => countMap[carta._id]);
    cardsGuild = sortCards(cardsGuild, sortCriterio);

    // Construye la cabecera con icono y título (alineado a la izquierda)
    const guildContainer = document.createElement('div');
    guildContainer.className = 'guild-section';
    guildContainer.innerHTML = `
        <div class="guild-header">
            <img class="guild-icon" src="${guild.icon || '/static/images/placeholder-server.png'}" alt="${guild.name}">
            <h2 class="guild-title">${guild.name}</h2>
        </div>
    `;

    // Contenedor para las cartas del servidor
    const cardsContainer = document.createElement('div');
    cardsContainer.className = 'cards-container';
    cardsContainer.style.display = 'flex';
    cardsContainer.style.flexWrap = 'wrap';
    cardsContainer.style.gap = '1rem';
    cardsContainer.style.justifyContent = 'center';

    // Renderiza cada carta
    cardsGuild.forEach(carta => {
        const div = document.createElement('div');
        div.className = 'card carta-card';
        div.dataset.carta = JSON.stringify(carta);
        div.innerHTML = `
            <div class="card-image-container" style="position: relative;">
                <img src="${carta.image || '/static/images/placeholder-card.png'}" alt="${carta.nombre}" class="card-image">
                ${ countMap[carta._id] > 1 ? `<span class="card-count">${countMap[carta._id]}</span>` : '' }
            </div>
            <div class="card-content">
                <h3 class="card-title">${carta.nombre}</h3>
                <p class="card-rarity ${carta.rareza.toLowerCase()}">${carta.rareza}</p>
            </div>
        `;
        div.addEventListener('click', () => abrirOverlayCarta(carta));
        cardsContainer.appendChild(div);
    });
    guildContainer.appendChild(cardsContainer);
    return guildContainer;
}

document.addEventListener('DOMContentLoaded', async () => {
    const container = document.getElementById('guilds-container');
    const sortSelect = document.getElementById('sort-select');
    const [cards, userData] = await Promise.all([cargarCartas(), cargarDatosUsuario()]);

    function renderAllGuilds(sortCriterio) {
        container.innerHTML = '';
        // Se preserva el orden de aparición de los guilds
        userData.guilds.forEach(guild => {
            if (guild.coleccionables && guild.coleccionables.length) {
                const section = renderGuildCards(guild, cards, sortCriterio);
                container.appendChild(section);
            }
        });
    }

    renderAllGuilds(sortSelect.value);
    sortSelect.addEventListener('change', (e) => renderAllGuilds(e.target.value));
});

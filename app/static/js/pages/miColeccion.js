import { cargarCartas, abrirOverlayCarta } from '../utils/shared.js';

// Función para cargar los coleccionables del usuario
async function cargarColeccionUsuario() {
    try {
        const user = await fetch('/api/users/me').then(res => res.json());
        // Se asume que user.guilds es un array donde cada guild tiene un array "coleccionables"
        const ids = user.guilds.reduce((acc, guild) => {
            if(guild.coleccionables && Array.isArray(guild.coleccionables)) {
                return acc.concat(guild.coleccionables);
            }
            return acc;
        }, []);
        return new Set(ids);
    } catch (e) {
        console.error('Error al cargar los coleccionables del usuario:', e);
        return new Set();
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    const container = document.getElementById('cards-container');
    const sortSelect = document.getElementById('sort-select');
    let cartas = await cargarCartas();
    const userCollectibles = await cargarColeccionUsuario();

    // Filtrar cartas que estén en la colección del usuario
    cartas = cartas.filter(carta => userCollectibles.has(carta._id));

    // Función para ordenar las cartas según el criterio elegido
    function sortCards(cards, criterio) {
        return cards.sort((a, b) => {
            let valA = a[criterio] || '';
            let valB = b[criterio] || '';
            if (typeof valA === 'string' && typeof valB === 'string') {
                return valA.localeCompare(valB);
            }
            return valA - valB;
        });
    }

    // Función para renderizar las cartas en el contenedor
    function renderCards(cards) {
        container.innerHTML = '';
        cards.forEach(carta => {
            const div = document.createElement('div');
            div.className = 'card carta-card';
            div.dataset.carta = JSON.stringify(carta);
            div.innerHTML = `
                <div class="card-image-container">
                    <img src="${carta.image || '/static/images/placeholder-card.png'}" alt="${carta.nombre}" class="card-image">
                </div>
                <div class="card-content">
                    <h3 class="card-title">${carta.nombre}</h3>
                    <p class="card-rarity">${carta.rareza}</p>
                </div>
            `;
            div.addEventListener('click', () => abrirOverlayCarta(carta));
            container.appendChild(div);
        });
    }

    // Orden inicial por "nombre"
    let cartasOrdenadas = sortCards(cartas, sortSelect.value);
    renderCards(cartasOrdenadas);

    // Actualizar orden al cambiar el select
    sortSelect.addEventListener('change', (e) => {
        cartasOrdenadas = sortCards(cartas, e.target.value);
        renderCards(cartasOrdenadas);
    });
});

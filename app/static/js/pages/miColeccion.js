import { cargarCartas, abrirOverlayCarta } from '../utils/shared.js';

document.addEventListener('DOMContentLoaded', async () => {
    // Se asume que existe un contenedor con id "cards-container" en el HTML.
    const container = document.getElementById('cards-container');
    let cartas = await cargarCartas();

    // Función para ordenar las cartas según los criterios
    function sortCards(cards, prefs = { coleccion: 1, servidor: 1, nombre: 1, rareza: 1 }) {
        return cards.sort((a, b) => {
            // Orden por nombre de colección
            const colA = (a.coleccion && a.coleccion.nombre) || '';
            const colB = (b.coleccion && b.coleccion.nombre) || '';
            if (colA.localeCompare(colB) !== 0) {
                return colA.localeCompare(colB) * prefs.coleccion;
            }
            
            // Orden por servidor (suponiendo que la propiedad 'servidor' exista; sino, cadena vacía)
            const servA = a.servidor || '';
            const servB = b.servidor || '';
            if (servA.localeCompare(servB) !== 0) {
                return servA.localeCompare(servB) * prefs.servidor;
            }
            
            // Orden por nombre de la carta
            if (a.nombre.localeCompare(b.nombre) !== 0) {
                return a.nombre.localeCompare(b.nombre) * prefs.nombre;
            }
            
            // Orden por rareza
            return a.rareza.localeCompare(b.rareza) * prefs.rareza;
        });
    }

    // Renderiza las cartas en el contenedor
    function renderCards(cards) {
        container.innerHTML = '';
        cards.forEach(carta => {
            // Se crean elementos de la carta
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
            // Activar overlay al hacer clic
            div.addEventListener('click', () => abrirOverlayCarta(carta));
            container.appendChild(div);
        });
    }

    // Orden por defecto
    const cartasOrdenadas = sortCards(cartas);
    renderCards(cartasOrdenadas);

    // Si se agregan controles de ordenación en el HTML, se pueden escuchar eventos y reconstruir el array prefs.
    // Ejemplo:
    // document.getElementById('sort-select').addEventListener('change', (e) => { ... });
    
    // ...existing code...
});

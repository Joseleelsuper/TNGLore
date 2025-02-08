import { abrirOverlayCarta } from '../utils/shared.js';

document.addEventListener('DOMContentLoaded', () => {
    const chestContainer = document.getElementById('chest-container');
    const cardsDisplay = document.getElementById('cards-display');
    const cardsContainer = document.getElementById('cards-container');

    chestContainer.addEventListener('click', async (e) => {
        const chestCard = e.target.closest('.chest-card');
        if (!chestCard) return;
        const chestType = chestCard.dataset.type;
        const server = chestCard.dataset.server;
        try {
            const response = await fetch('/api/open_chests', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chest_type: chestType, server })
            });
            const contentType = response.headers.get("content-type") || "";
            if (!contentType.includes("application/json")) {
                const text = await response.text();
                console.error("Response not JSON:", text);
                alert('Error en el servidor');
                return;
            }
            const data = await response.json();
            if (!response.ok) {
                alert(data.error || 'Error al abrir cofre');
                return;
            }
            mostrarCartas(data.results.cards);
            let count = parseInt(chestCard.dataset.count);
            count = Math.max(count - 1, 0);
            chestCard.dataset.count = count;
            if (count === 0) {
                chestCard.remove();
            } else {
                chestCard.querySelector('.chest-count').textContent = count;
            }
        } catch (error) {
            console.error('Error:', error);
        }
    });

    document.getElementById('close-cards-btn').addEventListener('click', () => {
        cardsDisplay.style.display = 'none';
        cardsContainer.innerHTML = '';
    });

    function mostrarCartas(cards) {
        cardsContainer.innerHTML = '';
        cards.forEach(card => {
            const div = document.createElement('div');
            div.className = 'card-item';
            // Se muestra la imagen de la carta (o placeholder) dentro de un enlace clicable.
            const imgSrc = card.image || '/static/images/placeholder-card.png';
            div.innerHTML = `
                <a href="#" class="card-link">
                    <img src="${imgSrc}" alt="${card.nombre}" class="card-image">
                </a>
                <p>${card.nombre}</p>
            `;
            div.querySelector('.card-link').addEventListener('click', (e) => {
                e.preventDefault();
                // Import the function at the top of the file
                abrirOverlayCarta(card);
            });
            cardsContainer.appendChild(div);
        });
        cardsDisplay.style.display = 'block';
    }
});
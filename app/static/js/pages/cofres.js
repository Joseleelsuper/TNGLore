import { abrirOverlayCarta } from '../utils/shared.js';

const PLACEHOLDER_ICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'%3E%3Ccircle cx='24' cy='24' r='24' fill='%23dee2e6'/%3E%3Ctext x='24' y='30' text-anchor='middle' font-size='20' fill='%23868e96'%3E%F0%9F%8F%A0%3C/text%3E%3C/svg%3E";

function fixGuildIcon(url) {
    if (!url) return PLACEHOLDER_ICON;
    if (url.includes('cdn.discordapp.com') && !/\.(png|jpg|jpeg|webp|gif)(\?.*)?$/i.test(url)) {
        return url + '.png';
    }
    return url;
}

function normalizeRarityClass(value) {
    return value
    ? value.toLowerCase().normalize('NFD').replaceAll(/[\u0300-\u036f]/g, '')
        : 'comun';
}

function createOpenAllButton(count) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'chest-action-btn open-all-btn';
    button.dataset.openCount = String(count);
    button.textContent = `Abrir ${count} cofres`;
    return button;
}

document.addEventListener('DOMContentLoaded', () => {
    const serversContainer = document.getElementById('servers-container');
    const cardsDisplay = document.getElementById('cards-display');
    const chestData = document.getElementById('chest-data');

    if (!serversContainer || !cardsDisplay || !chestData) {
        return;
    }

    // Agrupar los cofres por servidor
    organizarCofresPorServidor();

    // Función para organizar los cofres por servidor
    function organizarCofresPorServidor() {
        // Obtener todos los cofres originales del contenedor oculto
        const coffersElements = chestData.querySelectorAll('.chest-card');
        
        if (!coffersElements.length) {
            console.log("No se encontraron cofres para organizar");
            return;
        }
        
        // Crear un objeto para almacenar cofres por servidor
        const serverChests = {};
        
        // Agrupar cofres por servidor
        coffersElements.forEach(chest => {
            const server = chest.dataset.server;
            const serverName = chest.querySelector('.chest-server').innerText.replace('Servidor: ', '');
            // Obtener el icono del servidor si está disponible en el dataset
            const serverIcon = chest.dataset.serverIcon || '';
            
            if (!serverChests[server]) {
                serverChests[server] = {
                    name: serverName,
                    icon: serverIcon,
                    chests: []
                };
            }
            
            // Crear un clon del cofre para usar en la interfaz
            const chestClone = chest.cloneNode(true);
            
            // Eliminar la información redundante del servidor en el clon
            const chestInfo = chestClone.querySelector('.chest-info');
            const serverInfo = chestClone.querySelector('.chest-server');
            if (chestInfo && serverInfo) {
                serverInfo.remove();
            }
            
            serverChests[server].chests.push(chestClone);
        });
        
        // Limpiar el contenedor de servidores
        serversContainer.innerHTML = '';
        
        // Renderizar los cofres agrupados por servidor
        Object.entries(serverChests).forEach(([, serverData]) => {
            const serverSection = document.createElement('div');
            serverSection.className = 'server-section';
            
            // Crear la cabecera del servidor con icono
            const serverHeader = document.createElement('div');
            serverHeader.className = 'server-header';
            serverHeader.innerHTML = `
                <img class="server-icon" src="${fixGuildIcon(serverData.icon)}" alt="${serverData.name}"
                     onerror="this.src='${PLACEHOLDER_ICON}'">
                <h2 class="server-title">${serverData.name}</h2>
            `;
            serverSection.appendChild(serverHeader);
            
            // Crear el contenedor de cofres para este servidor
            const chestsContainer = document.createElement('div');
            chestsContainer.className = 'chest-container';
            
            // Añadir los cofres al contenedor
            serverData.chests.forEach((chest) => {
                chestsContainer.appendChild(chest);
            });
            
            serverSection.appendChild(chestsContainer);
            serversContainer.appendChild(serverSection);
        });
    }

    function setChestButtonsLoading(chestCard, isLoading) {
        const actionButtons = chestCard.querySelectorAll('.chest-action-btn');
        actionButtons.forEach((button) => {
            button.disabled = isLoading;
        });
        chestCard.classList.toggle('disabled', isLoading);
    }

    function showLoadingOverlay(quantity) {
        const loadingOverlay = document.createElement('div');
        loadingOverlay.className = 'loading-overlay';
        loadingOverlay.innerHTML = `
            <div class="spinner"></div>
            <div class="loading-text">${quantity > 1 ? `Abriendo ${quantity} cofres...` : 'Abriendo cofre...'}</div>
        `;
        document.body.appendChild(loadingOverlay);
        return loadingOverlay;
    }

    async function openChestsRequest(chestType, server, quantity) {
        const makeRequest = (signal) => fetch('/api/open_chests_multi', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chest_type: chestType, server, quantity }),
            signal
        });

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 20000);
        const response = await makeRequest(controller.signal).finally(() => clearTimeout(timeoutId));

        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
            if (response.status === 504) {
                await new Promise((resolve) => setTimeout(resolve, 500));
                const retryResponse = await makeRequest();
                const retryContentType = retryResponse.headers.get('content-type') || '';
                if (!retryContentType.includes('application/json')) {
                    throw new Error('Error en el servidor tras reintento');
                }
                const retryData = await retryResponse.json();
                if (!retryResponse.ok) {
                    throw new Error(retryData.error || 'Error al abrir cofres');
                }
                return retryData;
            }
            throw new Error('Respuesta inválida del servidor');
        }

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || 'Error al abrir cofres');
        }
        return data;
    }

    function updateActionButtons(chestCard, count) {
        const actions = chestCard.querySelector('.chest-actions');
        if (!actions) return;

        let openAllButton = actions.querySelector('.open-all-btn');
        if (count > 1) {
            if (!openAllButton) {
                openAllButton = createOpenAllButton(count);
                actions.appendChild(openAllButton);
            }
            openAllButton.dataset.openCount = String(count);
            openAllButton.textContent = `Abrir ${count} cofres`;
        } else if (openAllButton) {
            openAllButton.remove();
        }
    }

    function buildCardGroups(cards) {
        const groups = new Map();
        cards.forEach((card) => {
            const key = card._id || card.card_id || `${card.nombre || card.name || 'sin_nombre'}::${card.rareza || card.rarity || 'comun'}`;
            if (!groups.has(key)) {
                groups.set(key, { card, count: 0 });
            }
            groups.get(key).count += 1;
        });
        return Array.from(groups.values());
    }

    function processChestResults(data, chestCard) {
        const cards = data?.results?.cards || [];
        const openedCount = Number.parseInt(data?.results?.chests_opened || '1', 10) || 1;

        mostrarCartas(cards);

        let count = Number.parseInt(chestCard.dataset.count || '0', 10);
        count = Math.max(count - openedCount, 0);
        chestCard.dataset.count = String(count);

        if (count === 0) {
            chestCard.classList.add('fade-out');
            setTimeout(() => {
                const chestsContainer = chestCard.closest('.chest-container');
                chestCard.remove();

                if (chestsContainer?.children.length === 0) {
                    const serverSection = chestsContainer.closest('.server-section');
                    if (serverSection) {
                        serverSection.classList.add('fade-out');
                        setTimeout(() => serverSection.remove(), 300);
                    }
                }
            }, 300);
            return;
        }

        const countElement = chestCard.querySelector('.chest-count');
        if (countElement) {
            countElement.classList.add('count-change');
            setTimeout(() => {
                countElement.textContent = String(count);
                setTimeout(() => countElement.classList.remove('count-change'), 300);
            }, 150);
        }

        updateActionButtons(chestCard, count);
    }

    // Delegación de eventos para manejar clics de apertura
    document.addEventListener('click', async (e) => {
        const actionButton = e.target.closest('.chest-action-btn');
        if (!actionButton) return;

        const chestCard = actionButton.closest('.chest-card');
        if (!chestCard || chestCard.classList.contains('disabled')) return;

        const chestType = chestCard.dataset.type;
        const server = chestCard.dataset.server;
        if (!chestType || !server) return;

        const currentCount = Number.parseInt(chestCard.dataset.count || '1', 10) || 1;
        let quantity = Number.parseInt(actionButton.dataset.openCount || '1', 10) || 1;
        if (actionButton.classList.contains('open-all-btn')) {
            quantity = currentCount;
        }
        quantity = Math.max(1, Math.min(quantity, currentCount));

        const loadingOverlay = showLoadingOverlay(quantity);
        setChestButtonsLoading(chestCard, true);
        
        try {
            const data = await openChestsRequest(chestType, server, quantity);
            processChestResults(data, chestCard);
        } catch (error) {
            console.error('Error:', error);
            if (error.name === 'AbortError') {
                alert('La operación tomó demasiado tiempo. Por favor, inténtalo de nuevo.');
            } else {
                alert(error.message || 'Ocurrió un error al abrir el cofre. Por favor, inténtalo de nuevo.');
            }
        } finally {
            loadingOverlay.remove();
            setChestButtonsLoading(chestCard, false);
        }
    });

    // Event listeners para manejar el cierre de overlays
    document.addEventListener('click', (e) => {
        if (e.target.id === 'close-cards-btn') {
            cardsDisplay.style.display = 'none';
        }
        
        // Cerrar cards-display al hacer clic en el fondo
        if (e.target === cardsDisplay) {
            cardsDisplay.style.display = 'none';
        }
        
        // Cerrar overlay al hacer clic en el fondo
        if (e.target.id === 'overlay') {
            e.target.style.display = 'none';
            // Al cerrar el overlay de carta, podemos volver a mostrar las cartas ganadas si estaba visible
            if (cardsDisplay.innerHTML.includes('Cartas Ganadas')) {
                cardsDisplay.style.display = 'flex';
            }
        }
        
        // Cerrar overlay con el botón X
        if (e.target.classList.contains('close-btn')) {
            const overlay = e.target.closest('.overlay');
            if (overlay) {
                overlay.style.display = 'none';
                // Al cerrar el overlay de carta, podemos volver a mostrar las cartas ganadas si estaba visible
                if (cardsDisplay.innerHTML.includes('Cartas Ganadas')) {
                    cardsDisplay.style.display = 'flex';
                }
            }
        }
    });

    function mostrarCartas(cards) {
        const overlays = document.querySelectorAll('.overlay');
        overlays.forEach(overlay => {
            overlay.style.display = 'none';
        });

        const groupedCards = buildCardGroups(cards);
        
        cardsDisplay.innerHTML = `
            <div>
                <h2>Cartas Ganadas (${cards.length})</h2>
                <div id="cards-container" class="cards-grid"></div>
                <button id="close-cards-btn">Cerrar</button>
            </div>
        `;
        
        const newCardsContainer = document.getElementById('cards-container');
        
        groupedCards.forEach((group, index) => {
            const card = group.card;
            const div = document.createElement('div');
            div.className = 'card-item card-reveal';
            div.style.animationDelay = `${index * 0.04}s`;
            
            const img = document.createElement('img');
            img.className = 'card-image loaded';
            img.src = card.image || card.image_url || '/static/assets/images/placeholder-card.svg';
            img.alt = card.nombre || 'Carta';
            img.loading = 'eager';
            img.decoding = 'async';
            div.appendChild(img);

            if (group.count > 1) {
                const countBadge = document.createElement('span');
                countBadge.className = 'card-count-badge';
                countBadge.textContent = String(group.count);
                div.appendChild(countBadge);
            }
            
            const infoDiv = document.createElement('div');
            infoDiv.className = 'card-info';
            
            const rareza = normalizeRarityClass(card.rareza || card.rarity);
            
            infoDiv.innerHTML = `
                <p class="card-name">${card.nombre || card.name || 'Carta sin nombre'}</p>
                <p class="card-rarity ${rareza}">${card.rareza || card.rarity || 'Común'}</p>
            `;
            div.appendChild(infoDiv);
            
            div.addEventListener('click', (e) => {
                e.stopPropagation();
                cardsDisplay.style.display = 'none';
                setTimeout(() => abrirOverlayCarta(card), 100);
            });
            
            newCardsContainer.appendChild(div);
        });

        document.getElementById('close-cards-btn').addEventListener('click', () => {
            cardsDisplay.style.display = 'none';
        });
        
        cardsDisplay.style.display = 'flex';
        
        try {
            const audio = new Audio('/assets/sounds/card-reveal.mp3');
            audio.volume = 0.5;
            audio.play().catch(err => console.log('Error al reproducir sonido:', err));
        } catch (e) {
            console.warn('Sonido no disponible:', e);
        }
    }
});
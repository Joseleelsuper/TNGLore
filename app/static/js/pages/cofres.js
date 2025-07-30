import { abrirOverlayCarta } from '../utils/shared.js';

document.addEventListener('DOMContentLoaded', () => {
    const serversContainer = document.getElementById('servers-container');
    const cardsDisplay = document.getElementById('cards-display');
    const cardsContainer = document.getElementById('cards-container');
    const chestData = document.getElementById('chest-data');

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
            let serverIcon = chest.dataset.serverIcon || '';
            
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
            if (serverInfo) {
                chestInfo.removeChild(serverInfo);
            }
            
            serverChests[server].chests.push(chestClone);
        });
        
        // Limpiar el contenedor de servidores
        serversContainer.innerHTML = '';
        
        // Renderizar los cofres agrupados por servidor
        Object.entries(serverChests).forEach(([serverId, serverData]) => {
            const serverSection = document.createElement('div');
            serverSection.className = 'server-section';
            
            // Crear la cabecera del servidor con icono
            const serverHeader = document.createElement('div');
            serverHeader.className = 'server-header';
            serverHeader.innerHTML = `
                <img class="server-icon" src="${serverData.icon || '/static/images/placeholder-server.png'}" alt="${serverData.name}">
                <h2 class="server-title">${serverData.name}</h2>
            `;
            serverSection.appendChild(serverHeader);
            
            // Crear el contenedor de cofres para este servidor
            const chestsContainer = document.createElement('div');
            chestsContainer.className = 'chest-container';
            
            // Añadir los cofres al contenedor
            serverData.chests.forEach(chest => {
                chestsContainer.appendChild(chest);
            });
            
            serverSection.appendChild(chestsContainer);
            serversContainer.appendChild(serverSection);
        });
    }

    // Delegación de eventos para manejar clics en cofres
    document.addEventListener('click', async (e) => {
        const chestCard = e.target.closest('.chest-card');
        if (!chestCard) return;
        
        const chestType = chestCard.dataset.type;
        const server = chestCard.dataset.server;
        
        if (!chestType || !server) return;
        
        // Mostrar indicador de carga
        const loadingOverlay = document.createElement('div');
        loadingOverlay.className = 'loading-overlay';
        loadingOverlay.innerHTML = `
            <div class="spinner"></div>
            <div class="loading-text">Abriendo cofre...</div>
        `;
        document.body.appendChild(loadingOverlay);
        
        // Deshabilitar el cofre temporalmente para evitar clics múltiples
        chestCard.classList.add('disabled');
        
        try {
            // Implementar un timeout en el cliente para evitar esperas muy largas
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 segundos de timeout
            
            const response = await fetch('/api/open_chests', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chest_type: chestType, server }),
                signal: controller.signal
            }).finally(() => clearTimeout(timeoutId));
            
            // Verificar si la respuesta es JSON
            const contentType = response.headers.get("content-type") || "";
            if (!contentType.includes("application/json")) {
                // Intentar manejar errores no JSON (como 504 Gateway Timeout)
                if (response.status === 504) {
                    console.error("Timeout en el servidor. Reintentando...");
                    // Reintentar automáticamente una vez con un nuevo fetch
                    await new Promise(resolve => setTimeout(resolve, 500));
                    
                    const retryResponse = await fetch('/api/open_chests', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ chest_type: chestType, server }),
                    });
                    
                    if (!retryResponse.ok || !retryResponse.headers.get("content-type")?.includes("application/json")) {
                        throw new Error("Error después de reintento");
                    }
                    
                    const data = await retryResponse.json();
                    processChestResults(data, chestCard);
                } else {
                    const text = await response.text();
                    console.error("Response not JSON:", text);
                    alert('Error en el servidor. Por favor, inténtalo de nuevo más tarde.');
                }
            } else {
                // Procesamiento normal de respuesta JSON
                const data = await response.json();
                if (!response.ok) {
                    alert(data.error || 'Error al abrir cofre');
                } else {
                    processChestResults(data, chestCard);
                }
            }
        } catch (error) {
            console.error('Error:', error);
            if (error.name === 'AbortError') {
                alert('La operación tomó demasiado tiempo. Por favor, inténtalo de nuevo.');
            } else {
                alert('Ocurrió un error al abrir el cofre. Por favor, inténtalo de nuevo.');
            }
        } finally {
            // Eliminar indicador de carga y habilitar el cofre nuevamente
            document.body.removeChild(loadingOverlay);
            chestCard.classList.remove('disabled');
        }
    });
    
    // Función para procesar los resultados de abrir un cofre
    function processChestResults(data, chestCard) {
        // Mostrar las cartas obtenidas
        mostrarCartas(data.results.cards);
        
        // Actualizar el contador de cofres
        let count = parseInt(chestCard.dataset.count);
        count = Math.max(count - 1, 0);
        chestCard.dataset.count = count;
        
        if (count === 0) {
            // Animación de desvanecimiento antes de eliminar
            chestCard.classList.add('fade-out');
            setTimeout(() => {
                chestCard.remove();
                
                // Verificar si el contenedor del servidor está vacío y eliminarlo si es necesario
                const chestsContainer = chestCard.closest('.chest-container');
                if (chestsContainer && chestsContainer.children.length === 0) {
                    const serverSection = chestsContainer.closest('.server-section');
                    if (serverSection) {
                        serverSection.classList.add('fade-out');
                        setTimeout(() => serverSection.remove(), 300);
                    }
                }
            }, 300);
        } else {
            // Actualizar el contador visualmente
            const countElement = chestCard.querySelector('.chest-count');
            const oldCount = parseInt(countElement.textContent);
            
            // Pequeña animación para el cambio de número
            countElement.classList.add('count-change');
            setTimeout(() => {
                countElement.textContent = count;
                setTimeout(() => countElement.classList.remove('count-change'), 300);
            }, 150);
        }
    }

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
        // Cerrar cualquier overlay abierto antes de mostrar las cartas
        const overlays = document.querySelectorAll('.overlay');
        overlays.forEach(overlay => {
            overlay.style.display = 'none';
        });
        
        cardsDisplay.innerHTML = `
            <div>
                <h2>Cartas Ganadas</h2>
                <div id="cards-container" class="cards-grid"></div>
                <button id="close-cards-btn">Cerrar</button>
            </div>
        `;
        
        // Obtener referencia al contenedor de cartas después de crearlo
        const newCardsContainer = document.getElementById('cards-container');
        
        // Mostrar cada carta con una animación secuencial
        cards.forEach((card, index) => {
            const div = document.createElement('div');
            div.className = 'card-item';
            
            // Añadir imagen de la carta
            const img = document.createElement('img');
            img.className = 'card-image loaded';
            // Verificar si tenemos una URL de imagen válida, si no usar una imagen por defecto
            img.src = card.image || card.image_url || '/static/assets/images/placeholder-card.svg';
            img.alt = card.nombre || 'Carta';
            img.loading = 'eager';
            img.decoding = 'async';
            div.appendChild(img);
            
            // Añadir información básica de la carta
            const infoDiv = document.createElement('div');
            infoDiv.className = 'card-info';
            
            // Mostrar rareza con color correspondiente
            const rarityColors = {
                'común': '#b0b0b0',
                'comun': '#b0b0b0',
                'raro': '#007bff',
                'rara': '#007bff',
                'épico': '#6f42c1',
                'epico': '#6f42c1',
                'legendario': '#fd7e14',
                'legendaria': '#fd7e14'
            };
            
            const rareza = card.rareza ? card.rareza.toLowerCase() : 'común';
            const rarityColor = rarityColors[rareza] || '#b0b0b0';
            
            infoDiv.innerHTML = `
                <p class="card-name">${card.nombre || card.name || 'Carta sin nombre'}</p>
                <p class="card-rarity" style="color: ${rarityColor};">${card.rareza || card.rarity || 'Común'}</p>
            `;
            div.appendChild(infoDiv);
            
            // Hacer clicable para mostrar detalles
            div.addEventListener('click', (e) => {
                e.stopPropagation();
                cardsDisplay.style.display = 'none';
                setTimeout(() => abrirOverlayCarta(card), 100);
            });
            
            newCardsContainer.appendChild(div);
        });

        // Re-añadir event listeners
        document.getElementById('close-cards-btn').addEventListener('click', () => {
            cardsDisplay.style.display = 'none';
        });
        
        // Mostrar el display de cartas
        cardsDisplay.style.display = 'flex';
        
        // Añadir efectos de sonido para la revelación de cartas
        try {
            const audio = new Audio('/assets/sounds/card-reveal.mp3');
            audio.volume = 0.5;
            audio.play().catch(err => console.log('Error al reproducir sonido:', err));
        } catch (e) {
            console.log('Sonido no disponible');
        }
    }
});
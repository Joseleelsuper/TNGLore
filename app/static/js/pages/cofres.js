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
                
                // Verificar si el contenedor del servidor está vacío y eliminarlo si es necesario
                const chestsContainer = chestCard.closest('.chest-container');
                if (chestsContainer && chestsContainer.children.length === 0) {
                    const serverSection = chestsContainer.closest('.server-section');
                    if (serverSection) {
                        serverSection.remove();
                    }
                }
            } else {
                chestCard.querySelector('.chest-count').textContent = count;
            }
        } catch (error) {
            console.error('Error:', error);
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
        // Cerrar cualquier overlay abierto antes de mostrar las cartas
        const overlays = document.querySelectorAll('.overlay');
        overlays.forEach(overlay => {
            overlay.style.display = 'none';
        });
        
        cardsDisplay.innerHTML = `
            <div>
                <h2>Cartas Ganadas</h2>
                <div id="cards-container"></div>
                <button id="close-cards-btn">Cerrar</button>
            </div>
        `;
        
        const cardsContainer = document.getElementById('cards-container');
        cards.forEach(card => {
            const div = document.createElement('div');
            div.className = 'card-item';
            
            // Añadir imagen de la carta
            const img = document.createElement('img');
            img.className = 'card-image loaded'; // Agregamos 'loaded' directamente para evitar el reposicionamiento
            // Verificar si tenemos una URL de imagen válida, si no usar una imagen por defecto
            img.src = card.image || card.image_url || '/static/assets/images/placeholder-card.png';
            img.alt = card.nombre || 'Carta';
            img.loading = 'eager'; // Cambiado a eager para carga inmediata
            img.decoding = 'async'; // Mejora de rendimiento
            img.style.position = 'relative'; // Forzar posicionamiento relativo
            img.style.top = '0';
            img.style.left = '0';
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
            
            // Depurar información de la carta
            console.debug('Datos de la carta:', card);
            
            const rareza = card.rareza ? card.rareza.toLowerCase() : 'común';
            const rarityColor = rarityColors[rareza] || '#b0b0b0';
            
            infoDiv.innerHTML = `
                <p class="card-name">${card.nombre || card.name || 'Carta sin nombre'}</p>
                <p class="card-rarity" style="color: ${rarityColor};">${card.rareza || card.rarity || 'Común'}</p>
            `;
            div.appendChild(infoDiv);
            
            // Hacer clicable para mostrar detalles
            div.addEventListener('click', (e) => {
                e.stopPropagation(); // Evitar que el clic se propague al fondo
                // Primero oculta el overlay de cartas ganadas
                cardsDisplay.style.display = 'none';
                // Luego abre el overlay con la información de la carta
                setTimeout(() => abrirOverlayCarta(card), 100);
            });
            
            cardsContainer.appendChild(div);
        });

        // Re-añadir event listeners
        document.getElementById('close-cards-btn').addEventListener('click', () => {
            cardsDisplay.style.display = 'none';
        });
        
        cardsDisplay.style.display = 'flex';
    }
});
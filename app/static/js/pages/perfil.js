import { abrirOverlayCarta } from '../utils/shared.js';

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('perfil-form');
    const logoutBtn = document.getElementById('logout-btn');
    const deleteAccountBtn = document.getElementById('delete-account-btn');
    const deleteAccountModal = document.getElementById('delete-account-modal');
    const deleteAccountForm = document.getElementById('delete-account-form');
    const cancelDeleteBtn = document.getElementById('cancel-delete');

    // Cargar servidores del bot via AJAX (no bloquea el render de la página)
    loadBotServers();

    // Cargar historial de cofres
    loadOpeningHistory();

    form.addEventListener('submit', function(event) {
        const password = document.getElementById('password').value;
        const confirmPassword = document.getElementById('confirm_password').value;

        if (password && password !== confirmPassword) {
            event.preventDefault();
            alert('Las contraseñas no coinciden. Por favor, verifícalas.');
        }
    });

    logoutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        window.location.href = '/logout';
    });

    deleteAccountBtn.addEventListener('click', () => {
        deleteAccountModal.style.display = 'block';
    });

    cancelDeleteBtn.addEventListener('click', () => {
        deleteAccountModal.style.display = 'none';
    });

    deleteAccountForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const password = document.getElementById('delete-password').value;
        const confirmCheckbox = document.getElementById('delete-confirm');
    
        if (!confirmCheckbox.checked) {
            alert('Debes aceptar los términos para borrar tu cuenta.');
            return;
        }
    
        try {
            const response = await fetch('/perfil/delete-account', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ password }),
            });
    
            if (response.ok) {
                alert('Tu cuenta ha sido borrada. Serás redirigido a la página de inicio.');
                window.location.href = '/';
            } else {
                const data = await response.json();
                alert(data.message || 'Ha ocurrido un error al borrar la cuenta.');
            }
        } catch (error) {
            console.error('Error:', error);
            alert('Ha ocurrido un error al borrar la cuenta. Por favor, inténtalo de nuevo más tarde.');
        }
    });
});

/**
 * Carga los servidores del bot via AJAX para no bloquear el render de /perfil.
 */
async function loadBotServers() {
    const serverList = document.querySelector('.server-list');
    if (!serverList) return;
    
    try {
        const response = await fetch('/api/bot-servers');
        if (!response.ok) throw new Error('Error fetching bot servers');
        const servers = await response.json();
        
        if (servers.length === 0) {
            serverList.innerHTML = '<p class="no-servers">No hay servidores disponibles</p>';
            return;
        }
        
        serverList.innerHTML = servers.map(server => `
            <div class="server-card">
                <img src="${server.icon || '/static/images/default_server_icon.png'}" 
                     alt="${server.name}" class="server-icon">
                <div class="server-info">
                    <h3>${server.name}</h3>
                    <p>${server.coleccionables_count} cartas</p>
                </div>
            </div>
        `).join('');
    } catch (error) {
        serverList.innerHTML = '<p class="no-servers">Error al cargar servidores</p>';
    }
}


// ─── Historial de cofres abiertos ─────────────────────────

let _historyPage = 1;
const HISTORY_LIMIT = 10;

async function loadOpeningHistory(append = false) {
    const list = document.getElementById('history-list');
    const btn = document.getElementById('history-load-more');
    if (!list) return;

    if (!append) {
        list.innerHTML = '<p class="history-loading">Cargando historial...</p>';
        _historyPage = 1;
    }

    try {
        const res = await fetch(`/api/user/opening-history?page=${_historyPage}&limit=${HISTORY_LIMIT}`);
        if (!res.ok) throw new Error('Error');
        const data = await res.json();

        if (!append) list.innerHTML = '';

        if (data.entries.length === 0 && _historyPage === 1) {
            list.innerHTML = '<p class="history-empty">Aún no has abierto ningún cofre.</p>';
            btn.style.display = 'none';
            return;
        }

        const rarityColors = {
            comun: '#9e9e9e', rara: '#66bb6a', epica: '#ab47bc', legendaria: '#ffd54f'
        };

        data.entries.forEach(entry => {
            const card = document.createElement('div');
            card.className = 'history-entry';
            const date = new Date(entry.opened_at).toLocaleDateString('es-ES', {
                day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
            });
            const chestType = entry.chest_type || '?';
            const source = entry.chest_source || '';

            const cardsContainer = document.createElement('div');
            cardsContainer.className = 'history-cards';

            (entry.cards_received || []).forEach(c => {
                const color = rarityColors[c.rareza] || '#ccc';
                const chip = document.createElement('span');
                chip.className = 'history-card-chip';
                chip.style.borderColor = color;
                chip.style.color = color;
                chip.textContent = c.nombre;
                chip.addEventListener('click', () => {
                    abrirOverlayCarta({
                        _id: c.card_id || '',
                        nombre: c.nombre,
                        rareza: c.rareza,
                        coleccion: c.coleccion || '',
                        image: c.image || '',
                    });
                });
                cardsContainer.appendChild(chip);
            });

            if (cardsContainer.children.length === 0) {
                cardsContainer.innerHTML = '<em>Sin cartas</em>';
            }

            const meta = document.createElement('div');
            meta.className = 'history-meta';
            meta.innerHTML = `
                <span class="history-type" style="color:${rarityColors[chestType] || '#ccc'}">
                    Cofre ${chestType}
                </span>
                ${source ? `<span class="history-source">${source}</span>` : ''}
                <span class="history-date">${date}</span>
            `;
            card.appendChild(meta);
            card.appendChild(cardsContainer);
            list.appendChild(card);
        });

        btn.style.display = data.has_more ? '' : 'none';
        if (data.has_more) {
            btn.onclick = () => {
                _historyPage++;
                loadOpeningHistory(true);
            };
        }
    } catch (e) {
        console.error(e);
        if (!append) list.innerHTML = '<p class="history-empty">Error al cargar historial.</p>';
        btn.style.display = 'none';
    }
}
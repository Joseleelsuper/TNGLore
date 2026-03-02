// ─── Consola de Cofres (card-based feed with avatars) ─────────────

const DEFAULT_AVATAR = 'https://fonts.gstatic.com/s/i/materialicons/person/v6/24px.svg';

async function fetchChestLogs() {
    try {
        const res = await fetch('/api/cofres-log');
        if (!res.ok) throw new Error('Error al obtener logs');
        return await res.json();
    } catch (error) {
        console.error(error);
        return [];
    }
}

function renderChestLogs(logs) {
    const container = document.getElementById('chest-log-container');
    container.innerHTML = '';
    if (!logs.length) {
        container.innerHTML = '<p class="no-logs">Aún no hay cofres registrados.</p>';
        return;
    }
    logs.forEach(log => {
        if (!log.username) return;
        const card = document.createElement('div');
        card.className = 'log-card';
        const rarityClass = (log.chest?.rareza || '').toLowerCase();
        const avatar = log.pfp || DEFAULT_AVATAR;
        card.innerHTML = `
            <img class="log-avatar" src="${avatar}" alt="" loading="lazy"
                 onerror="this.src='${DEFAULT_AVATAR}'">
            <div class="log-body">
                <span class="log-username">${log.username}</span>
                <span class="log-text">ha conseguido un cofre</span>
                <span class="log-rareza ${rarityClass}">${log.chest?.rareza || '?'}</span>
            </div>
            <span class="log-date">${formatRelativeDate(log.date)}</span>
        `;
        container.appendChild(card);
    });
}

function formatRelativeDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const now = new Date();
    const diff = Math.floor((now - d) / 1000);
    if (diff < 60) return 'hace un momento';
    if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `hace ${Math.floor(diff / 3600)}h`;
    return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

async function updateChestLogs() {
    const logs = await fetchChestLogs();
    renderChestLogs(logs);
}

updateChestLogs();
setInterval(updateChestLogs, 60000);


// ─── Eventos de Login Diario ──────────────────────────────────────

const RARITY_EMOJIS = {
    comun: '📦', rara: '🎁', epica: '💎', legendaria: '👑'
};

let _userGuilds = [];

async function loadActiveEvents() {
    const container = document.getElementById('events-container');
    try {
        const res = await fetch('/api/events/active');
        if (!res.ok) throw new Error('Error');
        const data = await res.json();
        _userGuilds = data.guilds || [];
        renderEvents(data.events || [], container);
    } catch (e) {
        console.error(e);
        container.innerHTML = '<section class="event-section"><p class="dr-error">No se pudieron cargar los eventos.</p></section>';
    }
}

function renderEvents(events, container) {
    container.innerHTML = '';

    if (events.length === 0) {
        container.innerHTML = '<section class="event-section"><p class="dr-error" style="color:#999">No hay eventos activos.</p></section>';
        return;
    }

    events.forEach(ev => {
        const section = document.createElement('section');
        section.className = 'event-section';

        const heading = document.createElement('h2');
        heading.textContent = ev.name;
        section.appendChild(heading);

        if (ev.description) {
            const desc = document.createElement('p');
            desc.className = 'event-description';
            desc.textContent = ev.description;
            section.appendChild(desc);
        }

        const track = document.createElement('div');
        track.className = 'dr-track';
        section.appendChild(track);

        const info = document.createElement('div');
        info.className = 'dr-info';
        section.appendChild(info);

        renderEventTrack(ev, track, info);
        container.appendChild(section);
    });
}

function renderEventTrack(ev, track, info) {
    track.innerHTML = '';
    info.innerHTML = '';

    (ev.rewards || []).forEach((r, i) => {
        const dayNum = i + 1;
        let status = 'locked';
        if (dayNum <= ev.progress) status = 'claimed';
        else if (dayNum === ev.current_day && ev.can_claim) status = 'available';

        const day = document.createElement('div');
        day.className = `dr-day dr-${status}`;

        let emoji;
        if (r.type === 'code') emoji = '🎟️';
        else if (r.type === 'card') emoji = '🃏';
        else emoji = RARITY_EMOJIS[r.rarity] || '📦';

        let label;
        if (r.type === 'code') label = 'Código';
        else if (r.type === 'card') label = r.card_name || r.rarity || 'Carta';
        else label = r.rarity || '';

        day.innerHTML = `
            <span class="dr-num">Día ${dayNum}</span>
            <span class="dr-emoji">${emoji}</span>
            <span class="dr-label">${label}</span>
        `;

        if (status === 'available') {
            const btn = document.createElement('button');
            btn.className = 'dr-claim-btn';
            btn.textContent = 'Reclamar';
            btn.addEventListener('click', () => claimEventReward(btn, ev.event_id, r));
            day.appendChild(btn);
        }
        if (status === 'claimed') {
            day.innerHTML += '<span class="dr-check">✓</span>';
        }
        track.appendChild(day);
    });

    if (ev.completed) {
        info.innerHTML = '<p class="dr-complete">🎉 ¡Has completado este evento!</p>';
        if (ev.assigned_code) {
            info.innerHTML += `<p class="dr-code-reveal">Tu código: <strong>${ev.assigned_code.code}</strong></p>`;
            if (ev.assigned_code.description) {
                info.innerHTML += `<p class="dr-code-desc">${ev.assigned_code.description}</p>`;
            }
            if (ev.assigned_code.link) {
                info.innerHTML += `<p class="dr-code-desc"><a href="${ev.assigned_code.link}" target="_blank" rel="noopener">🔗 Canjear aquí</a></p>`;
            }
        }
    }
}

// ─── Custom Popup ─────────────────────────────────────────────────

function showRewardPopup({ title, emoji, message, code, codeLink, onClose }) {
    const backdrop = document.createElement('div');
    backdrop.className = 'reward-popup-backdrop';
    backdrop.innerHTML = `
        <div class="reward-popup">
            <div class="popup-emoji">${emoji || '🎉'}</div>
            <h3>${title || 'Recompensa'}</h3>
            <p class="popup-msg">${message || ''}</p>
            ${code ? `<div class="popup-code">${code}</div>` : ''}
            ${codeLink ? `<a class="popup-code-link" href="${codeLink}" target="_blank" rel="noopener">🔗 Canjear aquí</a>` : ''}
            <div class="popup-actions">
                <button class="popup-btn popup-btn-primary" data-action="ok">Aceptar</button>
            </div>
        </div>
    `;
    document.body.appendChild(backdrop);
    backdrop.querySelector('[data-action="ok"]').addEventListener('click', () => {
        backdrop.remove();
        if (onClose) onClose();
    });
    backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) { backdrop.remove(); if (onClose) onClose(); }
    });
}

function showServerSelectPopup({ title, emoji, guilds }) {
    return new Promise((resolve) => {
        const options = guilds.map(g => `<option value="${g.id}">${g.name}</option>`).join('');
        const backdrop = document.createElement('div');
        backdrop.className = 'reward-popup-backdrop';
        backdrop.innerHTML = `
            <div class="reward-popup">
                <div class="popup-emoji">${emoji || '🎁'}</div>
                <h3>${title || '¡Recompensa!'}</h3>
                <p class="popup-msg">Elige en qué servidor quieres guardar la recompensa:</p>
                <label class="server-select-label">Servidor</label>
                <select id="popup-server-select">${options}</select>
                <div class="popup-actions">
                    <button class="popup-btn popup-btn-primary" data-action="confirm">Confirmar</button>
                </div>
            </div>
        `;
        document.body.appendChild(backdrop);
        backdrop.querySelector('[data-action="confirm"]').addEventListener('click', () => {
            const selected = backdrop.querySelector('#popup-server-select').value;
            backdrop.remove();
            resolve(selected);
        });
    });
}

function showErrorPopup(message) {
    showRewardPopup({ title: 'Error', emoji: '❌', message });
}

// ─── Claim Event Reward ───────────────────────────────────────────

async function claimEventReward(btn, eventId, reward) {
    btn.disabled = true;
    btn.textContent = '...';

    try {
        let serverId = '';

        // Ask for server if reward needs it (chest or card) and user has guilds
        if (reward.type !== 'code' && _userGuilds.length > 0) {
            const emoji = reward.type === 'card' ? '🃏' : (RARITY_EMOJIS[reward.rarity] || '📦');
            const title = reward.type === 'card'
                ? `¡Carta${reward.card_name ? ': ' + reward.card_name : ''}!`
                : `¡Cofre ${reward.rarity}!`;

            serverId = await showServerSelectPopup({
                title,
                emoji,
                guilds: _userGuilds,
            });
        }

        const res = await fetch(`/api/events/${eventId}/claim`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ server_id: serverId }),
        });
        const data = await res.json();

        if (!res.ok) {
            showErrorPopup(data.error || 'Error al reclamar');
            btn.disabled = false;
            btn.textContent = 'Reclamar';
            return;
        }

        // Show reward feedback
        if (data.type === 'code' && data.code) {
            showRewardPopup({
                title: `Día ${data.day}`,
                emoji: '🎟️',
                message: '¡Has recibido un código!',
                code: data.code,
                codeLink: data.code_link || null,
                onClose: () => loadActiveEvents(),
            });
        } else if (data.type === 'card') {
            showRewardPopup({
                title: `Día ${data.day}`,
                emoji: '🃏',
                message: `¡Has recibido la carta "${data.card_name || 'una carta'}"!`,
                onClose: () => loadActiveEvents(),
            });
        } else {
            showRewardPopup({
                title: `Día ${data.day}`,
                emoji: RARITY_EMOJIS[data.rarity] || '📦',
                message: `¡Has recibido un cofre ${data.rarity}!${data.fallback ? '\n(No había códigos disponibles)' : ''}`,
                onClose: () => loadActiveEvents(),
            });
        }
    } catch (e) {
        console.error(e);
        btn.disabled = false;
        btn.textContent = 'Reclamar';
    }
}

loadActiveEvents();

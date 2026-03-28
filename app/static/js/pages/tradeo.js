import { abrirOverlayCarta } from '../utils/shared.js';

const RARITY_ORDER = {
    comun: 0,
    rara: 1,
    epica: 2,
    legendaria: 3,
};

const DEFAULT_AVATAR = 'https://fonts.gstatic.com/s/i/materialicons/person/v6/24px.svg';
const PLACEHOLDER_CARD = '/static/assets/images/placeholder-card.svg';

const state = {
    marketCards: [],
    marketTotal: 0,
    myListings: [],
    myCards: [],
    queue: [],
};

const selectorState = {
    isOpen: false,
    mode: null,
    targetCard: null,
    candidates: [],
    selected: null,
};

function rarityCompatible(targetRarity, offeredRarity) {
    const left = RARITY_ORDER[targetRarity];
    const right = RARITY_ORDER[offeredRarity];
    if (left === undefined || right === undefined) return false;
    return Math.abs(left - right) <= 1;
}

function rarityClass(rarity) {
    return (rarity || 'comun').toLowerCase();
}

function toOverlayCard(cardData) {
    return {
        _id: cardData.card_id || cardData.id || '',
        nombre: cardData.card_name || cardData.name || 'Carta',
        rareza: cardData.card_rarity || cardData.rarity || 'comun',
        image: cardData.card_image || cardData.image || PLACEHOLDER_CARD,
    };
}

function openCardOverlay(cardData, event = null) {
    if (event) {
        event.stopPropagation();
    }

    abrirOverlayCarta(toOverlayCard(cardData));
}

async function requestJson(url, method = 'GET', body = null) {
    const options = {
        method,
        headers: {
            'Content-Type': 'application/json',
        },
    };

    if (body) {
        options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    let data = {};
    const rawBody = await response.text();
    if (rawBody) {
        try {
            data = JSON.parse(rawBody);
        } catch (parseError) {
            data = {
                error: 'Respuesta JSON invalida del servidor.',
                details: String(parseError),
            };
        }
    }

    if (!response.ok) {
        throw new Error(data.error || 'Error en la solicitud');
    }

    return data;
}

function showFeedback(message, kind = 'success') {
    const container = document.getElementById('trade-feedback');
    if (!container) return;

    container.textContent = message;
    container.className = `trade-feedback ${kind}`;
    container.style.display = '';

    setTimeout(() => {
        container.style.display = 'none';
    }, 4500);
}

function createAvatarStack(users) {
    const stack = document.createElement('div');
    stack.className = 'avatar-stack';

    const visible = users.slice(0, 5);
    visible.forEach((user) => {
        const img = document.createElement('img');
        img.src = user.pfp || DEFAULT_AVATAR;
        img.alt = user.username || 'Usuario';
        img.title = user.username || 'Usuario';
        img.onerror = () => {
            img.src = DEFAULT_AVATAR;
        };
        stack.appendChild(img);
    });

    if (users.length > visible.length) {
        const more = document.createElement('span');
        more.className = 'avatar-more';
        more.textContent = `+${users.length - visible.length}`;
        stack.appendChild(more);
    }

    return stack;
}

function getOverlayNodes() {
    const overlay = document.getElementById('overlay');
    const content = overlay?.querySelector('.overlay-content');
    return { overlay, content };
}

function closeSelectorOverlay() {
    const { overlay, content } = getOverlayNodes();
    if (!overlay || !content) return;

    if (!selectorState.isOpen) return;

    selectorState.isOpen = false;
    selectorState.mode = null;
    selectorState.targetCard = null;
    selectorState.candidates = [];
    selectorState.selected = null;

    content.innerHTML = '';
    overlay.style.display = 'none';
    overlay.onclick = null;
}

function selectCandidate(index) {
    selectorState.selected = selectorState.candidates[index] || null;

    const buttons = document.querySelectorAll('.trade-selector-card');
    buttons.forEach((button, buttonIndex) => {
        if (buttonIndex === index) {
            button.classList.add('selected');
        } else {
            button.classList.remove('selected');
        }
    });

    const confirmButton = document.getElementById('trade-selector-confirm');
    if (confirmButton) {
        confirmButton.disabled = !selectorState.selected;
    }
}

function renderSelectorCandidates() {
    const grid = document.getElementById('trade-selector-grid');
    if (!grid) return;

    grid.innerHTML = '';
    selectorState.candidates.forEach((candidate, index) => {
        const cardButton = document.createElement('button');
        cardButton.type = 'button';
        cardButton.className = 'trade-selector-card';
        cardButton.innerHTML = `
            <div class="trade-selector-media">
                <img src="${candidate.card_image || PLACEHOLDER_CARD}" alt="${candidate.card_name || 'Carta'}">
            </div>
            <div class="trade-selector-info">
                <h4>${candidate.card_name || 'Carta'}</h4>
                <p class="trade-card-rarity ${rarityClass(candidate.card_rarity)}">${candidate.card_rarity || 'comun'}</p>
                <p>${candidate.server_name || 'Servidor'} · x${candidate.available_count || 1}</p>
            </div>
        `;

        cardButton.addEventListener('click', () => {
            selectCandidate(index);
        });

        grid.appendChild(cardButton);
    });
}

async function confirmSelector() {
    const confirmButton = document.getElementById('trade-selector-confirm');
    if (!selectorState.selected || !confirmButton) {
        showFeedback('Selecciona una carta para continuar.', 'error');
        return;
    }

    const previousText = confirmButton.textContent;
    confirmButton.textContent = 'Procesando...';
    confirmButton.disabled = true;

    try {
        if (selectorState.mode === 'publish') {
            await requestJson('/api/tradeo/listings', 'POST', {
                card_id: selectorState.selected.card_id,
                server_id: selectorState.selected.server_id,
            });
            showFeedback('Carta publicada correctamente.');
        } else if (selectorState.mode === 'offer' && selectorState.targetCard) {
            await requestJson('/api/tradeo/offers', 'POST', {
                target_card_id: selectorState.targetCard.card_id,
                offered_card_id: selectorState.selected.card_id,
                offered_server_id: selectorState.selected.server_id,
            });
            showFeedback('Oferta enviada. Si el usuario acepta, recibiras un DM del bot.');
        }

        closeSelectorOverlay();
        await refreshAll();
    } catch (error) {
        showFeedback(error.message, 'error');
    } finally {
        confirmButton.textContent = previousText;
        confirmButton.disabled = false;
    }
}

function openSelectorOverlay({ mode, title, subtitle, candidates, targetCard = null }) {
    const { overlay, content } = getOverlayNodes();
    if (!overlay || !content) {
        showFeedback('No se pudo abrir el selector de cartas.', 'error');
        return;
    }

    selectorState.isOpen = true;
    selectorState.mode = mode;
    selectorState.targetCard = targetCard;
    selectorState.candidates = candidates;
    selectorState.selected = null;

    const targetBlock = targetCard
        ? `
            <div class="trade-selector-target">
                <img src="${targetCard.card_image || PLACEHOLDER_CARD}" alt="${targetCard.card_name || 'Carta'}" id="trade-selector-target-image">
                <div>
                    <strong>${targetCard.card_name || 'Carta'}</strong>
                    <p class="trade-card-rarity ${rarityClass(targetCard.card_rarity)}">${targetCard.card_rarity || 'comun'}</p>
                    <p>El sistema aplicara tu propuesta a la primera publicación disponible.</p>
                </div>
            </div>
        `
        : '';

    content.innerHTML = `
        <span class="close-btn" id="trade-selector-close">&times;</span>
        <div class="trade-selector-header">
            <h2>${title}</h2>
            <p>${subtitle}</p>
        </div>
        ${targetBlock}
        <div id="trade-selector-grid" class="trade-selector-grid"></div>
        <div class="trade-selector-actions">
            <button id="trade-selector-confirm" class="btn-base btn-primary" disabled>Confirmar</button>
            <button id="trade-selector-cancel" class="btn-base btn-ghost">Cancelar</button>
        </div>
    `;

    overlay.style.display = 'block';
    renderSelectorCandidates();

    document.getElementById('trade-selector-close')?.addEventListener('click', closeSelectorOverlay);
    document.getElementById('trade-selector-cancel')?.addEventListener('click', closeSelectorOverlay);
    document.getElementById('trade-selector-confirm')?.addEventListener('click', confirmSelector);

    overlay.onclick = (event) => {
        if (selectorState.isOpen && event.target === overlay) {
            closeSelectorOverlay();
        }
    };
}

function openPublishSelector() {
    if (!state.myCards.length) {
        showFeedback('No tienes cartas disponibles para publicar.', 'error');
        return;
    }

    openSelectorOverlay({
        mode: 'publish',
        title: 'Publicar carta en marketplace',
        subtitle: 'Selecciona visualmente la carta que quieres subir (maximo 6 activas).',
        candidates: state.myCards,
    });
}

function openOfferSelector(targetCard) {
    const compatibleCards = state.myCards.filter((myCard) =>
        rarityCompatible(targetCard.card_rarity, myCard.card_rarity)
    );

    if (!compatibleCards.length) {
        showFeedback('No tienes cartas compatibles para esta oferta.', 'error');
        return;
    }

    openSelectorOverlay({
        mode: 'offer',
        title: 'Crear propuesta de intercambio',
        subtitle: 'Selecciona tu carta para ofertar en este trade.',
        candidates: compatibleCards,
        targetCard,
    });
}

function renderMarket() {
    const marketContainer = document.getElementById('market-content');
    const totalContainer = document.getElementById('market-total');

    if (!marketContainer || !totalContainer) return;

    totalContainer.textContent = `${state.marketTotal} publicaciones`;
    marketContainer.innerHTML = '';

    if (!state.marketCards.length) {
        const empty = document.createElement('div');
        empty.className = 'empty-state';
        empty.textContent = 'No hay cartas publicadas en este momento.';
        marketContainer.appendChild(empty);
        return;
    }

    state.marketCards.forEach((card) => {
        const cardNode = document.createElement('article');
        cardNode.className = 'trade-card';

        const media = document.createElement('div');
        media.className = 'trade-card-media';
        const img = document.createElement('img');
        img.src = card.card_image || PLACEHOLDER_CARD;
        img.alt = card.card_name || 'Carta';
        img.addEventListener('click', (event) => {
            openCardOverlay(card, event);
        });
        media.appendChild(img);

        const body = document.createElement('div');
        body.className = 'trade-card-body';

        const title = document.createElement('h3');
        title.className = 'trade-card-title';
        title.textContent = card.card_name || 'Carta';

        const rarity = document.createElement('p');
        rarity.className = `trade-card-rarity ${rarityClass(card.card_rarity)}`;
        rarity.textContent = card.card_rarity || 'comun';

        const by = document.createElement('p');
        by.className = 'trade-card-server';
        const uploaders = card.uploaded_by || [];
        const firstUploader = uploaders[0]?.username || 'Usuario';
        const extraUploaders = Math.max(0, uploaders.length - 1);
        if (extraUploaders > 0) {
            by.textContent = `Subida por ${firstUploader} y ${extraUploaders} mas · ${card.listing_count || 1} publicada(s)`;
        } else {
            by.textContent = `Subida por ${firstUploader} · ${card.listing_count || 1} publicada(s)`;
        }

        const footer = document.createElement('div');
        footer.className = 'trade-card-footer';

        const avatars = createAvatarStack(card.uploaded_by || []);
        const action = document.createElement('button');
        action.className = 'btn-base btn-primary';
        action.textContent = 'Ofertar';
        action.addEventListener('click', () => {
            openOfferSelector(card);
        });

        footer.appendChild(avatars);
        footer.appendChild(action);

        body.appendChild(title);
        body.appendChild(rarity);
        body.appendChild(by);
        body.appendChild(footer);

        cardNode.appendChild(media);
        cardNode.appendChild(body);
        marketContainer.appendChild(cardNode);
    });
}

function renderMyListings() {
    const container = document.getElementById('my-listings-content');
    if (!container) return;

    container.innerHTML = '';

    if (!state.myListings.length) {
        const empty = document.createElement('div');
        empty.className = 'empty-state';
        empty.textContent = 'No tienes cartas publicadas.';
        container.appendChild(empty);
        return;
    }

    state.myListings.forEach((listing) => {
        const cardNode = document.createElement('article');
        cardNode.className = 'trade-card';

        const media = document.createElement('div');
        media.className = 'trade-card-media';
        const img = document.createElement('img');
        img.src = listing.card_image || PLACEHOLDER_CARD;
        img.alt = listing.card_name || 'Carta';
        img.addEventListener('click', (event) => {
            openCardOverlay(listing, event);
        });
        media.appendChild(img);

        const body = document.createElement('div');
        body.className = 'trade-card-body';

        const title = document.createElement('h3');
        title.className = 'trade-card-title';
        title.textContent = listing.card_name || 'Carta';

        const rarity = document.createElement('p');
        rarity.className = `trade-card-rarity ${rarityClass(listing.card_rarity)}`;
        rarity.textContent = listing.card_rarity || 'comun';

        const server = document.createElement('p');
        server.className = 'trade-card-server';
        server.textContent = `${listing.source_server_name || 'Servidor'} · ${listing.pending_offers || 0} pendiente(s)`;

        const footer = document.createElement('div');
        footer.className = 'trade-card-footer';

        const withdrawBtn = document.createElement('button');
        withdrawBtn.className = 'btn-base btn-danger';
        withdrawBtn.textContent = 'Retirar';
        withdrawBtn.addEventListener('click', async () => {
            try {
                await requestJson(`/api/tradeo/listings/${listing.id}`, 'DELETE');
                showFeedback('Carta retirada del marketplace.');
                await refreshAll();
            } catch (error) {
                showFeedback(error.message, 'error');
            }
        });

        footer.appendChild(withdrawBtn);

        body.appendChild(title);
        body.appendChild(rarity);
        body.appendChild(server);
        body.appendChild(footer);

        cardNode.appendChild(media);
        cardNode.appendChild(body);
        container.appendChild(cardNode);
    });
}

function renderPendingQueue() {
    const pendingCount = document.getElementById('pending-count');
    const content = document.getElementById('pending-content');
    if (!pendingCount || !content) return;

    pendingCount.textContent = String(state.queue.length);
    content.innerHTML = '';

    if (!state.queue.length) {
        const empty = document.createElement('div');
        empty.className = 'empty-state';
        empty.textContent = 'No tienes solicitudes pendientes ahora mismo.';
        content.appendChild(empty);
        return;
    }

    const first = state.queue[0];

    const queueCard = document.createElement('div');
    queueCard.className = 'queue-card';

    const users = document.createElement('div');
    users.className = 'queue-users';

    const avatar = document.createElement('img');
    avatar.src = first.offerer?.pfp || DEFAULT_AVATAR;
    avatar.alt = first.offerer?.username || 'Usuario';
    avatar.onerror = () => {
        avatar.src = DEFAULT_AVATAR;
    };

    const text = document.createElement('span');
    text.textContent = `${first.offerer?.username || 'Usuario'} te propone un intercambio`;

    users.appendChild(avatar);
    users.appendChild(text);

    const cards = document.createElement('div');
    cards.className = 'queue-cards';

    const target = document.createElement('div');
    target.className = 'queue-mini';
    target.innerHTML = `
        <img src="${first.target_card?.image || PLACEHOLDER_CARD}" alt="${first.target_card?.name || 'Carta'}">
        <h4>Tu carta</h4>
        <p>${first.target_card?.name || 'Carta'} · ${first.target_card?.rarity || 'comun'}</p>
        <p>${first.target_card?.server_name || 'Servidor'}</p>
    `;

    const offered = document.createElement('div');
    offered.className = 'queue-mini';
    offered.innerHTML = `
        <img src="${first.offer_card?.image || PLACEHOLDER_CARD}" alt="${first.offer_card?.name || 'Carta'}">
        <h4>Te ofrece</h4>
        <p>${first.offer_card?.name || 'Carta'} · ${first.offer_card?.rarity || 'comun'}</p>
        <p>${first.offer_card?.server_name || 'Servidor'}</p>
    `;

    target.querySelector('img')?.addEventListener('click', (event) => {
        openCardOverlay(first.target_card, event);
    });
    offered.querySelector('img')?.addEventListener('click', (event) => {
        openCardOverlay(first.offer_card, event);
    });

    cards.appendChild(target);
    cards.appendChild(offered);

    const actions = document.createElement('div');
    actions.className = 'queue-actions';

    const acceptBtn = document.createElement('button');
    acceptBtn.className = 'btn-base btn-primary';
    acceptBtn.textContent = 'Aceptar';
    acceptBtn.addEventListener('click', async () => {
        await resolveOffer(first.offer_id, 'accept');
    });

    const rejectBtn = document.createElement('button');
    rejectBtn.className = 'btn-base btn-danger';
    rejectBtn.textContent = 'Rechazar';
    rejectBtn.addEventListener('click', async () => {
        await resolveOffer(first.offer_id, 'reject');
    });

    actions.appendChild(acceptBtn);
    actions.appendChild(rejectBtn);

    queueCard.appendChild(users);
    queueCard.appendChild(cards);

    if (state.queue.length > 1) {
        const hint = document.createElement('p');
        hint.className = 'panel-sub';
        hint.textContent = `Hay ${state.queue.length - 1} propuesta(s) mas en cola.`;
        queueCard.appendChild(hint);
    }

    queueCard.appendChild(actions);

    content.appendChild(queueCard);
}

function renderAll() {
    renderMarket();
    renderMyListings();
    renderPendingQueue();
}

async function refreshAll() {
    const [market, myListings, myCards, queue] = await Promise.all([
        requestJson('/api/tradeo/market'),
        requestJson('/api/tradeo/my-listings'),
        requestJson('/api/tradeo/my-cards'),
        requestJson('/api/tradeo/pending-queue'),
    ]);

    state.marketCards = market.market_cards || [];
    state.marketTotal = market.total_listings || 0;
    state.myListings = myListings.listings || [];
    state.myCards = myCards.cards || [];
    state.queue = queue.queue || [];

    renderAll();
}

async function resolveOffer(offerId, action) {
    try {
        const endpoint = action === 'accept'
            ? `/api/tradeo/offers/${offerId}/accept`
            : `/api/tradeo/offers/${offerId}/reject`;

        await requestJson(endpoint, 'POST');
        if (action === 'accept') {
            showFeedback('Trade aceptado y completado correctamente.');
        } else {
            showFeedback('Trade rechazado correctamente.');
        }

        await refreshAll();
    } catch (error) {
        showFeedback(error.message, 'error');
    }
}

function bindEvents() {
    const publishBtn = document.getElementById('btn-publicar');
    const refreshBtn = document.getElementById('btn-refresh');

    publishBtn?.addEventListener('click', openPublishSelector);
    refreshBtn?.addEventListener('click', async () => {
        try {
            await refreshAll();
            showFeedback('Marketplace actualizado.');
        } catch (error) {
            showFeedback(error.message, 'error');
        }
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    bindEvents();

    try {
        await refreshAll();
    } catch (error) {
        showFeedback(error.message, 'error');
    }
});

const DEFAULT_NAV_FEATURES = {
    tradeo: {
        enabled: true,
        text: 'NUEVO',
        tone: 'new',
    },
};

function createNavFeatureBadge(featureConfig) {
    const badge = document.createElement('span');
    badge.className = 'header-nav-badge';

    const tone = String(featureConfig?.tone || 'new').trim().toLowerCase();
    if (tone) {
        badge.classList.add(`header-nav-badge-${tone}`);
    }

    badge.textContent = String(featureConfig?.text || 'NUEVO');
    return badge;
}

function clearNavFeature(linkElement) {
    if (!linkElement) return;

    linkElement.classList.remove('header-nav-featured');
    [...linkElement.classList]
        .filter((className) => className.startsWith('header-nav-featured-'))
        .forEach((className) => linkElement.classList.remove(className));

    const currentBadge = linkElement.querySelector('.header-nav-badge');
    if (currentBadge) {
        currentBadge.remove();
    }
}

function applyHeaderNavFeatures(navMenu, featureConfigMap = {}) {
    if (!navMenu) return;

    Object.entries(featureConfigMap).forEach(([navKey, featureConfig]) => {
        const link = navMenu.querySelector(`a[data-nav-key="${navKey}"]`);
        if (!link) return;

        clearNavFeature(link);

        if (!featureConfig || featureConfig.enabled === false) {
            return;
        }

        const tone = String(featureConfig.tone || 'new').trim().toLowerCase();

        link.classList.add('header-nav-featured');
        if (tone) {
            link.classList.add(`header-nav-featured-${tone}`);
        }
        link.appendChild(createNavFeatureBadge(featureConfig));
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const navToggle = document.querySelector('.nav-toggle');
    const navMenu = document.querySelector('nav ul');
    const overlay = document.createElement('div');
    overlay.className = 'nav-overlay';

    function closeMenu() {
        if (!navMenu) return;

        navMenu.classList.remove('active');
        document.body.classList.remove('menu-open');
        if (document.body.contains(overlay)) {
            overlay.remove();
        }
    }

    navToggle?.addEventListener('click', function() {
        if (!navMenu) return;

        navMenu.classList.toggle('active');
        document.body.classList.toggle('menu-open');
        if (navMenu.classList.contains('active')) {
            document.body.appendChild(overlay);
        } else {
            closeMenu();
        }
    });

    overlay.addEventListener('click', closeMenu);

    // Cerrar el menú cuando se selecciona un elemento
    navMenu?.addEventListener('click', function(e) {
        if (e.target.closest('a')) {
            closeMenu();
        }
    });

    // Usar datos inlineados desde el servidor (sin fetch extra)
    const userData = globalThis.__USER__ || {};

    const userFeatures = globalThis.__HEADER_NAV_FEATURES__ || {};
    const finalFeatureConfig = {
        ...DEFAULT_NAV_FEATURES,
        ...userFeatures,
    };
    applyHeaderNavFeatures(navMenu, finalFeatureConfig);

    // Exponer API para activar/desactivar badges desde cualquier pagina.
    globalThis.updateHeaderNavFeatures = function updateHeaderNavFeatures(nextConfig = {}) {
        const mergedConfig = {
            ...DEFAULT_NAV_FEATURES,
            ...nextConfig,
        };
        applyHeaderNavFeatures(navMenu, mergedConfig);
    };

    if (userData.isAdmin) {
        const adminPanel = document.getElementById('admin-panel');
        if (adminPanel) adminPanel.style.display = 'flex';
    }

    const profileIcon = document.getElementById('profile-icon');
    if (profileIcon) {
        if (userData.pfp && userData.pfp !== 'None') {
            profileIcon.src = userData.pfp;
        } else {
            profileIcon.src = 'https://fonts.gstatic.com/s/i/materialicons/person/v6/24px.svg';
        }
        profileIcon.style.width = '48px';
        profileIcon.style.height = '48px';
    }
});
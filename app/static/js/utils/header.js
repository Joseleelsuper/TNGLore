document.addEventListener('DOMContentLoaded', () => {
    const navToggle = document.querySelector('.nav-toggle');
    const navMenu = document.querySelector('nav ul');
    const overlay = document.createElement('div');
    overlay.className = 'nav-overlay';

    function closeMenu() {
        navMenu.classList.remove('active');
        document.body.classList.remove('menu-open');
        if (document.body.contains(overlay)) {
            document.body.removeChild(overlay);
        }
    }

    navToggle.addEventListener('click', function() {
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
    navMenu.addEventListener('click', function(e) {
        if (e.target.tagName === 'A') {
            closeMenu();
        }
    });

    // Usar datos inlineados desde el servidor (sin fetch extra)
    const userData = window.__USER__ || {};

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
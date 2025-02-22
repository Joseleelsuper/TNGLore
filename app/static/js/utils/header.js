document.addEventListener('DOMContentLoaded', () => {
    const navToggle = document.querySelector('.nav-toggle');
    const navMenu = document.querySelector('nav ul');
    const overlay = document.createElement('div');
    overlay.className = 'overlay';

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

    // Mostrar el panel de administrador si el usuario es administrador
    fetch('/api/user')
        .then(response => response.json())
        .then(data => {
            if (data.is_admin) {
                document.getElementById('admin-panel').style.display = 'flex';
            }
            // Actualizar imagen de perfil
            const profileIcon = document.getElementById('profile-icon');
            if (data.pfp && data.pfp !== 'None') {
                profileIcon.src = data.pfp;
            } else {
                // Ruta al ícono por defecto de Google Material Icons
                profileIcon.src = 'https://fonts.gstatic.com/s/i/materialicons/person/v6/24px.svg';
            }
            profileIcon.style.width = '48px';
            profileIcon.style.height = '48px';
        })
        .catch(error => console.error('Error al obtener información del usuario:', error));
});
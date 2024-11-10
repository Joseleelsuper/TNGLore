document.addEventListener('DOMContentLoaded', () => {
    const navToggle = document.querySelector('.nav-toggle');
    const navMenu = document.querySelector('nav ul');
    const overlay = document.createElement('div');
    overlay.className = 'overlay';

    navToggle.addEventListener('click', function() {
        navMenu.classList.toggle('active');
        if (navMenu.classList.contains('active')) {
            document.body.appendChild(overlay);
        } else {
            document.body.removeChild(overlay);
        }
    });

    overlay.addEventListener('click', function() {
        navMenu.classList.remove('active');
        document.body.removeChild(overlay);
    });

    // Mostrar el panel de administrador si el usuario es administrador
    fetch('/api/user')
        .then(response => response.json())
        .then(data => {
            if (data.is_admin) {
                document.getElementById('admin-panel').style.display = 'block';
            }
        })
        .catch(error => console.error('Error al obtener información del usuario:', error));
});
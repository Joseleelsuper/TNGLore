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
});
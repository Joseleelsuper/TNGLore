// perfil.js

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('perfil-form');
    form.addEventListener('submit', function(event) {
        const password = document.getElementById('password').value;
        const confirmPassword = document.getElementById('confirm_password').value;

        if (password && password !== confirmPassword) {
            event.preventDefault();
            alert('Las contraseñas no coinciden. Por favor, verifícalas.');
        }
    });
});
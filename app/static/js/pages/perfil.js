document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('perfil-form');
    const logoutBtn = document.getElementById('logout-btn');
    const deleteAccountBtn = document.getElementById('delete-account-btn');
    const deleteAccountModal = document.getElementById('delete-account-modal');
    const deleteAccountForm = document.getElementById('delete-account-form');
    const cancelDeleteBtn = document.getElementById('cancel-delete');

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
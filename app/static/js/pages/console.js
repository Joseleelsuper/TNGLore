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
    logs.forEach(log => {
        // Ignorar logs sin usuario registrado
        if (!log.username) return;
        const mensaje = document.createElement('p');
        mensaje.innerHTML = `
            <span class="log-date">${new Date(log.date).toLocaleString('es-ES')}</span>
            &nbsp;¡<span class="log-username">${log.username}</span> ha conseguido un cofre de rareza 
            <span class="log-rareza ${log.chest.rareza.toLowerCase()}">${log.chest.rareza}</span>!
        `;
        container.appendChild(mensaje);
    });
}

async function updateChestLogs() {
    const logs = await fetchChestLogs();
    renderChestLogs(logs);
}

// Actualizar cada 60 segundos
updateChestLogs();
setInterval(updateChestLogs, 60000);

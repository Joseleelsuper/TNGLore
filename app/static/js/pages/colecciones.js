import {
    cargarColecciones,
    cargarCartas,
    crearElementoColeccion,
    crearElementoCarta,
    abrirOverlayColeccion,
    abrirOverlayCarta,
    cerrarOverlay
} from '../utils/shared.js';

document.addEventListener('DOMContentLoaded', initializeColeccionesPage);

function initializeColeccionesPage() {
    loadInitialData().then(() => {
        setupOverlay();
    });
}

async function loadInitialData() {
    try {
        const colecciones = await cargarColecciones();
        const cartas = await cargarCartas();
        
        console.log('Colecciones cargadas:', colecciones);
        console.log('Cartas cargadas:', cartas);

        const contenedorColecciones = document.getElementById('contenedor-colecciones');
        contenedorColecciones.innerHTML = ''; // Limpiar el contenedor
        
        colecciones.forEach(coleccion => {
            const elementoColeccion = crearElementoColeccion(coleccion);
            elementoColeccion.onclick = () => window.abrirOverlayColeccion(coleccion);
            
            // Corregir la comparación de IDs
            const cartasColeccion = cartas.filter(carta => 
                carta.coleccion && 
                (carta.coleccion._id === coleccion._id || carta.coleccion.id === coleccion._id)
            );
            
            const contenedorCartas = document.createElement('div');
            contenedorCartas.className = 'contenedor-cartas';
            
            if (cartasColeccion.length > 0) {
                cartasColeccion.forEach(carta => {
                    const elementoCarta = crearElementoCarta(carta);
                    elementoCarta.onclick = () => window.abrirOverlayCarta(carta);
                    contenedorCartas.appendChild(elementoCarta);
                });
            } else {
                contenedorCartas.innerHTML = '<p>No hay cartas en esta colección.</p>';
            }
            
            const seccionColeccion = document.createElement('div');
            seccionColeccion.className = 'seccion-coleccion';
            seccionColeccion.appendChild(elementoColeccion);
            seccionColeccion.appendChild(contenedorCartas);
            
            contenedorColecciones.appendChild(seccionColeccion);
        });
    } catch (error) {
        console.error('Error al cargar datos:', error);
        document.getElementById('contenedor-colecciones').innerHTML = 
            '<p>Error al cargar las colecciones. Por favor, recarga la página.</p>';
    }
}

function setupOverlay() {
    const overlay = document.getElementById('overlay');
    const closeBtn = document.querySelector('.close-btn');
    if (closeBtn) {
        closeBtn.onclick = cerrarOverlay;
    }
    window.onclick = (event) => {
        if (event.target == overlay) {
            cerrarOverlay();
        }
    };
}
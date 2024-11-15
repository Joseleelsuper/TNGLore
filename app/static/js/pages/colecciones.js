import {
    cargarColecciones,
    cargarCartas,
    crearElementoColeccion,
    crearElementoCarta,
    abrirOverlayColeccion,
    abrirOverlayCarta
} from './shared.js';

document.addEventListener('DOMContentLoaded', inicializarPaginaColecciones);

async function inicializarPaginaColecciones() {
    const colecciones = await cargarColecciones();
    const cartas = await cargarCartas();
    
    const contenedorColecciones = document.getElementById('contenedor-colecciones');
    
    colecciones.forEach(coleccion => {
        const elementoColeccion = crearElementoColeccion(coleccion, abrirOverlayColeccion);
        const cartasColeccion = cartas.filter(carta => carta.coleccion.id === coleccion._id);
        
        const contenedorCartas = document.createElement('div');
        contenedorCartas.className = 'contenedor-cartas';
        cartasColeccion.forEach(carta => {
            const elementoCarta = crearElementoCarta(carta, abrirOverlayCarta);
            contenedorCartas.appendChild(elementoCarta);
        });
        
        const seccionColeccion = document.createElement('div');
        seccionColeccion.className = 'seccion-coleccion';
        seccionColeccion.appendChild(elementoColeccion);
        seccionColeccion.appendChild(contenedorCartas);
        
        contenedorColecciones.appendChild(seccionColeccion);
    });
}
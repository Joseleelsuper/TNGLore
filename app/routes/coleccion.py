from flask import Blueprint, render_template, jsonify  # Se añade jsonify
from flask_login import login_required, current_user

from app.utils.images import get_images

collections_bp = Blueprint("collections", __name__)

# Rutas para páginas HTML
@collections_bp.route("/mi-coleccion")
@login_required
def my_collections():
    return render_template("pages/miColeccion.html", user=current_user, images=get_images())

@collections_bp.route("/colecciones")
@login_required
def collections():
    return render_template("pages/colecciones.html", user=current_user, images=get_images())

# Endpoint API para obtener datos de usuario (guilds y coleccionables)
@collections_bp.route("/api/coleccion/usuario")
@login_required
def api_user_collectibles():
    # Se asume que current_user.guilds almacena los datos extraídos de MongoDB.
    return jsonify({'guilds': current_user.guilds})
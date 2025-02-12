from flask import Blueprint, render_template  # Se agrega jsonify y request
from flask_login import login_required, current_user

from app.utils.images import get_images

collections_bp = Blueprint("collections", __name__)

# Rutas para las páginas HTML
@collections_bp.route("/mi-coleccion")
@login_required
def my_collections():
    return render_template("pages/miColeccion.html", user=current_user, images=get_images())

@collections_bp.route("/colecciones")
@login_required
def collections():
    return render_template("pages/colecciones.html", user=current_user, images=get_images())

# Los endpoints API ahora están centralizados en un módulo común (por ejemplo, app/routes/api_common.py)
# para ser compartidos entre los distintos blueprints.
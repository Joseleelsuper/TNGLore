from flask import Blueprint, render_template
from flask_login import login_required, current_user

from app.utils.images import get_images

collections_bp = Blueprint("collections", __name__)


@collections_bp.route("/mi-coleccion")
@login_required
def my_collections():
    return render_template("pages/miColeccion.html", user=current_user, images=get_images())

@collections_bp.route("/colecciones")
@login_required
def collections():
    return render_template("pages/colecciones.html", user=current_user, images=get_images())
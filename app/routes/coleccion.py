from flask import Blueprint, render_template
from flask_login import login_required, current_user

from app.utils.images import get_images

colections_bp = Blueprint("colections", __name__)


@colections_bp.route("/mi-coleccion")
@login_required
def my_colections():
    return render_template("pages/mi-coleccion.html", user=current_user, images=get_images())

@colections_bp.route("/colecciones")
@login_required
def colections():
    return render_template("pages/colecciones.html", user=current_user, images=get_images())
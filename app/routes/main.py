from flask import Blueprint, render_template
from flask_login import login_required, current_user

from app.utils.images import get_images

main_bp = Blueprint("main", __name__)


@main_bp.route("/inicio")
@login_required
def inicio():
    return render_template("pages/inicio.html", user=current_user, images=get_images())

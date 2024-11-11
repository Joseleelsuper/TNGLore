from flask import Blueprint, render_template
from flask_login import login_required, current_user

from app.utils.images import get_images

perfil_bp = Blueprint("perfil", __name__)


@perfil_bp.route("/perfil")
@login_required
def perfil():
    return render_template("pages/perfil.html", user=current_user, images=get_images())
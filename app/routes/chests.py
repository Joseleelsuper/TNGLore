from flask import Blueprint, render_template
from flask_login import login_required, current_user

from app.utils.images import get_images

chest_bp = Blueprint("chests", __name__)


@chest_bp.route("/cofres")
@login_required
def chests():
    return render_template("pages/cofres.html", user=current_user, images=get_images())

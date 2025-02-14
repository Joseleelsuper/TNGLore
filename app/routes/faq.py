from flask import Blueprint, render_template
from flask_login import current_user

from app.utils.images import get_images

faq_bp = Blueprint("faq", __name__)


@faq_bp.route("/faq")
def inicio():
    return render_template("pages/faq.html", user=current_user, images=get_images())

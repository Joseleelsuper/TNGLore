from flask import Blueprint, render_template
from flask_login import login_required, current_user

from app.utils.adminRequired import admin_required
from app.utils.images import get_images

admin_bp = Blueprint("admin", __name__)

@admin_bp.route("/admin")
@login_required
@admin_required
def admin_panel():
    return render_template("pages/admin.html", user=current_user, images=get_images())
from flask import Blueprint, render_template
from flask_login import login_required

from app.utils.images import get_images

main_bp = Blueprint('main', __name__)

@main_bp.route('/inicio')
@login_required
def inicio():
    images = get_images()
    return render_template('pages/inicio.html', images=images)
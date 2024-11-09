from flask import Blueprint, render_template
from flask_login import login_required

main_bp = Blueprint('main', __name__)

@main_bp.route('/inicio')
@login_required
def inicio():
    return render_template('pages/inicio.html')
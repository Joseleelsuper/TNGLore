from functools import wraps

from flask import flash, redirect, url_for
from flask_login import current_user


def admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not current_user.is_authenticated or not current_user.is_admin:
            flash('Acceso denegado. Debes ser administrador para ver esta página.', 'error')
            return redirect(url_for('main.inicio'))
        return f(*args, **kwargs)
    return decorated_function
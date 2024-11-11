# perfil.py

from bson.objectid import ObjectId
from flask import Blueprint, render_template, request, redirect, url_for, flash
from flask_login import login_required, current_user
from app import bcrypt, mongo
from app.utils.images import get_images

perfil_bp = Blueprint('perfil', __name__)

@perfil_bp.route('/perfil', methods=['GET', 'POST'])
@login_required
def perfil():
    if request.method == 'POST':
        username = request.form.get('username').strip()
        email = request.form.get('email').strip()
        password = request.form.get('password')
        confirm_password = request.form.get('confirm_password')

        updates = {}

        if username != current_user.username:
            existing_user = mongo.users.find_one({'username': username})
            if existing_user:
                flash('El nombre de usuario ya está en uso.', 'error')
                return redirect(url_for('perfil.perfil'))
            updates['username'] = username
            current_user.username = username  # Actualizar current_user

        if email != current_user.email:
            existing_email = mongo.users.find_one({'email': email})
            if existing_email:
                flash('El correo electrónico ya está en uso.', 'error')
                return redirect(url_for('perfil.perfil'))
            updates['email'] = email
            current_user.email = email  # Actualizar current_user

        if password:
            if password != confirm_password:
                flash('Las contraseñas no coinciden.', 'error')
                return redirect(url_for('perfil.perfil'))
            hashed_password = bcrypt.generate_password_hash(password).decode('utf-8')
            updates['password'] = hashed_password

        if updates:
            mongo.users.update_one({'_id': ObjectId(current_user._id)}, {'$set': updates})
            flash('Perfil actualizado correctamente.', 'success')
            print(f'Perfil actualizado: {updates}')
            print(f'current_user: {current_user.discord_id}')
            print(f'current_user: {current_user._id}')
        else:
            flash('No hay cambios para actualizar.', 'info')

        return redirect(url_for('perfil.perfil'))

    return render_template('pages/perfil.html', current_user=current_user, images=get_images())
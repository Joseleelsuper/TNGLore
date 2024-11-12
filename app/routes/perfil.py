# perfil.py

from bson.objectid import ObjectId
from flask import Blueprint, jsonify, render_template, request, redirect, url_for, flash
from flask_login import login_required, current_user, logout_user
from app import bcrypt, mongo
from app.utils.images import get_images
from app.utils.validation_utils import validate_user_input

perfil_bp = Blueprint('perfil', __name__)

@perfil_bp.route('/perfil', methods=['GET', 'POST'])
@login_required
def perfil():
    if request.method == 'POST':
        username = request.form.get('username')
        email = request.form.get('email')
        password = request.form.get('password')
        confirm_password = request.form.get('confirmPassword')
        
        is_valid, error_message = validate_user_input(username, email, password)
        if not is_valid:
            flash(error_message, 'error')
            return redirect(url_for('perfil.perfil'))
        
        updates = {}
        
        if username and username != current_user.username:
            existing_user = mongo.users.find_one({'username': username})
            if existing_user:
                flash('Este nombre de usuario ya está en uso.', 'error')
                return redirect(url_for('perfil.perfil'))
            updates['username'] = username
        
        if email and email != current_user.email:
            existing_user = mongo.users.find_one({'email': email})
            if existing_user:
                flash('Este correo electrónico ya está en uso.', 'error')
                return redirect(url_for('perfil.perfil'))
            updates['email'] = email
        
        if password:
            if password != confirm_password:
                flash('Las contraseñas no coinciden.', 'error')
                return redirect(url_for('perfil.perfil'))
            hashed_password = bcrypt.generate_password_hash(password).decode('utf-8')
            updates['password'] = hashed_password
        
        if updates:
            result = mongo.users.update_one(
                {'_id': ObjectId(current_user._id)},
                {'$set': updates}
            )
            
            if result.modified_count > 0:
                flash('Perfil actualizado correctamente.', 'success')
            else:
                flash('No se pudo actualizar el perfil. Por favor, inténtalo de nuevo.', 'error')
        else:
            flash('No hay cambios para actualizar.', 'info')
        
        return redirect(url_for('perfil.perfil'))
    
    return render_template('pages/perfil.html', current_user=current_user, images=get_images())

@perfil_bp.route('/perfil/delete-account', methods=['POST'])
@login_required
def delete_account():
    data = request.get_json()
    password = data.get('password')

    if not password:
        return jsonify({'message': 'Se requiere la contraseña.'}), 400

    # Verificar si la contraseña es correcta
    if not current_user.check_password(password):
        return jsonify({'message': 'Contraseña incorrecta.'}), 401

    # Eliminar el usuario de la base de datos
    mongo.users.delete_one({'_id': ObjectId(current_user._id)})

    # Cerrar sesión del usuario
    logout_user()

    return jsonify({'message': 'Cuenta eliminada correctamente.'}), 200
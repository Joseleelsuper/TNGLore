import os
from dotenv import load_dotenv
import requests
# perfil.py

from bson.objectid import ObjectId
from flask import Blueprint, jsonify, render_template, request, redirect, url_for, flash
from flask_login import login_required, current_user, logout_user
from app import bcrypt, mongo
from app.utils.images import get_images
from app.utils.validation_utils import validate_user_input

load_dotenv()  # Cargar variables de entorno

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
            flash(error_message or "Ha ocurrido un error de validación.", 'error')
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
    
    # --- Inicio de modificaciones en GET ---
    # Llamada a la API externa para obtener servidores
    api_secret = os.getenv("API_SECRET")
    servers_api_url = "https://207.244.199.172:7007/getBotServers"
    headers = { "X-API-KEY": api_secret }
    try:
        response = requests.get(servers_api_url, headers=headers, verify=False)
        response.raise_for_status()
        servers_data = response.json()  # Se espera una lista de dicts
    except Exception as e:
        servers_data = []
        print("Error al conectar con la API:", e)
    
    # Combinar datos de la API con la cantidad de cartas del usuario por servidor,
    # solo se incluyen servidores que están presentes en current_user.guilds.
    top_servers = []
    for server in servers_data:
        guild = next((g for g in current_user.guilds if g.get('id') == server.get('id')), None)
        if not guild:
            continue   # Omitir servidores sin coincidencia en el usuario
        count = len(guild.get('coleccionables', []))
        top_servers.append({
            "id": server.get("id"),
            "name": server.get("name"),
            "icon": server.get("icon"),
            "coleccionables_count": count
        })
    # Ordenar los servidores de mayor a menor cantidad de cartas
    top_servers.sort(key=lambda s: s["coleccionables_count"], reverse=True)
    # --- Fin de modificaciones en GET ---
    
    return render_template('pages/perfil.html', current_user=current_user, images=get_images(), top_servers=top_servers)

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
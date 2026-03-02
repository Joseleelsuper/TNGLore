from bson.objectid import ObjectId
from flask import Blueprint, jsonify, render_template, request, redirect, url_for, flash
from flask_login import login_required, current_user, logout_user
from app import bcrypt, mongo
from app.utils.images import get_images
from app.utils.validation_utils import validate_user_input
from app.models.user import invalidate_user_cache

import logging
import os
import requests

logger = logging.getLogger(__name__)

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
                invalidate_user_cache(str(current_user._id))
                flash('Perfil actualizado correctamente.', 'success')
            else:
                flash('No se pudo actualizar el perfil. Por favor, inténtalo de nuevo.', 'error')
        else:
            flash('No hay cambios para actualizar.', 'info')
        
        return redirect(url_for('perfil.perfil'))
    
    # GET: renderizar plantilla sin esperar a la API externa del bot
    # Los servidores del bot se cargan via AJAX desde /api/bot-servers
    return render_template('pages/perfil.html', current_user=current_user, images=get_images())


@perfil_bp.route('/api/bot-servers')
@login_required
def api_bot_servers():
    """Endpoint AJAX para obtener servidores del bot sin bloquear el render de /perfil."""
    api_secret = os.getenv("API_SECRET")
    servers_api_url = "https://172.93.110.38:4009/getBotServers"
    headers = {"X-API-KEY": api_secret}
    try:
        response = requests.get(servers_api_url, headers=headers, verify=False, timeout=3)
        response.raise_for_status()
        servers_data = response.json()
    except Exception as e:
        logger.warning(f"Error al conectar con la API del bot: {e}")
        return jsonify([])
    
    # Combinar con guilds del usuario
    top_servers = []
    for server in servers_data:
        guild = next((g for g in current_user.guilds if g.get('id') == server.get('id')), None)
        if not guild:
            continue
        count = len(guild.get('coleccionables', []))
        top_servers.append({
            "id": server.get("id"),
            "name": server.get("name"),
            "icon": server.get("icon"),
            "coleccionables_count": count
        })
    top_servers.sort(key=lambda s: s["coleccionables_count"], reverse=True)
    return jsonify(top_servers)

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


@perfil_bp.route('/api/user/opening-history')
@login_required
def api_opening_history():
    """Historial de cofres abiertos por el usuario, paginado."""
    try:
        page = max(1, int(request.args.get('page', 1)))
        limit = min(50, max(1, int(request.args.get('limit', 10))))
        skip = (page - 1) * limit

        total = mongo.opening_history.count_documents({"user_email": current_user.email})

        entries = list(
            mongo.opening_history.find(
                {"user_email": current_user.email},
                {"_id": 0, "user_email": 0},
            )
            .sort("opened_at", -1)
            .skip(skip)
            .limit(limit)
        )

        # Serializar datetimes
        for entry in entries:
            if entry.get("opened_at"):
                entry["opened_at"] = entry["opened_at"].isoformat()

        # Resolver chest_source (guild ID) a nombre de servidor
        guild_name_map = {}
        if hasattr(current_user, 'guilds') and current_user.guilds:
            guild_name_map = {
                g.get("id", ""): g.get("name", "Servidor")
                for g in current_user.guilds
                if g.get("id")
            }

        for entry in entries:
            source = entry.get("chest_source", "")
            if source == "daily_reward":
                entry["chest_source"] = "Recompensa diaria"
            elif source in guild_name_map:
                entry["chest_source"] = guild_name_map[source]
            # else: keep raw ID as fallback

        return jsonify({
            "entries": entries,
            "page": page,
            "limit": limit,
            "total": total,
            "has_more": skip + limit < total,
        })
    except Exception as e:
        logger.error(f"Error fetching opening history: {e}", exc_info=True)
        return jsonify({"error": "Error interno"}), 500
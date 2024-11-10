import os
from requests_oauthlib import OAuth2Session
from flask import Blueprint, render_template, redirect, url_for, request, flash, session, current_app
from flask_login import login_user, logout_user, login_required
from app.models.user import User
from app import bcrypt, mongo
import logging

from app.utils.images import get_images

# Permitir OAuth sin HTTPS en desarrollo
os.environ['OAUTHLIB_INSECURE_TRANSPORT'] = '1'

DISCORD_CLIENT_ID = os.getenv('DISCORD_CLIENT_ID')
DISCORD_CLIENT_SECRET = os.getenv('DISCORD_CLIENT_SECRET')
DISCORD_REDIRECT_URI = os.getenv('DISCORD_REDIRECT_URI')  # URL exacta
API_BASE_URL = 'https://discord.com/api'

auth_bp = Blueprint('auth', __name__)

def token_updater(token):
    session['oauth2_token'] = token

def make_discord_session(token=None, state=None):
    return OAuth2Session(
        client_id=DISCORD_CLIENT_ID,
        token=token,
        state=state,
        redirect_uri=DISCORD_REDIRECT_URI,
        scope=['identify', 'email', 'guilds']
    )

@auth_bp.route('/', methods=['GET'])
@auth_bp.route('/auth', methods=['GET'])
def auth():
    images = get_images()
    return render_template('pages/auth.html', images=images)

@auth_bp.route('/login', methods=['POST'])
def login():
    username = request.form.get('usernameOrEmail')
    password = request.form.get('password')
    
    user = User.get_by_username(username)
    if user and user.check_password(password):
        login_user(user)
        return redirect(url_for('main.inicio'))
    
    flash('Usuario o contraseña incorrectos', category="error")
    return redirect(url_for('auth.auth'))

@auth_bp.route('/register', methods=['POST'])
def register():
    try:
        username = request.form.get('username')
        email = request.form.get('email')
        password = request.form.get('password')
        
        if mongo.users.find_one({'$or': [{'username': username}, {'email': email}]}):
            flash('El usuario o email ya existe')
            return redirect(url_for('auth.auth'))
        
        hashed_password = bcrypt.generate_password_hash(password).decode('utf-8')
        user_data = {
            'username': username,
            'email': email,
            'password': hashed_password,
            'discord_id': None,
            'pfp': None,
            'guilds': [],
            'chests': [],
            'registration_method': 'Normal',
            'is_admin': False
        }
        
        result = mongo.users.insert_one(user_data)
        
        user_data['_id'] = result.inserted_id
        user = User(**user_data)
        login_user(user)
        
        return redirect(url_for('main.inicio'))
        
    except Exception as e:
        flash('Error al registrar usuario')
        return redirect(url_for('auth.auth'))

@auth_bp.route('/login/discord')
def discord_login():
    try:
        discord = make_discord_session()
        authorization_url, state = discord.authorization_url(
            f'{API_BASE_URL}/oauth2/authorize',
            prompt='consent'
        )
        session['oauth2_state'] = state
        return redirect(authorization_url)
    except Exception as error:
        logging.error(f"Error en discord_login: {str(error)}")
        flash('Error al conectar con Discord')
        return redirect(url_for('auth.auth'))

@auth_bp.route('/api/auth/redirect')
def discord_callback():
    if request.values.get('error'):
        flash('Error de autorización con Discord')
        return redirect(url_for('auth.auth'))

    try:
        discord = make_discord_session(state=session.get('oauth2_state'))
        
        token = discord.fetch_token(
            f'{API_BASE_URL}/oauth2/token',
            client_secret=DISCORD_CLIENT_SECRET,
            authorization_response=request.url.replace('http://', 'https://')
        )

        discord = make_discord_session(token=token)
        
        # Obtener datos del usuario
        user_response = discord.get(f'{API_BASE_URL}/users/@me')
        if user_response.status_code != 200:
            raise Exception(f"Error al obtener datos de usuario: {user_response.text}")
        
        user_data = user_response.json()
        
        # Obtener guilds
        guilds_response = discord.get(f'{API_BASE_URL}/users/@me/guilds')
        if guilds_response.status_code != 200:
            raise Exception(f"Error al obtener guilds: {guilds_response.text}")
            
        guilds_data = guilds_response.json()

        # Procesar usuario
        existing_user = User.get_by_discord_id(user_data['id'])
        
        if existing_user:
            existing_user.update_discord_info(user_data, guilds_data)
            mongo.db.users.update_one(
                {'_id': existing_user._id},
                {'$set': {
                    'discord_id': existing_user.discord_id,
                    'pfp': existing_user.pfp,
                    'guilds': existing_user.guilds
                }}
            )
            login_user(existing_user)
        else:
            new_user = User.create_from_discord(user_data)
            new_user.update_discord_info(user_data, guilds_data)
            result = mongo.users.insert_one({
                'username': new_user.username,
                'email': new_user.email,
                'password': None,
                'discord_id': new_user.discord_id,
                'pfp': new_user.pfp,
                'guilds': new_user.guilds,
                'chests': [],
                'registration_method': 'Discord',
                'is_admin': False
            })
            new_user._id = result.inserted_id
            login_user(new_user)

        return redirect(url_for('main.inicio'))
        
    except Exception as error:
        logging.error(f"Error en discord_callback: {str(error)}")
        flash('Error al procesar la autenticación con Discord')
        return redirect(url_for('auth.auth'))

@auth_bp.route('/logout')
@login_required
def logout():
    logout_user()
    return redirect(url_for('auth.auth'))
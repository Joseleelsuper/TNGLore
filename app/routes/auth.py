import json
import os
from requests_oauthlib import OAuth2Session
from flask import Blueprint, render_template, redirect, url_for, request, flash, session
from flask_login import login_user, logout_user, login_required
from app.models.user import User
from app import bcrypt, mongo

DISCORD_CLIENT_ID = os.getenv('DISCORD_CLIENT_ID')
DISCORD_CLIENT_SECRET = os.getenv('DISCORD_CLIENT_SECRET')
DISCORD_REDIRECT_URI = os.getenv('DISCORD_REDIRECT_URI')
API_BASE_URL = 'https://discord.com/api'

auth_bp = Blueprint('auth', __name__)

def get_images():
    with open('app/static/config/images.json', 'r') as f:
        return json.load(f)

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
    
    flash('Usuario o contraseña incorrectos')
    return redirect(url_for('auth.auth'))

@auth_bp.route('/register', methods=['POST'])
def register():
    username = request.form.get('username')
    email = request.form.get('email')
    password = request.form.get('password')
    
    if mongo.db.users.find_one({'$or': [{'username': username}, {'email': email}]}):
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
    
    result = mongo.db.users.insert_one(user_data)
    user_data['_id'] = result.inserted_id
    user = User(**user_data)
    login_user(user)
    
    return redirect(url_for('main.inicio'))

@auth_bp.route('/login/discord')
def discord_login():
    discord = make_discord_session()
    authorization_url, state = discord.authorization_url(
        f'{API_BASE_URL}/oauth2/authorize'
    )
    session['oauth2_state'] = state
    return redirect(authorization_url)

@auth_bp.route('/api/auth/redirect')
def discord_callback():
    if request.values.get('error'):
        return redirect(url_for('auth.auth'))

    try:
        discord = make_discord_session(state=session.get('oauth2_state'))
        token = discord.fetch_token(
            f'{API_BASE_URL}/oauth2/token',
            client_secret=DISCORD_CLIENT_SECRET,
            authorization_response=request.url
        )

        discord = make_discord_session(token=token)
        user_data = discord.get(f'{API_BASE_URL}/users/@me').json()
        guilds_data = discord.get(f'{API_BASE_URL}/users/@me/guilds').json()

        # Buscar si el usuario ya existe por discord_id
        existing_user = User.get_by_discord_id(user_data['id'])
        
        if existing_user:
            # Actualizar información de Discord
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
            # Crear nuevo usuario
            new_user = User.create_from_discord(user_data)
            new_user.update_discord_info(user_data, guilds_data)
            result = mongo.db.users.insert_one({
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
    except Exception as e:
        print(f"Error en discord_callback: {str(e)}")
        flash('Error al iniciar sesión con Discord')
        return redirect(url_for('auth.auth'))

@auth_bp.route('/logout')
@login_required
def logout():
    logout_user()
    return redirect(url_for('auth.auth'))
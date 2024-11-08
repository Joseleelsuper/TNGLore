import json
from flask import Blueprint, render_template, redirect, url_for, request, flash
from flask_login import login_user, logout_user, login_required
from app.models.user import User
from app import bcrypt, mongo

auth_bp = Blueprint('auth', __name__)

def get_images():
    with open('app/static/config/images.json', 'r') as f:
        return json.load(f)

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
        return redirect(url_for('static.templates.inicio'))
    
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
        'is_admin': False
    }
    
    mongo.db.users.insert_one(user_data)
    user = User(**user_data)
    login_user(user)
    
    return redirect(url_for('static.templates.inicio'))
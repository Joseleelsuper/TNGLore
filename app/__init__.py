from flask import Flask, redirect, url_for
from flask_login import LoginManager
from flask_bcrypt import Bcrypt
from pymongo import MongoClient
from config.settings import Config

login_manager = LoginManager()
bcrypt = Bcrypt()
mongo = None

def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)
    
    # Inicializar extensiones
    login_manager.init_app(app)
    login_manager.login_view = 'auth.login'
    bcrypt.init_app(app)
    
    # Conectar MongoDB
    global mongo
    mongo = MongoClient(app.config['MONGODB_URI'])
    
    # Registrar blueprints
    from app.routes.auth import auth_bp
    app.register_blueprint(auth_bp)
    
    # Añadir ruta principal
    @app.route('/')
    def index():
        return redirect(url_for('auth.auth'))
    
    return app
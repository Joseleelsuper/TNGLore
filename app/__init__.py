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
    app.config.from_object('config.settings.Config')
    
    # Inicializar extensiones
    login_manager.init_app(app)
    login_manager.login_view = 'auth.auth'
    bcrypt.init_app(app)
    
    # Conectar MongoDB
    global mongo
    mongo = MongoClient(app.config['MONGODB_URI']).tnglore
    
    # Registrar blueprints
    from app.routes.auth import auth_bp
    from app.routes.main import main_bp
    
    app.register_blueprint(auth_bp, url_prefix='/')
    app.register_blueprint(main_bp)
    
    return app
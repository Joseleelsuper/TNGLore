# app/__init__.py
from flask import Flask
from flask_login import LoginManager
from flask_bcrypt import Bcrypt
from pymongo import MongoClient
import os

login_manager = LoginManager()
bcrypt = Bcrypt()
mongo = None


def create_app():
    app = Flask(__name__)
    app.config.from_object("config.settings.Config")

    # Inicializar extensiones
    login_manager.init_app(app)
    login_manager.login_view = "auth.auth"
    bcrypt.init_app(app)

    # Conectar MongoDB con manejo de errores
    try:
        global mongo
        mongo_uri = os.getenv("MONGODB_URI")
        if not mongo_uri:
            raise ValueError("MONGODB_URI no está configurado")

        client = MongoClient(mongo_uri)
        # Verificar conexión
        client.admin.command("ping")
        mongo = client.tnglore
        app.logger.info("Conexión exitosa a MongoDB")

    except Exception as e:
        app.logger.error(f"Error conectando a MongoDB: {str(e)}")
        raise

    # Registrar blueprints
    from app.routes.auth import auth_bp
    from app.routes.main import main_bp
    from app.routes.admin import admin_bp
    from app.routes.chests import chest_bp
    from app.routes.coleccion import colections_bp
    from app.routes.perfil import perfil_bp

    app.register_blueprint(auth_bp)
    app.register_blueprint(main_bp)
    app.register_blueprint(admin_bp)
    app.register_blueprint(chest_bp)
    app.register_blueprint(colections_bp)
    app.register_blueprint(perfil_bp)

    return app

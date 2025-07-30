# app/__init__.py
from flask import Flask
from flask_login import LoginManager
from flask_bcrypt import Bcrypt
from flask_caching import Cache
from pymongo import MongoClient
import os

# Instancias globales
login_manager = LoginManager()
bcrypt = Bcrypt()
cache = Cache()
mongo = None
cache_manager = None
async_db_manager = None


def create_app():
    app = Flask(__name__)
    app.config.from_object("config.settings.Config")
    
    # Configurar caché
    from app.utils.cache_manager import create_cache_config, CacheManager
    cache_config = create_cache_config()
    app.config.update(cache_config)
    
    # Inicializar extensiones
    login_manager.init_app(app)
    setattr(login_manager, "login_view", "auth.auth")  # Nombre del endpoint para el login
    bcrypt.init_app(app)
    cache.init_app(app)
    
    # Inicializar gestores de caché
    global cache_manager, async_db_manager
    cache_manager = CacheManager(cache)
    
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
        
        # Inicializar gestor de DB asíncrono después de conectar MongoDB
        from app.utils.async_db import create_async_db_manager
        async_db_manager = create_async_db_manager(mongo)

    except Exception as e:
        app.logger.error(f"Error conectando a MongoDB: {str(e)}")
        raise

    # Registrar blueprints
    from app.routes.auth import auth_bp
    from app.routes.main import main_bp
    from app.routes.admin import admin_bp
    from app.routes.chests import chest_bp
    from app.routes.coleccion import collections_bp
    from app.routes.perfil import perfil_bp
    from app.routes.faq import faq_bp

    app.register_blueprint(auth_bp)
    app.register_blueprint(main_bp)
    app.register_blueprint(admin_bp)
    app.register_blueprint(chest_bp)
    app.register_blueprint(collections_bp)
    app.register_blueprint(perfil_bp)
    app.register_blueprint(faq_bp)
    
    # Registrar template helpers para optimización de imágenes
    from app.utils.template_helpers import register_template_helpers
    register_template_helpers(app)
    
    # Ruta para estadísticas de caché (solo en desarrollo)
    @app.route('/cache/stats')
    def cache_stats():
        if app.debug and cache_manager:
            stats = cache_manager.get_stats()
            return stats
        return {"error": "Not available in production"}, 404
    
    # Ruta para limpiar caché (solo en desarrollo)
    @app.route('/cache/clear')
    def clear_cache():
        if app.debug and cache_manager:
            cache.clear()
            from app.utils.images import clear_images_cache
            clear_images_cache()
            return {"message": "Cache cleared successfully"}
        return {"error": "Not available in production"}, 404

    return app

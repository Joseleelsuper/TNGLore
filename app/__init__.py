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
    global cache_manager
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
    from app.routes.events import events_bp
    from app.routes.tradeo import tradeo_bp

    app.register_blueprint(auth_bp)
    app.register_blueprint(main_bp)
    app.register_blueprint(admin_bp)
    app.register_blueprint(chest_bp)
    app.register_blueprint(collections_bp)
    app.register_blueprint(perfil_bp)
    app.register_blueprint(faq_bp)
    app.register_blueprint(events_bp)
    app.register_blueprint(tradeo_bp)

    # Ensure indexes for event_progress
    try:
        mongo.event_progress.create_index(
            [("user_email", 1), ("event_id", 1)],
            unique=True,
            background=True,
        )
    except Exception as idx_err:
        app.logger.warning(f"Could not create event_progress index: {idx_err}")

    # Ensure indexes for trade marketplace
    try:
        mongo.trade_marketplace.create_index(
            [("listing_status", 1), ("card_id", 1), ("created_at", 1)],
            background=True,
        )
        mongo.trade_marketplace.create_index(
            [("owner_email", 1), ("listing_status", 1), ("created_at", -1)],
            background=True,
        )
        mongo.trade_marketplace.create_index(
            [("offers.offerer_email", 1), ("offers.status", 1)],
            background=True,
        )
    except Exception as idx_err:
        app.logger.warning(f"Could not create trade_marketplace indexes: {idx_err}")
    
    # Registrar template helpers para optimización de imágenes
    from app.utils.template_helpers import register_template_helpers
    register_template_helpers(app)
    
    # Ruta para estadísticas de caché (solo en desarrollo)
    @app.route('/cache/stats', methods=['GET'])
    def cache_stats():
        if app.debug and cache_manager:
            stats = cache_manager.get_stats()
            return stats
        return {"error": "Not available in production"}, 404
    
    # Ruta para limpiar caché (solo en desarrollo)
    @app.route('/cache/clear', methods=['GET'])
    def clear_cache():
        if app.debug and cache_manager:
            cache.clear()
            from app.utils.images import clear_images_cache
            clear_images_cache()
            return {"message": "Cache cleared successfully"}
        return {"error": "Not available in production"}, 404

    return app

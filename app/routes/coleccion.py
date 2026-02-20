from flask import Blueprint, render_template, jsonify
from flask_login import login_required, current_user
from bson import ObjectId
from typing import List, Dict, Any, Optional
import logging

from app.utils.images import get_images
from app.utils.cache_manager import safe_memoize
from app import mongo, cache

logger = logging.getLogger(__name__)

collections_bp = Blueprint("collections", __name__)


@safe_memoize(timeout=1800)  # 30 minutos de caché
def get_all_collections() -> List[Dict[str, Any]]:
    """Obtiene todas las colecciones con conteo de cartas via agregación (sin N+1)."""
    try:
        collections = list(mongo.collections.find({}))
        
        # Batch: contar cartas por colección con un solo pipeline de agregación
        card_counts_pipeline = [
            {"$group": {"_id": "$coleccion", "count": {"$sum": 1}}}
        ]
        card_counts_raw = list(mongo.collectables.aggregate(card_counts_pipeline))
        card_counts: Dict[str, int] = {str(item["_id"]): item["count"] for item in card_counts_raw}
        
        for collection in collections:
            original_id = str(collection["_id"])
            collection["_id"] = original_id
            collection["count"] = card_counts.get(original_id, 0)
        
        return collections
    except Exception as e:
        logger.error(f"Error getting collections: {e}")
        return []


@safe_memoize(timeout=900)  # 15 minutos de caché
def get_user_collectibles_data(user_email: str) -> Dict[str, Any]:
    """Obtiene datos de coleccionables del usuario con batch query (sin N+1 por guild)."""
    try:
        user_data = mongo.users.find_one({"email": user_email})
        if not user_data:
            return {"guilds": []}
            
        guilds = user_data.get("guilds")
        if not guilds or not isinstance(guilds, list):
            return {"guilds": []}
        
        # Recolectar TODOS los IDs de coleccionables de TODAS las guilds en un solo set
        all_ids: Dict[str, List[str]] = {}  # guild_id -> list of collectable string ids
        all_object_ids = set()
        
        for guild in guilds:
            collectables_ids = guild.get("coleccionables", [])
            valid_ids = []
            if collectables_ids and isinstance(collectables_ids, list):
                for id_str in collectables_ids:
                    if isinstance(id_str, str) and ObjectId.is_valid(id_str):
                        valid_ids.append(id_str)
                        all_object_ids.add(ObjectId(id_str))
            all_ids[guild.get("id", "")] = valid_ids
        
        # UNA SOLA query para todos los coleccionables de todas las guilds
        collectables_map: Dict[str, Dict[str, Any]] = {}
        if all_object_ids:
            all_collectables = list(mongo.collectables.find({"_id": {"$in": list(all_object_ids)}}))
            for item in all_collectables:
                item_id = str(item["_id"])
                item["_id"] = item_id
                if "coleccion" in item and item["coleccion"]:
                    item["coleccion"] = str(item["coleccion"])
                collectables_map[item_id] = item
        
        # Distribuir coleccionables a cada guild
        processed_guilds: List[Dict[str, Any]] = []
        for guild in guilds:
            guild_data = guild.copy()
            guild_id = guild.get("id", "")
            guild_collectable_ids = all_ids.get(guild_id, [])
            
            details = [collectables_map[cid] for cid in guild_collectable_ids if cid in collectables_map]
            guild_data["collectables_details"] = details
            guild_data["collectables_count"] = len(details)
            processed_guilds.append(guild_data)
        
        return {"guilds": processed_guilds}
    except Exception as e:
        logger.error(f"Error getting user collectibles: {e}")
        return {"guilds": []}


@safe_memoize(timeout=1200)  # 20 minutos de caché
def get_collection_cards(collection_id):
    """Obtiene todas las cartas de una colección específica con caché"""
    try:
        if not ObjectId.is_valid(collection_id):
            logger.warning(f"ID de colección inválido: {collection_id}")
            return []
            
        cards = list(mongo.collectables.find({"coleccion": ObjectId(collection_id)}))
        
        # Serializar ObjectIds y agregar datos de colección
        for card in cards:
            card["_id"] = str(card["_id"])
            if "coleccion" in card:
                card["coleccion"] = str(card["coleccion"])
        
        return cards
    except Exception as e:
        logger.error(f"Error getting collection cards: {e}")
        return []


@safe_memoize(timeout=600)  # 10 minutos de caché  
def get_card_details(card_id):
    """Obtiene detalles de una carta específica con caché"""
    try:
        if not ObjectId.is_valid(card_id):
            return None
        
        card = mongo.collectables.find_one({"_id": ObjectId(card_id)})
        if card:
            card["_id"] = str(card["_id"])
            if "coleccion" in card and card["coleccion"]:
                card["coleccion"] = str(card["coleccion"])
        return card
    except Exception as e:
        logger.error(f"Error getting card details: {e}")
        return None

# Rutas para páginas HTML
@collections_bp.route("/mi-coleccion")
@login_required
def my_collections():
    return render_template("pages/miColeccion.html", user=current_user, images=get_images())

@collections_bp.route("/colecciones")
@login_required
def collections():
    return render_template("pages/colecciones.html", user=current_user, images=get_images())

# Endpoints API optimizados con caché
@collections_bp.route("/api/coleccion/usuario")
@login_required
def api_user_collectibles():
    """API para obtener datos de usuario con caché optimizado."""
    try:
        if not current_user or not current_user.email:
            return jsonify({"error": "Usuario no autenticado"}), 401
            
        user_data = get_user_collectibles_data(current_user.email)
        return jsonify(user_data)
    except Exception as e:
        logger.error(f"Error en api_user_collectibles: {e}", exc_info=True)
        return jsonify({"error": "Error interno del servidor"}), 500

@collections_bp.route("/api/colecciones")
@login_required  
def api_collections():
    """API para obtener todas las colecciones con caché"""
    collections = get_all_collections()
    return jsonify(collections)

@collections_bp.route("/api/colecciones/<collection_id>/cartas")
@login_required
def api_collection_cards(collection_id: str):
    """API para obtener cartas de una colección específica usando función cacheada."""
    try:
        if not ObjectId.is_valid(collection_id):
            return jsonify({"error": "ID de colección inválido"}), 400
        
        # Usar la función cacheada en vez de query directa
        cards = get_collection_cards(collection_id)
        return jsonify(cards)
    except Exception as e:
        logger.error(f"Error getting collection cards: {e}")
        return jsonify({"error": "Error interno del servidor"}), 500

@collections_bp.route("/api/colecciones/<collection_id>")
@login_required
def api_collection_details(collection_id):
    """API para obtener detalles de una colección específica"""
    try:
        if not ObjectId.is_valid(collection_id):
            return jsonify({"error": "ID de colección inválido"}), 400
            
        collection = mongo.collections.find_one({"_id": ObjectId(collection_id)})
        if not collection:
            return jsonify({"error": "Colección no encontrada"}), 404
            
        # Serializar ObjectId y contar cartas
        collection["_id"] = str(collection["_id"])
        card_count = mongo.collectables.count_documents({"coleccion": ObjectId(collection_id)})
        collection["count"] = card_count
        
        return jsonify(collection)
    except Exception as e:
        logger.error(f"Error getting collection details: {e}")
        return jsonify({"error": "Error interno del servidor"}), 500

@collections_bp.route("/api/cartas")
@login_required
def api_all_cards():
    """API para obtener todas las cartas"""
    try:
        cards = list(mongo.collectables.find({}))
        
        # Serializar ObjectIds y poblar datos de colección
        for card in cards:
            card["_id"] = str(card["_id"])
            if "coleccion" in card and card["coleccion"]:
                card["coleccion"] = str(card["coleccion"])
                
        return jsonify(cards)
    except Exception as e:
        logger.error(f"Error getting all cards: {e}")
        return jsonify({"error": "Error interno del servidor"}), 500

@collections_bp.route("/api/cartas/<card_id>")
@login_required
def api_card_details(card_id):
    """API para obtener detalles de una carta específica con caché"""
    card = get_card_details(card_id)
    if card:
        return jsonify(card)
    else:
        return jsonify({"error": "Carta no encontrada"}), 404

@collections_bp.route("/api/cartas/<card_id>/relacionadas")
@login_required  
def api_related_cards(card_id):
    """API para obtener cartas relacionadas (misma colección) con caché"""
    try:
        if not ObjectId.is_valid(card_id):
            return jsonify({"error": "ID de carta inválido"}), 400
            
        card = mongo.collectables.find_one({"_id": ObjectId(card_id)})
        if not card:
            return jsonify({"error": "Carta no encontrada"}), 404
        
        collection_id = card.get("coleccion")
        if not collection_id:
            return jsonify([])
        
        # Obtener cartas de la misma colección, excluyendo la actual
        related_cards = list(mongo.collectables.find({
            "coleccion": collection_id,
            "_id": {"$ne": ObjectId(card_id)}
        }))
        
        # Serializar ObjectIds
        for related_card in related_cards:
            related_card["_id"] = str(related_card["_id"])
            related_card["coleccion"] = str(related_card["coleccion"])
            
        return jsonify(related_cards)
    except Exception as e:
        logger.error(f"Error getting related cards: {e}", exc_info=True)
        return jsonify({"error": "Error interno del servidor"}), 500
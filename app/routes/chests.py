# File: app/routes/chests.py
from flask import Blueprint, render_template, request, jsonify
from flask_login import login_required, current_user
import random
from bson import ObjectId
from collections import Counter
import logging

from app.utils.images import get_images
from app import mongo, cache

logger = logging.getLogger(__name__)

chest_bp = Blueprint("chests", __name__)

# Configuración de cofres: cantidad de cartas y probabilidades (en porcentaje)
CHEST_CONFIG = {
    "comun": {"cards": 2, "probabilities": [70, 16, 12, 2], "name": "Común"},
    "rara": {"cards": 3, "probabilities": [35, 45, 15, 5], "name": "Raro"},
    "epica": {"cards": 4, "probabilities": [20, 30, 35, 15], "name": "Épico"},
    "legendaria": {"cards": 5, "probabilities": [10, 25, 35, 30], "name": "Legendario"},
}

CARD_RARITIES = ["comun", "rara", "epica", "legendaria"]


def get_image_url(rarity):
    mapping = {
        "comun": "/assets/images/cofre-comun.webp",
        "rara": "/assets/images/cofre-rara.webp",
        "epica": "/assets/images/cofre-epica.webp",
        "legendaria": "/assets/images/cofre-legendaria.webp",
    }
    return mapping.get(rarity, "")


rarity_colors = {
    "comun": "#9e9e9e",
    "rara": "#4CAF50",
    "epica": "#9C27B0",
    "legendaria": "#FFD700",
}


def serialize_doc(doc):
    if isinstance(doc, dict):
        return {k: serialize_doc(v) for k, v in doc.items()}
    elif isinstance(doc, list):
        return [serialize_doc(item) for item in doc]
    elif isinstance(doc, ObjectId):
        return str(doc)
    else:
        return doc


@cache.memoize(timeout=600)  # Cache por 10 minutos
def get_user_chests_data(email: str) -> dict:
    """Obtiene los datos de cofres del usuario con caché"""
    user_data = mongo.users.find_one({"email": email})
    if not user_data or "chests" not in user_data:
        return {"user_chests": [], "guild_mapping": {}}
    
    # Obtener cofres con conteo
    chest_id_list = user_data.get("chests", [])
    chest_counts = Counter(chest_id_list)
    unique_ids = [ObjectId(_id) for _id in chest_counts.keys()]
    chests_docs = list(mongo.chests.find({"_id": {"$in": unique_ids}}))
    
    # Procesar datos de cofres
    grouped = {}
    for chest in chests_docs:
        rarity = chest.get("rarity")
        servidor = chest.get("servidor")
        key = (rarity, servidor)
        count = chest_counts.get(str(chest["_id"]))
        
        if key in grouped:
            grouped[key]["count"] += count
        else:
            grouped[key] = {
                "chest_type": rarity,
                "servidor": servidor,
                "count": count,
                "image": get_image_url(rarity),
            }
    
    user_chests = list(grouped.values())
    
    # Crear mapeo de servidores
    guild_mapping = {
        guild["id"]: {
            "name": guild.get("name", "Servidor desconocido"),
            "icon": guild.get("icon", ""),
        }
        for guild in user_data.get("guilds", [])
    }
    
    # Añadir información de servidor a cada cofre
    for chest in user_chests:
        server_info = guild_mapping.get(
            chest["servidor"], {"name": "Servidor desconocido", "icon": ""}
        )
        chest["server_name"] = server_info["name"]
        chest["server_icon"] = server_info["icon"]
        chest["rarity_color"] = rarity_colors.get(chest["chest_type"], "#000")
    
    return {"user_chests": user_chests, "guild_mapping": guild_mapping}


@cache.memoize(timeout=300)  # Cache por 5 minutos (datos más dinámicos)
def get_chest_config() -> dict:
    """Obtiene la configuración de cofres con caché"""
    return CHEST_CONFIG.copy()


@cache.memoize(timeout=1800)  # Cache por 30 minutos
def get_chest_rarity_colors() -> dict:
    """Obtiene los colores de rareza con caché"""
    return rarity_colors.copy()


@chest_bp.route("/cofres")
@login_required
def chests():
    """Página de cofres con datos cacheados."""
    try:
        chest_data = get_user_chests_data(current_user.email)
        user_chests = chest_data["user_chests"]
    except Exception as e:
        logger.error(f"Error loading chests page: {e}", exc_info=True)
        user_chests = []

    return render_template(
        "pages/cofres.html",
        user=current_user,
        images=get_images(),
        user_chests=user_chests,
    )


@chest_bp.route("/api/open_chests", methods=["POST"])
@login_required
def open_chests():
    """API para abrir cofres (síncrono)."""
    data = request.get_json()
    chest_type = data.get("chest_type")
    server = data.get("server")

    if not server:
        return jsonify({"error": "Servidor no especificado"}), 400
    if chest_type not in CHEST_CONFIG:
        return jsonify({"error": "Tipo de cofre inválido"}), 400

    # Invalidar caché del usuario después de abrir cofre
    cache.delete_memoized(get_user_chests_data, current_user.email)

    try:
        result = _open_chest_sync(current_user.email, chest_type, server)
        if "error" in result:
            return jsonify(result), 400
        return jsonify(result)
    except Exception as e:
        logger.error(f"Error opening chest: {e}", exc_info=True)
        return jsonify({"error": "Error interno al abrir cofre"}), 500


def _open_chest_sync(email: str, chest_type: str, server: str) -> dict:
    """Abre un cofre de forma síncrona."""
    user_data = mongo.users.find_one({"email": email})
    if not user_data:
        return {"error": "Usuario no encontrado"}

    user_chest_ids = user_data.get("chests", [])
    matching_id = None

    if user_chest_ids:
        object_ids = [ObjectId(cid) for cid in user_chest_ids]
        matching_chests = list(mongo.chests.find({
            "_id": {"$in": object_ids},
            "rarity": chest_type,
            "servidor": server
        }).limit(1))
        if matching_chests:
            matching_id = str(matching_chests[0]["_id"])

    if not matching_id:
        return {"error": "No tienes el cofre indicado"}

    config = CHEST_CONFIG[chest_type]
    cards: list = []
    received_card_ids: list = []

    for _ in range(config["cards"]):
        r = random.uniform(0, 100)
        cumulative = 0
        for rarity, prob in zip(CARD_RARITIES, config["probabilities"]):
            cumulative += prob
            if r <= cumulative:
                pipeline = [{"$match": {"rareza": rarity}}, {"$sample": {"size": 1}}]
                results = list(mongo.collectables.aggregate(pipeline))
                if results:
                    card_doc = serialize_doc(results[0])
                    cards.append(card_doc)
                    if isinstance(card_doc, dict) and "_id" in card_doc:
                        received_card_ids.append(card_doc["_id"])
                else:
                    cards.append({"nombre": f"Sin carta {rarity}", "rareza": rarity})
                break

    # Eliminar solo una ocurrencia del cofre abierto
    user_chests = user_data.get("chests", [])
    try:
        user_chests.remove(matching_id)
    except ValueError:
        pass

    mongo.users.update_one(
        {"email": email}, {"$set": {"chests": user_chests}}
    )
    mongo.users.update_one(
        {"email": email, "guilds.id": server},
        {"$push": {"guilds.$.coleccionables": {"$each": received_card_ids}}},
    )
    return {"results": {"chest_type": chest_type, "cards": cards}}


@chest_bp.route("/api/chests/data")
@login_required
def get_chests_data():
    """API endpoint para obtener datos de cofres con caché"""
    try:
        chest_data = get_user_chests_data(current_user.email)
        return jsonify({
            "success": True,
            "data": chest_data
        })
    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


@chest_bp.route("/api/chests/config")
def get_chests_config_api():
    """API endpoint para obtener configuración de cofres con caché"""
    try:
        config = get_chest_config()
        colors = get_chest_rarity_colors()
        
        return jsonify({
            "success": True,
            "config": config,
            "rarity_colors": colors
        })
    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

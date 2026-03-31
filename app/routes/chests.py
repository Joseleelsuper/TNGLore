# File: app/routes/chests.py
from flask import Blueprint, render_template, request, jsonify
from flask_login import login_required, current_user
import random
from datetime import datetime, timezone
from bson import ObjectId
from collections import Counter
import logging
from typing import Dict, Any, List, Optional

from app.utils.images import get_images
from app.utils.cache_manager import safe_memoize, safe_delete_memoized
from app.routes.coleccion import get_user_collectibles_data
from app.utils.game_config import (
    get_chest_config as _yaml_chest_config,
    get_card_rarities as _yaml_card_rarities,
    get_rarity_colors as _yaml_rarity_colors,
    get_chest_images as _yaml_chest_images,
)
from app import mongo, cache

logger = logging.getLogger(__name__)

chest_bp = Blueprint("chests", __name__)


def _get_image_url(rarity: str) -> str:
    """Obtiene la URL de imagen de cofre desde la config YAML."""
    return _yaml_chest_images().get(rarity, "")


def serialize_doc(doc):
    if isinstance(doc, dict):
        return {k: serialize_doc(v) for k, v in doc.items()}
    elif isinstance(doc, list):
        return [serialize_doc(item) for item in doc]
    elif isinstance(doc, ObjectId):
        return str(doc)
    else:
        return doc


@safe_memoize(timeout=600)  # Cache por 10 minutos
def get_user_chests_data(email: str) -> Dict[str, Any]:
    """Obtiene los datos de cofres del usuario con caché"""
    user_data = mongo.users.find_one({"email": email})
    if not user_data or "chests" not in user_data:
        return {"user_chests": [], "guild_mapping": {}}
    
    rarity_colors = _yaml_rarity_colors()

    # Obtener cofres con conteo
    chest_id_list: List[str] = user_data.get("chests", [])
    chest_counts: Dict[str, int] = dict(Counter(chest_id_list))
    unique_ids = [ObjectId(_id) for _id in chest_counts.keys()]
    chests_docs = list(mongo.chests.find({"_id": {"$in": unique_ids}}))
    
    # Procesar datos de cofres
    grouped: Dict[tuple, Dict[str, Any]] = {}
    for chest in chests_docs:
        rarity = chest.get("rarity")
        servidor = chest.get("servidor")
        key = (rarity, servidor)
        count = chest_counts.get(str(chest["_id"]), 0)
        
        if key in grouped:
            grouped[key]["count"] += count
        else:
            grouped[key] = {
                "chest_type": rarity,
                "servidor": servidor,
                "count": count,
                "image": _get_image_url(rarity),
            }
    
    user_chests: List[Dict[str, Any]] = list(grouped.values())
    
    # Crear mapeo de servidores
    guild_mapping: Dict[str, Dict[str, str]] = {
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


def get_chest_config() -> Dict[str, Dict[str, Any]]:
    """Obtiene la configuración de cofres desde YAML (hot-reloadable)."""
    return _yaml_chest_config()


def get_chest_rarity_colors() -> Dict[str, str]:
    """Obtiene los colores de rareza desde YAML (hot-reloadable)."""
    return _yaml_rarity_colors()


@chest_bp.route("/cofres", methods=["GET"])
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
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        data = {}
    chest_type = data.get("chest_type")
    server = data.get("server")

    if not server:
        return jsonify({"error": "Servidor no especificado"}), 400
    if chest_type not in _yaml_chest_config():
        return jsonify({"error": "Tipo de cofre inválido"}), 400

    # Invalidar caché del usuario después de abrir cofre
    safe_delete_memoized(get_user_chests_data, current_user.email)
    safe_delete_memoized(get_user_collectibles_data, current_user.email)

    try:
        result = _open_chests_sync(current_user.email, chest_type, server, quantity=1)
        if "error" in result:
            return jsonify(result), 400
        return jsonify(result)
    except Exception as e:
        logger.error(f"Error opening chest: {e}", exc_info=True)
        return jsonify({"error": "Error interno al abrir cofre"}), 500


@chest_bp.route("/api/open_chests_multi", methods=["POST"])
@login_required
def open_chests_multi():
    """API para abrir 1 o N cofres del mismo tipo y servidor."""
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        data = {}
    chest_type = data.get("chest_type")
    server = data.get("server")
    quantity_raw = data.get("quantity")

    if not server:
        return jsonify({"error": "Servidor no especificado"}), 400
    if chest_type not in _yaml_chest_config():
        return jsonify({"error": "Tipo de cofre inválido"}), 400

    try:
        quantity = int(quantity_raw)
    except (TypeError, ValueError):
        return jsonify({"error": "Cantidad de cofres inválida"}), 400

    if quantity < 1:
        return jsonify({"error": "La cantidad de cofres debe ser mayor a 0"}), 400

    safe_delete_memoized(get_user_chests_data, current_user.email)
    safe_delete_memoized(get_user_collectibles_data, current_user.email)

    try:
        result = _open_chests_sync(current_user.email, chest_type, server, quantity=quantity)
        if "error" in result:
            return jsonify(result), 400
        return jsonify(result)
    except Exception as e:
        logger.error(f"Error opening multiple chests: {e}", exc_info=True)
        return jsonify({"error": "Error interno al abrir cofres"}), 500


def _open_chest_sync(email: str, chest_type: str, server: str) -> dict:
    """Wrapper legado para abrir un cofre."""
    return _open_chests_sync(email, chest_type, server, quantity=1)


def _get_matching_user_chests(
    user_chest_ids: List[str], chest_type: str, server: str
) -> List[str]:
    """Devuelve todas las ocurrencias de IDs de cofres del usuario que coinciden con tipo+servidor."""
    if not user_chest_ids:
        return []

    object_ids: List[ObjectId] = []
    for chest_id in set(user_chest_ids):
        try:
            object_ids.append(ObjectId(chest_id))
        except Exception:
            logger.warning(f"Invalid chest id found for user inventory: {chest_id}")

    if not object_ids:
        return []

    matching_docs = list(
        mongo.chests.find(
            {
                "_id": {"$in": object_ids},
                "rarity": chest_type,
                "servidor": server,
            },
            {"_id": 1},
        )
    )

    matching_id_set = {str(doc["_id"]) for doc in matching_docs}
    if not matching_id_set:
        return []

    return [chest_id for chest_id in user_chest_ids if chest_id in matching_id_set]


def _remove_chest_occurrences(chest_ids: List[str], ids_to_remove: List[str]) -> List[str]:
    """Elimina exactamente N ocurrencias de IDs, respetando duplicados."""
    removal_counter: Dict[str, int] = dict(Counter(ids_to_remove))
    remaining_ids: List[str] = []
    for chest_id in chest_ids:
        current_count = removal_counter.get(chest_id, 0)
        if current_count > 0:
            removal_counter[chest_id] = current_count - 1
            continue
        remaining_ids.append(chest_id)
    return remaining_ids


def _draw_cards_for_chests(chest_type: str, chest_count: int) -> Dict[str, Any]:
    """Sortea las cartas de N cofres usando la misma lógica de probabilidades actual."""
    chest_cfg = _yaml_chest_config()
    card_rarities = _yaml_card_rarities()
    config = chest_cfg[chest_type]

    total_cards = config["cards"] * chest_count
    cards: List[Dict[str, Any]] = []
    received_card_ids: List[str] = []

    for _ in range(total_cards):
        roll = random.uniform(0, 100)
        cumulative = 0.0
        selected_rarity = card_rarities[-1] if card_rarities else "comun"

        for rarity, prob in zip(card_rarities, config["probabilities"]):
            cumulative += prob
            if roll <= cumulative:
                selected_rarity = rarity
                break

        pipeline = [{"$match": {"rareza": selected_rarity}}, {"$sample": {"size": 1}}]
        results = list(mongo.collectables.aggregate(pipeline))
        if results:
            card_doc = serialize_doc(results[0])
            cards.append(card_doc)
            if isinstance(card_doc, dict) and "_id" in card_doc:
                received_card_ids.append(card_doc["_id"])
        else:
            cards.append({"nombre": f"Sin carta {selected_rarity}", "rareza": selected_rarity})

    return {"cards": cards, "received_card_ids": received_card_ids}


def _save_opening_history(
    email: str,
    chest_type: str,
    server: str,
    cards: List[Dict[str, Any]],
    chests_opened: int,
) -> None:
    """Guarda una sola entrada de historial por operación de apertura."""
    try:
        history_cards: List[Dict[str, Any]] = []
        for card in cards:
            history_cards.append({
                "card_id": card.get("_id", ""),
                "nombre": card.get("nombre", ""),
                "rareza": card.get("rareza", ""),
                "coleccion": str(card.get("coleccion", "")),
                "image": card.get("image", ""),
            })

        mongo.opening_history.insert_one({
            "user_email": email,
            "chest_type": chest_type,
            "chest_source": server,
            "chests_opened": chests_opened,
            "cards_received": history_cards,
            "opened_at": datetime.now(timezone.utc),
        })
    except Exception as history_err:
        logger.warning(f"Failed to log chest opening history: {history_err}")


def _open_chests_sync(email: str, chest_type: str, server: str, quantity: int) -> dict:
    """Abre N cofres de forma síncrona con control básico de concurrencia."""
    if quantity < 1:
        return {"error": "Cantidad de cofres inválida"}

    max_retries = 3
    chest_ids_to_remove: List[str] = []
    chests_to_open = 0

    for attempt in range(max_retries):
        user_data = mongo.users.find_one({"email": email}, {"chests": 1})
        if not user_data:
            return {"error": "Usuario no encontrado"}

        user_chest_ids: List[str] = user_data.get("chests", [])
        matching_user_chests = _get_matching_user_chests(user_chest_ids, chest_type, server)
        if not matching_user_chests:
            return {"error": "No tienes el cofre indicado"}

        chests_to_open = min(quantity, len(matching_user_chests))
        chest_ids_to_remove = matching_user_chests[:chests_to_open]
        updated_chests = _remove_chest_occurrences(user_chest_ids, chest_ids_to_remove)

        update_result = mongo.users.update_one(
            {"email": email, "chests": user_chest_ids},
            {"$set": {"chests": updated_chests}},
        )
        if update_result.modified_count == 1:
            break

        if attempt == max_retries - 1:
            return {
                "error": "Tu inventario cambió mientras abrías cofres. Inténtalo de nuevo"
            }

    try:
        draw_result = _draw_cards_for_chests(chest_type, chests_to_open)
        cards: List[Dict[str, Any]] = draw_result["cards"]
        received_card_ids: List[str] = [
            str(card_id)
            for card_id in draw_result["received_card_ids"]
            if card_id
        ]

        guild_update = mongo.users.update_one(
            {"email": email, "guilds.id": server},
            {"$push": {"guilds.$.coleccionables": {"$each": received_card_ids}}},
        )

        if guild_update.matched_count == 0:
            mongo.users.update_one(
                {"email": email},
                {"$push": {"chests": {"$each": chest_ids_to_remove}}},
            )
            return {"error": "Servidor no encontrado para el usuario"}

        _save_opening_history(email, chest_type, server, cards, chests_to_open)

        return {
            "results": {
                "chest_type": chest_type,
                "chests_opened": chests_to_open,
                "cards": cards,
            }
        }
    except Exception as open_err:
        mongo.users.update_one(
            {"email": email},
            {"$push": {"chests": {"$each": chest_ids_to_remove}}},
        )
        logger.error(f"Error during chest opening flow: {open_err}", exc_info=True)
        return {"error": "Error interno al abrir cofre"}


@chest_bp.route("/api/chests/data", methods=["GET"])
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


@chest_bp.route("/api/chests/config", methods=["GET"])
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

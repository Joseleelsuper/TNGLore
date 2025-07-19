# File: app/routes/chests.py
from flask import Blueprint, render_template, request, jsonify
from flask_login import login_required, current_user
import random
from bson import ObjectId
from collections import Counter

from app.utils.images import get_images
from app.utils.async_utils import run_async_in_sync
from app import mongo, cache

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


async def get_user_chests_data_async(email: str) -> dict:
    """Obtiene los datos de cofres del usuario de forma asíncrona y optimizada"""
    from app.utils.async_db import AsyncDBManager
    from app import async_db_manager
    
    if not async_db_manager:
        async_db_manager = AsyncDBManager(mongo)
    
    # Obtener datos del usuario de forma asíncrona
    user_data = await async_db_manager.find_user_async(email)
    if not user_data or "chests" not in user_data:
        return {"user_chests": [], "guild_mapping": {}}
    
    # Obtener cofres en paralelo
    chest_id_list = user_data.get("chests", [])
    chest_counts = Counter(chest_id_list)
    
    chests_docs = await async_db_manager.find_multiple_chests_async(list(chest_counts.keys()))
    
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


async def open_chest_async(email: str, chest_type: str, server: str) -> dict:
    """Abre un cofre de forma asíncrona con operaciones optimizadas"""
    from app.utils.async_db import AsyncDBManager
    from app import async_db_manager
    
    if not async_db_manager:
        async_db_manager = AsyncDBManager(mongo)
    
    # Verificar que el usuario tenga el cofre
    user_data = await async_db_manager.find_user_async(email)
    if not user_data:
        return {"error": "Usuario no encontrado"}
    
    user_chest_ids = user_data.get("chests", [])
    matching_id = None
    
    # Buscar cofre coincidente
    for chest_id in user_chest_ids:
        chest_doc = mongo.chests.find_one({"_id": ObjectId(chest_id)})
        if (chest_doc and 
            chest_doc.get("rarity") == chest_type and 
            chest_doc.get("servidor") == server):
            matching_id = chest_id
            break
    
    if not matching_id:
        return {"error": "No tienes el cofre indicado"}
    
    config = CHEST_CONFIG[chest_type]
    
    # Generar las rarezas de las cartas que se obtendrán
    rarities_needed = []
    for _ in range(config["cards"]):
        r = random.uniform(0, 100)
        cumulative = 0
        for rarity, prob in zip(CARD_RARITIES, config["probabilities"]):
            cumulative += prob
            if r <= cumulative:
                rarities_needed.append(rarity)
                break
    
    # Obtener todas las cartas en paralelo
    collectables_results = await async_db_manager.batch_find_collectables_async(rarities_needed)
    
    cards = []
    received_card_ids = []
    
    for i, results in enumerate(collectables_results):
        if results and len(results) > 0:
            card_doc = serialize_doc(results[0])
            cards.append(card_doc)
            if isinstance(card_doc, dict) and "_id" in card_doc:
                received_card_ids.append(card_doc["_id"])
        else:
            # Fallback si no se encuentra carta
            rarity = rarities_needed[i]
            cards.append({"nombre": f"Sin carta {rarity}", "rareza": rarity})
    
    # Actualizar datos del usuario de forma asíncrona
    user_chests = user_data.get("chests", [])
    try:
        user_chests.remove(matching_id)
    except ValueError:
        pass
    
    # Ejecutar actualizaciones en paralelo
    update_chests_task = async_db_manager.update_user_chests_async(email, user_chests)
    update_collectables_task = async_db_manager.add_collectables_to_guild_async(
        email, server, received_card_ids
    )
    
    # Esperar a que ambas operaciones terminen
    import asyncio
    await asyncio.gather(update_chests_task, update_collectables_task)
    
    return {"results": {"chest_type": chest_type, "cards": cards}}


@chest_bp.route("/cofres")
@login_required
def chests():
    """Página de cofres con datos cacheados"""
    try:
        # Usar función cacheada para obtener datos optimizados
        chest_data = get_user_chests_data(current_user.email)
        user_chests = chest_data["user_chests"]
        
        return render_template(
            "pages/cofres.html",
            user=current_user,
            images=get_images(),
            user_chests=user_chests,
        )
    except Exception:
        # Fallback a método asíncrono en caso de error con caché
        try:
            chest_data = run_async_in_sync(get_user_chests_data_async(current_user.email))
            user_chests = chest_data["user_chests"]
            
            return render_template(
                "pages/cofres.html",
                user=current_user,
                images=get_images(),
                user_chests=user_chests,
            )
        except Exception:
            # Último fallback
            return chests_fallback()


def chests_fallback():
    """Fallback síncrono para la página de cofres"""
    # Obtener el usuario real desde MongoDB usando su email
    user_data = mongo.users.find_one({"email": current_user.email})
    user_chests = []
    if user_data and "chests" in user_data:
        # Contar IDs repetidos en el array
        chest_id_list = user_data.get("chests", [])
        chest_counts = Counter(chest_id_list)
        unique_ids = [ObjectId(_id) for _id in chest_counts.keys()]
        chests_docs = list(mongo.chests.find({"_id": {"$in": unique_ids}}))
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
        # Crear un mapeo de servidores que incluya nombres e iconos
        guild_mapping = {
            guild["id"]: {
                "name": guild.get("name", "Servidor desconocido"),
                "icon": guild.get("icon", ""),
            }
            for guild in user_data.get("guilds", [])
        }

        for chest in user_chests:
            server_info = guild_mapping.get(
                chest["servidor"], {"name": "Servidor desconocido", "icon": ""}
            )
            chest["server_name"] = server_info["name"]
            chest["server_icon"] = server_info["icon"]
            chest["rarity_color"] = rarity_colors.get(chest["chest_type"], "#000")
    return render_template(
        "pages/cofres.html",
        user=current_user,
        images=get_images(),
        user_chests=user_chests,
    )


@chest_bp.route("/api/open_chests", methods=["POST"])
@login_required
def open_chests():
    """API para abrir cofres con versión asíncrona optimizada"""
    try:
        data = request.get_json()
        chest_type = data.get("chest_type")
        server = data.get("server")
        
        if not server:
            return jsonify({"error": "Servidor no especificado"}), 400
        if chest_type not in get_chest_config():
            return jsonify({"error": "Tipo de cofre inválido"}), 400
        
        # Invalidar caché del usuario después de abrir cofre
        cache.delete_memoized(get_user_chests_data, current_user.email)
        
        # Usar función asíncrona para abrir cofre
        result = run_async_in_sync(open_chest_async(current_user.email, chest_type, server))
        
        if "error" in result:
            return jsonify(result), 400
        
        return jsonify(result)
        
    except Exception:
        # Fallback a método síncrono
        return open_chests_fallback()


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


def open_chests_fallback():
    """Fallback síncrono para apertura de cofres"""
    data = request.get_json()
    chest_type = data.get("chest_type")
    server = data.get("server")
    # Forzamos apertura de 1 cofre, ya no se usa "quantity"
    if not server:
        return jsonify({"error": "Servidor no especificado"}), 400
    if chest_type not in CHEST_CONFIG:
        return jsonify({"error": "Tipo de cofre inválido"}), 400

    # Verificar que el usuario tenga al menos un cofre del tipo y servidor indicados
    user_data = mongo.users.find_one({"email": current_user.email})
    if not user_data:
        return jsonify({"error": "Usuario no encontrado"}), 400
    user_chest_ids = user_data.get("chests", [])
    matching_id = None
    for chest_id in user_chest_ids:
        chest_doc = mongo.chests.find_one({"_id": ObjectId(chest_id)})
        if (
            chest_doc
            and chest_doc.get("rarity") == chest_type
            and chest_doc.get("servidor") == server
        ):
            matching_id = chest_id
            break
    if not matching_id:
        return jsonify({"error": "No tienes el cofre indicado"}), 400

    config = CHEST_CONFIG[chest_type]
    # Solo abrir un cofre
    cards = []
    received_card_ids = []
    for _ in range(config["cards"]):
        r = random.uniform(0, 100)
        cumulative = 0
        for rarity, prob in zip(CARD_RARITIES, config["probabilities"]):
            cumulative += prob
            if r <= cumulative:
                pipeline = [{"$match": {"rareza": rarity}}, {"$sample": {"size": 1}}]
                results = list(mongo.collectables.aggregate(pipeline))
                if results:
                    # Convertir el documento para que sea JSON serializable
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
        {"email": current_user.email}, {"$set": {"chests": user_chests}}
    )
    # Agregar las cartas obtenidas a "coleccionables" en el guild correspondiente
    mongo.users.update_one(
        {"email": current_user.email, "guilds.id": server},
        {"$push": {"guilds.$.coleccionables": {"$each": received_card_ids}}},
    )
    return jsonify({"results": {"chest_type": chest_type, "cards": cards}})
    data = request.get_json()
    chest_type = data.get("chest_type")
    server = data.get("server")
    # Forzamos apertura de 1 cofre, ya no se usa "quantity"
    if not server:
        return jsonify({"error": "Servidor no especificado"}), 400
    if chest_type not in CHEST_CONFIG:
        return jsonify({"error": "Tipo de cofre inválido"}), 400

    # Verificar que el usuario tenga al menos un cofre del tipo y servidor indicados
    user_data = mongo.users.find_one({"email": current_user.email})
    if not user_data:
        return jsonify({"error": "Usuario no encontrado"}), 400
    user_chest_ids = user_data.get("chests", [])
    matching_id = None
    for chest_id in user_chest_ids:
        chest_doc = mongo.chests.find_one({"_id": ObjectId(chest_id)})
        if (
            chest_doc
            and chest_doc.get("rarity") == chest_type
            and chest_doc.get("servidor") == server
        ):
            matching_id = chest_id
            break
    if not matching_id:
        return jsonify({"error": "No tienes el cofre indicado"}), 400

    config = CHEST_CONFIG[chest_type]
    # Solo abrir un cofre
    cards = []
    received_card_ids = []
    for _ in range(config["cards"]):
        r = random.uniform(0, 100)
        cumulative = 0
        for rarity, prob in zip(CARD_RARITIES, config["probabilities"]):
            cumulative += prob
            if r <= cumulative:
                pipeline = [{"$match": {"rareza": rarity}}, {"$sample": {"size": 1}}]
                results = list(mongo.collectables.aggregate(pipeline))
                if results:
                    # Convertir el documento para que sea JSON serializable
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
        {"email": current_user.email}, {"$set": {"chests": user_chests}}
    )
    # Agregar las cartas obtenidas a "coleccionables" en el guild correspondiente
    mongo.users.update_one(
        {"email": current_user.email, "guilds.id": server},
        {"$push": {"guilds.$.coleccionables": {"$each": received_card_ids}}},
    )
    return jsonify({"results": {"chest_type": chest_type, "cards": cards}})

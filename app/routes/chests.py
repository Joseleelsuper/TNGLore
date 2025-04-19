# File: app/routes/chests.py
from flask import Blueprint, render_template, request, jsonify
from flask_login import login_required, current_user
import random
from bson import ObjectId
from collections import Counter

from app.utils.images import get_images
from app import mongo

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


# Agregar función auxiliar para serializar ObjectIds en objetos anidados
def serialize_doc(doc):
    if isinstance(doc, dict):
        return {k: serialize_doc(v) for k, v in doc.items()}
    elif isinstance(doc, list):
        return [serialize_doc(item) for item in doc]
    elif isinstance(doc, ObjectId):
        return str(doc)
    else:
        return doc


@chest_bp.route("/cofres")
@login_required
def chests():
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

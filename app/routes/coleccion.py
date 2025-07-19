from flask import Blueprint, render_template, jsonify
from flask_login import login_required, current_user
from bson import ObjectId

from app.utils.images import get_images
from app import mongo, cache

collections_bp = Blueprint("collections", __name__)


@cache.memoize(timeout=1800)  # 30 minutos de caché
def get_all_collections():
    """Obtiene todas las colecciones con caché"""
    try:
        # Obtener todas las colecciones de la tabla collections
        collections = list(mongo.collections.find({}))
        
        # Para cada colección, contar las cartas y serializar
        for collection in collections:
            original_id = collection["_id"]
            collection["_id"] = str(collection["_id"])
            # Contar cartas en esta colección
            card_count = mongo.collectables.count_documents({"coleccion": original_id})
            collection["count"] = card_count
        
        return collections
    except Exception as e:
        print(f"Error getting collections: {e}")
        return []


@cache.memoize(timeout=900)  # 15 minutos de caché
def get_user_collectibles_data(user_email):
    """Obtiene datos de coleccionables del usuario con caché"""
    try:
        user_data = mongo.users.find_one({"email": user_email})
        if not user_data:
            print(f"Usuario no encontrado: {user_email}")
            return {"guilds": []}
            
        guilds = user_data.get("guilds")
        if not guilds or not isinstance(guilds, list):
            print(f"Usuario sin guilds válidos: {user_email}")
            return {"guilds": []}
        
        # Procesar datos de guilds con coleccionables detallados
        processed_guilds = []
        for guild in guilds:
            try:
                collectables_ids = guild.get("coleccionables", [])
                if collectables_ids and isinstance(collectables_ids, list):
                    # Validar y convertir ObjectIds de forma segura
                    valid_object_ids = []
                    for id_str in collectables_ids:
                        if isinstance(id_str, str) and ObjectId.is_valid(id_str):
                            valid_object_ids.append(ObjectId(id_str))
                        else:
                            print(f"ID inválido encontrado: {id_str}")
                    
                    if valid_object_ids:
                        # Obtener detalles de los coleccionables
                        collectables_details = list(mongo.collectables.find({"_id": {"$in": valid_object_ids}}))
                        
                        # Serializar ObjectIds y colección
                        for item in collectables_details:
                            item["_id"] = str(item["_id"])
                            if "coleccion" in item and item["coleccion"]:
                                item["coleccion"] = str(item["coleccion"])
                        
                        guild_data = guild.copy()
                        guild_data["collectables_details"] = collectables_details
                        guild_data["collectables_count"] = len(collectables_details)
                        processed_guilds.append(guild_data)
                    else:
                        guild_data = guild.copy()
                        guild_data["collectables_details"] = []
                        guild_data["collectables_count"] = 0
                        processed_guilds.append(guild_data)
                else:
                    guild_data = guild.copy()
                    guild_data["collectables_details"] = []
                    guild_data["collectables_count"] = 0
                    processed_guilds.append(guild_data)
            except Exception as guild_error:
                print(f"Error procesando guild {guild.get('name', 'unknown')}: {guild_error}")
                # Agregar guild sin coleccionables en caso de error
                guild_data = guild.copy()
                guild_data["collectables_details"] = []
                guild_data["collectables_count"] = 0
                processed_guilds.append(guild_data)
        
        return {"guilds": processed_guilds}
    except Exception as e:
        print(f"Error getting user collectibles: {e}")
        return {"guilds": []}


@cache.memoize(timeout=1200)  # 20 minutos de caché
def get_collection_cards(collection_id):
    """Obtiene todas las cartas de una colección específica con caché"""
    try:
        if not ObjectId.is_valid(collection_id):
            print(f"ID de colección inválido: {collection_id}")
            return []
            
        cards = list(mongo.collectables.find({"coleccion": ObjectId(collection_id)}))
        
        # Serializar ObjectIds y agregar datos de colección
        for card in cards:
            card["_id"] = str(card["_id"])
            if "coleccion" in card:
                card["coleccion"] = str(card["coleccion"])
        
        return cards
    except Exception as e:
        print(f"Error getting collection cards: {e}")
        return []


@cache.memoize(timeout=600)  # 10 minutos de caché  
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
        print(f"Error getting card details: {e}")
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
    """API para obtener datos de usuario con caché optimizado"""
    try:
        if not current_user or not current_user.email:
            return jsonify({"error": "Usuario no autenticado"}), 401
            
        print(f"Obteniendo datos de coleccionables para: {current_user.email}")
        user_data = get_user_collectibles_data(current_user.email)
        print(f"Datos obtenidos: {len(user_data.get('guilds', []))} guilds")
        return jsonify(user_data)
    except Exception as e:
        print(f"Error completo en api_user_collectibles: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": "Error interno del servidor", "details": str(e)}), 500

@collections_bp.route("/api/colecciones")
@login_required  
def api_collections():
    """API para obtener todas las colecciones con caché"""
    collections = get_all_collections()
    return jsonify(collections)

@collections_bp.route("/api/colecciones/<collection_id>/cartas")
@login_required
def api_collection_cards(collection_id):
    """API para obtener cartas de una colección específica con caché"""
    try:
        if not ObjectId.is_valid(collection_id):
            return jsonify({"error": "ID de colección inválido"}), 400
            
        cards = list(mongo.collectables.find({"coleccion": ObjectId(collection_id)}))
        
        # Serializar ObjectIds y poblar datos de colección
        for card in cards:
            card["_id"] = str(card["_id"])
            card["coleccion"] = str(card["coleccion"])
            
        return jsonify(cards)
    except Exception as e:
        print(f"Error getting collection cards: {e}")
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
        print(f"Error getting collection details: {e}")
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
        print(f"Error getting all cards: {e}")
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
        print(f"Error getting related cards: {e}")
        return jsonify({"error": "Error interno del servidor"}), 500
        return jsonify([])
    
    try:
        # Buscar cartas por coleccion ObjectId
        if isinstance(collection_id, str):
            collection_id = ObjectId(collection_id)
        
        related_cards = list(mongo.collectables.find({
            "coleccion": collection_id,
            "_id": {"$ne": ObjectId(card_id)}
        }))
        
        # Serializar ObjectIds
        for card in related_cards:
            card["_id"] = str(card["_id"])
            if isinstance(card.get("coleccion"), ObjectId):
                card["coleccion"] = str(card["coleccion"])
        
        return jsonify(related_cards)
    except Exception as e:
        print(f"Error getting related cards: {e}")
        return jsonify([])
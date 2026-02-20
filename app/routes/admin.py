import requests
import base64
import os

from flask import Blueprint, current_app, render_template, request, jsonify
from flask_login import login_required, current_user
from bson.objectid import ObjectId

from app import mongo, cache, bcrypt
from app.utils.adminRequired import admin_required
from app.utils.images import get_images
from app.utils.cache_manager import safe_memoize, safe_delete_memoized

GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN")
GITHUB_REPO = os.environ.get("GITHUB_REPO")
GITHUB_API_URL = f"https://api.github.com/repos/{GITHUB_REPO}/contents"
GITHUB_BRANCH = os.environ.get("GITHUB_BRANCH", "development")

admin_bp = Blueprint("admin", __name__)


@safe_memoize(timeout=600)  # 10 minutos de caché
def get_all_cards_cached():
    """Obtiene todas las cartas con caché para admin"""
    try:
        cards = list(mongo.collectables.find())
        # Serializar ObjectIds
        for card in cards:
            card["_id"] = str(card["_id"])
        return cards
    except Exception as e:
        current_app.logger.error(f"Error getting cards: {e}")
        return []


@safe_memoize(timeout=1200)  # 20 minutos de caché
def get_all_collections_cached():
    """Obtiene todas las colecciones con caché para admin"""
    try:
        collections = list(mongo.collections.find())
        
        # Serializar ObjectIds
        for collection in collections:
            if collection.get("_id"):
                collection["_id"] = str(collection["_id"])
        
        return collections
    except Exception as e:
        current_app.logger.error(f"Error getting collections: {e}")
        return []


@safe_memoize(timeout=300)  # 5 minutos de caché
def get_all_users_cached():
    """Obtiene todos los usuarios con caché para admin"""
    try:
        users = list(mongo.users.find({}, {
            "password": 0  # Excluir contraseñas por seguridad
        }))
        # Serializar ObjectIds
        for user in users:
            user["_id"] = str(user["_id"])
        return users
    except Exception as e:
        current_app.logger.error(f"Error getting users: {e}")
        return []


def invalidate_cards_cache():
    """Invalida el caché de cartas cuando se modifican"""
    safe_delete_memoized(get_all_cards_cached)
    safe_delete_memoized(get_all_collections_cached)


def invalidate_collections_cache():
    """Invalida el caché de colecciones cuando se modifican"""
    safe_delete_memoized(get_all_collections_cached)


def invalidate_users_cache():
    """Invalida el caché de usuarios cuando se modifican"""
    safe_delete_memoized(get_all_users_cached)


@admin_bp.route("/admin")
@login_required
@admin_required
def admin_panel():
    """Panel de administración con datos cacheados"""
    return render_template("pages/admin.html", user=current_user, images=get_images())


@admin_bp.route("/api/admin/cartas", methods=['GET'])
@login_required
@admin_required
def api_cartas():
    """API para obtener cartas con caché. Pre-carga colecciones para evitar N+1."""
    try:
        cartas = get_all_cards_cached()
        
        # Filtrar por colección si se especifica
        coleccion_id = request.args.get('coleccion')
        if coleccion_id:
            try:
                from bson import ObjectId
                coleccion_oid = ObjectId(coleccion_id)
                cartas = [carta for carta in cartas if carta.get('coleccion') == coleccion_oid]
            except Exception:
                pass
        
        # Pre-cargar TODAS las colecciones en un dict para evitar N+1
        all_collections = list(mongo.collections.find({}))
        collections_map = {}
        for col in all_collections:
            collections_map[col['_id']] = {
                'id': str(col['_id']),
                'nombre': col['nombre'],
                'descripcion': col.get('descripcion'),
                'image': col.get('image')
            }
        
        no_collection = {
            'id': None,
            'nombre': 'No asignada',
            'descripcion': None,
            'image': None
        }
        
        # Mapear colecciones a cartas usando el dict pre-cargado
        for carta in cartas:
            col_id = carta.get('coleccion')
            if col_id and col_id in collections_map:
                carta['coleccion'] = collections_map[col_id]
            else:
                carta['coleccion'] = no_collection
        
        return jsonify(cartas), 200
    except Exception as e:
        current_app.logger.error(f"Error al obtener cartas: {str(e)}", exc_info=True)
        return jsonify({'error': 'Error interno del servidor'}), 500


@admin_bp.route("/api/collections", methods=['GET'])
@login_required
def api_collections():
    """API para obtener colecciones con caché"""
    try:
        collections = get_all_collections_cached()
        return jsonify(collections), 200
    except Exception as e:
        current_app.logger.error(f"Error al obtener colecciones: {str(e)}", exc_info=True)
        return jsonify({'error': 'Error interno del servidor'}), 500


@admin_bp.route("/api/users", methods=['GET'])
@login_required
@admin_required
def api_users():
    """API para obtener usuarios con caché"""
    try:
        users = get_all_users_cached()
        return jsonify(users), 200
    except Exception as e:
        current_app.logger.error(f"Error al obtener usuarios: {str(e)}", exc_info=True)
        return jsonify({'error': 'Error interno del servidor'}), 500


@admin_bp.route("/api/admin/cartas/<id>", methods=["GET"])
@login_required
@admin_required
def obtener_carta(id):
    try:
        carta = mongo.collectables.find_one({"_id": ObjectId(id)})
        if carta:
            carta["_id"] = str(carta["_id"])
            # Obtener la información completa de la colección
            if "coleccion" in carta and carta["coleccion"]:
                coleccion = mongo.collections.find_one({"_id": carta["coleccion"]})
                if coleccion:
                    carta["coleccion"] = {
                        "id": str(coleccion["_id"]),
                        "nombre": coleccion["nombre"],
                        "descripcion": coleccion.get("descripcion"),
                        "image": coleccion.get("image"),
                    }
                else:
                    carta["coleccion"] = {
                        "id": None,
                        "nombre": "No asignada",
                        "descripcion": None,
                        "image": None,
                    }
            else:
                carta["coleccion"] = {
                    "id": None,
                    "nombre": "No asignada",
                    "descripcion": None,
                    "image": None,
                }
            return jsonify(carta)
        return jsonify({"error": "Carta no encontrada"}), 404
    except Exception as e:
        current_app.logger.error(f"Error al obtener carta: {str(e)}")
        return jsonify({"error": "Error interno del servidor"}), 500


def serialize_object_id(obj):
    if isinstance(obj, ObjectId):
        return str(obj)
    raise TypeError(f"Object of type {obj.__class__.__name__} is not JSON serializable")





@admin_bp.route("/api/colecciones", methods=["GET"])
@login_required
def obtener_colecciones():
    try:
        colecciones = get_all_collections_cached()
        return jsonify(colecciones), 200
    except Exception as e:
        current_app.logger.error(f"Error al obtener colecciones: {str(e)}")
        return jsonify({"error": "Error interno del servidor"}), 500


@admin_bp.route("/api/admin/cartas", methods=["POST"])
@login_required
@admin_required
def crear_carta():
    try:
        coleccion_id = request.form.get("coleccion")
        if not coleccion_id:
            return jsonify({"error": "El ID de la colección es requerido"}), 400

        nueva_carta = {
            "nombre": request.form.get("nombre"),
            "descripcion": request.form.get("descripcion"),
            "rareza": request.form.get("rareza"),
            "coleccion": ObjectId(coleccion_id),
            "image": None,  # Se actualizará después de subir la imagen
        }

        # Validación de datos
        if not nueva_carta["nombre"] or not nueva_carta["rareza"]:
            return jsonify({"error": "Faltan campos requeridos"}), 400

        # Verificar si la colección existe
        coleccion = mongo.collections.find_one({"_id": nueva_carta["coleccion"]})
        if not coleccion:
            return jsonify({"error": "La colección especificada no existe"}), 400

        result = mongo.collectables.insert_one(nueva_carta)
        
        # Invalidar caché después de crear
        invalidate_cards_cache()
        
        return jsonify({"message": "Carta creada", "id": str(result.inserted_id)}), 201
    except ValueError as ve:
        return jsonify({"error": f"ID de colección inválido: {str(ve)}"}), 400
    except Exception as e:
        current_app.logger.error(f"Error al crear carta: {str(e)}")
        return jsonify({"error": f"Error interno del servidor: {str(e)}"}), 500


@admin_bp.route("/api/admin/cartas/<id>", methods=["PUT"])
@login_required
@admin_required
def actualizar_carta(id):
    try:
        carta = mongo.collectables.find_one({"_id": ObjectId(id)})
        if not carta:
            return jsonify({"error": "Carta no encontrada"}), 404

        # Crear un diccionario con los campos a actualizar
        updates = {}
        if "nombre" in request.form:
            updates["nombre"] = request.form.get("nombre")
        if "descripcion" in request.form:
            updates["descripcion"] = request.form.get("descripcion")
        if "rareza" in request.form:
            updates["rareza"] = request.form.get("rareza")
        if "coleccion" in request.form:
            coleccion_id = request.form.get("coleccion")
            if coleccion_id:
                try:
                    updates["coleccion"] = ObjectId(coleccion_id)
                except Exception:
                    return jsonify(
                        {"error": f"ID de colección inválido: {coleccion_id}"}
                    ), 400

        # Imprimir los datos recibidos y las actualizaciones para depuración
        current_app.logger.info(f"Datos recibidos: {request.form}")
        current_app.logger.info(f"Actualizaciones a realizar: {updates}")

        # Actualizar solo los campos proporcionados
        if updates:
            result = mongo.collectables.update_one(
                {"_id": ObjectId(id)}, {"$set": updates}
            )
            
            # Invalidar caché después de actualizar
            invalidate_cards_cache()
            
            if result.modified_count == 0:
                # Verificar si la carta existe pero no se modificó
                if mongo.collectables.find_one({"_id": ObjectId(id)}):
                    return jsonify(
                        {"message": "No se realizaron cambios en la carta", "id": id}
                    ), 200
                else:
                    return jsonify({"error": "No se pudo actualizar la carta"}), 400
            return jsonify({"message": "Carta actualizada", "id": id}), 200
        else:
            return jsonify({"message": "No se proporcionaron cambios", "id": id}), 200

    except Exception as e:
        current_app.logger.error(f"Error al actualizar carta: {str(e)}", exc_info=True)
        return jsonify({"error": f"Error interno del servidor: {str(e)}"}), 500


@admin_bp.route("/api/colecciones", methods=["POST"])
@login_required
@admin_required
def crear_coleccion():
    try:
        nueva_coleccion = {
            "nombre": request.form.get("nombre"),
            "descripcion": request.form.get("descripcion"),
            "image": None,  # Se actualizará después de subir la imagen
        }
        result = mongo.collections.insert_one(nueva_coleccion)
        
        # Invalidar caché después de crear
        invalidate_collections_cache()
        
        return jsonify(
            {"message": "Colección creada", "id": str(result.inserted_id)}
        ), 201
    except Exception as e:
        current_app.logger.error(f"Error al crear colección: {str(e)}")
        return jsonify({"error": "Error interno del servidor"}), 500


def create_github_folder(path):
    headers = {
        "Authorization": f"token {GITHUB_TOKEN}",
        "Accept": "application/vnd.github.v3+json",
    }
    data = {"message": f"Create folder: {path}", "content": ""}
    response = requests.put(
        f"{GITHUB_API_URL}/{path}/.gitkeep", headers=headers, json=data
    )
    return response.status_code == 201


@admin_bp.route("/api/colecciones/<id>", methods=["GET", "PUT", "DELETE"])
@login_required
@admin_required
def api_coleccion(id):
    if request.method == "GET":
        coleccion = mongo.collections.find_one({"_id": ObjectId(id)})
        if not coleccion:
            return jsonify({"error": "Colección no encontrada"}), 404
        return jsonify({**coleccion, "_id": str(coleccion["_id"])})
    elif request.method == "PUT":
        try:
            coleccion = mongo.collections.find_one({"_id": ObjectId(id)})
            if not coleccion:
                return jsonify({"error": "Colección no encontrada"}), 404

            # Crear un diccionario con los campos a actualizar
            updates = {}
            if "nombre" in request.form:
                updates["nombre"] = request.form.get("nombre")
            if "descripcion" in request.form:
                updates["descripcion"] = request.form.get("descripcion")

            # Imprimir los datos recibidos y las actualizaciones para depuración
            current_app.logger.info(f"Datos recibidos: {request.form}")
            current_app.logger.info(f"Actualizaciones a realizar: {updates}")

            # Actualizar solo los campos proporcionados
            if updates:
                result = mongo.collections.update_one(
                    {"_id": ObjectId(id)}, {"$set": updates}
                )
                if result.modified_count == 0:
                    # Verificar si la colección existe pero no se modificó
                    if mongo.collections.find_one({"_id": ObjectId(id)}):
                        return jsonify(
                            {
                                "message": "No se realizaron cambios en la colección",
                                "id": id,
                            }
                        ), 200
                    else:
                        return jsonify(
                            {"error": "No se pudo actualizar la colección"}
                        ), 400
                return jsonify({"message": "Colección actualizada", "id": id}), 200
            else:
                return jsonify(
                    {"message": "No se proporcionaron cambios", "id": id}
                ), 200

        except Exception as e:
            current_app.logger.error(
                f"Error al actualizar colección: {str(e)}", exc_info=True
            )
            return jsonify({"error": f"Error interno del servidor: {str(e)}"}), 500
    elif request.method == "DELETE":
        result = mongo.collections.delete_one({"_id": ObjectId(id)})
        if result.deleted_count == 0:
            return jsonify({"error": "No se pudo eliminar la colección"}), 400
        # Eliminar todas las cartas asociadas a esta colección
        mongo.collectables.delete_many({"coleccion": ObjectId(id)})
        return jsonify({"message": "Colección y cartas asociadas eliminadas"})
    # Ensure a valid response is always returned
    return jsonify({"error": "Método no permitido"}), 405


@admin_bp.route("/api/usuarios", methods=["GET"])
@login_required
@admin_required
def api_usuarios():
    try:
        usuarios = get_all_users_cached()
        return jsonify(usuarios), 200
    except Exception as e:
        current_app.logger.error(f"Error al obtener usuarios: {str(e)}")
        return jsonify({"error": "Error interno del servidor"}), 500


@admin_bp.route("/api/usuarios/<id>", methods=["GET", "DELETE"])
@login_required
@admin_required
def api_usuario(id):
    if request.method == "GET":
        usuario = mongo.users.find_one({"_id": ObjectId(id)}, {"password": 0})
        if usuario:
            return jsonify({**usuario, "_id": str(usuario["_id"])})
        else:
            return jsonify({"error": "Usuario no encontrado"}), 404
    elif request.method == "DELETE":
        result = mongo.users.delete_one({"_id": ObjectId(id)})
        if result.deleted_count == 0:
            return jsonify({"error": "Usuario no encontrado"}), 404
        
        # Invalidar caché después de eliminar usuario
        invalidate_users_cache()
        
        return jsonify({"message": "Usuario eliminado"})
    return jsonify({"error": "Método no permitido"}), 405


@admin_bp.route("/api/usuarios/<id>/cambiar-contrasena", methods=["POST"])
@login_required
@admin_required
def cambiar_contrasena_usuario(id):
    if not request.json or "password" not in request.json:
        return jsonify({"error": "No se proporcionó una nueva contraseña"}), 400
    nueva_contrasena = request.json.get("password")

    hashed_password = bcrypt.generate_password_hash(nueva_contrasena).decode('utf-8')
    mongo.users.update_one(
        {"_id": ObjectId(id)}, {"$set": {"password": hashed_password}}
    )
    
    # Invalidar caché después de actualizar contraseña
    invalidate_users_cache()
    
    return jsonify({"message": "Contraseña actualizada"})


def upload_image_to_github(image_data, path):
    headers = {
        "Authorization": f"token {GITHUB_TOKEN}",
        "Accept": "application/vnd.github.v3+json",
    }
    content = base64.b64encode(image_data).decode("utf-8")
    data = {"message": f"Add image: {path}", "content": content}
    response = requests.put(f"{GITHUB_API_URL}/{path}", headers=headers, json=data)
    if response.status_code == 201:
        return f"https://cdn.jsdelivr.net/gh/{GITHUB_REPO}@{GITHUB_BRANCH}/{path}"
    else:
        raise Exception(f"Failed to upload image: {response.text}")


@admin_bp.route("/api/upload-image", methods=["POST"])
@login_required
@admin_required
def upload_image():
    if "image" not in request.files:
        return jsonify({"error": "No se proporcionó archivo de imagen"}), 400

    image = request.files["image"]
    tipo = request.form.get("tipo")
    id = request.form.get("id")

    if tipo not in ["coleccion", "carta"]:
        return jsonify({"error": "Tipo inválido"}), 400

    try:
        if tipo == "coleccion":
            coleccion = mongo.collections.find_one({"_id": ObjectId(id)})
            if not coleccion:
                return jsonify({"error": "Colección no encontrada"}), 404
            extension = (
                image.filename.split(".")[-1]
                if image.filename and "." in image.filename
                else "png"
            )
            path = f"app/static/assets/collections/{coleccion['nombre']}/image/{id}.{extension}"
        else:
            carta = mongo.collectables.find_one({"_id": ObjectId(id)})
            if not carta:
                return jsonify({"error": "Carta no encontrada"}), 404
            coleccion = mongo.collections.find_one({"_id": carta["coleccion"]})
            if not coleccion:
                return jsonify({"error": "Colección no encontrada para la carta"}), 404
            extension = (
                image.filename.split(".")[-1]
                if image.filename and "." in image.filename
                else "png"
            )
            path = f"app/static/assets/collections/{coleccion['nombre']}/cards/{id}.{extension}"

        # Eliminar la imagen anterior si existe
        delete_from_github(path)

        # Subir la nueva imagen
        image_url = upload_image_to_github(image.read(), path)
        image_url = image_url.replace("@development", "@main")

        # Actualizar la URL de la imagen en la base de datos
        if tipo == "coleccion":
            mongo.collections.update_one(
                {"_id": ObjectId(id)}, {"$set": {"image": image_url}}
            )
            # Invalidar caché después de actualizar imagen de colección
            invalidate_collections_cache()
        else:
            mongo.collectables.update_one(
                {"_id": ObjectId(id)}, {"$set": {"image": image_url}}
            )
            # Invalidar caché después de actualizar imagen de carta
            invalidate_cards_cache()

        return jsonify({"message": "Imagen subida exitosamente", "url": image_url})
    except Exception as e:
        current_app.logger.error(f"Error al subir imagen: {str(e)}", exc_info=True)
        return jsonify({"error": str(e)}), 500


def delete_from_github(path):
    headers = {
        "Authorization": f"token {GITHUB_TOKEN}",
        "Accept": "application/vnd.github.v3+json",
    }
    response = requests.get(f"{GITHUB_API_URL}/{path}", headers=headers)
    if response.status_code == 200:
        content = response.json()
        data = {"message": f"Delete {path}", "sha": content["sha"]}
        delete_response = requests.delete(
            f"{GITHUB_API_URL}/{path}", headers=headers, json=data
        )
        return delete_response.status_code == 200
    return False


@admin_bp.route("/api/admin/cartas/<id>", methods=["DELETE"])
@login_required
@admin_required
def eliminar_carta(id):
    carta = mongo.collectables.find_one({"_id": ObjectId(id)})
    if carta:
        coleccion = mongo.collections.find_one({"_id": carta["coleccion"]})
        if coleccion:
            image_path = (
                f"app/static/assets/collections/{coleccion['_id']}/cards/{id}.png"
            )
            delete_from_github(image_path)
        mongo.collectables.delete_one({"_id": ObjectId(id)})
        
        # Invalidar caché después de eliminar
        invalidate_cards_cache()
        
        return jsonify({"message": "Carta eliminada"})
    return jsonify({"error": "Carta no encontrada"}), 404


@admin_bp.route("/api/colecciones/<id>", methods=["DELETE"])
@login_required
@admin_required
def eliminar_coleccion(id):
    coleccion = mongo.collections.find_one({"_id": ObjectId(id)})
    if coleccion:
        # Eliminar la carpeta de la colección en GitHub
        folder_path = f"app/static/assets/collections/{id}"
        delete_from_github(folder_path)

        # Eliminar la colección y sus cartas de la base de datos
        mongo.collections.delete_one({"_id": ObjectId(id)})
        mongo.collectables.delete_many({"coleccion": ObjectId(id)})
        
        # Invalidar caché después de eliminar
        invalidate_collections_cache()
        invalidate_cards_cache()  # También invalidar cartas porque se eliminaron cartas asociadas
        
        return jsonify({"message": "Colección y cartas asociadas eliminadas"})
    return jsonify({"error": "Colección no encontrada"}), 404

import requests
import base64
import os


from bson import json_util
from flask import Blueprint, json, render_template, request, jsonify
from flask_login import login_required, current_user
from bson.objectid import ObjectId
from werkzeug.security import generate_password_hash

from app import mongo
from app.utils.adminRequired import admin_required
from app.utils.images import get_images

GITHUB_TOKEN = os.environ.get('GITHUB_TOKEN')
GITHUB_REPO = os.environ.get('GITHUB_REPO')
GITHUB_API_URL = f'https://api.github.com/repos/{GITHUB_REPO}/contents'

admin_bp = Blueprint("admin", __name__)

@admin_bp.route("/admin")
@login_required
@admin_required
def admin_panel():
    return render_template("pages/admin.html", user=current_user, images=get_images())

@admin_bp.route("/api/cartas", methods=['GET'])
@login_required
@admin_required
def api_cartas():
    if request.method == 'GET':
        try:
            cartas = list(mongo.collectables.find())
            for carta in cartas:
                carta['_id'] = str(carta['_id'])
                # Obtener la información completa de la colección
                if 'coleccion' in carta and carta['coleccion']:
                    coleccion = mongo.collections.find_one({'_id': carta['coleccion']})
                    if coleccion:
                        carta['coleccion'] = {
                            'id': str(coleccion['_id']),
                            'nombre': coleccion['nombre'],
                            'descripcion': coleccion.get('descripcion'),
                            'image': coleccion.get('image')
                        }
                    else:
                        carta['coleccion'] = {
                            'id': None,
                            'nombre': 'No asignada',
                            'descripcion': None,
                            'image': None
                        }
                else:
                    carta['coleccion'] = {
                        'id': None,
                        'nombre': 'No asignada',
                        'descripcion': None,
                        'image': None
                    }
            return json.dumps(cartas, default=json_util.default), 200, {'Content-Type': 'application/json'}
        except Exception as e:
            print(f"Error al obtener cartas: {str(e)}")
            return jsonify({'error': 'Error interno del servidor'}), 500

@admin_bp.route("/api/cartas/<id>", methods=['GET'])
@login_required
@admin_required
def obtener_carta(id):
    try:
        carta = mongo.collectables.find_one({'_id': ObjectId(id)})
        if carta:
            carta['_id'] = str(carta['_id'])
            # Obtener la información completa de la colección
            if 'coleccion' in carta and carta['coleccion']:
                coleccion = mongo.collections.find_one({'_id': carta['coleccion']})
                if coleccion:
                    carta['coleccion'] = {
                        'id': str(coleccion['_id']),
                        'nombre': coleccion['nombre'],
                        'descripcion': coleccion.get('descripcion'),
                        'image': coleccion.get('image')
                    }
                else:
                    carta['coleccion'] = {
                        'id': None,
                        'nombre': 'No asignada',
                        'descripcion': None,
                        'image': None
                    }
            else:
                carta['coleccion'] = {
                    'id': None,
                    'nombre': 'No asignada',
                    'descripcion': None,
                    'image': None
                }
            return jsonify(carta)
        return jsonify({'error': 'Carta no encontrada'}), 404
    except Exception as e:
        print(f"Error al obtener carta: {str(e)}")
        return jsonify({'error': 'Error interno del servidor'}), 500

def serialize_object_id(obj):
    if isinstance(obj, ObjectId):
        return str(obj)
    raise TypeError(f"Object of type {obj.__class__.__name__} is not JSON serializable")

@admin_bp.route("/api/cartas", methods=['GET'])
@login_required
@admin_required
def obtener_cartas():
    try:
        cartas = list(mongo.collectables.find())
        return json.dumps(cartas, default=serialize_object_id), 200, {'Content-Type': 'application/json'}
    except Exception as e:
        print(f"Error al obtener cartas: {str(e)}")
        return jsonify({'error': 'Error interno del servidor'}), 500
    
@admin_bp.route("/api/colecciones", methods=['GET'])
@login_required
@admin_required
def obtener_colecciones():
    try:
        colecciones = list(mongo.collections.find())
        return json.dumps(colecciones, default=serialize_object_id), 200, {'Content-Type': 'application/json'}
    except Exception as e:
        print(f"Error al obtener colecciones: {str(e)}")
        return jsonify({'error': 'Error interno del servidor'}), 500

@admin_bp.route("/api/cartas", methods=['POST'])
@login_required
@admin_required
def crear_carta():
    try:
        nueva_carta = {
            'nombre': request.form.get('nombre'),
            'descripcion': request.form.get('descripcion'),
            'rareza': request.form.get('rareza'),
            'coleccion': ObjectId(request.form.get('coleccion')),
            'image': None  # Se actualizará después de subir la imagen
        }
        result = mongo.collectables.insert_one(nueva_carta)
        return jsonify({'message': 'Carta creada', 'id': str(result.inserted_id)}), 201
    except Exception as e:
        print(f"Error al crear carta: {str(e)}")
        return jsonify({'error': 'Error interno del servidor'}), 500

@admin_bp.route("/api/colecciones", methods=['POST'])
@login_required
@admin_required
def crear_coleccion():
    try:
        nueva_coleccion = {
            'nombre': request.form.get('nombre'),
            'descripcion': request.form.get('descripcion'),
            'image': None  # Se actualizará después de subir la imagen
        }
        result = mongo.collections.insert_one(nueva_coleccion)
        return jsonify({'message': 'Colección creada', 'id': str(result.inserted_id)}), 201
    except Exception as e:
        print(f"Error al crear colección: {str(e)}")
        return jsonify({'error': 'Error interno del servidor'}), 500

def create_github_folder(path):
    headers = {
        'Authorization': f'token {GITHUB_TOKEN}',
        'Accept': 'application/vnd.github.v3+json'
    }
    data = {
        'message': f'Create folder: {path}',
        'content': ''
    }
    response = requests.put(f'{GITHUB_API_URL}/{path}/.gitkeep', headers=headers, json=data)
    return response.status_code == 201

@admin_bp.route("/api/colecciones/<id>", methods=['GET', 'PUT', 'DELETE'])
@login_required
@admin_required
def api_coleccion(id):
    if request.method == 'GET':
        coleccion = mongo.collections.find_one({'_id': ObjectId(id)})
        if not coleccion:
            return jsonify({'error': 'Colección no encontrada'}), 404
        return jsonify({**coleccion, '_id': str(coleccion['_id'])})
    elif request.method == 'PUT':
        nombre = request.form.get('nombre')
        descripcion = request.form.get('descripcion')
        
        if not nombre or not descripcion:
            return jsonify({'error': 'Nombre y descripción son requeridos'}), 400
        
        updates = {
            'nombre': nombre,
            'descripcion': descripcion
        }
        result = mongo.collections.update_one({'_id': ObjectId(id)}, {'$set': updates})
        if result.modified_count == 0:
            return jsonify({'error': 'No se pudo actualizar la colección'}), 400
        return jsonify({'message': 'Colección actualizada'})
    elif request.method == 'DELETE':
        result = mongo.collections.delete_one({'_id': ObjectId(id)})
        if result.deleted_count == 0:
            return jsonify({'error': 'No se pudo eliminar la colección'}), 400
        # Eliminar todas las cartas asociadas a esta colección
        mongo.collectables.delete_many({'coleccion': ObjectId(id)})
        return jsonify({'message': 'Colección y cartas asociadas eliminadas'})

@admin_bp.route("/api/usuarios", methods=['GET'])
@login_required
@admin_required
def api_usuarios():
    usuarios = list(mongo.users.find({}, {'password': 0}))
    return jsonify([{**usuario, '_id': str(usuario['_id'])} for usuario in usuarios])

@admin_bp.route("/api/usuarios/<id>", methods=['GET', 'DELETE'])
@login_required
@admin_required
def api_usuario(id):
    if request.method == 'GET':
        usuario = mongo.users.find_one({'_id': ObjectId(id)}, {'password': 0})
        return jsonify({**usuario, '_id': str(usuario['_id'])})
    elif request.method == 'DELETE':
        mongo.users.delete_one({'_id': ObjectId(id)})
        return jsonify({'message': 'Usuario eliminado'})

@admin_bp.route("/api/usuarios/<id>/cambiar-contrasena", methods=['POST'])
@login_required
@admin_required
def cambiar_contrasena_usuario(id):
    nueva_contrasena = request.json.get('password')
    if not nueva_contrasena:
        return jsonify({'error': 'No se proporcionó una nueva contraseña'}), 400
    
    hashed_password = generate_password_hash(nueva_contrasena)
    mongo.users.update_one({'_id': ObjectId(id)}, {'$set': {'password': hashed_password}})
    return jsonify({'message': 'Contraseña actualizada'})

def upload_image_to_github(image_data, path):
    headers = {
        'Authorization': f'token {GITHUB_TOKEN}',
        'Accept': 'application/vnd.github.v3+json'
    }
    content = base64.b64encode(image_data).decode('utf-8')
    data = {
        'message': f'Add image: {path}',
        'content': content
    }
    response = requests.put(f'{GITHUB_API_URL}/{path}', headers=headers, json=data)
    if response.status_code == 201:
        return f'https://cdn.jsdelivr.net/gh/{GITHUB_REPO}@main/{path}'
    else:
        raise Exception(f'Failed to upload image: {response.text}')

@admin_bp.route("/api/upload-image", methods=['POST'])
@login_required
@admin_required
def upload_image():
    if 'image' not in request.files:
        return jsonify({'error': 'No se proporcionó archivo de imagen'}), 400
    
    image = request.files['image']
    tipo = request.form.get('tipo')
    id = request.form.get('id')
    
    if tipo not in ['coleccion', 'carta']:
        return jsonify({'error': 'Tipo inválido'}), 400
    
    if tipo == 'coleccion':
        coleccion = mongo.collections.find_one({'_id': ObjectId(id)})
        if not coleccion:
            return jsonify({'error': 'Colección no encontrada'}), 404
        path = f'app/static/assets/collections/{coleccion["nombre"]}/image/{id}.{image.filename.split(".")[-1]}'
    else:
        carta = mongo.collectables.find_one({'_id': ObjectId(id)})
        if not carta:
            return jsonify({'error': 'Carta no encontrada'}), 404
        coleccion = mongo.collections.find_one({'_id': carta['coleccion']})
        path = f'app/static/assets/collections/{coleccion["nombre"]}/cards/{id}.{image.filename.split(".")[-1]}'
    
    try:
        image_url = upload_image_to_github(image.read(), path)
        if tipo == 'coleccion':
            mongo.collections.update_one({'_id': ObjectId(id)}, {'$set': {'image': image_url}})
        else:
            mongo.collectables.update_one({'_id': ObjectId(id)}, {'$set': {'image': image_url}})
        return jsonify({'message': 'Imagen subida exitosamente', 'url': image_url})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    
def delete_from_github(path):
    headers = {
        'Authorization': f'token {GITHUB_TOKEN}',
        'Accept': 'application/vnd.github.v3+json'
    }
    response = requests.get(f'{GITHUB_API_URL}/{path}', headers=headers)
    if response.status_code == 200:
        content = response.json()
        data = {
            'message': f'Delete {path}',
            'sha': content['sha']
        }
        delete_response = requests.delete(f'{GITHUB_API_URL}/{path}', headers=headers, json=data)
        return delete_response.status_code == 200
    return False

@admin_bp.route("/api/cartas/<id>", methods=['DELETE'])
@login_required
@admin_required
def eliminar_carta(id):
    carta = mongo.collectables.find_one({'_id': ObjectId(id)})
    if carta:
        coleccion = mongo.collections.find_one({'_id': carta['coleccion']})
        if coleccion:
            image_path = f'app/static/assets/collections/{coleccion["_id"]}/cards/{id}.png'
            delete_from_github(image_path)
        mongo.collectables.delete_one({'_id': ObjectId(id)})
        return jsonify({'message': 'Carta eliminada'})
    return jsonify({'error': 'Carta no encontrada'}), 404

@admin_bp.route("/api/colecciones/<id>", methods=['DELETE'])
@login_required
@admin_required
def eliminar_coleccion(id):
    coleccion = mongo.collections.find_one({'_id': ObjectId(id)})
    if coleccion:
        # Eliminar la carpeta de la colección en GitHub
        folder_path = f'app/static/assets/collections/{id}'
        delete_from_github(folder_path)
        
        # Eliminar la colección y sus cartas de la base de datos
        mongo.collections.delete_one({'_id': ObjectId(id)})
        mongo.collectables.delete_many({'coleccion': ObjectId(id)})
        return jsonify({'message': 'Colección y cartas asociadas eliminadas'})
    return jsonify({'error': 'Colección no encontrada'}), 404
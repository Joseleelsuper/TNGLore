from flask import Blueprint, render_template, jsonify, send_from_directory, current_app
from flask_login import login_required, current_user
from typing import List, Dict, Any

from app.utils.images import get_images
from app import mongo
from datetime import datetime
from bson.objectid import ObjectId

main_bp = Blueprint("main", __name__)


@main_bp.route("/sw.js")
def service_worker() -> Any:
    """Sirve el Service Worker desde la raíz para que tenga scope '/'."""
    return send_from_directory(
        current_app.static_folder,  # type: ignore[arg-type]
        'sw.js',
        mimetype='application/javascript',
    )


@main_bp.route("/inicio")
@login_required
def inicio():
    return render_template("pages/inicio.html", user=current_user, images=get_images())

@main_bp.route("/api/cofres-log")
@login_required
def cofres_log() -> tuple:
    """Log de cofres recientes. Usa batch queries en vez de N+1."""
    try:
        logs: List[Dict[str, Any]] = list(mongo.chest_logs.find().sort("date", -1).limit(30))
        if not logs:
            return jsonify([])
        
        # Recolectar IDs únicos para batch queries
        chest_ids = set()
        usernames = set()
        for log in logs:
            if log.get("chest_id"):
                try:
                    chest_ids.add(ObjectId(log["chest_id"]))
                except Exception:
                    pass
            if log.get("username"):
                usernames.add(log["username"])
        
        # Batch query: todos los cofres de una vez
        chests_map: Dict[str, str] = {}
        if chest_ids:
            chests_docs = mongo.chests.find({"_id": {"$in": list(chest_ids)}})
            for chest in chests_docs:
                chests_map[str(chest["_id"])] = chest.get("rarity", "Desconocida")
        
        # Batch query: verificar qué usernames existen
        existing_users = set()
        if usernames:
            users_docs = mongo.users.find(
                {"username": {"$in": list(usernames)}},
                {"username": 1}
            )
            for user in users_docs:
                existing_users.add(user["username"])
        
        # Construir respuesta filtrada
        filtered_logs: List[Dict[str, Any]] = []
        for log in logs:
            username = log.get("username")
            if username not in existing_users:
                continue
            
            log["_id"] = str(log["_id"])
            if not isinstance(log.get("date"), str) and isinstance(log.get("date"), datetime):
                log["date"] = log["date"].isoformat() + "Z"
            
            chest_rarity = chests_map.get(log.get("chest_id"), "Desconocida")
            log["chest"] = {"rareza": chest_rarity}
            filtered_logs.append(log)
        
        return jsonify(filtered_logs)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

from flask import Blueprint, render_template, jsonify
from flask_login import login_required, current_user

from app.utils.images import get_images
from app import mongo
from datetime import datetime
from bson.objectid import ObjectId

main_bp = Blueprint("main", __name__)


@main_bp.route("/inicio")
@login_required
def inicio():
    return render_template("pages/inicio.html", user=current_user, images=get_images())

@main_bp.route("/api/cofres-log")
@login_required
def cofres_log():
    try:
        logs = list(mongo.chest_logs.find().sort("date", -1).limit(10))
        for log in logs:
            log["_id"] = str(log["_id"])
            # Si date ya es string en formato ISO, se deja; de lo contrario se formatea.
            if not isinstance(log.get("date"), str) and isinstance(log.get("date"), datetime):
                log["date"] = log["date"].isoformat() + "Z"
            # Lookup en la colección 'chests' para obtener la rareza
            try:
                chest = mongo.chests.find_one({"_id": ObjectId(log["chest_id"])})
                log["chest"] = {"rareza": chest.get("rarity", "Desconocida")} if chest else {"rareza": "Desconocida"}
            except Exception:
                log["chest"] = {"rareza": "Desconocida"}
        return jsonify(logs)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

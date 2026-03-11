"""
Sistema de eventos de recompensas diarias (reemplaza daily_rewards).

Soporta múltiples eventos simultáneos, cada uno con N días de recompensas.
Tipos de recompensa: cofre, código, carta (específica o aleatoria por rareza).
El progreso se almacena en la colección `event_progress`.
"""

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
import logging

from bson import ObjectId
from flask import Blueprint, jsonify, request
from flask_login import login_required, current_user

from app import mongo
from app.models.user import invalidate_user_cache
from app.utils.bot_servers import get_shared_bot_servers
from app.utils.game_config import get_chest_images
from app.utils.cache_manager import safe_delete_memoized
from app.routes.coleccion import get_user_collectibles_data

logger = logging.getLogger(__name__)

events_bp = Blueprint("events", __name__)


# ─── Helpers ──────────────────────────────────────────────────────────


def _get_active_events() -> List[Dict[str, Any]]:
    """Devuelve los eventos que están activos y dentro de su rango de fechas."""
    now = datetime.now(timezone.utc)
    query = {
        "active": True,
        "start_date": {"$lte": now},
        "$or": [
            {"end_date": {"$gte": now}},
            {"end_date": None},
        ],
    }
    events = list(mongo.events.find(query).sort("start_date", -1))
    for ev in events:
        ev["_id"] = str(ev["_id"])
        if ev.get("start_date"):
            ev["start_date"] = ev["start_date"].isoformat()
        if ev.get("end_date"):
            ev["end_date"] = ev["end_date"].isoformat()
        if ev.get("created_at"):
            ev["created_at"] = ev["created_at"].isoformat()
        if ev.get("updated_at"):
            ev["updated_at"] = ev["updated_at"].isoformat()
    return events


def _get_user_progress(email: str, event_id: str) -> Optional[Dict[str, Any]]:
    """Obtiene el progreso de un usuario en un evento concreto."""
    return mongo.event_progress.find_one({
        "user_email": email,
        "event_id": event_id,
    })


def _can_claim(progress_doc: Optional[Dict[str, Any]]) -> bool:
    """Comprueba si el usuario puede reclamar hoy."""
    if progress_doc is None:
        return True  # nunca reclamó → puede
    if progress_doc.get("completed"):
        return False
    last = progress_doc.get("last_claimed")
    if last is None:
        return True
    now = datetime.now(timezone.utc)
    if last.tzinfo is None:
        last = last.replace(tzinfo=timezone.utc)
    return now.date() > last.date()


def _create_reward_chest(
    email: str, rarity: str, servidor: str = "event_reward"
) -> Optional[str]:
    """Crea un cofre de recompensa y lo asigna al usuario.

    Args:
        email: Email del usuario.
        rarity: Rareza del cofre.
        servidor: ID del servidor donde asignar el cofre.

    Returns:
        ID del cofre creado como string, o None si falla.
    """
    try:
        existing = mongo.chests.find_one({
            "servidor": servidor,
            "rarity": rarity,
        })
        if existing:
            chest_id = existing["_id"]
        else:
            chest_id = ObjectId()
            mongo.chests.insert_one({
                "_id": chest_id,
                "rarity": rarity,
                "servidor": servidor,
                "creation_date": datetime.now(timezone.utc),
                "__v": 0,
            })

        chest_id_str = str(chest_id)
        mongo.users.update_one(
            {"email": email},
            {"$push": {"chests": chest_id_str}},
        )
        return chest_id_str
    except Exception as e:
        logger.error(f"Error creating event reward chest: {e}", exc_info=True)
        return None


def _assign_code_from_pool(email: str) -> Optional[Dict[str, Any]]:
    """Asigna un código disponible del pool al usuario.

    Soporta códigos de un solo uso, múltiples usos y usos ilimitados.
    - ``max_uses == 0``  → ilimitado.
    - ``max_uses == N``  → N usos máximos.
    - Campo ausente       → 1 uso (retrocompatibilidad).

    No asigna el mismo código dos veces al mismo usuario.

    Returns:
        Dict con el código asignado, o None si no hay disponibles.
    """
    try:
        now = datetime.now(timezone.utc)

        # Códigos con capacidad disponible:
        #   - max_uses == 0 → ilimitado (siempre disponible)
        #   - max_uses > 0 y current_uses < max_uses
        #   - Campo ausente (retrocompat): assigned_to == None
        availability_conditions = [
            {"max_uses": 0},
            {"$expr": {"$lt": ["$current_uses", "$max_uses"]}},
            {"max_uses": {"$exists": False}, "assigned_to": None},
        ]

        query: Dict[str, Any] = {
            "active": True,
            "assigned_users.email": {"$ne": email},
            "$and": [
                {"$or": [
                    {"expires_at": None},
                    {"expires_at": {"$gt": now}},
                ]},
                {"$or": availability_conditions},
            ],
        }

        code_doc = mongo.codes.find_one_and_update(
            query,
            {
                "$inc": {"current_uses": 1},
                "$push": {"assigned_users": {"email": email, "assigned_at": now}},
                "$set": {"assigned_to": email, "assigned_at": now},
            },
            return_document=True,
        )
        if code_doc:
            return {
                "code": code_doc["code"],
                "description": code_doc.get("description", ""),
                "link": code_doc.get("link"),
                "expires_at": code_doc.get("expires_at"),
            }
        return None
    except Exception as e:
        logger.error(f"Error assigning code from pool: {e}", exc_info=True)
        return None


def _assign_card_to_user(
    email: str, card_id: str, servidor: str
) -> Optional[Dict[str, Any]]:
    """Asigna una carta específica al usuario en un servidor concreto.

    Returns:
        Dict con datos de la carta, o None si falla.
    """
    try:
        card_doc = mongo.collectables.find_one({"_id": ObjectId(card_id)})
        if not card_doc:
            logger.warning(f"Card {card_id} not found for event reward")
            return None

        mongo.users.update_one(
            {"email": email, "guilds.id": servidor},
            {"$push": {"guilds.$.coleccionables": card_id}},
        )
        return {
            "_id": str(card_doc["_id"]),
            "nombre": card_doc.get("nombre", ""),
            "rareza": card_doc.get("rareza", ""),
            "image": card_doc.get("image", ""),
        }
    except Exception as e:
        logger.error(f"Error assigning card to user: {e}", exc_info=True)
        return None


def _assign_random_card_by_rarity(
    email: str, rarity: str, servidor: str
) -> Optional[Dict[str, Any]]:
    """Asigna una carta aleatoria de la rareza indicada.

    Returns:
        Dict con datos de la carta, o None si falla.
    """
    try:
        pipeline = [{"$match": {"rareza": rarity}}, {"$sample": {"size": 1}}]
        results = list(mongo.collectables.aggregate(pipeline))
        if not results:
            logger.warning(f"No cards found with rarity {rarity}")
            return None

        card_doc = results[0]
        card_id = str(card_doc["_id"])
        mongo.users.update_one(
            {"email": email, "guilds.id": servidor},
            {"$push": {"guilds.$.coleccionables": card_id}},
        )
        return {
            "_id": card_id,
            "nombre": card_doc.get("nombre", ""),
            "rareza": card_doc.get("rareza", ""),
            "image": card_doc.get("image", ""),
        }
    except Exception as e:
        logger.error(f"Error assigning random card: {e}", exc_info=True)
        return None


# ─── Public API ───────────────────────────────────────────────────────


@events_bp.route("/api/events/active")
@login_required
def active_events() -> tuple:
    """Lista los eventos activos con el progreso del usuario en cada uno."""
    try:
        events = _get_active_events()
        chest_images = get_chest_images()

        # Batch-fetch user progress for all active events
        event_ids = [ev["_id"] for ev in events]
        progress_docs = list(mongo.event_progress.find({
            "user_email": current_user.email,
            "event_id": {"$in": event_ids},
        }))
        progress_map: Dict[str, Dict[str, Any]] = {
            doc["event_id"]: doc for doc in progress_docs
        }

        # Only show servers the user shares with the bot
        shared_servers = get_shared_bot_servers(current_user.guilds or [])
        user_guilds: List[Dict[str, str]] = [
            {"id": s["id"], "name": s["name"]}
            for s in shared_servers
            if s.get("id")
        ]

        result: List[Dict[str, Any]] = []
        for ev in events:
            prog = progress_map.get(ev["_id"])
            progress_val = prog["progress"] if prog else 0
            completed = prog["completed"] if prog else False
            can_claim = _can_claim(prog)
            current_day = 0 if completed else progress_val + 1
            days_count = ev.get("days_count", len(ev.get("rewards", [])))

            # Build rewards preview
            rewards_preview: List[Dict[str, Any]] = []
            for reward in ev.get("rewards", []):
                day_num = reward.get("day", 0)
                r_type = reward.get("type", "chest")

                if day_num <= progress_val:
                    status = "claimed"
                elif day_num == current_day and can_claim:
                    status = "available"
                else:
                    status = "locked"

                preview: Dict[str, Any] = {
                    "day": day_num,
                    "type": r_type,
                    "status": status,
                    "rarity": reward.get("rarity"),
                    "card_name": reward.get("card_name"),
                }
                if r_type == "chest" and reward.get("rarity"):
                    preview["image"] = chest_images.get(reward["rarity"], "")
                else:
                    preview["image"] = ""

                rewards_preview.append(preview)

            # Check for assigned code (if completed and event had a code day)
            assigned_code = None
            if completed:
                code_doc = mongo.codes.find_one({
                    "assigned_users.email": current_user.email,
                })
                if code_doc:
                    assigned_code = {
                        "code": code_doc["code"],
                        "description": code_doc.get("description", ""),
                        "link": code_doc.get("link"),
                    }

            result.append({
                "event_id": ev["_id"],
                "name": ev.get("name", "Evento"),
                "description": ev.get("description", ""),
                "days_count": days_count,
                "start_date": ev.get("start_date"),
                "end_date": ev.get("end_date"),
                "rewards": rewards_preview,
                "progress": progress_val,
                "current_day": current_day,
                "can_claim": can_claim,
                "completed": completed,
                "assigned_code": assigned_code,
            })

        return jsonify({
            "events": result,
            "guilds": user_guilds,
        }), 200
    except Exception as e:
        logger.error(f"Error getting active events: {e}", exc_info=True)
        return jsonify({"error": "Error interno"}), 500


@events_bp.route("/api/events/<event_id>/claim", methods=["POST"])
@login_required
def claim_event_reward(event_id: str) -> tuple:
    """Reclama la recompensa del día actual de un evento."""
    try:
        # Verificar evento
        try:
            event = mongo.events.find_one({"_id": ObjectId(event_id)})
        except Exception:
            return jsonify({"error": "ID de evento inválido"}), 400

        if not event:
            return jsonify({"error": "Evento no encontrado"}), 404

        if not event.get("active"):
            return jsonify({"error": "Este evento no está activo"}), 400

        now = datetime.now(timezone.utc)
        start = event.get("start_date")
        end = event.get("end_date")
        # Ensure dates are timezone-aware (legacy docs may be stored naive)
        if start and start.tzinfo is None:
            start = start.replace(tzinfo=timezone.utc)
        if end and end.tzinfo is None:
            end = end.replace(tzinfo=timezone.utc)
        if start and now < start:
            return jsonify({"error": "Este evento aún no ha comenzado"}), 400
        if end and now > end:
            return jsonify({"error": "Este evento ha finalizado"}), 400

        # Obtener progreso del usuario
        eid_str = str(event["_id"])
        prog = _get_user_progress(current_user.email, eid_str)
        if prog and prog.get("completed"):
            return jsonify({"error": "Ya has completado este evento"}), 400
        if not _can_claim(prog):
            return jsonify({"error": "Ya has reclamado la recompensa de hoy"}), 400

        progress_val = prog["progress"] if prog else 0
        current_day = progress_val + 1
        rewards = event.get("rewards", [])
        days_count = event.get("days_count", len(rewards))

        if current_day < 1 or current_day > days_count:
            return jsonify({"error": "Día de recompensa inválido"}), 400

        # Find the reward for this day
        reward = None
        for r in rewards:
            if r.get("day") == current_day:
                reward = r
                break
        if not reward:
            return jsonify({"error": "Recompensa no configurada para este día"}), 400

        # Parse server_id from body
        body = request.get_json(silent=True) or {}
        server_id = (body.get("server_id") or "").strip()

        # Validate server_id belongs to user
        if server_id:
            user_guild_ids = [g.get("id") for g in (current_user.guilds or [])]
            if server_id not in user_guild_ids:
                server_id = ""

        servidor = server_id or "event_reward"
        r_type = reward.get("type", "chest")

        result_data: Dict[str, Any] = {
            "day": current_day,
            "type": r_type,
            "event_id": eid_str,
        }

        if r_type == "code":
            # Comprobar si el usuario tiene denegada la recepción de códigos
            deny_code = getattr(current_user, "deny_code_reward", False)
            code_data = None if deny_code else _assign_code_from_pool(current_user.email)

            if code_data:
                result_data["code"] = code_data["code"]
                result_data["code_description"] = code_data.get("description", "")
                result_data["code_link"] = code_data.get("link")
                mongo.chest_logs.insert_one({
                    "date": now,
                    "username": current_user.username,
                    "type": "code",
                    "source": "event",
                    "event_id": eid_str,
                })
            else:
                # Fallback: legendary chest
                if deny_code:
                    logger.info(
                        "User %s has deny_code_reward, giving legendary chest instead",
                        current_user.email,
                    )
                    result_data["denied"] = True
                else:
                    logger.warning(
                        "No codes available for user %s event %s, fallback to chest",
                        current_user.email, eid_str,
                    )
                chest_id = _create_reward_chest(
                    current_user.email, "legendaria", servidor
                )
                result_data["type"] = "chest"
                result_data["rarity"] = "legendaria"
                result_data["chest_id"] = chest_id
                result_data["fallback"] = True
                if chest_id:
                    mongo.chest_logs.insert_one({
                        "date": now,
                        "chest_id": chest_id,
                        "username": current_user.username,
                        "type": "chest",
                        "source": "event",
                    })

        elif r_type == "chest":
            rarity = reward.get("rarity", "comun")
            chest_id = _create_reward_chest(current_user.email, rarity, servidor)
            result_data["rarity"] = rarity
            result_data["chest_id"] = chest_id
            result_data["image"] = get_chest_images().get(rarity, "")
            if chest_id:
                mongo.chest_logs.insert_one({
                    "date": now,
                    "chest_id": chest_id,
                    "username": current_user.username,
                    "type": "chest",
                    "source": "event",
                })

        elif r_type == "card":
            card_id = reward.get("card_id")
            rarity = reward.get("rarity")
            if card_id:
                # Carta específica
                card_data = _assign_card_to_user(
                    current_user.email, card_id, servidor
                )
            elif rarity:
                # Carta aleatoria por rareza
                card_data = _assign_random_card_by_rarity(
                    current_user.email, rarity, servidor
                )
            else:
                card_data = None

            if card_data:
                result_data["card"] = card_data
                mongo.chest_logs.insert_one({
                    "date": now,
                    "username": current_user.username,
                    "type": "card",
                    "source": "event",
                    "card_nombre": card_data.get("nombre", ""),
                    "card_rareza": card_data.get("rareza", ""),
                })
            else:
                # Fallback: chest of the specified rarity
                fallback_rarity = rarity or "comun"
                chest_id = _create_reward_chest(
                    current_user.email, fallback_rarity, servidor
                )
                result_data["type"] = "chest"
                result_data["rarity"] = fallback_rarity
                result_data["chest_id"] = chest_id
                result_data["fallback"] = True
                if chest_id:
                    mongo.chest_logs.insert_one({
                        "date": now,
                        "chest_id": chest_id,
                        "username": current_user.username,
                        "type": "chest",
                        "source": "event",
                    })

        # Update progress
        is_completed = current_day >= days_count
        if prog:
            mongo.event_progress.update_one(
                {"_id": prog["_id"]},
                {
                    "$set": {
                        "progress": current_day,
                        "last_claimed": now,
                        "completed": is_completed,
                    }
                },
            )
        else:
            mongo.event_progress.insert_one({
                "user_email": current_user.email,
                "event_id": eid_str,
                "progress": current_day,
                "last_claimed": now,
                "completed": is_completed,
            })

        invalidate_user_cache(str(current_user._id))
        safe_delete_memoized(get_user_collectibles_data, current_user.email)

        result_data["completed"] = is_completed
        return jsonify(result_data), 200

    except Exception as e:
        logger.error(f"Error claiming event reward: {e}", exc_info=True)
        return jsonify({"error": "Error interno al reclamar recompensa"}), 500

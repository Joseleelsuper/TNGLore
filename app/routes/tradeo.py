import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import requests
from bson import ObjectId
from flask import Blueprint, jsonify, render_template, request
from flask_login import current_user, login_required

from app import mongo
from app.routes.coleccion import get_user_collectibles_data
from app.utils.cache_manager import safe_delete_memoized, safe_memoize
from app.utils.images import get_images

logger = logging.getLogger(__name__)

tradeo_bp = Blueprint("tradeo", __name__)

RARITY_ORDER: Dict[str, int] = {
    "comun": 0,
    "rara": 1,
    "epica": 2,
    "legendaria": 3,
}

DEFAULT_AVATAR: str = "https://fonts.gstatic.com/s/i/materialicons/person/v6/24px.svg"
BOT_API_BASE_URL: str = (
    os.getenv("BOT_API_BASE_URL")
    or os.getenv("BOT_INTERNAL_API_URL")
    or "https://172.93.110.38:4009"
).rstrip("/")
BOT_API_VERIFY_SSL: bool = os.getenv("BOT_API_VERIFY_SSL", "false").lower() == "true"
BOT_API_CA_BUNDLE: str = os.getenv("BOT_API_CA_BUNDLE", "").strip()
try:
    BOT_API_TIMEOUT_SEC: int = max(1, int(os.getenv("BOT_API_TIMEOUT_SEC", "5")))
except ValueError:
    BOT_API_TIMEOUT_SEC = 5
PLACEHOLDER_CARD_IMAGE: str = "/static/assets/images/placeholder-card.svg"
MONGO_ELEM_MATCH: str = "$elemMatch"
OFFER_NOT_FOUND_ERROR: str = "Oferta pendiente no encontrada"


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _iso(value: Optional[datetime]) -> Optional[str]:
    if value is None:
        return None
    return value.isoformat()


def _safe_card_image(card_doc: Optional[Dict[str, Any]]) -> str:
    if not card_doc:
        return PLACEHOLDER_CARD_IMAGE
    return card_doc.get("image") or PLACEHOLDER_CARD_IMAGE


def _find_user_guild(user_doc: Dict[str, Any], guild_id: str) -> Optional[Dict[str, Any]]:
    guilds = user_doc.get("guilds")
    if not isinstance(guilds, list):
        return None
    for guild in guilds:
        if isinstance(guild, dict) and guild.get("id") == guild_id:
            return guild
    return None


def _count_inventory_copies(user_doc: Dict[str, Any], card_id: str, server_id: str) -> int:
    guild = _find_user_guild(user_doc, server_id)
    if not guild:
        return 0
    items = guild.get("coleccionables") or []
    if not isinstance(items, list):
        return 0
    return sum(1 for item in items if item == card_id)


def _get_reserved_maps(email: str) -> Tuple[Dict[str, int], Dict[str, int]]:
    listing_reserved: Dict[str, int] = {}
    offer_reserved: Dict[str, int] = {}

    active_my_listings = list(
        mongo.trade_marketplace.find(
            {"owner_email": email, "listing_status": "active"},
            {"card_id": 1, "source_server_id": 1},
        )
    )
    for listing in active_my_listings:
        key = f"{listing.get('source_server_id', '')}:{listing.get('card_id', '')}"
        listing_reserved[key] = listing_reserved.get(key, 0) + 1

    active_offer_docs = list(
        mongo.trade_marketplace.find(
            {
                "listing_status": "active",
                "offers": {
                    MONGO_ELEM_MATCH: {
                        "offerer_email": email,
                        "status": "pending",
                    }
                },
            },
            {"offers": 1},
        )
    )
    for doc in active_offer_docs:
        offers = doc.get("offers") or []
        if not isinstance(offers, list):
            continue
        for offer in offers:
            if (
                isinstance(offer, dict)
                and offer.get("offerer_email") == email
                and offer.get("status") == "pending"
            ):
                key = f"{offer.get('source_server_id', '')}:{offer.get('card_id', '')}"
                offer_reserved[key] = offer_reserved.get(key, 0) + 1

    return listing_reserved, offer_reserved


def _get_available_copies(user_doc: Dict[str, Any], email: str, card_id: str, server_id: str) -> int:
    owned = _count_inventory_copies(user_doc, card_id, server_id)
    listing_reserved, offer_reserved = _get_reserved_maps(email)
    key = f"{server_id}:{card_id}"
    used = listing_reserved.get(key, 0) + offer_reserved.get(key, 0)
    return max(0, owned - used)


def _card_snapshot(card_doc: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": str(card_doc.get("_id")),
        "name": card_doc.get("nombre", "Carta"),
        "rarity": card_doc.get("rareza", "comun"),
        "image": _safe_card_image(card_doc),
    }


def _is_rarity_compatible(left_rarity: str, right_rarity: str) -> bool:
    if left_rarity not in RARITY_ORDER or right_rarity not in RARITY_ORDER:
        return False
    return abs(RARITY_ORDER[left_rarity] - RARITY_ORDER[right_rarity]) <= 1


def _remove_single_card_from_user(email: str, card_id: str, server_id: str) -> bool:
    user_doc = mongo.users.find_one({"email": email}, {"guilds": 1})
    if not user_doc:
        return False

    guild = _find_user_guild(user_doc, server_id)
    if not guild:
        return False

    collectibles = guild.get("coleccionables") or []
    if not isinstance(collectibles, list):
        return False

    try:
        index = collectibles.index(card_id)
    except ValueError:
        return False

    updated_collectibles = list(collectibles)
    updated_collectibles.pop(index)

    update_result = mongo.users.update_one(
        {"email": email, "guilds.id": server_id},
        {"$set": {"guilds.$.coleccionables": updated_collectibles}},
    )
    return update_result.modified_count > 0


def _add_single_card_to_user(email: str, card_id: str, server_id: str) -> bool:
    update_result = mongo.users.update_one(
        {"email": email, "guilds.id": server_id},
        {"$push": {"guilds.$.coleccionables": card_id}},
    )
    return update_result.modified_count > 0


def _normalize_avatar(url: Optional[str]) -> str:
    if not url:
        return DEFAULT_AVATAR
    return url


def _build_trade_url() -> str:
    root = request.url_root.rstrip("/")
    return f"{root}/tradeo"


def _to_absolute_url(raw_url: str) -> str:
    cleaned = str(raw_url or "").strip()
    if not cleaned:
        return ""

    if cleaned.startswith("http://") or cleaned.startswith("https://"):
        return cleaned

    if cleaned.startswith("//"):
        return f"https:{cleaned}"

    root = request.url_root.rstrip("/")
    if cleaned.startswith("/"):
        return f"{root}{cleaned}"

    return f"{root}/{cleaned}"


def _notify_card_payload(card_data: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "name": str(card_data.get("name", "Carta")),
        "rarity": str(card_data.get("rarity", "comun")),
        "image": _to_absolute_url(str(card_data.get("image", ""))),
    }


def _notify_bot_trade(payload: Dict[str, Any]) -> None:
    api_secret = os.getenv("API_SECRET")
    if not api_secret:
        logger.warning("Trade notification skipped: API_SECRET is not configured")
        return

    headers = {
        "X-API-KEY": api_secret,
        "Content-Type": "application/json",
    }

    try:
        verify_value: Any = BOT_API_CA_BUNDLE if BOT_API_CA_BUNDLE else BOT_API_VERIFY_SSL
        response = requests.post(
            f"{BOT_API_BASE_URL}/trade/notify",
            json=payload,
            headers=headers,
            verify=verify_value,
            timeout=BOT_API_TIMEOUT_SEC,
        )
        if response.status_code >= 400:
            logger.warning(
                "Trade notification failed (%s): %s",
                response.status_code,
                response.text[:250],
            )
            return

        try:
            response_json = response.json()
        except ValueError:
            response_json = {}

        if response_json.get("sent") is False:
            logger.info(
                "Trade notification delivered but DM was not sent (type=%s recipient=%s)",
                payload.get("type"),
                payload.get("recipient_discord_id"),
            )
    except requests.RequestException as notify_error:
        logger.warning("Trade notification request error: %s", notify_error)
    except Exception as notify_error:
        logger.warning("Unexpected trade notification error: %s", notify_error)


def _notify_new_offer(
    owner_discord_id: Optional[str],
    requester_discord_id: Optional[str],
    requester_username: str,
    target_card: Dict[str, Any],
    offer_card: Dict[str, Any],
) -> None:
    if not owner_discord_id:
        return

    payload = {
        "type": "new_offer",
        "recipient_discord_id": owner_discord_id,
        "requester_discord_id": requester_discord_id,
        "requester_username": requester_username,
        "target_card": _notify_card_payload(target_card),
        "offer_card": _notify_card_payload(offer_card),
        "trade_url": _build_trade_url(),
    }
    _notify_bot_trade(payload)


def _notify_offer_result(
    offerer_discord_id: Optional[str],
    owner_discord_id: Optional[str],
    status: str,
    target_card: Dict[str, Any],
    offer_card: Dict[str, Any],
) -> None:
    if not offerer_discord_id:
        return

    payload = {
        "type": "offer_result",
        "recipient_discord_id": offerer_discord_id,
        "owner_discord_id": owner_discord_id,
        "status": status,
        "target_card": _notify_card_payload(target_card),
        "offer_card": _notify_card_payload(offer_card),
        "trade_url": _build_trade_url(),
    }
    _notify_bot_trade(payload)


def _invalidate_trade_cache_for_users(emails: List[str]) -> None:
    unique_emails = list({email for email in emails if email})

    safe_delete_memoized(get_trade_market_data)
    for email in unique_emails:
        safe_delete_memoized(get_my_active_listings, email)
        safe_delete_memoized(get_pending_trade_queue, email)
        safe_delete_memoized(get_user_trade_cards, email)
        safe_delete_memoized(get_user_collectibles_data, email)


@safe_memoize(timeout=60)
def get_trade_market_data() -> Dict[str, Any]:
    listings = list(
        mongo.trade_marketplace.find({"listing_status": "active"}).sort("created_at", 1)
    )

    grouped: Dict[str, Dict[str, Any]] = {}
    for listing in listings:
        card_id = listing.get("card_id")
        if not card_id:
            continue

        if card_id not in grouped:
            grouped[card_id] = {
                "card_id": card_id,
                "card_name": listing.get("card_name", "Carta"),
                "card_rarity": listing.get("card_rarity", "comun"),
                "card_image": listing.get("card_image", PLACEHOLDER_CARD_IMAGE),
                "first_listing_id": str(listing.get("_id")),
                "first_uploaded_at": _iso(listing.get("created_at")),
                "listing_count": 0,
                "uploaded_by": [],
            }

        grouped_entry = grouped[card_id]
        grouped_entry["listing_count"] += 1
        grouped_entry["uploaded_by"].append(
            {
                "username": listing.get("owner_username", "Usuario"),
                "pfp": _normalize_avatar(listing.get("owner_pfp")),
                "discord_id": listing.get("owner_discord_id"),
            }
        )

    market_cards = list(grouped.values())
    market_cards.sort(key=lambda item: item.get("first_uploaded_at") or "")

    return {
        "market_cards": market_cards,
        "total_listings": len(listings),
    }


@safe_memoize(timeout=60)
def get_my_active_listings(email: str) -> List[Dict[str, Any]]:
    listings = list(
        mongo.trade_marketplace.find(
            {"owner_email": email, "listing_status": "active"}
        ).sort("created_at", -1)
    )

    parsed: List[Dict[str, Any]] = []
    for listing in listings:
        offers = listing.get("offers") or []
        pending_count = 0
        if isinstance(offers, list):
            pending_count = sum(
                1
                for offer in offers
                if isinstance(offer, dict) and offer.get("status") == "pending"
            )

        parsed.append(
            {
                "id": str(listing.get("_id")),
                "card_id": listing.get("card_id"),
                "card_name": listing.get("card_name", "Carta"),
                "card_rarity": listing.get("card_rarity", "comun"),
                "card_image": listing.get("card_image", PLACEHOLDER_CARD_IMAGE),
                "source_server_id": listing.get("source_server_id"),
                "source_server_name": listing.get("source_server_name", "Servidor"),
                "created_at": _iso(listing.get("created_at")),
                "pending_offers": pending_count,
            }
        )

    return parsed


@safe_memoize(timeout=30)
def get_pending_trade_queue(email: str) -> List[Dict[str, Any]]:
    listings = list(
        mongo.trade_marketplace.find(
            {"owner_email": email, "listing_status": "active"}
        ).sort("created_at", 1)
    )

    queue: List[Dict[str, Any]] = []
    for listing in listings:
        offers = listing.get("offers") or []
        if not isinstance(offers, list):
            continue

        for offer in offers:
            if not isinstance(offer, dict) or offer.get("status") != "pending":
                continue

            queue.append(
                {
                    "offer_id": offer.get("offer_id"),
                    "listing_id": str(listing.get("_id")),
                    "requested_at": _iso(offer.get("created_at")),
                    "offerer": {
                        "email": offer.get("offerer_email"),
                        "username": offer.get("offerer_username", "Usuario"),
                        "pfp": _normalize_avatar(offer.get("offerer_pfp")),
                        "discord_id": offer.get("offerer_discord_id"),
                    },
                    "target_card": {
                        "id": listing.get("card_id"),
                        "name": listing.get("card_name", "Carta"),
                        "rarity": listing.get("card_rarity", "comun"),
                        "image": listing.get("card_image", PLACEHOLDER_CARD_IMAGE),
                        "server_id": listing.get("source_server_id"),
                        "server_name": listing.get("source_server_name", "Servidor"),
                    },
                    "offer_card": {
                        "id": offer.get("card_id"),
                        "name": offer.get("card_name", "Carta"),
                        "rarity": offer.get("card_rarity", "comun"),
                        "image": offer.get("card_image", PLACEHOLDER_CARD_IMAGE),
                        "server_id": offer.get("source_server_id"),
                        "server_name": offer.get("source_server_name", "Servidor"),
                    },
                }
            )

    queue.sort(key=lambda item: item.get("requested_at") or "")
    return queue


@safe_memoize(timeout=30)
def get_user_trade_cards(email: str) -> List[Dict[str, Any]]:
    user_doc = mongo.users.find_one({"email": email})
    if not user_doc:
        return []

    guilds = user_doc.get("guilds")
    if not isinstance(guilds, list):
        return []

    counts_by_slot: Dict[str, Dict[str, Any]] = {}
    object_ids: List[ObjectId] = []
    object_ids_set = set()

    for guild in guilds:
        if not isinstance(guild, dict):
            continue

        server_id = guild.get("id")
        server_name = guild.get("name", "Servidor")
        cards = guild.get("coleccionables") or []

        if not server_id or not isinstance(cards, list):
            continue

        for card_id in cards:
            if not isinstance(card_id, str) or not ObjectId.is_valid(card_id):
                continue

            key = f"{server_id}:{card_id}"
            if key not in counts_by_slot:
                counts_by_slot[key] = {
                    "server_id": server_id,
                    "server_name": server_name,
                    "card_id": card_id,
                    "count": 0,
                }
            counts_by_slot[key]["count"] += 1

            object_id = ObjectId(card_id)
            if object_id not in object_ids_set:
                object_ids_set.add(object_id)
                object_ids.append(object_id)

    cards_by_id: Dict[str, Dict[str, Any]] = {}
    if object_ids:
        card_docs = list(mongo.collectables.find({"_id": {"$in": object_ids}}))
        for card_doc in card_docs:
            card_key = str(card_doc.get("_id"))
            cards_by_id[card_key] = card_doc

    listing_reserved, offer_reserved = _get_reserved_maps(email)

    result: List[Dict[str, Any]] = []
    for key, data in counts_by_slot.items():
        card_id = data["card_id"]
        server_id = data["server_id"]
        total_count = data["count"]

        used = listing_reserved.get(key, 0) + offer_reserved.get(key, 0)
        available = max(0, total_count - used)

        if available <= 0:
            continue

        card_doc = cards_by_id.get(card_id)
        if not card_doc:
            continue

        result.append(
            {
                "card_id": card_id,
                "card_name": card_doc.get("nombre", "Carta"),
                "card_rarity": card_doc.get("rareza", "comun"),
                "card_image": _safe_card_image(card_doc),
                "server_id": server_id,
                "server_name": data.get("server_name", "Servidor"),
                "available_count": available,
                "total_count": total_count,
            }
        )

    result.sort(key=lambda item: (item.get("card_name", ""), item.get("server_name", "")))
    return result


def _prepare_listing_owner(user_doc: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "owner_email": user_doc.get("email"),
        "owner_username": user_doc.get("username", "Usuario"),
        "owner_discord_id": user_doc.get("discord_id"),
        "owner_pfp": user_doc.get("pfp"),
    }


@tradeo_bp.route("/tradeo", methods=["GET"])
@login_required
def tradeo_page() -> Any:
    return render_template("pages/tradeo.html", user=current_user, images=get_images())


@tradeo_bp.route("/api/tradeo/market", methods=["GET"])
@login_required
def tradeo_market() -> Any:
    return jsonify(get_trade_market_data())


@tradeo_bp.route("/api/tradeo/my-listings", methods=["GET"])
@login_required
def tradeo_my_listings() -> Any:
    return jsonify({"limit": 6, "listings": get_my_active_listings(current_user.email)})


@tradeo_bp.route("/api/tradeo/my-cards", methods=["GET"])
@login_required
def tradeo_my_cards() -> Any:
    return jsonify({"cards": get_user_trade_cards(current_user.email)})


@tradeo_bp.route("/api/tradeo/pending-queue", methods=["GET"])
@login_required
def tradeo_pending_queue() -> Any:
    queue = get_pending_trade_queue(current_user.email)
    return jsonify({"queue": queue, "total_pending": len(queue)})


@tradeo_bp.route("/api/tradeo/listings", methods=["POST"])
@login_required
def tradeo_create_listing() -> Any:
    data = request.get_json(silent=True) or {}
    card_id = str(data.get("card_id", "")).strip()
    server_id = str(data.get("server_id", "")).strip()

    if not card_id or not server_id:
        return jsonify({"error": "Faltan datos para publicar la carta"}), 400

    if not ObjectId.is_valid(card_id):
        return jsonify({"error": "Carta invalida"}), 400

    active_count = mongo.trade_marketplace.count_documents(
        {"owner_email": current_user.email, "listing_status": "active"}
    )
    if active_count >= 6:
        return jsonify({"error": "Ya tienes 6 cartas publicadas"}), 400

    user_doc = mongo.users.find_one({"email": current_user.email})
    if not user_doc:
        return jsonify({"error": "Usuario no encontrado"}), 404

    guild = _find_user_guild(user_doc, server_id)
    if not guild:
        return jsonify({"error": "Servidor invalido para tu cuenta"}), 400

    available = _get_available_copies(user_doc, current_user.email, card_id, server_id)
    if available <= 0:
        return jsonify({"error": "No tienes copias disponibles de esa carta"}), 400

    card_doc = mongo.collectables.find_one({"_id": ObjectId(card_id)})
    if not card_doc:
        return jsonify({"error": "Carta no encontrada"}), 404

    now = _utcnow()
    listing_doc: Dict[str, Any] = {
        "listing_status": "active",
        "created_at": now,
        "updated_at": now,
        "traded_at": None,
        "accepted_offer_id": None,
        "card_id": card_id,
        "card_name": card_doc.get("nombre", "Carta"),
        "card_rarity": card_doc.get("rareza", "comun"),
        "card_image": _safe_card_image(card_doc),
        "source_server_id": server_id,
        "source_server_name": guild.get("name", "Servidor"),
        "offers": [],
    }
    listing_doc.update(_prepare_listing_owner(user_doc))

    result = mongo.trade_marketplace.insert_one(listing_doc)
    _invalidate_trade_cache_for_users([current_user.email])

    return jsonify({"ok": True, "listing_id": str(result.inserted_id)}), 201


@tradeo_bp.route("/api/tradeo/listings/<listing_id>", methods=["DELETE"])
@login_required
def tradeo_withdraw_listing(listing_id: str) -> Any:
    if not ObjectId.is_valid(listing_id):
        return jsonify({"error": "Publicacion invalida"}), 400

    listing = mongo.trade_marketplace.find_one(
        {
            "_id": ObjectId(listing_id),
            "owner_email": current_user.email,
            "listing_status": "active",
        }
    )
    if not listing:
        return jsonify({"error": "Publicacion no encontrada"}), 404

    offers = listing.get("offers") or []
    updated_offers: List[Dict[str, Any]] = []
    now = _utcnow()

    for offer in offers:
        if not isinstance(offer, dict):
            continue
        current_status = offer.get("status")
        if current_status == "pending":
            offer["status"] = "cancelled"
            offer["decided_at"] = now
            offer["decision_reason"] = "listing_withdrawn"
        updated_offers.append(offer)

    mongo.trade_marketplace.update_one(
        {"_id": listing["_id"]},
        {
            "$set": {
                "listing_status": "withdrawn",
                "updated_at": now,
                "offers": updated_offers,
            }
        },
    )

    affected_emails = [current_user.email]
    for offer in updated_offers:
        offer_email = offer.get("offerer_email")
        if offer_email:
            affected_emails.append(offer_email)

    _invalidate_trade_cache_for_users(affected_emails)

    return jsonify({"ok": True}), 200


@tradeo_bp.route("/api/tradeo/offers", methods=["POST"])
@login_required
def tradeo_create_offer() -> Any:
    data = request.get_json(silent=True) or {}
    target_card_id = str(data.get("target_card_id", "")).strip()
    offered_card_id = str(data.get("offered_card_id", "")).strip()
    offered_server_id = str(data.get("offered_server_id", "")).strip()

    if not target_card_id or not offered_card_id or not offered_server_id:
        return jsonify({"error": "Faltan datos para crear la oferta"}), 400

    if not ObjectId.is_valid(target_card_id) or not ObjectId.is_valid(offered_card_id):
        return jsonify({"error": "Carta invalida"}), 400

    listing = mongo.trade_marketplace.find_one(
        {
            "card_id": target_card_id,
            "listing_status": "active",
            "owner_email": {"$ne": current_user.email},
        },
        sort=[("created_at", 1)],
    )
    if not listing:
        return jsonify({"error": "No hay publicaciones disponibles para esa carta"}), 404

    user_doc = mongo.users.find_one({"email": current_user.email})
    if not user_doc:
        return jsonify({"error": "Usuario no encontrado"}), 404

    guild = _find_user_guild(user_doc, offered_server_id)
    if not guild:
        return jsonify({"error": "Servidor invalido para la carta ofertada"}), 400

    available = _get_available_copies(user_doc, current_user.email, offered_card_id, offered_server_id)
    if available <= 0:
        return jsonify({"error": "No tienes copias disponibles de la carta ofertada"}), 400

    offered_card_doc = mongo.collectables.find_one({"_id": ObjectId(offered_card_id)})
    if not offered_card_doc:
        return jsonify({"error": "Carta ofertada no encontrada"}), 404

    listing_rarity = str(listing.get("card_rarity", "comun"))
    offered_rarity = str(offered_card_doc.get("rareza", "comun"))
    if not _is_rarity_compatible(listing_rarity, offered_rarity):
        return jsonify({"error": "La rareza de la carta ofertada no es compatible"}), 400

    offers = listing.get("offers") or []
    if isinstance(offers, list):
        for offer in offers:
            if (
                isinstance(offer, dict)
                and offer.get("status") == "pending"
                and offer.get("offerer_email") == current_user.email
            ):
                return jsonify({"error": "Ya tienes una oferta pendiente para esa publicacion"}), 400

    now = _utcnow()
    new_offer: Dict[str, Any] = {
        "offer_id": str(ObjectId()),
        "status": "pending",
        "created_at": now,
        "decided_at": None,
        "decision_reason": None,
        "offerer_email": current_user.email,
        "offerer_username": user_doc.get("username", "Usuario"),
        "offerer_discord_id": user_doc.get("discord_id"),
        "offerer_pfp": user_doc.get("pfp"),
        "card_id": offered_card_id,
        "card_name": offered_card_doc.get("nombre", "Carta"),
        "card_rarity": offered_card_doc.get("rareza", "comun"),
        "card_image": _safe_card_image(offered_card_doc),
        "source_server_id": offered_server_id,
        "source_server_name": guild.get("name", "Servidor"),
    }

    update_result = mongo.trade_marketplace.update_one(
        {"_id": listing.get("_id"), "listing_status": "active"},
        {
            "$push": {"offers": new_offer},
            "$set": {"updated_at": now},
        },
    )

    if update_result.modified_count <= 0:
        return jsonify({"error": "No se pudo crear la oferta, intenta de nuevo"}), 409

    _notify_new_offer(
        owner_discord_id=listing.get("owner_discord_id"),
        requester_discord_id=user_doc.get("discord_id"),
        requester_username=user_doc.get("username", "Usuario"),
        target_card={
            "name": listing.get("card_name", "Carta"),
            "rarity": listing.get("card_rarity", "comun"),
            "image": listing.get("card_image", PLACEHOLDER_CARD_IMAGE),
        },
        offer_card={
            "name": new_offer.get("card_name", "Carta"),
            "rarity": new_offer.get("card_rarity", "comun"),
            "image": new_offer.get("card_image", PLACEHOLDER_CARD_IMAGE),
        },
    )

    _invalidate_trade_cache_for_users([current_user.email, str(listing.get("owner_email", ""))])

    return jsonify({"ok": True, "offer_id": new_offer["offer_id"]}), 201


def _find_pending_offer_in_listing(listing: Dict[str, Any], offer_id: str) -> Optional[Dict[str, Any]]:
    offers = listing.get("offers") or []
    if not isinstance(offers, list):
        return None

    for offer in offers:
        if (
            isinstance(offer, dict)
            and offer.get("offer_id") == offer_id
            and offer.get("status") == "pending"
        ):
            return offer
    return None


@tradeo_bp.route("/api/tradeo/offers/<offer_id>/accept", methods=["POST"])
@login_required
def tradeo_accept_offer(offer_id: str) -> Any:
    listing = mongo.trade_marketplace.find_one(
        {
            "owner_email": current_user.email,
            "listing_status": "active",
            "offers": {
                MONGO_ELEM_MATCH: {
                    "offer_id": offer_id,
                    "status": "pending",
                }
            },
        }
    )
    if not listing:
        return jsonify({"error": OFFER_NOT_FOUND_ERROR}), 404

    offer = _find_pending_offer_in_listing(listing, offer_id)
    if not offer:
        return jsonify({"error": OFFER_NOT_FOUND_ERROR}), 404

    owner_email = str(listing.get("owner_email", ""))
    offerer_email = str(offer.get("offerer_email", ""))

    owner_user = mongo.users.find_one({"email": owner_email})
    offerer_user = mongo.users.find_one({"email": offerer_email})
    if not owner_user or not offerer_user:
        return jsonify({"error": "No se pudo validar a los usuarios del intercambio"}), 409

    listing_server = str(listing.get("source_server_id", ""))
    offer_server = str(offer.get("source_server_id", ""))
    listing_card_id = str(listing.get("card_id", ""))
    offer_card_id = str(offer.get("card_id", ""))

    if not _find_user_guild(owner_user, listing_server):
        return jsonify({"error": "Tu servidor original ya no esta disponible"}), 409
    if not _find_user_guild(offerer_user, offer_server):
        return jsonify({"error": "El servidor del usuario que ofrecio ya no esta disponible"}), 409

    if _count_inventory_copies(owner_user, listing_card_id, listing_server) <= 0:
        return jsonify({"error": "Tu carta publicada ya no esta disponible"}), 409
    if _count_inventory_copies(offerer_user, offer_card_id, offer_server) <= 0:
        return jsonify({"error": "La carta ofertada ya no esta disponible"}), 409

    owner_removed = _remove_single_card_from_user(owner_email, listing_card_id, listing_server)
    if not owner_removed:
        return jsonify({"error": "No se pudo reservar tu carta publicada"}), 409

    offerer_removed = _remove_single_card_from_user(offerer_email, offer_card_id, offer_server)
    if not offerer_removed:
        _add_single_card_to_user(owner_email, listing_card_id, listing_server)
        return jsonify({"error": "No se pudo reservar la carta ofertada"}), 409

    owner_added = _add_single_card_to_user(owner_email, offer_card_id, listing_server)
    offerer_added = _add_single_card_to_user(offerer_email, listing_card_id, offer_server)

    if not owner_added or not offerer_added:
        # Rollback best-effort to avoid data loss.
        _remove_single_card_from_user(owner_email, offer_card_id, listing_server)
        _add_single_card_to_user(owner_email, listing_card_id, listing_server)
        _add_single_card_to_user(offerer_email, offer_card_id, offer_server)
        if offerer_added:
            _remove_single_card_from_user(offerer_email, listing_card_id, offer_server)
        return jsonify({"error": "No se pudo completar el intercambio"}), 500

    now = _utcnow()
    updated_offers: List[Dict[str, Any]] = []
    offers = listing.get("offers") or []
    for item in offers:
        if not isinstance(item, dict):
            continue
        if item.get("offer_id") == offer_id:
            item["status"] = "accepted"
            item["decided_at"] = now
            item["decision_reason"] = None
        elif item.get("status") == "pending":
            item["status"] = "cancelled"
            item["decided_at"] = now
            item["decision_reason"] = "listing_traded"
        updated_offers.append(item)

    mongo.trade_marketplace.update_one(
        {"_id": listing.get("_id"), "listing_status": "active"},
        {
            "$set": {
                "listing_status": "traded",
                "accepted_offer_id": offer_id,
                "updated_at": now,
                "traded_at": now,
                "offers": updated_offers,
            }
        },
    )

    _notify_offer_result(
        offerer_discord_id=offer.get("offerer_discord_id"),
        owner_discord_id=listing.get("owner_discord_id"),
        status="accepted",
        target_card={
            "name": listing.get("card_name", "Carta"),
            "rarity": listing.get("card_rarity", "comun"),
            "image": listing.get("card_image", PLACEHOLDER_CARD_IMAGE),
        },
        offer_card={
            "name": offer.get("card_name", "Carta"),
            "rarity": offer.get("card_rarity", "comun"),
            "image": offer.get("card_image", PLACEHOLDER_CARD_IMAGE),
        },
    )

    affected = [owner_email, offerer_email]
    for item in updated_offers:
        if isinstance(item, dict) and item.get("offerer_email"):
            affected.append(str(item.get("offerer_email")))
    _invalidate_trade_cache_for_users(affected)

    return jsonify({"ok": True}), 200


@tradeo_bp.route("/api/tradeo/offers/<offer_id>/reject", methods=["POST"])
@login_required
def tradeo_reject_offer(offer_id: str) -> Any:
    listing = mongo.trade_marketplace.find_one(
        {
            "owner_email": current_user.email,
            "listing_status": "active",
            "offers": {
                MONGO_ELEM_MATCH: {
                    "offer_id": offer_id,
                    "status": "pending",
                }
            },
        }
    )
    if not listing:
        return jsonify({"error": OFFER_NOT_FOUND_ERROR}), 404

    now = _utcnow()
    updated_offers: List[Dict[str, Any]] = []
    rejected_offer: Optional[Dict[str, Any]] = None

    for item in listing.get("offers") or []:
        if not isinstance(item, dict):
            continue
        if item.get("offer_id") == offer_id and item.get("status") == "pending":
            item["status"] = "rejected"
            item["decided_at"] = now
            item["decision_reason"] = None
            rejected_offer = item
        updated_offers.append(item)

    if not rejected_offer:
        return jsonify({"error": OFFER_NOT_FOUND_ERROR}), 404

    mongo.trade_marketplace.update_one(
        {"_id": listing.get("_id"), "listing_status": "active"},
        {
            "$set": {
                "offers": updated_offers,
                "updated_at": now,
            }
        },
    )

    _notify_offer_result(
        offerer_discord_id=rejected_offer.get("offerer_discord_id"),
        owner_discord_id=listing.get("owner_discord_id"),
        status="rejected",
        target_card={
            "name": listing.get("card_name", "Carta"),
            "rarity": listing.get("card_rarity", "comun"),
            "image": listing.get("card_image", PLACEHOLDER_CARD_IMAGE),
        },
        offer_card={
            "name": rejected_offer.get("card_name", "Carta"),
            "rarity": rejected_offer.get("card_rarity", "comun"),
            "image": rejected_offer.get("card_image", PLACEHOLDER_CARD_IMAGE),
        },
    )

    _invalidate_trade_cache_for_users([current_user.email, str(rejected_offer.get("offerer_email", ""))])

    return jsonify({"ok": True}), 200

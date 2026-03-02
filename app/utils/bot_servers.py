"""Utilidad para obtener los servidores que el usuario comparte con el bot."""

import logging
import os
from typing import Any, Dict, List

import requests

logger = logging.getLogger(__name__)

_BOT_API_URL = "https://172.93.110.38:4009/getBotServers"


def get_shared_bot_servers(user_guilds: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Devuelve los servidores del bot que el usuario también tiene.

    Llama a la API interna del bot y cruza con los guilds del usuario.
    Si el bot no responde, devuelve lista vacía (no lanza excepción).

    Args:
        user_guilds: Lista de guilds del usuario (campo ``guilds`` del modelo User).

    Returns:
        Lista de dicts ``{id, name, icon}`` — solo los servidores compartidos.
    """
    api_secret = os.getenv("API_SECRET")
    headers = {"X-API-KEY": api_secret}
    try:
        response = requests.get(
            _BOT_API_URL, headers=headers, verify=False, timeout=3
        )
        response.raise_for_status()
        bot_servers: List[Dict[str, Any]] = response.json()
    except Exception as e:
        logger.warning(f"No se pudo contactar la API del bot: {e}")
        return []

    # Índice de guilds del usuario por ID para O(1) lookup
    user_guild_ids = {g.get("id") for g in user_guilds if g.get("id")}

    shared: List[Dict[str, Any]] = []
    for server in bot_servers:
        if server.get("id") in user_guild_ids:
            shared.append({
                "id": server.get("id"),
                "name": server.get("name"),
                "icon": server.get("icon"),
            })
    return shared

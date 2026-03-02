"""
Cargador de configuración de juego desde YAML con hot-reload.

Recarga automáticamente el fichero config/game_config.yaml cada CONFIG_TTL
segundos sin necesidad de reiniciar la aplicación.
"""

import os
import time
import yaml
import logging
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

_config_cache: Optional[Dict[str, Any]] = None
_config_timestamp: Optional[float] = None
CONFIG_TTL: int = 60  # Segundos entre recargas automáticas

_CONFIG_PATH: str = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "config",
    "game_config.yaml",
)


def _load_config() -> Dict[str, Any]:
    """Carga el fichero YAML desde disco con caché TTL."""
    global _config_cache, _config_timestamp
    now = time.monotonic()

    if (
        _config_cache is not None
        and _config_timestamp is not None
        and now - _config_timestamp < CONFIG_TTL
    ):
        return _config_cache

    try:
        with open(_CONFIG_PATH, "r", encoding="utf-8") as f:
            _config_cache = yaml.safe_load(f) or {}
        logger.info("Game config (re)loaded from %s", _CONFIG_PATH)
    except FileNotFoundError:
        logger.warning("Game config file not found at %s — using defaults", _CONFIG_PATH)
        _config_cache = {}
    except yaml.YAMLError as e:
        logger.error("Error parsing game config YAML: %s", e)
        if _config_cache is None:
            _config_cache = {}

    _config_timestamp = now
    return _config_cache


def get_game_config() -> Dict[str, Any]:
    """Devuelve la configuración de juego completa (hot-reloadable)."""
    return _load_config()


def clear_game_config_cache() -> None:
    """Fuerza la recarga en la siguiente llamada."""
    global _config_cache, _config_timestamp
    _config_cache = None
    _config_timestamp = None


# ---------------------------------------------------------------------------
# Accessors de conveniencia
# ---------------------------------------------------------------------------

# Valores por defecto (se usan si el YAML no define la clave)
_DEFAULT_CHEST_CONFIG: Dict[str, Dict[str, Any]] = {
    "comun": {"cards": 2, "probabilities": [70, 16, 12, 2], "name": "Común"},
    "rara": {"cards": 3, "probabilities": [35, 45, 15, 5], "name": "Raro"},
    "epica": {"cards": 4, "probabilities": [20, 30, 35, 15], "name": "Épico"},
    "legendaria": {"cards": 5, "probabilities": [10, 25, 35, 30], "name": "Legendario"},
}

_DEFAULT_CARD_RARITIES: List[str] = ["comun", "rara", "epica", "legendaria"]

_DEFAULT_RARITY_COLORS: Dict[str, str] = {
    "comun": "#9e9e9e",
    "rara": "#4CAF50",
    "epica": "#9C27B0",
    "legendaria": "#FFD700",
}

_DEFAULT_CHEST_IMAGES: Dict[str, str] = {
    "comun": "/assets/images/cofre-comun.webp",
    "rara": "/assets/images/cofre-rara.webp",
    "epica": "/assets/images/cofre-epica.webp",
    "legendaria": "/assets/images/cofre-legendaria.webp",
}


def get_chest_config() -> Dict[str, Dict[str, Any]]:
    """Configuración de cofres (cards + probabilities + name)."""
    cfg = get_game_config()
    return cfg.get("chest_config", _DEFAULT_CHEST_CONFIG)


def get_card_rarities() -> List[str]:
    """Lista ordenada de rarezas de cartas."""
    cfg = get_game_config()
    return cfg.get("card_rarities", _DEFAULT_CARD_RARITIES)


def get_rarity_colors() -> Dict[str, str]:
    """Mapa rareza -> color hex."""
    cfg = get_game_config()
    return cfg.get("rarity_colors", _DEFAULT_RARITY_COLORS)


def get_chest_images() -> Dict[str, str]:
    """Mapa rareza -> ruta imagen cofre."""
    cfg = get_game_config()
    return cfg.get("chest_images", _DEFAULT_CHEST_IMAGES)

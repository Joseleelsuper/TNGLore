import json
import os
import time
from typing import Dict, Any, Optional
from functools import lru_cache
import logging

logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def get_github_branch() -> str:
    """Obtiene la rama de GitHub con caché en memoria."""
    return os.getenv('GITHUB_BRANCH', 'main')


# Caché en memoria para la configuración de imágenes (raw y procesada)
_raw_images_cache: Optional[Dict[str, Any]] = None
_processed_images_cache: Optional[Dict[str, Any]] = None
_cache_timestamp: Optional[float] = None
CACHE_TTL: int = 1800  # 30 minutos


def _load_raw_config() -> Dict[str, Any]:
    """Carga el JSON crudo de images.json con caché TTL."""
    global _raw_images_cache, _cache_timestamp

    now = time.monotonic()
    if (_raw_images_cache is not None
            and _cache_timestamp is not None
            and now - _cache_timestamp < CACHE_TTL):
        return _raw_images_cache

    try:
        with open('app/static/config/images.json', 'r', encoding='utf-8') as f:
            _raw_images_cache = json.load(f)
    except FileNotFoundError:
        logger.warning("Images config file not found")
        _raw_images_cache = {}
    except json.JSONDecodeError as e:
        logger.error(f"Error parsing images config JSON: {e}")
        _raw_images_cache = {}

    _cache_timestamp = now
    return _raw_images_cache if _raw_images_cache is not None else {}


def get_images() -> Dict[str, Any]:
    """Devuelve la configuración de imágenes con {GITHUB_BRANCH} resuelta.

    El resultado procesado se cachea; sólo se recalcula cuando el raw
    config se recarga (cada 30 min) o cuando se llama a clear_images_cache().
    """
    global _processed_images_cache

    raw = _load_raw_config()

    # Devolver copia cacheada si el raw no cambió
    if _processed_images_cache is not None and raw is _raw_images_cache:
        return _processed_images_cache

    github_branch = get_github_branch()
    import copy
    images: Dict[str, Any] = copy.deepcopy(raw)

    for category in images.values():
        if isinstance(category, dict):
            for key, url in category.items():
                if isinstance(url, str):
                    category[key] = url.replace('{GITHUB_BRANCH}', github_branch)

    _processed_images_cache = images
    return _processed_images_cache


def get_optimized_image_url(base_url: str, size: str = "medium", format_type: str = "webp") -> str:
    """
    Genera URLs optimizadas para imágenes con parámetros de tamaño y formato
    """
    size_configs = {
        "thumbnail": {"w": 150, "h": 150},
        "small": {"w": 300, "h": 300},
        "medium": {"w": 600, "h": 600},
        "large": {"w": 1200, "h": 1200},
        "xl": {"w": 1920, "h": 1920}
    }
    
    config = size_configs.get(size, size_configs["medium"])
    
    # Si la URL ya tiene parámetros, añadir con &, sino con ?
    separator = "&" if "?" in base_url else "?"
    
    return f"{base_url}{separator}w={config['w']}&h={config['h']}&fit=crop&fm={format_type}&q=85"


def get_responsive_image_srcset(base_url: str, format_type: str = "webp") -> str:
    """Genera un srcset para imágenes responsivas."""
    sizes = ["small", "medium", "large", "xl"]
    srcset_parts: list[str] = []
    
    config = {
        "small": {"w": 300, "descriptor": "300w"},
        "medium": {"w": 600, "descriptor": "600w"}, 
        "large": {"w": 1200, "descriptor": "1200w"},
        "xl": {"w": 1920, "descriptor": "1920w"}
    }
    
    for size in sizes:
        size_config = config[size]
        separator = "&" if "?" in base_url else "?"
        url = f"{base_url}{separator}w={size_config['w']}&fit=crop&fm={format_type}&q=85"
        srcset_parts.append(f"{url} {size_config['descriptor']}")
    
    return ", ".join(srcset_parts)


def preload_critical_images() -> list:
    """Retorna lista de imágenes críticas que deben precargarse."""
    images = get_images()
    critical_images: list[Dict[str, str]] = []
    
    if 'auth' in images:
        for image_url in images['auth'].values():
            critical_images.append({
                'url': get_optimized_image_url(image_url, 'medium'),
                'as': 'image',
                'type': 'image/webp'
            })
    
    if 'icons' in images:
        for image_url in images['icons'].values():
            critical_images.append({
                'url': image_url,
                'as': 'image',
                'type': 'image/svg+xml' if image_url.endswith('.svg') else 'image/webp'
            })
    
    return critical_images


def clear_images_cache() -> None:
    """Limpia el caché de imágenes (útil para desarrollo)."""
    global _raw_images_cache, _processed_images_cache, _cache_timestamp
    _raw_images_cache = None
    _processed_images_cache = None
    _cache_timestamp = None
    get_github_branch.cache_clear()
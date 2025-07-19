import json
import os
import asyncio
import aiofiles
from typing import Dict, Any, Optional
from functools import lru_cache
import logging

logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def get_github_branch() -> str:
    """Obtiene la rama de GitHub con caché en memoria (síncrono)"""
    return os.getenv('GITHUB_BRANCH', 'main')


# Caché asíncrono para la configuración de imágenes
_images_cache: Optional[Dict[str, Any]] = None
_cache_timestamp: Optional[float] = None
CACHE_TTL = 1800  # 30 minutos


async def load_images_config_async() -> Dict[str, Any]:
    """Carga la configuración de imágenes de forma asíncrona con caché"""
    global _images_cache, _cache_timestamp
    
    current_time = asyncio.get_event_loop().time()
    
    # Verificar si el caché es válido
    if (_images_cache is not None and 
        _cache_timestamp is not None and 
        current_time - _cache_timestamp < CACHE_TTL):
        return _images_cache
    
    try:
        async with aiofiles.open('app/static/config/images.json', 'r', encoding='utf-8') as f:
            content = await f.read()
            _images_cache = json.loads(content)
            _cache_timestamp = current_time
            logger.debug("Images config loaded asynchronously")
            return _images_cache
    except FileNotFoundError:
        logger.warning("Images config file not found")
        _images_cache = {}
        _cache_timestamp = current_time
        return _images_cache
    except json.JSONDecodeError as e:
        logger.error(f"Error parsing images config JSON: {e}")
        _images_cache = {}
        _cache_timestamp = current_time
        return _images_cache
    except Exception as e:
        logger.error(f"Unexpected error loading images config: {e}")
        return {}


def load_images_config() -> Dict[str, Any]:
    """Versión síncrona que usa caché en memoria para compatibilidad"""
    global _images_cache
    if _images_cache is not None:
        return _images_cache
    
    # Fallback síncrono si no hay caché
    try:
        with open('app/static/config/images.json', 'r', encoding='utf-8') as f:
            _images_cache = json.load(f)
            return _images_cache if _images_cache is not None else {}
    except (FileNotFoundError, json.JSONDecodeError):
        _images_cache = {}
        return _images_cache


async def get_images_async() -> Dict[str, Any]:
    """Obtiene las imágenes con URLs procesadas de forma asíncrona"""
    github_branch = get_github_branch()
    images = (await load_images_config_async()).copy()
    
    # Reemplazar {GITHUB_BRANCH} en las URLs
    for category in images.values():
        if isinstance(category, dict):
            for key, url in category.items():
                if isinstance(url, str):
                    category[key] = url.replace('{GITHUB_BRANCH}', github_branch)
    
    return images


def get_images() -> Dict[str, Any]:
    """Versión síncrona para compatibilidad con código existente"""
    github_branch = get_github_branch()
    images = load_images_config().copy()
    
    # Reemplazar {GITHUB_BRANCH} en las URLs
    for category in images.values():
        if isinstance(category, dict):
            for key, url in category.items():
                if isinstance(url, str):
                    category[key] = url.replace('{GITHUB_BRANCH}', github_branch)
    
    return images


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
    """
    Genera un srcset para imágenes responsivas
    """
    sizes = ["small", "medium", "large", "xl"]
    srcset_parts = []
    
    for size in sizes:
        config = {
            "small": {"w": 300, "descriptor": "300w"},
            "medium": {"w": 600, "descriptor": "600w"}, 
            "large": {"w": 1200, "descriptor": "1200w"},
            "xl": {"w": 1920, "descriptor": "1920w"}
        }
        
        size_config = config[size]
        separator = "&" if "?" in base_url else "?"
        url = f"{base_url}{separator}w={size_config['w']}&fit=crop&fm={format_type}&q=85"
        srcset_parts.append(f"{url} {size_config['descriptor']}")
    
    return ", ".join(srcset_parts)


async def preload_critical_images_async() -> list:
    """
    Retorna lista de imágenes críticas que deben precargarse (versión asíncrona)
    """
    images = await get_images_async()
    critical_images = []
    
    # Imágenes de autenticación (página de login)
    if 'auth' in images:
        for image_url in images['auth'].values():
            critical_images.append({
                'url': get_optimized_image_url(image_url, 'medium'),
                'as': 'image',
                'type': 'image/webp'
            })
    
    # Iconos importantes
    if 'icons' in images:
        for image_url in images['icons'].values():
            critical_images.append({
                'url': image_url,
                'as': 'image',
                'type': 'image/svg+xml' if image_url.endswith('.svg') else 'image/webp'
            })
    
    return critical_images


async def batch_process_images_async(image_urls: list, size: str = "medium") -> list:
    """
    Procesa múltiples URLs de imágenes en paralelo para optimizar rendimiento
    """
    async def process_single_image(url):
        return {
            'original_url': url,
            'optimized_url': get_optimized_image_url(url, size),
            'srcset': get_responsive_image_srcset(url),
            'sizes': '(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw'
        }
    
    tasks = [process_single_image(url) for url in image_urls]
    return await asyncio.gather(*tasks)


async def validate_image_urls_async(urls: list) -> Dict[str, bool]:
    """
    Valida múltiples URLs de imágenes de forma asíncrona
    Nota: Implementación básica, se podría extender con requests HTTP reales
    """
    async def validate_single_url(url):
        # Validación básica de formato
        if not url or not isinstance(url, str):
            return False
        
        # Verificar que sea una URL válida
        valid_schemes = ['http://', 'https://', '//']
        valid_extensions = ['.jpg', '.jpeg', '.png', '.webp', '.svg', '.gif']
        
        has_valid_scheme = any(url.startswith(scheme) for scheme in valid_schemes)
        has_valid_extension = any(url.lower().endswith(ext) for ext in valid_extensions)
        
        return has_valid_scheme and (has_valid_extension or '?' in url)  # URLs con parámetros también válidas
    
    tasks = [validate_single_url(url) for url in urls]
    results = await asyncio.gather(*tasks)
    
    return {url: result for url, result in zip(urls, results)}


def preload_critical_images() -> list:
    """
    Retorna lista de imágenes críticas que deben precargarse
    """
    images = get_images()
    critical_images = []
    
    # Imágenes de autenticación (página de login)
    if 'auth' in images:
        for image_url in images['auth'].values():
            critical_images.append({
                'url': get_optimized_image_url(image_url, 'medium'),
                'as': 'image',
                'type': 'image/webp'
            })
    
    # Iconos importantes
    if 'icons' in images:
        for image_url in images['icons'].values():
            critical_images.append({
                'url': image_url,
                'as': 'image',
                'type': 'image/svg+xml' if image_url.endswith('.svg') else 'image/webp'
            })
    
    return critical_images


def clear_images_cache():
    """Limpia el caché de imágenes (útil para desarrollo)"""
    global _images_cache, _cache_timestamp
    _images_cache = None
    _cache_timestamp = None
    get_github_branch.cache_clear()
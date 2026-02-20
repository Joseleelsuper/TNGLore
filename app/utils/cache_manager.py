# app/utils/cache_manager.py
import os
import hashlib
import logging
from typing import Any, Callable, Dict, Optional
from flask_caching import Cache
from functools import wraps
from collections import defaultdict

logger = logging.getLogger(__name__)


def safe_memoize(timeout: int = 300) -> Callable:
    """Decorador que envuelve @cache.memoize con manejo seguro de errores.
    
    Si el backend de caché falla (ej: error de serialización),
    el decorador captura la excepción y ejecuta la función original directamente.
    Esto garantiza que los datos SIEMPRE se devuelven desde MongoDB aunque la caché falle.
    
    Uso:
        @safe_memoize(timeout=600)
        def get_data(): ...
        
    Para invalidar, usar: cache.delete_memoized(get_data._memoized_fn)
    o bien la función safe_delete_memoized(get_data, ...).
    """
    from app import cache
    
    def decorator(func: Callable) -> Callable:
        # Crear función interna con identidad del original ANTES de memoizar.
        # Esto es crítico: @cache.memoize genera claves de caché usando
        # __name__, __module__ y __qualname__ de la función que recibe.
        # Si no se copian antes, todas las funciones compartirían la misma clave.
        def inner_fn(*args, **kwargs):
            return func(*args, **kwargs)
        
        inner_fn.__name__ = func.__name__
        inner_fn.__module__ = func.__module__
        inner_fn.__qualname__ = func.__qualname__
        
        # Ahora aplicar @cache.memoize — usará inner_fn.__qualname__ para el cache key
        memoized_fn = cache.memoize(timeout=timeout)(inner_fn)
        
        @wraps(func)
        def wrapper(*args, **kwargs):
            try:
                return memoized_fn(*args, **kwargs)
            except Exception as e:
                # Caché falló — ejecutar función directamente contra MongoDB
                logger.warning(f"Cache error on {func.__name__}, falling through to DB: {e}")
                return func(*args, **kwargs)
        
        # Guardar referencia a la función memoizada para delete_memoized
        wrapper._memoized_fn = memoized_fn
        return wrapper
    return decorator


def safe_delete_memoized(func: Callable, *args) -> None:
    """Elimina entradas de caché de forma segura, ignorando errores del backend.
    
    Usa func._memoized_fn si la función fue decorada con @safe_memoize,
    de lo contrario intenta directamente con la función proporcionada.
    """
    from app import cache
    try:
        target = getattr(func, '_memoized_fn', func)
        if args:
            cache.delete_memoized(target, *args)
        else:
            cache.delete_memoized(target)
    except Exception as e:
        logger.warning(f"Failed to delete memoized cache for {func.__name__}: {e}")

class CacheManager:
    """Gestor de caché para optimizar el rendimiento de la aplicación"""
    
    def __init__(self, cache_instance: Cache):
        self.cache = cache_instance
        self.hit_stats = defaultdict(int)
        self.miss_stats = defaultdict(int)
    
    def get_cache_key(self, prefix: str, *args) -> str:
        """Genera una clave de caché única basada en los argumentos"""
        key_data = f"{prefix}::{':'.join(str(arg) for arg in args)}"
        return hashlib.md5(key_data.encode()).hexdigest()
    
    def cached_result(self, timeout: int = 300, key_prefix: str = "general"):
        """Decorador para cachear resultados de funciones"""
        def decorator(func):
            @wraps(func)
            def wrapper(*args, **kwargs):
                cache_key = self.get_cache_key(key_prefix, func.__name__, *args, *kwargs.values())
                
                # Intentar obtener del caché
                result = self.cache.get(cache_key)
                if result is not None:
                    self.hit_stats[key_prefix] += 1
                    return result
                
                # Si no está en caché, ejecutar función
                result = func(*args, **kwargs)
                self.cache.set(cache_key, result, timeout=timeout)
                self.miss_stats[key_prefix] += 1
                return result
            return wrapper
        return decorator
    
    def invalidate_pattern(self, pattern: str):
        """Invalida todas las claves que coincidan con un patrón"""
        # Nota: Flask-Caching no soporta patrones por defecto
        # Esta es una implementación básica para backends que soporten scan_iter.
        keys_to_delete = []
        cache_backend = getattr(self.cache, 'cache', None)
        if cache_backend and hasattr(cache_backend, 'scan_iter'):
            for key in cache_backend.scan_iter(match=f"*{pattern}*"):
                keys_to_delete.append(key)
            for key in keys_to_delete:
                self.cache.delete(key)
        else:
            # Para backends sin soporte de scan_iter (ej: SimpleCache), no se puede invalidar por patrón
            # Se podría advertir o simplemente no hacer nada
            pass
    
    def get_stats(self) -> Dict[str, Any]:
        """Obtiene estadísticas del caché"""
        total_hits = sum(self.hit_stats.values())
        total_misses = sum(self.miss_stats.values())
        hit_rate = total_hits / (total_hits + total_misses) if (total_hits + total_misses) > 0 else 0
        
        return {
            'hit_rate': round(hit_rate * 100, 2),
            'total_hits': total_hits,
            'total_misses': total_misses,
            'by_category': {
                'hits': dict(self.hit_stats),
                'misses': dict(self.miss_stats)
            }
        }


def create_cache_config() -> Dict[str, Any]:
    """Crea la configuración del caché según el entorno.
    
    Usa SimpleCache (en memoria) por defecto. En Vercel serverless
    el caché se pierde en cold starts, pero safe_memoize garantiza
    que siempre se sirven datos desde MongoDB.
    """
    cache_type = os.getenv('CACHE_TYPE', '')
    
    if cache_type == 'filesystem':
        return {
            'CACHE_TYPE': 'FileSystemCache',
            'CACHE_DIR': os.getenv('CACHE_DIR', '/tmp/flask-cache'),
            'CACHE_DEFAULT_TIMEOUT': 300
        }
    else:
        # Caché en memoria (SimpleCache)
        return {
            'CACHE_TYPE': 'SimpleCache',
            'CACHE_DEFAULT_TIMEOUT': 300
        }

# app/utils/cache_manager.py
import os
import hashlib
from typing import Any, Dict
from flask_caching import Cache
from functools import wraps
from collections import defaultdict

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
        # Esta es una implementación básica para RedisCache.
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
    
    Auto-detecta Redis si REDIS_URL está definida. Esto es crítico
    para Vercel serverless, donde SimpleCache se pierde en cold starts.
    """
    redis_url = os.getenv('REDIS_URL')
    cache_type = os.getenv('CACHE_TYPE', '')
    
    # Auto-detect: si hay REDIS_URL, usar Redis aunque no se pida explícitamente
    if redis_url or cache_type == 'redis':
        return {
            'CACHE_TYPE': 'RedisCache',
            'CACHE_REDIS_URL': redis_url or 'redis://localhost:6379/0',
            'CACHE_DEFAULT_TIMEOUT': 300
        }
    elif cache_type == 'filesystem':
        return {
            'CACHE_TYPE': 'FileSystemCache',
            'CACHE_DIR': os.getenv('CACHE_DIR', '/tmp/flask-cache'),
            'CACHE_DEFAULT_TIMEOUT': 300
        }
    else:
        # Caché en memoria para desarrollo local
        return {
            'CACHE_TYPE': 'SimpleCache',
            'CACHE_DEFAULT_TIMEOUT': 300
        }

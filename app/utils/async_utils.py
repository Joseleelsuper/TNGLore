# app/utils/async_utils.py
import asyncio
from functools import wraps
from typing import Any, Callable, Dict
import threading
import logging

logger = logging.getLogger(__name__)

# Thread-local storage para gestionar loops de asyncio
_thread_local = threading.local()


def get_or_create_event_loop():
    """Obtiene o crea un event loop para el thread actual"""
    if not hasattr(_thread_local, 'loop'):
        try:
            # Intentar obtener el loop actual
            _thread_local.loop = asyncio.get_event_loop()
        except RuntimeError:
            # Si no hay loop, crear uno nuevo
            _thread_local.loop = asyncio.new_event_loop()
            asyncio.set_event_loop(_thread_local.loop)
    
    return _thread_local.loop


def run_async_in_sync(coro):
    """
    Ejecuta una corrutina de forma síncrona de manera segura
    Compatible con aplicaciones Flask que no son nativas asíncronas
    """
    try:
        loop = get_or_create_event_loop()
        
        if loop.is_running():
            # Si el loop ya está corriendo, crear una tarea
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as executor:
                future = executor.submit(asyncio.run, coro)
                return future.result()
        else:
            # Si el loop no está corriendo, ejecutar directamente
            return loop.run_until_complete(coro)
    except Exception as e:
        logger.error(f"Error executing async coroutine: {e}")
        raise


def async_to_sync(async_func: Callable) -> Callable:
    """
    Decorador que convierte una función asíncrona en síncrona
    Útil para usar funciones async en contextos síncronos como Flask
    """
    @wraps(async_func)
    def wrapper(*args, **kwargs):
        coro = async_func(*args, **kwargs)
        return run_async_in_sync(coro)
    
    return wrapper


class AsyncContextManager:
    """
    Gestor de contexto para operaciones asíncronas en Flask
    """
    
    def __init__(self):
        self.loop = None
        self.tasks = []
    
    def __enter__(self):
        self.loop = get_or_create_event_loop()
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        # Cancelar tareas pendientes si hay errores
        if exc_type and self.tasks:
            for task in self.tasks:
                if not task.done():
                    task.cancel()
    
    def run_async(self, coro):
        """Ejecuta una corrutina en el contexto actual"""
        if self.loop and self.loop.is_running():
            task = asyncio.create_task(coro)
            self.tasks.append(task)
            return task
        else:
            return run_async_in_sync(coro)
    
    async def gather_async(self, *coros):
        """Ejecuta múltiples corrutinas en paralelo"""
        tasks = [asyncio.create_task(coro) for coro in coros]
        self.tasks.extend(tasks)
        return await asyncio.gather(*tasks, return_exceptions=True)


class AsyncResultCache:
    """
    Caché especializado para resultados de funciones asíncronas
    """
    
    def __init__(self, maxsize: int = 128, ttl: int = 300):
        self.maxsize = maxsize
        self.ttl = ttl
        self.cache: Dict[str, Dict[str, Any]] = {}
        self.access_times: Dict[str, float] = {}
    
    def _cleanup_expired(self):
        """Limpia entradas expiradas del caché"""
        import time
        current_time = time.time()
        expired_keys = [
            key for key, access_time in self.access_times.items()
            if current_time - access_time > self.ttl
        ]
        
        for key in expired_keys:
            self.cache.pop(key, None)
            self.access_times.pop(key, None)
    
    def _evict_lru(self):
        """Elimina la entrada menos recientemente usada"""
        if len(self.cache) >= self.maxsize:
            lru_key = min(self.access_times.items(), key=lambda x: x[1])[0]
            self.cache.pop(lru_key, None)
            self.access_times.pop(lru_key, None)
    
    def get(self, key: str) -> Any:
        """Obtiene un valor del caché"""
        self._cleanup_expired()
        
        if key in self.cache:
            import time
            self.access_times[key] = time.time()
            return self.cache[key]['value']
        
        return None
    
    def set(self, key: str, value: Any):
        """Establece un valor en el caché"""
        import time
        
        self._cleanup_expired()
        self._evict_lru()
        
        self.cache[key] = {'value': value}
        self.access_times[key] = time.time()
    
    def clear(self):
        """Limpia todo el caché"""
        self.cache.clear()
        self.access_times.clear()


def cached_async(maxsize: int = 128, ttl: int = 300):
    """
    Decorador para cachear resultados de funciones asíncronas
    """
    cache = AsyncResultCache(maxsize, ttl)
    
    def decorator(async_func):
        @wraps(async_func)
        async def wrapper(*args, **kwargs):
            # Generar clave de caché
            import hashlib
            key_data = f"{async_func.__name__}:{args}:{sorted(kwargs.items())}"
            cache_key = hashlib.md5(key_data.encode()).hexdigest()
            
            # Intentar obtener del caché
            cached_result = cache.get(cache_key)
            if cached_result is not None:
                return cached_result
            
            # Si no está en caché, ejecutar función
            result = await async_func(*args, **kwargs)
            cache.set(cache_key, result)
            
            return result
        
        # Añadir método para limpiar caché
        wrapper.cache_clear = cache.clear
        return wrapper
    
    return decorator


# Funciones de utilidad para integración con Flask

def make_async_route(app, rule: str, **options):
    """
    Decorador para crear rutas Flask que soporten funciones asíncronas
    """
    def decorator(async_func):
        @wraps(async_func)
        def sync_wrapper(*args, **kwargs):
            return run_async_in_sync(async_func(*args, **kwargs))
        
        return app.route(rule, **options)(sync_wrapper)
    
    return decorator


def background_task(func):
    """
    Decorador para ejecutar funciones asíncronas en segundo plano
    """
    @wraps(func)
    def wrapper(*args, **kwargs):
        async def run_task():
            try:
                await func(*args, **kwargs)
            except Exception as e:
                logger.error(f"Background task error: {e}")
        
        # Ejecutar en thread separado para no bloquear
        import threading
        thread = threading.Thread(target=lambda: run_async_in_sync(run_task()))
        thread.daemon = True
        thread.start()
        
        return thread
    
    return wrapper

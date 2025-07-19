# app/utils/async_db.py
import asyncio
from typing import List, Dict, Any, Optional
from concurrent.futures import ThreadPoolExecutor
from bson import ObjectId
import logging

logger = logging.getLogger(__name__)

class AsyncDBManager:
    """Gestor para operaciones asíncronas de base de datos"""
    
    def __init__(self, mongo_instance):
        self.mongo = mongo_instance
        self.executor = ThreadPoolExecutor(max_workers=4)
    
    async def find_user_async(self, email: str) -> Optional[Dict[str, Any]]:
        """Busca un usuario de forma asíncrona"""
        loop = asyncio.get_event_loop()
        try:
            result = await loop.run_in_executor(
                self.executor,
                lambda: self.mongo.users.find_one({"email": email})
            )
            return result
        except Exception as e:
            logger.error(f"Error finding user {email}: {str(e)}")
            return None
    
    async def find_multiple_chests_async(self, chest_ids: List[str]) -> List[Dict[str, Any]]:
        """Busca múltiples cofres de forma asíncrona"""
        loop = asyncio.get_event_loop()
        try:
            object_ids = [ObjectId(chest_id) for chest_id in chest_ids]
            result = await loop.run_in_executor(
                self.executor,
                lambda: list(self.mongo.chests.find({"_id": {"$in": object_ids}}))
            )
            return result
        except Exception as e:
            logger.error(f"Error finding chests: {str(e)}")
            return []
    
    async def find_collectables_by_rarity_async(self, rarity: str, limit: int = 1) -> List[Dict[str, Any]]:
        """Busca coleccionables por rareza de forma asíncrona"""
        loop = asyncio.get_event_loop()
        try:
            pipeline = [
                {"$match": {"rareza": rarity}},
                {"$sample": {"size": limit}}
            ]
            result = await loop.run_in_executor(
                self.executor,
                lambda: list(self.mongo.collectables.aggregate(pipeline))
            )
            return result
        except Exception as e:
            logger.error(f"Error finding collectables with rarity {rarity}: {str(e)}")
            return []
    
    async def update_user_chests_async(self, email: str, new_chests: List[str]) -> bool:
        """Actualiza los cofres del usuario de forma asíncrona"""
        loop = asyncio.get_event_loop()
        try:
            result = await loop.run_in_executor(
                self.executor,
                lambda: self.mongo.users.update_one(
                    {"email": email},
                    {"$set": {"chests": new_chests}}
                )
            )
            return result.modified_count > 0
        except Exception as e:
            logger.error(f"Error updating user chests for {email}: {str(e)}")
            return False
    
    async def add_collectables_to_guild_async(self, email: str, server: str, collectables: List[str]) -> bool:
        """Añade coleccionables a un guild de forma asíncrona"""
        loop = asyncio.get_event_loop()
        try:
            result = await loop.run_in_executor(
                self.executor,
                lambda: self.mongo.users.update_one(
                    {"email": email, "guilds.id": server},
                    {"$push": {"guilds.$.coleccionables": {"$each": collectables}}}
                )
            )
            return result.modified_count > 0
        except Exception as e:
            logger.error(f"Error adding collectables to guild for {email}: {str(e)}")
            return False
    
    async def batch_find_collectables_async(self, rarities: List[str]) -> List[Dict[str, Any]]:
        """Busca múltiples coleccionables en paralelo"""
        tasks = []
        for rarity in rarities:
            task = self.find_collectables_by_rarity_async(rarity, 1)
            tasks.append(task)
        
        results = await asyncio.gather(*tasks, return_exceptions=True)
        collectables = []
        
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                logger.error(f"Error finding collectable for rarity {rarities[i]}: {str(result)}")
                collectables.append([])
            else:
                collectables.append(result)
        
        return collectables
    
    def run_async(self, coro):
        """Ejecuta una corrutina de forma síncrona"""
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                # Si ya hay un loop corriendo, crear una nueva tarea
                return asyncio.create_task(coro)
            else:
                return loop.run_until_complete(coro)
        except RuntimeError:
            # Si no hay loop, crear uno nuevo
            return asyncio.run(coro)


class CollectionCache:
    """Caché específico para datos de colecciones"""
    
    def __init__(self, cache_manager):
        self.cache_manager = cache_manager
        self.cache_timeout = 1800  # 30 minutos
    
    def get_cached_user_data(self, email: str, cache_key: Optional[str] = None):
        """Obtiene datos del usuario desde caché o base de datos"""
        if not cache_key:
            cache_key = f"user_data:{email}"
        
        return self.cache_manager.cache.get(cache_key)
    
    def set_cached_user_data(self, email: str, data: Dict[str, Any], cache_key: Optional[str] = None):
        """Guarda datos del usuario en caché"""
        if not cache_key:
            cache_key = f"user_data:{email}"
        
        self.cache_manager.cache.set(cache_key, data, timeout=self.cache_timeout)
    
    def invalidate_user_cache(self, email: str):
        """Invalida el caché de un usuario específico"""
        patterns = [f"user_data:{email}", f"user_chests:{email}", f"user_collectables:{email}"]
        for pattern in patterns:
            self.cache_manager.cache.delete(pattern)


def create_async_db_manager(mongo_instance):
    """Factory para crear el gestor de DB asíncrono"""
    return AsyncDBManager(mongo_instance)

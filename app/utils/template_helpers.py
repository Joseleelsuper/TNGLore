# app/utils/template_helpers.py
from flask import current_app
from typing import Dict, List
from app.utils.images import preload_critical_images, get_optimized_image_url


def inject_performance_helpers():
    """Inyecta helpers de rendimiento en los templates"""
    
    def get_preload_links() -> List[Dict[str, str]]:
        """Genera enlaces de precarga para imágenes críticas"""
        try:
            critical_images = preload_critical_images()
            return critical_images
        except Exception as e:
            current_app.logger.error(f"Error generating preload links: {e}")
            return []
    
    def get_optimized_image(url: str, size: str = "medium") -> str:
        """Helper para obtener URLs de imágenes optimizadas en templates"""
        try:
            return get_optimized_image_url(url, size)
        except Exception:
            return url
    
    def get_responsive_attributes(url: str) -> Dict[str, str]:
        """Genera atributos para imágenes responsivas"""
        from app.utils.images import get_responsive_image_srcset
        try:
            return {
                'srcset': get_responsive_image_srcset(url),
                'sizes': '(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw',
                'loading': 'lazy',
                'decoding': 'async'
            }
        except Exception:
            return {'loading': 'lazy', 'decoding': 'async'}
    
    def get_cache_bust_url(url: str) -> str:
        """Añade cache busting a URLs en desarrollo"""
        if current_app.debug:
            import time
            separator = "&" if "?" in url else "?"
            return f"{url}{separator}t={int(time.time())}"
        return url
    
    return {
        'get_preload_links': get_preload_links,
        'get_optimized_image': get_optimized_image, 
        'get_responsive_attributes': get_responsive_attributes,
        'get_cache_bust_url': get_cache_bust_url
    }


def register_template_helpers(app):
    """Registra los helpers en la aplicación Flask"""
    
    @app.context_processor
    def inject_helpers():
        return inject_performance_helpers()
    
    @app.template_filter('optimize_image')
    def optimize_image_filter(url, size='medium'):
        """Filtro de template para optimizar imágenes"""
        return get_optimized_image_url(url, size)
    
    @app.template_filter('cache_bust')
    def cache_bust_filter(url):
        """Filtro para cache busting"""
        if app.debug:
            import time
            separator = "&" if "?" in url else "?"
            return f"{url}{separator}t={int(time.time())}"
        return url

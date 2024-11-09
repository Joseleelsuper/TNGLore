import os
from datetime import timedelta
from dotenv import load_dotenv

# Determinar el entorno
ENVIRONMENT = os.getenv('ENVIRONMENT', 'local')

# Cargar el archivo .env correspondiente
if ENVIRONMENT == 'production':
    load_dotenv('.env.production')
elif ENVIRONMENT == 'local':
    load_dotenv('.env.local')
else:
    load_dotenv('.env')

class Config:
    MONGODB_URI = os.getenv('MONGODB_URI')
    SECRET_KEY = os.getenv('SECRET_KEY', 'dev')
    
    # Configuración de sesión
    PERMANENT_SESSION_LIFETIME = timedelta(minutes=30)  # Duración máxima de inactividad
    SESSION_PERMANENT = False  # La sesión expira al cerrar el navegador
    SESSION_COOKIE_SECURE = ENVIRONMENT == 'production'  # HTTPS solo en producción
    SESSION_COOKIE_HTTPONLY = True  # No accesible por JavaScript
    SESSION_COOKIE_SAMESITE = 'Lax'  # Protección CSRF

    os.environ['OAUTHLIB_INSECURE_TRANSPORT'] = '1'
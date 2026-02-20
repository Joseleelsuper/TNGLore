import os
from datetime import timedelta
from dotenv import load_dotenv

if os.path.exists('.env.local'):
    load_dotenv('.env.local')
else:
    load_dotenv('.env')

class Config:
    MONGODB_URI = os.getenv('MONGODB_URI')
    SECRET_KEY = os.getenv('SECRET_KEY', 'dev')
    # Configuración de sesión
    PERMANENT_SESSION_LIFETIME = timedelta(hours=1)  # Duración máxima de inactividad
    SESSION_PERMANENT = False  # La sesión expira al cerrar el navegador
    SESSION_COOKIE_HTTPONLY = True  # No accesible por JavaScript
    SESSION_COOKIE_SAMESITE = 'Lax'  # Protección CSRF
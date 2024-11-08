import os
from dotenv import load_dotenv

# Determinar el entorno
ENVIRONMENT = os.getenv('ENVIRONMENT', 'local')  # 'local', 'production'

# Cargar el archivo .env correspondiente
if ENVIRONMENT == 'production':
    load_dotenv('.env.production')
elif ENVIRONMENT == 'local':
    load_dotenv('.env.local')
else:
    load_dotenv('.env')  # archivo por defecto

class Config:
    SECRET_KEY = os.getenv('SECRET_KEY', 'dev')
    MONGODB_URI = os.getenv('MONGODB_URI')
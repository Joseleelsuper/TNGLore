# api/index.py
from app import create_app

app = create_app()

# Punto de entrada para Vercel
from flask import Flask

app.debug = False
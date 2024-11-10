from app import create_app

app = create_app()

if __name__ == '__main__':
    app.run(
        host='127.0.0.1',
        port=5000,
        ssl_context=(
            'ssl/localhost+1.pem',  # certificado
            'ssl/localhost+1-key.pem'  # clave privada
        ),
        debug=True)
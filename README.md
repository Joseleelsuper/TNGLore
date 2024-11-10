# TNGLore - Proyecto Web
Proyecto web dedicado a la apertura de cofres y ganancia de cartas. El objetivo era mejorar como programador creando una página web que se comunique con un bot de discord y viceversa para que, el bot de discord proporcione los cofres a los usuarios y estos puedan abrirlos en la página web.

## Índice
- [Tecnologías](#tecnologías)
- [Funcionalidades](#funcionalidades)
- [Cómo ejecutar en local](#cómo-ejecutar-en-local)

## Tecnologías
- **Frontend**: HTML, CSS, JavaScript.
- **Backend**: Python (Flask).
- **Base de datos**: MongoDB.

## Funcionalidades
- **Registro y login de usuarios**.
- **Apertura de cofres**.
- **Ganancia de cartas**.
- **Panel de Administrador**.

## Cómo ejecutar en local:
1. Clonar el repositorio.
```bash
git clone https://github.com/Joseleelsuper/TNGLore
```
2. Instalar las dependencias.
```bash
pip install -r requirements.txt
```
3. Modificar el nombre del archivo `.env.example` a `.env` y completar las variables de entorno.
4. Instalar chocolatey.
```bash
Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://chocolatey.org/install.ps1'))
```
5. Instalar Certificados locales.
```bash
choco install mkcert
```
6. Instalar el certificado local.
```bash
mkcert -install
```
7. Crear un certificado local en una carpeta creada por ti en el directorio raíz.
```bash
mkdir ssl
mkcert localhost 127.0.0.1
```

Volver al [Índice](#índice)
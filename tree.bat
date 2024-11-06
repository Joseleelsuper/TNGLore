@echo off
REM Crear directorios principales
mkdir public
mkdir public\assets
mkdir public\assets\images
mkdir public\assets\fonts
mkdir public\assets\icons
mkdir public\css
mkdir public\css\components
mkdir public\js
mkdir public\js\auth
mkdir public\js\db
mkdir public\js\utils
mkdir public\js\components
mkdir server
mkdir server\config
mkdir server\models
mkdir server\routes
mkdir server\middleware
mkdir views
mkdir views\components
mkdir tests

REM Crear archivos base
echo. > public\css\style.css
echo. > public\js\main.js
echo. > server\config\db.js
echo. > server\config\discord.js
echo. > server\server.js
echo. > views\index.html
echo. > views\login.html
echo. > .env
echo. > .gitignore
echo. > package.json
echo. > README.md

echo Estructura de directorios creada exitosamente!
pause
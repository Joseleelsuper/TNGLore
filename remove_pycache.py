# Elimina la carpeta __pycache__ de un directorio junto a todos sus archivos y subdirectorios.

import os
import shutil

def remove_pycache(directory: str):
    """
    Elimina la carpeta __pycache__ de un directorio junto a todos sus archivos y subdirectorios.
    """
    for root, dirs, files in os.walk(directory):
        if "__pycache__" in dirs:
            shutil.rmtree(os.path.join(root, "__pycache__"))
            print(f"Se ha eliminado la carpeta '__pycache__' del directorio '{root}'.")
        for file in files:
            if file == "__pycache__":
                os.remove(os.path.join(root, file))
                print(f"Se ha eliminado el archivo '__pycache__' del directorio '{root}'.")
    print(f"Se han eliminado los archivos '__pycache__' del directorio '{directory}'.")

remove_pycache("app")
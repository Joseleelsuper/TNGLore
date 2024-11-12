import re

def is_valid_email(email):
    """
    Valida si el correo electrónico es válido según el estándar RFC 5322.
    También verifica que la longitud total no exceda los 320 caracteres (RFC 3696).
    """
    email_regex = re.compile(r'^[a-zA-Z0-9.!#$%&\'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$')
    return email_regex.match(email) is not None and len(email) <= 320

def is_valid_password(password):
    """
    Valida si la contraseña cumple con los requisitos:
    - Entre 6 y 64 caracteres
    - Al menos una letra mayúscula
    - Al menos una letra minúscula
    - Al menos un número
    """
    if not (6 <= len(password) <= 64):
        return False
    if not re.search(r'[A-Z]', password):
        return False
    if not re.search(r'[a-z]', password):
        return False
    if not re.search(r'\d', password):
        return False
    return True

def validate_user_input(username, email, password):
    """
    Valida los datos de entrada del usuario para registro o actualización de perfil.
    Retorna una tupla (is_valid, error_message).
    """
    if not username or len(username) < 1 or len(username) > 32:
        return False, "El nombre de usuario debe tener entre 1 y 32 caracteres."
    
    if not is_valid_email(email):
        return False, "El correo electrónico no es válido."
    
    if password and not is_valid_password(password):
        return False, "La contraseña debe tener entre 6 y 64 caracteres, incluyendo al menos una mayúscula, una minúscula y un número."
    
    return True, None
from flask_login import UserMixin
from app import mongo, bcrypt, login_manager
from bson.objectid import ObjectId

class User(UserMixin):
    def __init__(self, username, email, password, _id=None, is_admin=False,
                 discord_id=None, pfp=None, guilds=None, chests=None, 
                 registration_method="Normal"):
        self.username = username
        self.email = email
        self.password = password
        self._id = _id
        self.is_admin = is_admin
        self.discord_id = discord_id
        self.pfp = pfp
        self.guilds = guilds or []
        self.chests = chests or []
        self.registration_method = registration_method

    def get_id(self):
        return str(self._id)
    
    @staticmethod
    def get_by_id(user_id):
        try:
            user_data = mongo.db.users.find_one({'_id': ObjectId(user_id)})
            if user_data:
                return User(
                    username=user_data['username'],
                    email=user_data['email'],
                    password=user_data['password'],
                    _id=user_data['_id'],
                    is_admin=user_data.get('is_admin', False)
                )
        except:
            return None
        return None

    @staticmethod
    def get_by_username(username):
        user_data = mongo.db.users.find_one({
            '$or': [
                {'username': username},
                {'email': username}
            ]
        })
        if user_data:
            return User(
                username=user_data['username'],
                email=user_data['email'],
                password=user_data['password'],
                _id=user_data['_id'],
                is_admin=user_data.get('is_admin', False),
                discord_id=user_data.get('discord_id'),
                pfp=user_data.get('pfp'),
                guilds=user_data.get('guilds', []),
                chests=user_data.get('chests', []),
                registration_method=user_data.get('registration_method', 'Normal')
            )
        return None

    @staticmethod
    def get_by_discord_id(discord_id):
        user_data = mongo.db.users.find_one({'discord_id': discord_id})
        if user_data:
            return User(
                username=user_data['username'],
                email=user_data['email'],
                password=user_data.get('password'),
                _id=user_data['_id'],
                is_admin=user_data.get('is_admin', False),
                discord_id=user_data.get('discord_id'),
                pfp=user_data.get('pfp'),
                guilds=user_data.get('guilds', []),
                chests=user_data.get('chests', []),
                registration_method=user_data.get('registration_method', 'Normal')
            )
        return None

    @staticmethod
    def create_from_discord(discord_data):
        user_data = {
            'username': discord_data['username'],
            'email': discord_data['email'],
            'password': None,
            'discord_id': discord_data['id'],
            'pfp': f"https://cdn.discordapp.com/avatars/{discord_data['id']}/{discord_data['avatar']}.png",
            'guilds': [],  # Se llenará después con la info de los servidores
            'chests': [],
            'registration_method': 'Discord',
            'is_admin': False
        }
        return User(**user_data)

    def update_discord_info(self, discord_data, guilds_data):
        self.discord_id = discord_data['id']
        self.pfp = f"https://cdn.discordapp.com/avatars/{discord_data['id']}/{discord_data['avatar']}.png"
        self.guilds = [{
            'id': guild['id'],
            'name': guild['name'],
            'icon': guild['icon'],
            'banner': guild.get('banner'),
            'owner': guild['owner'],
            'permissions': guild['permissions'],
            'permissions_new': guild['permissions_new'],
            'features': guild.get('features', []),
            'coleccionables': []
        } for guild in guilds_data]

    def check_password(self, password):
        return bcrypt.check_password_hash(self.password, password)

@login_manager.user_loader
def load_user(user_id):
    return User.get_by_id(user_id)
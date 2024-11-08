from flask_login import UserMixin
from app import mongo, bcrypt, login_manager
from bson.objectid import ObjectId

class User(UserMixin):
    def __init__(self, username, email, password, _id=None, is_admin=False):
        self.username = username
        self.email = email
        self.password = password
        self._id = _id
        self.is_admin = is_admin
    
    def get_id(self):
        return str(self._id)
    
    @staticmethod
    def get_by_id(user_id):
        user_data = mongo.db.users.find_one({'_id': ObjectId(user_id)})
        if user_data:
            return User(
                username=user_data['username'],
                email=user_data['email'],
                password=user_data['password'],
                _id=user_data['_id'],
                is_admin=user_data.get('is_admin', False)
            )
        return None
    
    @staticmethod
    def get_by_username(username):
        user_data = mongo.db.users.find_one({'username': username})
        if user_data:
            return User(
                username=user_data['username'],
                email=user_data['email'],
                password=user_data['password'],
                _id=user_data['_id'],
                is_admin=user_data.get('is_admin', False)
            )
        return None
    
    def check_password(self, password):
        return bcrypt.check_password_hash(self.password, password)

@login_manager.user_loader
def load_user(user_id):
    return User.get_by_id(user_id)
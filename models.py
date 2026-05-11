"""
models.py
Modelo de usuário para Flask-Login.
"""

from flask_login import UserMixin
from database import get_db_connection


class User(UserMixin):
    def __init__(self, id, username, password_hash, is_active=True):
        self.id = id
        self.username = username
        self.password_hash = password_hash
        self.active = is_active

    @property
    def is_active(self):
        return self.active


def load_user(user_id):
    conn = get_db_connection()
    user_data = conn.execute("SELECT * FROM Users WHERE id = ?", (user_id,)).fetchone()
    conn.close()
    if user_data:
        keys = user_data.keys()
        is_active = bool(user_data['is_active']) if 'is_active' in keys else True
        return User(
            id=user_data['id'],
            username=user_data['username'],
            password_hash=user_data['password_hash'],
            is_active=is_active
        )
    return None

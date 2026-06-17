"""
routes_auth.py
Blueprint de autenticação — login, logout, criação de usuários.
"""

import sqlite3
from flask import Blueprint, render_template, redirect, url_for, request, flash, abort
from flask_login import login_user, login_required, logout_user, current_user
from werkzeug.security import check_password_hash, generate_password_hash
from database import get_db_connection
from models import User

auth_bp = Blueprint('auth_bp', __name__)


@auth_bp.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form['username']
        password = request.form['password']

        conn = get_db_connection()
        user_data = conn.execute("SELECT * FROM Users WHERE username = ?", (username,)).fetchone()
        conn.close()

        if user_data and check_password_hash(user_data['password_hash'], password):
            keys = user_data.keys()
            is_active = bool(user_data['is_active']) if 'is_active' in keys else True
            permissions = user_data['permissions'] if 'permissions' in keys else None
            user = User(
                id=user_data['id'],
                username=user_data['username'],
                password_hash=user_data['password_hash'],
                is_active=is_active,
                permissions=permissions
            )
            login_user(user)
            return redirect(url_for('index'))

        flash('Usuário ou senha inválidos.')

    return render_template('login.html')


@auth_bp.route('/logout')
@login_required
def logout():
    logout_user()
    reason = request.args.get('reason')
    if reason == 'inactivity':
        flash('Sua sessão expirou por inatividade.')
    else:
        flash('Você saiu do sistema.')
    return redirect(url_for('auth_bp.login'))


@auth_bp.route('/new-user', methods=['POST'])
@login_required
def create_user():
    if current_user.username != 'admin':
        abort(403)

    username = request.form['username']
    password = request.form['password']

    conn = get_db_connection()
    try:
        hashed_pw = generate_password_hash(password, method='scrypt')
        conn.execute(
            "INSERT INTO Users (username, password_hash, is_active) VALUES (?, ?, 1)",
            (username, hashed_pw)
        )
        conn.commit()
        flash('Usuário criado com sucesso!')
    except sqlite3.IntegrityError:
        flash('Erro: Nome de usuário já existe.')
    except Exception as e:
        flash(f'Erro ao criar usuário: {e}')
    finally:
        conn.close()

    return redirect(url_for('index'))

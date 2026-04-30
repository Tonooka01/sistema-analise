import sqlite3
import os
from flask import g, current_app


def get_db():
    """
    Retorna a conexão com o banco de dados para o contexto da requisição atual.
    Se ainda não existir uma conexão aberta, cria uma nova e a armazena em `g`.
    O Flask fecha automaticamente ao fim de cada request via teardown_appcontext.
    """
    if 'db' not in g:
        database_path = current_app.config['DATABASE']
        g.db = sqlite3.connect(database_path, timeout=30.0)
        g.db.execute("PRAGMA journal_mode=WAL")
        g.db.row_factory = sqlite3.Row
    return g.db


def close_db(e=None):
    """
    Fecha a conexão com o banco se ela estiver aberta.
    Registrada via app.teardown_appcontext — chamada automaticamente pelo Flask.
    """
    db = g.pop('db', None)
    if db is not None:
        db.close()


def init_app(app):
    """
    Registra as funções de banco de dados no app Flask.
    Chamar isso em api_server.py substitui o app.config['GET_DB_CONNECTION'].
    """
    app.teardown_appcontext(close_db)

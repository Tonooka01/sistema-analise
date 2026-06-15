"""
database.py
Conexão com SQLite e inicialização das tabelas de sistema.
"""

import sqlite3
import os
from werkzeug.security import generate_password_hash
from logger import get_logger

logger = get_logger(__name__)

DATABASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'analise_dados.db')


def get_db_connection():
    """Conecta ao banco SQLite e retorna linhas como dicionários."""
    conn = sqlite3.connect(DATABASE, timeout=30.0)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.row_factory = sqlite3.Row
    return conn


def init_db_users():
    """Inicializa as tabelas de sistema (Users, AccessLogs, Settings) e faz migrações."""
    conn = get_db_connection()
    try:
        conn.execute('''
            CREATE TABLE IF NOT EXISTS Users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL
            )
        ''')
        conn.execute('''
            CREATE TABLE IF NOT EXISTS AccessLogs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT,
                path TEXT,
                method TEXT,
                ip_address TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        conn.execute('''
            CREATE TABLE IF NOT EXISTS Settings (
                key TEXT PRIMARY KEY,
                value TEXT
            )
        ''')
        conn.execute('''
            CREATE TABLE IF NOT EXISTS DRE (
                id               INTEGER PRIMARY KEY AUTOINCREMENT,
                Ano              INTEGER,
                Mes              INTEGER,
                Ano_Mes          TEXT,
                Grupo_DRE        TEXT,
                Subgrupo_DRE     TEXT,
                Plano_de_Contas  TEXT,
                Centro_de_Custo  TEXT,
                Fornecedor       TEXT,
                CNPJ             TEXT,
                Situacao         TEXT,
                Data_Competencia TEXT,
                Data_Vencimento  TEXT,
                Data_Confirmacao TEXT,
                Valor            REAL,
                NFe              TEXT,
                Cod_Lancamento   INTEGER,
                Loja             TEXT,
                Observacao       TEXT
            )
        ''')

        # Índices UNIQUE nas tabelas IXC para evitar duplicatas no INSERT OR REPLACE
        _IXC_INDEXES = [
            ('idx_contratos_id',         'Contratos',             'ID'),
            ('idx_contratos_neg_id',     'Contratos_Negativacao', 'ID'),
            ('idx_clientes_id',          'Clientes',              'ID'),
            ('idx_clientes_neg_id',      'Clientes_Negativacao',  'ID'),
            ('idx_logins_id',            'Logins',                'ID'),
        ]
        for idx, table, col in _IXC_INDEXES:
            try:
                conn.execute(
                    f"CREATE UNIQUE INDEX IF NOT EXISTS {idx} ON {table}({col})"
                )
            except Exception:
                pass  # tabela ainda não existe no primeiro boot

        # Migrations
        cursor = conn.cursor()
        cursor.execute("PRAGMA table_info(Users)")
        columns = [info[1] for info in cursor.fetchall()]

        if 'is_active' not in columns:
            logger.info("Atualizando tabela Users: Adicionando 'is_active'...")
            conn.execute("ALTER TABLE Users ADD COLUMN is_active INTEGER DEFAULT 1")

        if 'last_seen' not in columns:
            logger.info("Atualizando tabela Users: Adicionando 'last_seen'...")
            conn.execute("ALTER TABLE Users ADD COLUMN last_seen DATETIME")

        # Dados padrão
        if not conn.execute("SELECT value FROM Settings WHERE key = 'inactivity_timeout_minutes'").fetchone():
            conn.execute("INSERT INTO Settings (key, value) VALUES (?, ?)", ('inactivity_timeout_minutes', '30'))

        if not conn.execute("SELECT * FROM Users WHERE username = 'admin'").fetchone():
            hashed_pw = generate_password_hash('netvale01', method='scrypt')
            conn.execute(
                "INSERT INTO Users (username, password_hash, is_active) VALUES (?, ?, 1)",
                ('admin', hashed_pw)
            )
            logger.info("Usuário 'admin' criado com sucesso.")

        conn.commit()
    except Exception as e:
        logger.error("Erro ao inicializar banco de sistema: %s", e, exc_info=True)
    finally:
        conn.close()

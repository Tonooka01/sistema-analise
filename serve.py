"""
serve.py
Servidor de produção para Windows usando Waitress.
Use este arquivo em vez de rodar api_server.py diretamente.
"""

import os

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from waitress import serve
from api_server import app, init_db_users
from logger import get_logger

logger = get_logger(__name__)

# Inicializa banco
init_db_users()

host = '0.0.0.0'
port = 5000

logger.info(f"NetVale Dashboard iniciado em http://{host}:{port}")
logger.info("Pressione Ctrl+C para parar.")

serve(app, host=host, port=port, threads=6)

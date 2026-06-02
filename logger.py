"""
logger.py
Configuração centralizada de logging para o NetVale Dashboard.

Uso em qualquer módulo:
    from logger import get_logger
    logger = get_logger(__name__)

Nível de log controlado pela variável de ambiente LOG_LEVEL (padrão: INFO).
Logs gravados em logs/app.log com rotação de 10 MB (5 backups).
"""

import logging
import logging.handlers
import os

_LOG_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'logs')
os.makedirs(_LOG_DIR, exist_ok=True)

_LOG_FILE = os.path.join(_LOG_DIR, 'app.log')

_FORMATTER = logging.Formatter(
    fmt='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)


def get_logger(name: str) -> logging.Logger:
    """Retorna um logger configurado com handlers de console e arquivo rotativo."""
    logger = logging.getLogger(name)

    if logger.handlers:
        return logger

    level_name = os.environ.get('LOG_LEVEL', 'INFO').upper()
    level = getattr(logging, level_name, logging.INFO)
    logger.setLevel(level)
    logger.propagate = False  # evita interferência do root logger do Flask

    # Console
    ch = logging.StreamHandler()
    ch.setLevel(level)
    ch.setFormatter(_FORMATTER)
    logger.addHandler(ch)

    # Arquivo rotativo (10 MB, 5 backups)
    try:
        fh = logging.handlers.RotatingFileHandler(
            _LOG_FILE, maxBytes=10 * 1024 * 1024, backupCount=5, encoding='utf-8'
        )
        fh.setLevel(level)
        fh.setFormatter(_FORMATTER)
        logger.addHandler(fh)
    except Exception:
        pass  # se não conseguir criar o arquivo, continua só com console

    return logger

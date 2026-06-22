"""
api_server.py
Ponto de entrada da aplicação Flask.
Configuração, middleware, registro de blueprints e inicialização.
"""

import os
from datetime import datetime
from flask import Flask, render_template, jsonify, request, redirect, url_for
from flask_cors import CORS
from flask_login import LoginManager, login_required, current_user
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

# Carrega variáveis de ambiente do .env (se existir)
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# --- Módulos locais ---
from database import get_db_connection, init_db_users
from models import User, load_user
from logger import get_logger

logger = get_logger(__name__)

# --- Blueprints originais ---
from routes_auth import auth_bp
from routes_admin import admin_bp
from routes_summary import summary_bp
from routes_filters import filters_bp
from routes_behavior import behavior_bp
from routes_comparison import comparison_bp

# --- Blueprints de análise ---
from routes_analysis_finance import finance_bp
from routes_analysis_churn import churn_bp
from routes_analysis_sales import sales_bp
from routes_analysis_tech import tech_bp

# --- Blueprints de detalhes ---
from routes_details_finance import details_finance_bp
from routes_details_tech import details_tech_bp
from routes_details_sales import details_sales_bp
from routes_details_churn import details_churn_bp

# --- Blueprint Fluxo de Caixa ---
from routes_cashflow import cashflow_bp

# --- Blueprint DRE ---
from routes_dre import dre_bp

# --- Blueprint Gestão Financeira (DRE2) ---
from routes_dre2 import dre2_bp

# --- Blueprint Crescimento Analítico ---
from routes_crescimento import crescimento_bp

# --- Blueprint Sync IXC ---
from routes_ixc_sync import ixc_sync_bp

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = Flask(__name__)

app.secret_key = os.environ.get('FLASK_SECRET_KEY', 'sua_chave_secreta_super_segura_troque_isso_em_producao')
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SECURE'] = False
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['GET_DB_CONNECTION'] = get_db_connection

CORS(app)

# --- Rate limiting ---
limiter = Limiter(
    get_remote_address,
    app=app,
    default_limits=["2000 per day", "500 per hour"],
    storage_uri="memory://"
)

# --- Flask-Login ---
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'auth_bp.login'
login_manager.login_message = "Por favor, faça login para acessar."
login_manager.login_message_category = "error"
login_manager.user_loader(load_user)

# ---------------------------------------------------------------------------
# Middleware
# ---------------------------------------------------------------------------

@app.after_request
def log_request(response):
    if request.path.startswith('/static') or request.path.startswith('/favicon.ico'):
        return response

    username = 'Visitante'
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

    if current_user.is_authenticated:
        username = current_user.username
        try:
            conn = get_db_connection()
            conn.execute("UPDATE Users SET last_seen = ? WHERE id = ?", (timestamp, current_user.id))
            conn.commit()
            conn.close()
        except Exception:
            pass

    ip = (request.headers.get('CF-Connecting-IP')
          or (request.headers.getlist("X-Forwarded-For") or [None])[0]
          or request.remote_addr)

    try:
        conn = get_db_connection()
        conn.execute(
            "INSERT INTO AccessLogs (username, path, method, ip_address, timestamp) VALUES (?, ?, ?, ?, ?)",
            (username, request.path, request.method, ip, timestamp)
        )
        conn.commit()
        conn.close()
    except Exception as e:
        logger.error(f"Erro ao gravar log: {e}", exc_info=True)

    logger.info("%s %s %s -> %s [%s]",
                request.method, request.path, response.status_code, ip, username)

    return response


@app.before_request
def require_login_for_api():
    if request.path.startswith('/api') and not current_user.is_authenticated:
        return jsonify({"error": "Acesso não autorizado"}), 401


# ---------------------------------------------------------------------------
# Rotas principais
# ---------------------------------------------------------------------------

@app.route('/')
@login_required
def index():
    return render_template('index.html')


# ---------------------------------------------------------------------------
# Registro de Blueprints
# ---------------------------------------------------------------------------

app.register_blueprint(auth_bp)
limiter.limit("5 per minute")(app.view_functions['auth_bp.login'])
app.register_blueprint(admin_bp)
app.register_blueprint(summary_bp,          url_prefix='/api')
app.register_blueprint(filters_bp,          url_prefix='/api/filters')
app.register_blueprint(behavior_bp,         url_prefix='/api/behavior')
app.register_blueprint(comparison_bp,       url_prefix='/api/comparison')

app.register_blueprint(finance_bp,          url_prefix='/api/custom_analysis')
app.register_blueprint(churn_bp,            url_prefix='/api/custom_analysis')
app.register_blueprint(sales_bp,            url_prefix='/api/custom_analysis')
app.register_blueprint(tech_bp,             url_prefix='/api/custom_analysis')

app.register_blueprint(details_finance_bp,  url_prefix='/api/details')
app.register_blueprint(details_tech_bp,     url_prefix='/api/details')
app.register_blueprint(details_sales_bp,    url_prefix='/api/details')
app.register_blueprint(details_churn_bp,    url_prefix='/api/details')
app.register_blueprint(cashflow_bp,         url_prefix='/api/cashflow')
app.register_blueprint(dre_bp,              url_prefix='/api/dre')
app.register_blueprint(dre2_bp)
app.register_blueprint(crescimento_bp,     url_prefix='/api/crescimento')
app.register_blueprint(ixc_sync_bp,         url_prefix='/api/ixc')

# Agendamento semanal
from routes_ixc_sync import start_weekly_scheduler
start_weekly_scheduler(app)


# ---------------------------------------------------------------------------
# Inicialização
# ---------------------------------------------------------------------------

if __name__ == '__main__':
    for folder in ['templates', os.path.join('static', 'js'), os.path.join('static', 'css')]:
        os.makedirs(folder, exist_ok=True)

    init_db_users()

    logger.info("Servidor iniciado na porta 5000...")
    app.run(host='0.0.0.0', port=5000, debug=False)

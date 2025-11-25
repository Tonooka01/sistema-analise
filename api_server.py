import sqlite3
import os
from datetime import datetime
# Importação completa com jsonify incluído
from flask import Flask, render_template, redirect, url_for, request, flash, abort, jsonify
from flask_cors import CORS
from flask_login import LoginManager, UserMixin, login_user, login_required, logout_user, current_user
from werkzeug.security import generate_password_hash, check_password_hash
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

# Importa os blueprints (suas rotas de análise)
from routes_summary import summary_bp
from routes_custom_analysis import custom_analysis_bp
from routes_details import details_bp
from routes_filters import filters_bp
from routes_behavior import behavior_bp
from routes_comparison import comparison_bp
app = Flask(__name__)

# --- Configurações de Segurança ---
# Chave secreta para sessões (em produção, use variável de ambiente ou mantenha esta protegida)
app.secret_key = os.environ.get('FLASK_SECRET_KEY', 'sua_chave_secreta_super_segura_troque_isso_em_producao')

# Configuração de Cookies (Essencial para HTTPS/Tailscale)
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SECURE'] = True  # True para HTTPS (Tailscale/Cloudflare)
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'

CORS(app)

# Caminho do Banco de Dados
DATABASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'analise_dados.db')

# --- Configuração do Limitador (Rate Limiting) ---
# Protege contra ataques de força bruta no login
limiter = Limiter(
    get_remote_address,
    app=app,
    default_limits=["2000 per day", "500 per hour"],
    storage_uri="memory://"
)

# --- Configuração do Login (Flask-Login) ---
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'
login_manager.login_message = "Por favor, faça login para acessar."
login_manager.login_message_category = "error"

# --- Modelo de Usuário ---
class User(UserMixin):
    def __init__(self, id, username, password_hash, is_active=True):
        self.id = id
        self.username = username
        self.password_hash = password_hash
        self.active = is_active

    @property
    def is_active(self):
        return self.active

@login_manager.user_loader
def load_user(user_id):
    conn = get_db_connection()
    curr = conn.cursor()
    # Busca dados do usuário, incluindo status de bloqueio
    curr.execute("SELECT * FROM Users WHERE id = ?", (user_id,))
    user_data = curr.fetchone()
    conn.close()
    if user_data:
        # Garante compatibilidade se a coluna não existir (migração)
        keys = user_data.keys()
        is_active = bool(user_data['is_active']) if 'is_active' in keys else True
        return User(id=user_data['id'], username=user_data['username'], 
                    password_hash=user_data['password_hash'], is_active=is_active)
    return None

# --- Funções de Banco de Dados ---

def get_db_connection():
    """Conecta ao banco SQLite e retorna linhas como dicionários"""
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    return conn

# Disponibiliza a função para os blueprints
app.config['GET_DB_CONNECTION'] = get_db_connection

def init_db_users():
    """Inicializa as tabelas de sistema (Users, AccessLogs, Settings) e faz migrações"""
    conn = get_db_connection()
    try:
        # 1. Tabelas Básicas
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

        # 2. Migrations (Adicionar colunas novas se faltarem na tabela Users)
        cursor = conn.cursor()
        cursor.execute("PRAGMA table_info(Users)")
        columns = [info[1] for info in cursor.fetchall()]
        
        if 'is_active' not in columns:
            print("Atualizando tabela Users: Adicionando 'is_active'...")
            conn.execute("ALTER TABLE Users ADD COLUMN is_active INTEGER DEFAULT 1")
            
        if 'last_seen' not in columns:
            print("Atualizando tabela Users: Adicionando 'last_seen'...")
            conn.execute("ALTER TABLE Users ADD COLUMN last_seen DATETIME")

        # 3. Dados Padrão
        # Configuração de inatividade padrão (30 min)
        default_timeout = conn.execute("SELECT value FROM Settings WHERE key = 'inactivity_timeout_minutes'").fetchone()
        if not default_timeout:
            conn.execute("INSERT INTO Settings (key, value) VALUES (?, ?)", ('inactivity_timeout_minutes', '30'))

        # Usuário Admin padrão
        admin = conn.execute("SELECT * FROM Users WHERE username = 'admin'").fetchone()
        if not admin:
            hashed_pw = generate_password_hash('netvale01', method='scrypt')
            # Verifica se a coluna is_active já existe para o insert correto
            if 'is_active' in columns:
                 conn.execute("INSERT INTO Users (username, password_hash, is_active) VALUES (?, ?, 1)", ('admin', hashed_pw))
            else:
                 conn.execute("INSERT INTO Users (username, password_hash) VALUES (?, ?)", ('admin', hashed_pw))
            print("--- Usuário padrão 'admin' criado com sucesso. ---")
            
        conn.commit()
    except Exception as e:
        print(f"Erro ao inicializar banco de sistema: {e}")
    finally:
        conn.close()

# --- Middleware (Logs e Monitoramento) ---

@app.after_request
def log_request(response):
    """Intercepta requisições para logar acesso e atualizar 'visto por último'"""
    if request.path.startswith('/static') or request.path.startswith('/favicon.ico'):
        return response

    username = 'Visitante'
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

    if current_user.is_authenticated:
        username = current_user.username
        # Atualiza last_seen do usuário
        try:
            conn = get_db_connection()
            conn.execute("UPDATE Users SET last_seen = ? WHERE id = ?", (timestamp, current_user.id))
            conn.commit()
            conn.close()
        except:
            pass # Falha silenciosa para não impactar performance

    path = request.path
    method = request.method
    
    # Tenta pegar o IP real (atrás do Cloudflare ou Proxy)
    if request.headers.get('CF-Connecting-IP'):
        ip = request.headers.get('CF-Connecting-IP')
    elif request.headers.getlist("X-Forwarded-For"):
        ip = request.headers.getlist("X-Forwarded-For")[0]
    else:
        ip = request.remote_addr
        
    try:
        conn = get_db_connection()
        conn.execute(
            "INSERT INTO AccessLogs (username, path, method, ip_address, timestamp) VALUES (?, ?, ?, ?, ?)",
            (username, path, method, ip, timestamp)
        )
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"Erro ao gravar log: {e}")

    return response

# --- Rotas de Autenticação ---

@app.route('/login', methods=['GET', 'POST'])
@limiter.limit("5 per minute") # Proteção contra força bruta
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
            
            user = User(id=user_data['id'], username=user_data['username'], 
                        password_hash=user_data['password_hash'], is_active=is_active)
            
            login_user(user)
            return redirect(url_for('index'))
        
        flash('Usuário ou senha inválidos.')
    
    return render_template('login.html')

@app.route('/logout')
@login_required
def logout():
    logout_user()
    reason = request.args.get('reason')
    if reason == 'inactivity':
        flash('Sua sessão expirou por inatividade.')
    else:
        flash('Você saiu do sistema.')
    return redirect(url_for('login'))

@app.route('/new-user', methods=['POST'])
@login_required
def create_user():
    """Cria novo usuário (Apenas Admin) - Chamado pelo Modal"""
    if current_user.username != 'admin':
         abort(403)

    username = request.form['username']
    password = request.form['password']
    
    conn = get_db_connection()
    try:
        hashed_pw = generate_password_hash(password, method='scrypt')
        # Cria usuário ativo por padrão
        conn.execute("INSERT INTO Users (username, password_hash, is_active) VALUES (?, ?, 1)", (username, hashed_pw))
        conn.commit()
        flash('Usuário criado com sucesso!')
    except sqlite3.IntegrityError:
        flash('Erro: Nome de usuário já existe.')
    except Exception as e:
        flash(f'Erro ao criar usuário: {e}')
    finally:
        conn.close()
            
    return redirect(url_for('index'))

# --- Rotas da API Administrativa (Configurações e Usuários) ---

@app.route('/api/admin/settings', methods=['GET', 'POST'])
@login_required
def admin_settings():
    """Gerencia configurações globais (ex: tempo de inatividade)"""
    if current_user.username != 'admin': return jsonify({"error": "Acesso negado"}), 403

    conn = get_db_connection()
    
    if request.method == 'POST':
        timeout_minutes = request.json.get('timeout')
        if timeout_minutes and str(timeout_minutes).isdigit():
            conn.execute("REPLACE INTO Settings (key, value) VALUES (?, ?)", 
                         ('inactivity_timeout_minutes', str(timeout_minutes)))
            conn.commit()
            conn.close()
            return jsonify({"success": True, "message": "Tempo de inatividade salvo."})
        conn.close()
        return jsonify({"error": "Valor inválido"}), 400
    
    # GET
    timeout = conn.execute("SELECT value FROM Settings WHERE key = 'inactivity_timeout_minutes'").fetchone()
    conn.close()
    return jsonify({"timeout_minutes": timeout['value'] if timeout else '30'})

@app.route('/api/admin/users', methods=['GET'])
@login_required
def get_users():
    """Lista todos os usuários e seus status para o painel"""
    if current_user.username != 'admin': return jsonify({"error": "Acesso negado"}), 403
    
    conn = get_db_connection()
    users = conn.execute("SELECT id, username, is_active, last_seen FROM Users").fetchall()
    conn.close()
    
    users_list = []
    now = datetime.now()
    
    for u in users:
        is_online = False
        if u['last_seen']:
            try:
                last_seen_dt = datetime.strptime(u['last_seen'], '%Y-%m-%d %H:%M:%S')
                # Considera online se visto nos últimos 5 minutos
                if (now - last_seen_dt).total_seconds() < 300:
                    is_online = True
            except:
                pass

        users_list.append({
            "id": u['id'],
            "username": u['username'],
            "is_active": bool(u['is_active']) if u['is_active'] is not None else True,
            "last_seen": u['last_seen'],
            "is_online": is_online
        })
        
    return jsonify(users_list)

@app.route('/api/admin/users/toggle', methods=['POST'])
@login_required
def toggle_user():
    """Ativa ou Desativa um usuário"""
    if current_user.username != 'admin': return jsonify({"error": "Acesso negado"}), 403
    
    user_id = request.json.get('user_id')
    
    if user_id == current_user.id:
        return jsonify({"error": "Você não pode desativar a si mesmo!"}), 400
        
    conn = get_db_connection()
    # Inverte o status atual (True -> False ou False -> True)
    conn.execute("UPDATE Users SET is_active = NOT is_active WHERE id = ?", (user_id,))
    conn.commit()
    conn.close()
    
    return jsonify({"success": True})

@app.route('/admin/logs')
@login_required
def view_logs():
    """Página de visualização de Logs"""
    if current_user.username != 'admin': abort(403)

    date_filter = request.args.get('date')
    conn = get_db_connection()
    
    if date_filter:
        query = "SELECT * FROM AccessLogs WHERE date(timestamp) = ? ORDER BY id DESC"
        logs = conn.execute(query, (date_filter,)).fetchall()
    else:
        logs = conn.execute("SELECT * FROM AccessLogs ORDER BY id DESC LIMIT 200").fetchall()
    
    conn.close()
    return render_template('logs.html', logs=logs)

# --- Rotas do Sistema Principal ---

@app.route('/')
@login_required
def index():
    return render_template('index.html')

# Proteção Global para as APIs de dados
@app.before_request
def require_login_for_api():
    if request.path.startswith('/api') and not current_user.is_authenticated:
        return jsonify({"error": "Acesso não autorizado"}), 401

# --- Registro dos Blueprints (Módulos) ---
app.register_blueprint(summary_bp, url_prefix='/api')
app.register_blueprint(custom_analysis_bp, url_prefix='/api/custom_analysis')
app.register_blueprint(details_bp, url_prefix='/api/details')
app.register_blueprint(filters_bp, url_prefix='/api/filters')
app.register_blueprint(behavior_bp, url_prefix='/api/behavior')
app.register_blueprint(comparison_bp, url_prefix='/api/comparison')

# --- Inicialização ---
if __name__ == '__main__':
    # Garante a estrutura de pastas
    if not os.path.exists('templates'): os.makedirs('templates')
    static_js = os.path.join('static', 'js')
    static_css = os.path.join('static', 'css')
    if not os.path.exists(static_js): os.makedirs(static_js)
    if not os.path.exists(static_css): os.makedirs(static_css)

    # Inicializa/Atualiza o banco de dados de sistema
    init_db_users()

    print("Servidor Seguro iniciado na porta 5000...")
    app.run(host='0.0.0.0', port=5000, debug=True)
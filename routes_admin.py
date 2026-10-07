"""
routes_admin.py
Blueprint administrativo — settings, usuários, logs de acesso.
"""

import json
import os
import signal
import sqlite3
import subprocess
import zipfile
from datetime import datetime
from pathlib import Path
from flask import Blueprint, render_template, request, jsonify, abort, send_file
from flask_login import login_required, current_user
from werkzeug.security import generate_password_hash
from database import get_db_connection

admin_bp = Blueprint('admin_bp', __name__)

# ── Versionamento ────────────────────────────────────────────────
_APP_DIR      = Path(__file__).parent
_VERSIONS_DIR = _APP_DIR / 'versions'
_VERSION_FILE = _APP_DIR / 'version.txt'
_MAX_OLD      = 3   # manter 3 versões antigas + 1 atual = 4 total
_SKIP_DIRS    = {'__pycache__', 'versions', '.git', 'node_modules', '.venv', 'venv'}
_SKIP_EXTS    = {'.pyc', '.log', '.pid', '.db', '.db-wal', '.db-shm'}

def _current_ver():
    if _VERSION_FILE.exists():
        return _VERSION_FILE.read_text().strip()
    return '1.000'

def _next_ver(v):
    try:
        major, minor = v.split('.')
        return f"{major}.{int(minor)+1:03d}"
    except Exception:
        return '1.001'

def _list_zips():
    if not _VERSIONS_DIR.exists():
        return []
    return sorted(_VERSIONS_DIR.glob('v*.zip'), key=lambda p: p.stat().st_mtime)


@admin_bp.route('/api/admin/settings', methods=['GET', 'POST'])
@login_required
def admin_settings():
    if current_user.username != 'admin':
        return jsonify({"error": "Acesso negado"}), 403

    conn = get_db_connection()

    if request.method == 'POST':
        timeout_minutes = request.json.get('timeout')
        if timeout_minutes and str(timeout_minutes).isdigit():
            conn.execute(
                "REPLACE INTO Settings (key, value) VALUES (?, ?)",
                ('inactivity_timeout_minutes', str(timeout_minutes))
            )
            conn.commit()
            conn.close()
            return jsonify({"success": True, "message": "Tempo de inatividade salvo."})
        conn.close()
        return jsonify({"error": "Valor inválido"}), 400

    timeout = conn.execute(
        "SELECT value FROM Settings WHERE key = 'inactivity_timeout_minutes'"
    ).fetchone()
    conn.close()
    return jsonify({"timeout_minutes": timeout['value'] if timeout else '30'})


@admin_bp.route('/api/admin/users', methods=['GET'])
@login_required
def get_users():
    if current_user.username != 'admin':
        return jsonify({"error": "Acesso negado"}), 403

    conn = get_db_connection()
    users = conn.execute("SELECT id, username, is_active, last_seen, permissions FROM Users").fetchall()
    conn.close()

    now = datetime.now()
    users_list = []
    for u in users:
        is_online = False
        if u['last_seen']:
            try:
                last_seen_dt = datetime.strptime(u['last_seen'], '%Y-%m-%d %H:%M:%S')
                is_online = (now - last_seen_dt).total_seconds() < 300
            except Exception:
                pass
        users_list.append({
            "id": u['id'],
            "username": u['username'],
            "is_active": bool(u['is_active']) if u['is_active'] is not None else True,
            "last_seen": u['last_seen'],
            "is_online": is_online,
            "permissions": u['permissions'],
        })

    return jsonify(users_list)


@admin_bp.route('/api/admin/users/toggle', methods=['POST'])
@login_required
def toggle_user():
    if current_user.username != 'admin':
        return jsonify({"error": "Acesso negado"}), 403

    user_id = request.json.get('user_id')
    if user_id == current_user.id:
        return jsonify({"error": "Você não pode desativar a si mesmo!"}), 400

    conn = get_db_connection()
    conn.execute("UPDATE Users SET is_active = NOT is_active WHERE id = ?", (user_id,))
    conn.commit()
    conn.close()
    return jsonify({"success": True})


@admin_bp.route('/api/admin/users/edit', methods=['POST'])
@login_required
def edit_user():
    if current_user.username != 'admin':
        return jsonify({"error": "Acesso negado"}), 403

    user_id = request.json.get('user_id')
    new_username = (request.json.get('username') or '').strip()
    new_password = (request.json.get('password') or '').strip()

    if not user_id:
        return jsonify({"error": "user_id obrigatório"}), 400
    if not new_username and not new_password:
        return jsonify({"error": "Nada para atualizar"}), 400

    conn = get_db_connection()
    try:
        if new_username:
            conn.execute("UPDATE Users SET username = ? WHERE id = ?", (new_username, user_id))
        if new_password:
            hashed = generate_password_hash(new_password, method='scrypt')
            conn.execute("UPDATE Users SET password_hash = ? WHERE id = ?", (hashed, user_id))
        conn.commit()
        return jsonify({"success": True})
    except sqlite3.IntegrityError:
        return jsonify({"error": "Nome de usuário já existe"}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        conn.close()


@admin_bp.route('/api/admin/users/permissions', methods=['POST'])
@login_required
def set_user_permissions():
    if current_user.username != 'admin':
        return jsonify({"error": "Acesso negado"}), 403

    user_id = request.json.get('user_id')
    permissions = request.json.get('permissions')  # None = all, list = restricted

    conn = get_db_connection()
    try:
        perms_str = json.dumps(permissions) if permissions is not None else None
        conn.execute("UPDATE Users SET permissions = ? WHERE id = ?", (perms_str, user_id))
        conn.commit()
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        conn.close()


@admin_bp.route('/api/admin/version', methods=['GET'])
@login_required
def get_version():
    if current_user.username != 'admin':
        return jsonify({'error': 'Acesso negado'}), 403
    zips = _list_zips()
    versions = []
    for z in reversed(zips):
        s = z.stat()
        versions.append({
            'filename': z.name,
            'label':    z.stem,
            'size_kb':  round(s.st_size / 1024, 1),
            'saved_at': datetime.fromtimestamp(s.st_mtime).strftime('%d/%m/%Y %H:%M'),
        })
    return jsonify({'current': _current_ver(), 'versions': versions})


@admin_bp.route('/api/admin/version/save', methods=['POST'])
@login_required
def save_version():
    if current_user.username != 'admin':
        return jsonify({'error': 'Acesso negado'}), 403

    _VERSIONS_DIR.mkdir(exist_ok=True)
    current = _current_ver()
    zip_path = _VERSIONS_DIR / f'v{current}.zip'

    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        for item in _APP_DIR.rglob('*'):
            rel = item.relative_to(_APP_DIR)
            if any(p in _SKIP_DIRS for p in rel.parts):
                continue
            if item.suffix in _SKIP_EXTS:
                continue
            if item.is_file():
                zf.write(item, rel)

    next_v = _next_ver(current)
    _VERSION_FILE.write_text(next_v)

    # Manter apenas _MAX_OLD versões antigas
    all_zips = _list_zips()
    while len(all_zips) > _MAX_OLD:
        all_zips[0].unlink()
        all_zips = all_zips[1:]

    return jsonify({'ok': True, 'saved': current, 'current': next_v})


@admin_bp.route('/api/admin/version/restore', methods=['POST'])
@login_required
def restore_version():
    if current_user.username != 'admin':
        return jsonify({'error': 'Acesso negado'}), 403

    filename = (request.json or {}).get('filename', '')
    if not filename.endswith('.zip') or '/' in filename or '..' in filename:
        return jsonify({'error': 'Arquivo inválido'}), 400

    zip_path = _VERSIONS_DIR / filename
    if not zip_path.exists():
        return jsonify({'error': 'Versão não encontrada'}), 404

    with zipfile.ZipFile(zip_path, 'r') as zf:
        zf.extractall(_APP_DIR)

    # Tenta reiniciar o serviço
    try:
        pid_file = _APP_DIR / 'gunicorn.pid'
        if pid_file.exists():
            pid = int(pid_file.read_text().strip())
            os.kill(pid, signal.SIGHUP)
        else:
            subprocess.Popen(['systemctl', 'restart', 'analise'],
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception:
        pass

    return jsonify({'ok': True, 'restored': filename.replace('.zip', '')})


@admin_bp.route('/api/admin/version/download/<filename>', methods=['GET'])
@login_required
def download_version(filename):
    if current_user.username != 'admin':
        abort(403)
    if not filename.endswith('.zip') or '/' in filename or '..' in filename:
        abort(400)
    zip_path = _VERSIONS_DIR / filename
    if not zip_path.exists():
        abort(404)
    return send_file(zip_path, as_attachment=True, download_name=filename)


@admin_bp.route('/api/admin/profile', methods=['POST'])
@login_required
def update_profile():
    new_username = (request.json.get('username') or '').strip()
    new_password = (request.json.get('password') or '').strip()

    if not new_username and not new_password:
        return jsonify({"error": "Nada para atualizar"}), 400

    conn = get_db_connection()
    try:
        if new_username:
            conn.execute("UPDATE Users SET username = ? WHERE id = ?", (new_username, current_user.id))
        if new_password:
            hashed = generate_password_hash(new_password, method='scrypt')
            conn.execute("UPDATE Users SET password_hash = ? WHERE id = ?", (hashed, current_user.id))
        conn.commit()
        return jsonify({"success": True})
    except sqlite3.IntegrityError:
        return jsonify({"error": "Nome de usuário já existe"}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        conn.close()


_ACOMP_CONFIG_DEFAULT = {
    "tipos_acao": [
        {"value": "ligacao",  "label": "Ligação",   "emoji": "📞", "ativo": True},
        {"value": "whatsapp", "label": "WhatsApp",  "emoji": "💬", "ativo": True},
        {"value": "visita",   "label": "Visita",    "emoji": "🏠", "ativo": True},
        {"value": "email",    "label": "E-mail",    "emoji": "✉️", "ativo": True},
    ],
    "assuntos_os": [
        {"label": "Sem sinal",               "abre_os": False},
        {"label": "Lentidão",                "abre_os": False},
        {"label": "Retirada de equipamento", "abre_os": False},
        {"label": "Instalação",              "abre_os": False},
        {"label": "Suporte técnico",         "abre_os": False},
        {"label": "Mudança de endereço",     "abre_os": False},
        {"label": "Outros",                  "abre_os": False},
    ],
}


def _migrate_assuntos_os(assuntos):
    if not assuntos:
        return []
    if isinstance(assuntos[0], str):
        return [{"label": s, "id_assunto": ""} for s in assuntos]
    return assuntos


@admin_bp.route('/api/admin/acomp-config', methods=['GET', 'POST'])
@login_required
def admin_acomp_config():
    if current_user.username != 'admin':
        return jsonify({"error": "Acesso negado"}), 403
    conn = get_db_connection()
    try:
        if request.method == 'POST':
            data = request.get_json(force=True) or {}
            conn.execute(
                "REPLACE INTO Settings (key, value) VALUES (?, ?)",
                ('acomp_config', json.dumps(data, ensure_ascii=False))
            )
            conn.commit()
            return jsonify({"success": True})
        row = conn.execute("SELECT value FROM Settings WHERE key = 'acomp_config'").fetchone()
        cfg = json.loads(row['value']) if row and row['value'] else _ACOMP_CONFIG_DEFAULT
        # Normaliza assuntos para {label, abre_os}
        raw = cfg.get('assuntos_os', [])
        cfg['assuntos_os'] = [
            s if isinstance(s, dict) else {"label": s, "abre_os": False}
            for s in raw
        ]
        return jsonify(cfg)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        conn.close()


@admin_bp.route('/api/admin/settings/ixc-extra', methods=['GET', 'POST'])
@login_required
def admin_ixc_extra():
    if current_user.username != 'admin':
        return jsonify({"error": "Acesso negado"}), 403
    conn = get_db_connection()
    try:
        if request.method == 'POST':
            data = request.get_json(force=True) or {}
            key   = data.get('key', '').strip()
            value = str(data.get('value', '') or '').strip()
            allowed = {'ixc_id_atendente', 'ixc_id_resposta'}
            if key not in allowed:
                return jsonify({"error": "Chave inválida"}), 400
            conn.execute("REPLACE INTO Settings (key, value) VALUES (?, ?)", (key, value))
            conn.commit()
            return jsonify({"success": True})
        keys = ['ixc_id_atendente', 'ixc_id_resposta']
        rows = conn.execute(
            f"SELECT key, value FROM Settings WHERE key IN ({','.join('?'*len(keys))})", keys
        ).fetchall()
        result = {r['key']: r['value'] for r in rows}
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        conn.close()


@admin_bp.route('/api/admin/settings/ixc-setor', methods=['GET', 'POST'])
@login_required
def admin_ixc_setor():
    if current_user.username != 'admin':
        return jsonify({"error": "Acesso negado"}), 403
    conn = get_db_connection()
    try:
        if request.method == 'POST':
            data = request.get_json(force=True) or {}
            setor_id = str(data.get('ixc_setor_id', '') or '').strip()
            conn.execute("REPLACE INTO Settings (key, value) VALUES (?, ?)", ('ixc_setor_id', setor_id))
            conn.commit()
            return jsonify({"success": True, "ixc_setor_id": setor_id})
        row = conn.execute("SELECT value FROM Settings WHERE key = 'ixc_setor_id'").fetchone()
        return jsonify({"ixc_setor_id": row['value'] if row else ''})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        conn.close()


@admin_bp.route('/admin/logs')
@login_required
def view_logs():
    if current_user.username != 'admin':
        abort(403)

    date_filter = request.args.get('date')
    conn = get_db_connection()

    if date_filter:
        logs = conn.execute(
            "SELECT * FROM AccessLogs WHERE date(timestamp) = ? ORDER BY id DESC",
            (date_filter,)
        ).fetchall()
    else:
        logs = conn.execute(
            "SELECT * FROM AccessLogs ORDER BY id DESC LIMIT 200"
        ).fetchall()

    conn.close()
    return render_template('logs.html', logs=logs)

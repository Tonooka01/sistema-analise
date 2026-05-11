"""
routes_admin.py
Blueprint administrativo — settings, usuários, logs de acesso.
"""

from datetime import datetime
from flask import Blueprint, render_template, request, jsonify, abort
from flask_login import login_required, current_user
from database import get_db_connection

admin_bp = Blueprint('admin_bp', __name__)


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
    users = conn.execute("SELECT id, username, is_active, last_seen FROM Users").fetchall()
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
            "is_online": is_online
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

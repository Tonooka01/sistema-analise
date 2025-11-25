import sqlite3
from flask import Blueprint, jsonify, request, abort, current_app

# Define o Blueprint
filters_bp = Blueprint('filters_bp', __name__)

def get_db():
    """Função auxiliar para obter a conexão do banco de dados a partir do app_context."""
    return current_app.config['GET_DB_CONNECTION']()

# --- Definição da Rota ---

@filters_bp.route('/contract_statuses')
def api_contract_statuses():
    """
    Busca os valores distintos para status de contrato e acesso para os filtros.
    """
    conn = get_db()
    try:
        status_contrato_query = "SELECT DISTINCT Status_contrato FROM Contratos WHERE Status_contrato IS NOT NULL AND Status_contrato != ''"
        status_contrato = [row['Status_contrato'] for row in conn.execute(status_contrato_query).fetchall()]

        status_acesso_query = "SELECT DISTINCT Status_acesso FROM Contratos WHERE Status_acesso IS NOT NULL AND Status_acesso != ''"
        status_acesso = [row['Status_acesso'] for row in conn.execute(status_acesso_query).fetchall()]

        return jsonify({
            "status_contrato": sorted(status_contrato),
            "status_acesso": sorted(status_acesso)
        })
    except sqlite3.Error as e:
        print(f"Erro ao buscar status de contrato: {e}")
        return jsonify({"error": "Erro interno ao buscar filtros de status."}), 500
    finally:
        if conn: conn.close()

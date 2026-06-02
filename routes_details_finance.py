"""
routes_details_finance.py
Detalhes financeiros: faturas, atrasos, contas a receber.
"""

import sqlite3
from flask import Blueprint, jsonify, request, abort, current_app

details_finance_bp = Blueprint('details_finance_bp', __name__)

from logger import get_logger
logger = get_logger(__name__)


def get_db():
    return current_app.config['GET_DB_CONNECTION']()


@details_finance_bp.route('/invoice_details')
def api_invoice_details():
    conn = get_db()
    try:
        contract_id   = request.args.get('contract_id', '')
        analysis_type = request.args.get('type', '')
        limit         = request.args.get('limit', 15, type=int)
        offset        = request.args.get('offset', 0, type=int)

        if not contract_id or not analysis_type:
            abort(400, "ID do contrato e tipo de análise são obrigatórios.")

        params = [contract_id]
        from_join = "FROM Contas_a_Receber AS CAR"

        if analysis_type == 'atrasos_pagos':
            where = "WHERE CAR.ID_Contrato_Recorrente = ? AND (CAR.Data_pagamento > CAR.Vencimento)"
        elif analysis_type == 'faturas_nao_pagas':
            where = "WHERE CAR.ID_Contrato_Recorrente = ? AND (CAR.Status = 'A receber' AND CAR.Vencimento < date('now'))"
        elif analysis_type == 'all_invoices':
            where = "WHERE CAR.ID_Contrato_Recorrente = ?"
        else:
            abort(400, "Tipo de análise inválido.")

        total_rows = conn.execute(f"SELECT COUNT(*) {from_join} {where}", tuple(params)).fetchone()[0]

        params.extend([limit, offset])
        data = conn.execute(
            f"SELECT CAR.ID, CAR.Vencimento, CAR.Emissao, CAR.Data_pagamento, CAR.Valor, CAR.Status "
            f"{from_join} {where} ORDER BY CAR.Vencimento DESC LIMIT ? OFFSET ?",
            tuple(params)
        ).fetchall()

        return jsonify({"data": [dict(r) for r in data], "total_rows": total_rows, "limit": limit, "offset": offset})

    except sqlite3.Error as e:
        logger.error(f"Erro ao buscar detalhes da fatura: {e}", exc_info=True)
        return jsonify({"error": "Erro interno ao buscar detalhes da fatura."}), 500
    finally:
        if conn: conn.close()


@details_finance_bp.route('/financial/<contract_id>')
def api_financial_details(contract_id):
    conn = get_db()
    try:
        limit  = request.args.get('limit', 15, type=int)
        offset = request.args.get('offset', 0, type=int)

        total_rows = conn.execute(
            "SELECT COUNT(*) FROM Contas_a_Receber WHERE ID_Contrato_Recorrente = ?",
            (contract_id,)
        ).fetchone()[0]

        data = conn.execute(
            "SELECT ID, Parcela_R, Emissao, Vencimento, Data_pagamento, Valor, Status "
            "FROM Contas_a_Receber WHERE ID_Contrato_Recorrente = ? ORDER BY Vencimento DESC LIMIT ? OFFSET ?",
            (contract_id, limit, offset)
        ).fetchall()

        return jsonify({"data": [dict(r) for r in data], "total_rows": total_rows})

    except sqlite3.Error as e:
        logger.error(f"Erro ao buscar detalhes financeiros: {e}", exc_info=True)
        return jsonify({"error": "Erro interno ao processar a solicitação."}), 500
    finally:
        if conn: conn.close()

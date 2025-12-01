import sqlite3
from flask import Blueprint, jsonify, request, abort
from utils_api import get_db

details_finance_bp = Blueprint('details_finance_bp', __name__)

@details_finance_bp.route('/invoice_details')
def api_invoice_details():
    conn = get_db()
    try:
        contract_id = request.args.get('contract_id', '')
        analysis_type = request.args.get('type', '')
        limit = request.args.get('limit', 15, type=int)
        offset = request.args.get('offset', 0, type=int)

        if not contract_id or not analysis_type:
            abort(400, "ID do contrato e tipo de análise são obrigatórios.")

        params = [contract_id]
        from_join = "FROM Contas_a_Receber AS CAR"

        where_condition = ""
        if analysis_type == 'atrasos_pagos':
            where_condition = "WHERE CAR.ID_Contrato_Recorrente = ? AND (CAR.Data_pagamento > CAR.Vencimento)"
        elif analysis_type == 'faturas_nao_pagas':
            where_condition = "WHERE CAR.ID_Contrato_Recorrente = ? AND (CAR.Status = 'A receber' AND CAR.Vencimento < date('now'))"
        else:
            abort(400, "Tipo de análise inválido.")

        count_query = f"SELECT COUNT(*) {from_join} {where_condition}"
        total_rows = conn.execute(count_query, tuple(params)).fetchone()[0]

        data_query = f"SELECT CAR.ID, CAR.Vencimento, CAR.Emissao, CAR.Data_pagamento, CAR.Valor, CAR.Status {from_join} {where_condition} ORDER BY CAR.Vencimento DESC LIMIT ? OFFSET ?"
        params.extend([limit, offset])

        data = conn.execute(data_query, tuple(params)).fetchall()

        return jsonify({
            "data": [dict(row) for row in data],
            "total_rows": total_rows,
            "limit": limit,
            "offset": offset
        })

    except sqlite3.Error as e:
        print(f"Erro na base de dados ao procurar detalhes da fatura: {e}")
        return jsonify({"error": "Erro interno ao procurar detalhes da fatura."}), 500
    finally:
        if conn: conn.close()


@details_finance_bp.route('/financial/<contract_id>')
def api_financial_details(contract_id):
    """
    Busca os detalhes financeiros (contas a receber) de um contrato.
    """
    conn = get_db()
    try:
        limit = request.args.get('limit', 15, type=int)
        offset = request.args.get('offset', 0, type=int)
        count_query = "SELECT COUNT(*) FROM Contas_a_Receber WHERE ID_Contrato_Recorrente = ?"
        total_rows = conn.execute(count_query, (contract_id,)).fetchone()[0]
        data_query = "SELECT ID, Parcela_R, Emissao, Vencimento, Data_pagamento, Valor, Status FROM Contas_a_Receber WHERE ID_Contrato_Recorrente = ? ORDER BY Vencimento DESC LIMIT ? OFFSET ?"
        data = conn.execute(data_query, (contract_id, limit, offset)).fetchall()
        return jsonify({"data": [dict(row) for row in data], "total_rows": total_rows})
    except sqlite3.Error as e:
        print(f"Erro ao buscar detalhes financeiros: {e}")
        return jsonify({"error": "Erro interno ao processar a solicitação."}), 500
    finally:
        if conn: conn.close()
"""
routes_details_churn.py
Detalhes de churn: OS/atendimentos, cancelamento, clientes por cidade/bairro.
"""

import sqlite3
from flask import Blueprint, jsonify, request, abort, current_app

details_churn_bp = Blueprint('details_churn_bp', __name__)

from logger import get_logger
logger = get_logger(__name__)


def get_db():
    return current_app.config['GET_DB_CONNECTION']()


def _parse_relevance(relevance_str):
    if not relevance_str:
        return None, None
    parts = relevance_str.split('-')
    try:
        if '+' in parts[0]:
            return int(parts[0].replace('+', '')), None
        return int(parts[0]), (int(parts[1]) if len(parts) > 1 else None)
    except ValueError:
        return None, None


def _permanence_sql(prefix='sub'):
    return (
        f"CASE WHEN {prefix}.Data_ativa_o IS NOT NULL AND {prefix}.end_date IS NOT NULL AND {prefix}.end_date != 'N/A' "
        f"THEN JULIANDAY({prefix}.end_date) - JULIANDAY({prefix}.Data_ativa_o) ELSE NULL END AS permanencia_dias, "
        f"CASE WHEN {prefix}.Data_ativa_o IS NOT NULL AND {prefix}.end_date IS NOT NULL AND {prefix}.end_date != 'N/A' "
        f"THEN CAST(ROUND((JULIANDAY({prefix}.end_date) - JULIANDAY({prefix}.Data_ativa_o)) / 30.44) AS INTEGER) ELSE NULL END AS permanencia_meses"
    )


@details_churn_bp.route('/complaints/<client_name>')
def api_complaints_details(client_name):
    conn = get_db()
    try:
        complaint_type = request.args.get('type')
        limit  = request.args.get('limit', 15, type=int)
        offset = request.args.get('offset', 0, type=int)

        if complaint_type == 'os':
            table   = 'OS'
            cols    = 'ID, Abertura, Assunto, Status'
            order   = 'Abertura'
        elif complaint_type == 'atendimentos':
            table   = 'Atendimentos'
            cols    = 'ID, Criado_em, Assunto, Novo_status'
            order   = 'Criado_em'
        else:
            abort(400, "Tipo de 'complaint' inválido.")

        where = f"WHERE UPPER(TRIM(Cliente)) = UPPER(TRIM(?))"
        total_rows = conn.execute(f"SELECT COUNT(*) FROM {table} {where}", (client_name,)).fetchone()[0]
        data = conn.execute(
            f"SELECT {cols} FROM {table} {where} ORDER BY {order} DESC LIMIT ? OFFSET ?",
            (client_name, limit, offset)
        ).fetchall()

        return jsonify({"data": [dict(r) for r in data], "total_rows": total_rows})

    except sqlite3.Error as e:
        logger.error(f"Erro ao buscar detalhes de complaints: {e}", exc_info=True)
        return jsonify({"error": "Erro interno ao processar a solicitação."}), 500
    finally:
        if conn: conn.close()


@details_churn_bp.route('/cancellation_context/<contract_id>/<client_name>')
def api_cancellation_context(client_name, contract_id):
    conn = get_db()
    try:
        contract_info = conn.execute('SELECT Data_cancelamento FROM Contratos WHERE ID = ?', (contract_id,)).fetchone()
        end_date = contract_info['Data_cancelamento'] if contract_info else None

        if not end_date:
            try:
                neg_info = conn.execute('SELECT Data_negativa_o FROM Contratos_Negativacao WHERE ID = ?', (contract_id,)).fetchone()
                if neg_info: end_date = neg_info['Data_negativa_o']
            except sqlite3.Error as e:
                if "no such table" not in str(e): raise

        where_os  = f"AND DATE(Abertura) < DATE('{end_date}')"   if end_date else ""
        where_at  = f"AND DATE(Criado_em) < DATE('{end_date}')"  if end_date else ""

        equipamentos = conn.execute(
            "SELECT Descricao_produto, Status_comodato, Data FROM Equipamento WHERE TRIM(ID_contrato) = ?",
            (contract_id,)
        ).fetchall()
        os_data = conn.execute(
            f"SELECT ID, Abertura, Fechamento, SLA, Assunto, Mensagem FROM OS WHERE Cliente = ? {where_os} ORDER BY Abertura DESC",
            (client_name,)
        ).fetchall()
        atendimentos = conn.execute(
            f"SELECT ID, Criado_em, ltima_altera_o, Assunto, Novo_status, Descri_o FROM Atendimentos WHERE Cliente = ? {where_at} ORDER BY Criado_em DESC",
            (client_name,)
        ).fetchall()

        return jsonify({
            "equipamentos": [dict(r) for r in equipamentos],
            "os":           [dict(r) for r in os_data],
            "atendimentos": [dict(r) for r in atendimentos]
        })

    except sqlite3.Error as e:
        logger.error(f"Erro ao buscar contexto de cancelamento: {e}", exc_info=True)
        return jsonify({"error": "Erro interno ao processar a solicitação."}), 500
    finally:
        if conn: conn.close()


@details_churn_bp.route('/city_clients')
def api_city_clients():
    conn = get_db()
    try:
        city        = request.args.get('city')
        client_type = request.args.get('type')
        start_date  = request.args.get('start_date', '')
        end_date    = request.args.get('end_date', '')
        relevance   = request.args.get('relevance', '')
        limit       = request.args.get('limit', 25, type=int)
        offset      = request.args.get('offset', 0, type=int)

        if not city or not client_type:
            abort(400, "Cidade e tipo de cliente são obrigatórios.")

        def _date_filter(clauses, params, date_col):
            if start_date: clauses.append(f"DATE({date_col}) >= ?"); params.append(start_date)
            if end_date:   clauses.append(f"DATE({date_col}) <= ?"); params.append(end_date)

        if client_type == 'cancelado':
            wc = ["Cidade = ?", "Status_contrato = 'Inativo'", "Status_acesso = 'Desativado'"]; pc = [city]
            _date_filter(wc, pc, "Data_cancelamento")
            base = f"SELECT Cliente, ID AS Contrato_ID, Data_ativa_o, Data_cancelamento AS end_date FROM Contratos WHERE {' AND '.join(wc)}"
            params = pc

        elif client_type == 'negativado':
            wcn = ["Cidade = ?", "Cidade NOT IN ('Caçapava', 'Jacareí', 'São José dos Campos')"]; pcn = [city]
            _date_filter(wcn, pcn, "Data_negativa_o")
            wcc = ["Cidade = ?", "Status_contrato = 'Negativado'", "Cidade NOT IN ('Caçapava', 'Jacareí', 'São José dos Campos')"]; pcc = [city]
            _date_filter(wcc, pcc, "Data_cancelamento")
            base = (
                f"SELECT Cliente, ID AS Contrato_ID, Data_ativa_o, Data_negativa_o as end_date FROM Contratos_Negativacao WHERE {' AND '.join(wcn)} "
                f"UNION "
                f"SELECT Cliente, ID AS Contrato_ID, Data_ativa_o, Data_cancelamento as end_date FROM Contratos WHERE {' AND '.join(wcc)}"
            )
            params = pcn + pcc
        else:
            abort(400, "Tipo de cliente inválido.")

        sub = f"SELECT sub.Cliente, sub.Contrato_ID, sub.Data_ativa_o, sub.end_date, {_permanence_sql()} FROM ({base}) AS sub"

        rel_clauses = []; min_m, max_m = _parse_relevance(relevance)
        if min_m is not None: rel_clauses.append("permanencia_meses >= ?"); params.append(min_m)
        if max_m is not None: rel_clauses.append("permanencia_meses <= ?"); params.append(max_m)
        rel_where = (" WHERE " + " AND ".join(rel_clauses)) if rel_clauses else ""

        total_rows = conn.execute(f"SELECT COUNT(*) FROM ({sub}) AS sr {rel_where}", tuple(params)).fetchone()[0]
        params.extend([limit, offset])
        data = conn.execute(f"SELECT * FROM ({sub}) AS sr {rel_where} ORDER BY sr.end_date DESC LIMIT ? OFFSET ?", tuple(params)).fetchall()

        return jsonify({"data": [dict(r) for r in data], "total_rows": total_rows})

    except sqlite3.Error as e:
        logger.error(f"Erro ao buscar clientes da cidade: {e}", exc_info=True)
        return jsonify({"error": "Erro interno ao processar a solicitação."}), 500
    finally:
        if conn: conn.close()


@details_churn_bp.route('/neighborhood_clients')
def api_neighborhood_clients():
    conn = get_db()
    try:
        city         = request.args.get('city')
        neighborhood = request.args.get('neighborhood')
        client_type  = request.args.get('type')
        start_date   = request.args.get('start_date', '') or request.args.get('year', '')
        end_date     = request.args.get('end_date', '')   or request.args.get('month', '')
        relevance    = request.args.get('relevance', '')
        limit        = request.args.get('limit', 25, type=int)
        offset       = request.args.get('offset', 0, type=int)

        if not city or not neighborhood or not client_type:
            abort(400, "Cidade, bairro e tipo de cliente são obrigatórios.")

        def _date(clauses, params, date_col):
            if start_date: clauses.append(f"DATE({date_col}) >= ?"); params.append(start_date)
            if end_date:   clauses.append(f"DATE({date_col}) <= ?"); params.append(end_date)

        if client_type == 'cancelado':
            wc = ["Cidade = ?", "Bairro = ?", "Status_contrato = 'Inativo'", "Status_acesso = 'Desativado'"]; pc = [city, neighborhood]
            _date(wc, pc, "Data_cancelamento")
            base = f"SELECT Cliente, ID AS Contrato_ID, Data_ativa_o, Data_cancelamento AS end_date FROM Contratos WHERE {' AND '.join(wc)}"
            params = pc

        elif client_type == 'negativado':
            wcn = ["Cidade = ?", "Bairro = ?", "Cidade NOT IN ('Caçapava', 'Jacareí', 'São José dos Campos')"]; pcn = [city, neighborhood]
            _date(wcn, pcn, "Data_negativa_o")
            wcc = ["Cidade = ?", "Bairro = ?", "Status_contrato = 'Negativado'", "Cidade NOT IN ('Caçapava', 'Jacareí', 'São José dos Campos')"]; pcc = [city, neighborhood]
            _date(wcc, pcc, "Data_cancelamento")
            base = (
                f"SELECT Cliente, ID AS Contrato_ID, Data_ativa_o, Data_negativa_o as end_date FROM Contratos_Negativacao WHERE {' AND '.join(wcn)} "
                f"UNION "
                f"SELECT Cliente, ID AS Contrato_ID, Data_ativa_o, Data_cancelamento as end_date FROM Contratos WHERE {' AND '.join(wcc)}"
            )
            params = pcn + pcc
        else:
            abort(400, "Tipo de cliente inválido.")

        sub = f"SELECT sub.Cliente, sub.Contrato_ID, sub.Data_ativa_o, sub.end_date, {_permanence_sql()} FROM ({base}) AS sub"

        rel_clauses = []; min_m, max_m = _parse_relevance(relevance)
        if min_m is not None: rel_clauses.append("permanencia_meses >= ?"); params.append(min_m)
        if max_m is not None: rel_clauses.append("permanencia_meses <= ?"); params.append(max_m)
        rel_where = (" WHERE " + " AND ".join(rel_clauses)) if rel_clauses else ""

        total_rows = conn.execute(f"SELECT COUNT(*) FROM ({sub}) AS sr {rel_where}", tuple(params)).fetchone()[0]
        params.extend([limit, offset])
        data = conn.execute(f"SELECT * FROM ({sub}) AS sr {rel_where} ORDER BY sr.end_date DESC LIMIT ? OFFSET ?", tuple(params)).fetchall()

        return jsonify({"data": [dict(r) for r in data], "total_rows": total_rows})

    except sqlite3.Error as e:
        logger.error(f"Erro ao buscar clientes do bairro: {e}", exc_info=True)
        return jsonify({"error": "Erro interno ao processar a solicitação."}), 500
    finally:
        if conn: conn.close()

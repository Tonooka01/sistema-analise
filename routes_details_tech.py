import sqlite3
from flask import Blueprint, jsonify, request, abort
from utils_api import get_db

details_tech_bp = Blueprint('details_tech_bp', __name__)

@details_tech_bp.route('/complaints/<client_name>')
def api_complaints_details(client_name):
    """
    Busca os detalhes de OS ou Atendimentos para um cliente específico.
    """
    conn = get_db()
    try:
        complaint_type = request.args.get('type')
        limit = request.args.get('limit', 15, type=int)
        offset = request.args.get('offset', 0, type=int)

        sql_params = (client_name, )

        if complaint_type == 'os':
            table = 'OS'
            columns = 'ID, Abertura, Assunto, Status'
            count_query = f"SELECT COUNT(*) FROM {table} WHERE UPPER(TRIM(Cliente)) = UPPER(TRIM(?))"
            data_query = f"SELECT {columns} FROM {table} WHERE UPPER(TRIM(Cliente)) = UPPER(TRIM(?)) ORDER BY Abertura DESC LIMIT ? OFFSET ?"
        elif complaint_type == 'atendimentos':
            table = 'Atendimentos'
            columns = 'ID, Criado_em, Assunto, Novo_status'
            count_query = f"SELECT COUNT(*) FROM {table} WHERE UPPER(TRIM(Cliente)) = UPPER(TRIM(?))"
            data_query = f"SELECT {columns} FROM {table} WHERE UPPER(TRIM(Cliente)) = UPPER(TRIM(?)) ORDER BY Criado_em DESC LIMIT ? OFFSET ?"
        else:
            abort(400, "Tipo de 'complaint' inválido.")

        total_rows = conn.execute(count_query, sql_params).fetchone()[0]
        data_params = sql_params + (limit, offset)
        data = conn.execute(data_query, data_params).fetchall()

        return jsonify({
            "data": [dict(row) for row in data],
            "total_rows": total_rows
        })
    except sqlite3.Error as e:
        print(f"Erro ao buscar detalhes de complaints: {e}")
        return jsonify({"error": "Erro interno ao processar a solicitação."}), 500
    finally:
        if conn: conn.close()

@details_tech_bp.route('/logins/<contract_id>')
def api_logins_details(contract_id):
    conn = get_db()
    try:
        limit = request.args.get('limit', 15, type=int)
        offset = request.args.get('offset', 0, type=int)

        count_query = "SELECT COUNT(*) FROM Logins L LEFT JOIN Clientes_Fibra CF ON L.Login = CF.Login WHERE L.ID_contrato = ?"
        total_rows = conn.execute(count_query, (contract_id,)).fetchone()[0]

        data_query = """
            SELECT
                L.Login,
                L.ltima_conex_o_final as ltima_conex_o_inicial,
                CF.Sinal_RX,
                L.Login AS ONU_tipo,
                L.IPV4,
                CF.Transmissor
            FROM Logins L
            LEFT JOIN Clientes_Fibra CF ON L.Login = CF.Login
            WHERE L.ID_contrato = ?
            ORDER BY L.ltima_conex_o_final DESC
            LIMIT ? OFFSET ?
        """
        data = conn.execute(data_query, (contract_id, limit, offset)).fetchall()
        return jsonify({"data": [dict(row) for row in data], "total_rows": total_rows})
    except sqlite3.Error as e:
        print(f"Erro ao buscar detalhes de logins: {e}")
        return jsonify({"error": "Erro interno ao processar a solicitação."}), 500
    finally:
        if conn: conn.close()

@details_tech_bp.route('/comodato/<contract_id>')
def api_comodato_details(contract_id):
    conn = get_db()
    try:
        query = "SELECT Descricao_produto, Status_comodato FROM Equipamento WHERE TRIM(ID_contrato) = ?"
        data = conn.execute(query, (contract_id,)).fetchall()
        return jsonify({"data": [dict(row) for row in data], "total_rows": len(data)})
    except sqlite3.Error as e:
        print(f"Erro ao buscar detalhes de comodato: {e}")
        return jsonify({"error": "Erro interno ao processar a solicitação."}), 500
    finally:
        if conn: conn.close()

@details_tech_bp.route('/active_equipment_clients')
def api_active_equipment_clients():
    conn = get_db()
    try:
        equipment_name = request.args.get('equipment_name')
        city = request.args.get('city', '')
        limit = request.args.get('limit', 25, type=int)
        offset = request.args.get('offset', 0, type=int)

        if not equipment_name:
            abort(400, "O nome do equipamento é obrigatório.")

        where_clauses = [
            "E.Status_comodato = 'Emprestado'",
            "L.Transmissor IS NOT NULL",
            "L.Transmissor != ''",
            "E.Descricao_produto = ?"
        ]
        params = [equipment_name]

        if city:
            where_clauses.append("C.Cidade = ?")
            params.append(city)

        where_sql = " AND ".join(where_clauses)

        base_query = f"""
            FROM Logins L
            JOIN Contratos C ON L.ID_contrato = C.ID
            JOIN Equipamento E ON C.ID = TRIM(E.ID_contrato)
            WHERE {where_sql}
        """

        count_query = f"SELECT COUNT(DISTINCT C.ID) {base_query}"
        total_rows = conn.execute(count_query, tuple(params)).fetchone()[0]

        data_query = f"""
            SELECT DISTINCT
                C.Cliente,
                C.ID AS Contrato_ID,
                C.Data_ativa_o,
                C.Cidade,
                C.Status_contrato
            {base_query}
            ORDER BY C.Cliente
            LIMIT ? OFFSET ?
        """
        params.extend([limit, offset])

        data = conn.execute(data_query, tuple(params)).fetchall()

        return jsonify({
            "data": [dict(row) for row in data],
            "total_rows": total_rows
        })
    except sqlite3.Error as e:
        print(f"Erro ao buscar detalhes de clientes por equipamento ativo: {e}")
        return jsonify({"error": "Erro interno ao processar a solicitação."}), 500
    finally:
        if conn: conn.close()
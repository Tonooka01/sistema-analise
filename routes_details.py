import pandas as pd
import sqlite3
from flask import Blueprint, jsonify, request, abort, current_app
import traceback # Importa o traceback para logs de erro detalhados

# Define o Blueprint
details_bp = Blueprint('details_bp', __name__)

def get_db():
    """Função auxiliar para obter a conexão do banco de dados a partir do app_context."""
    return current_app.config['GET_DB_CONNECTION']()

# --- COPIADO DE routes_custom_analysis.py ---
def parse_relevance_filter(relevance_str):
    """
    Converte a string de filtro de relevância (ex: "0-6", "37+")
    em valores min e max de meses para a query SQL.
    Retorna (min_months, max_months)
    """
    if not relevance_str:
        return (None, None)
    
    parts = relevance_str.split('-')
    
    try:
        if '+' in parts[0]:
            min_months = int(parts[0].replace('+', ''))
            max_months = None
            return (min_months, max_months)
        
        min_months = int(parts[0])
        max_months = int(parts[1]) if len(parts) > 1 else None
        
        return (min_months, max_months)
        
    except ValueError:
        print(f"Valor de relevância inválido: {relevance_str}")
        return (None, None)
# --- FIM DA CÓPIA ---


# --- Definição das Rotas ---

@details_bp.route('/invoice_details')
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


@details_bp.route('/financial/<contract_id>')
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

@details_bp.route('/complaints/<client_name>')
def api_complaints_details(client_name):
    """
    Busca os detalhes de OS ou Atendimentos para um cliente específico.
    CORRIGIDO: Usa UPPER(TRIM()) para garantir a correspondência do nome.
    """
    conn = get_db()
    try:
        complaint_type = request.args.get('type')
        limit = request.args.get('limit', 15, type=int)
        offset = request.args.get('offset', 0, type=int)

        # Parâmetro para as queries SQL
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

        # Adiciona limit e offset aos parâmetros para a query de dados
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

@details_bp.route('/logins/<contract_id>')
def api_logins_details(contract_id):
    """
    Busca os detalhes de logins para um contrato específico.
    """
    conn = get_db()
    try:
        limit = request.args.get('limit', 15, type=int)
        offset = request.args.get('offset', 0, type=int)

        # A contagem deve ser feita na tabela principal da consulta
        count_query = "SELECT COUNT(*) FROM Logins L LEFT JOIN Clientes_Fibra CF ON L.Login = CF.Login WHERE L.ID_contrato = ?"
        total_rows = conn.execute(count_query, (contract_id,)).fetchone()[0]

        # CORREÇÃO: Junta Logins com Clientes_Fibra para obter Sinal_RX e usa a coluna correta 'ltima_conex_o_final'
        # AJUSTE (baseado no feedback do usuário): Usa a coluna 'Login' no lugar da 'ONU_tipo' que estava causando erro.
        data_query = """
            SELECT
                L.Login,
                L.ltima_conex_o_final as ltima_conex_o_inicial,
                CF.Sinal_RX,
                L.Login AS ONU_tipo, -- Ajustado para usar Login como fallback se ONU_tipo não existir
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

@details_bp.route('/comodato/<contract_id>')
def api_comodato_details(contract_id):
    """
    Busca os detalhes de equipamentos em comodato para um contrato.
    """
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


@details_bp.route('/cancellation_context/<contract_id>/<client_name>')
def api_cancellation_context(client_name, contract_id): # Ordem dos parâmetros corrigida
    """
    Busca o contexto de um cliente que cancelou ou foi negativado.
    """
    conn = get_db()
    try:
        contract_info = conn.execute('SELECT Data_cancelamento FROM Contratos WHERE ID = ?', (contract_id,)).fetchone()
        end_date = None
        if contract_info and contract_info['Data_cancelamento']:
            end_date = contract_info['Data_cancelamento']
        else:
            try:
                neg_info = conn.execute('SELECT Data_negativa_o FROM Contratos_Negativacao WHERE ID = ?', (contract_id,)).fetchone()
                if neg_info and neg_info['Data_negativa_o']:
                    end_date = neg_info['Data_negativa_o']
            except sqlite3.Error as e:
                 if "no such table" not in str(e): raise e
                 print("Aviso: Tabela Contratos_Negativacao não encontrada para contexto.")


        where_atendimento_date_clause = f"AND DATE(Criado_em) < DATE('{end_date}')" if end_date else ""
        where_os_date_clause = f"AND DATE(Abertura) < DATE('{end_date}')" if end_date else ""

        equipamentos = conn.execute("SELECT Descricao_produto, Status_comodato, Data FROM Equipamento WHERE TRIM(ID_contrato) = ?", (contract_id,)).fetchall()
        # Usa placeholders para segurança
        os = conn.execute(f"SELECT ID, Abertura, Fechamento, SLA, Assunto, Mensagem FROM OS WHERE Cliente = ? {where_os_date_clause} ORDER BY Abertura DESC", (client_name,)).fetchall()
        atendimentos = conn.execute(f"SELECT ID, Criado_em, ltima_altera_o, Assunto, Novo_status, Descri_o FROM Atendimentos WHERE Cliente = ? {where_atendimento_date_clause} ORDER BY Criado_em DESC", (client_name,)).fetchall()

        return jsonify({
            "equipamentos": [dict(row) for row in equipamentos],
            "os": [dict(row) for row in os],
            "atendimentos": [dict(row) for row in atendimentos]
        })
    except sqlite3.Error as e:
        print(f"Erro na base de dados ao buscar contexto de cancelamento: {e}")
        return jsonify({"error": "Erro interno ao processar a solicitação de contexto."}), 500
    finally:
        if conn: conn.close()

@details_bp.route('/seller_clients')
def api_seller_clients():
    conn = get_db()
    try:
        seller_id = request.args.get('seller_id', type=int)
        client_type = request.args.get('type')
        year = request.args.get('year', '')
        month = request.args.get('month', '')
        limit = request.args.get('limit', 25, type=int)
        offset = request.args.get('offset', 0, type=int)

        if not seller_id or not client_type:
            abort(400, "ID do vendedor e tipo de cliente são obrigatórios.")

        params = []
        base_query = ""

        if client_type == 'cancelado':
            where_sql = "WHERE Vendedor = ? AND Status_contrato = 'Inativo' AND Status_acesso = 'Desativado'"
            params.append(seller_id)
            if year: where_sql += " AND STRFTIME('%Y', Data_cancelamento) = ?"; params.append(year)
            if month: where_sql += " AND STRFTIME('%m', Data_cancelamento) = ?"; params.append(f'{int(month):02d}')
            base_query = f"""
                SELECT Cliente, ID AS Contrato_ID, Data_ativa_o, Data_cancelamento as end_date
                FROM Contratos {where_sql}
            """
        elif client_type == 'negativado':
            # --- LÓGICA ATUALIZADA PARA 'NEGATIVADO' ---
            where_cn = "WHERE Vendedor = ? AND Cidade NOT IN ('Caçapava', 'Jacareí', 'São José dos Campos')"
            params_cn = [seller_id]
            if year: where_cn += " AND STRFTIME('%Y', Data_negativa_o) = ?"; params_cn.append(year)
            if month: where_cn += " AND STRFTIME('%m', Data_negativa_o) = ?"; params_cn.append(f'{int(month):02d}')

            where_c = "WHERE Vendedor = ? AND Status_contrato = 'Negativado' AND Cidade NOT IN ('Caçapava', 'Jacareí', 'São José dos Campos')"
            params_c = [seller_id]
            if year: where_c += " AND STRFTIME('%Y', Data_cancelamento) = ?"; params_c.append(year)
            if month: where_c += " AND STRFTIME('%m', Data_cancelamento) = ?"; params_c.append(f'{int(month):02d}')

            base_query = f"""
                SELECT Cliente, ID AS Contrato_ID, Data_ativa_o, Data_negativa_o as end_date FROM Contratos_Negativacao {where_cn}
                UNION
                SELECT Cliente, ID AS Contrato_ID, Data_ativa_o, Data_cancelamento as end_date FROM Contratos {where_c}
            """
            params = params_cn + params_c
        else:
            abort(400, "Tipo de cliente inválido.")

        count_query = f"SELECT COUNT(*) FROM ({base_query})"
        total_rows = conn.execute(count_query, tuple(params)).fetchone()[0]

        paginated_query = f"""
            SELECT
                sub.Cliente,
                sub.Contrato_ID,
                sub.Data_ativa_o,
                sub.end_date,
                CASE WHEN sub.Data_ativa_o IS NOT NULL AND sub.end_date IS NOT NULL AND sub.end_date != 'N/A' THEN JULIANDAY(sub.end_date) - JULIANDAY(sub.Data_ativa_o) ELSE NULL END AS permanencia_dias,
                CASE WHEN sub.Data_ativa_o IS NOT NULL AND sub.end_date IS NOT NULL AND sub.end_date != 'N/A' THEN CAST(ROUND((JULIANDAY(sub.end_date) - JULIANDAY(sub.Data_ativa_o)) / 30.44) AS INTEGER) ELSE NULL END AS permanencia_meses
            FROM ({base_query}) AS sub
            ORDER BY sub.end_date DESC
            LIMIT ? OFFSET ?
        """
        params.extend([limit, offset])

        data = conn.execute(paginated_query, tuple(params)).fetchall()

        return jsonify({"data": [dict(row) for row in data], "total_rows": total_rows})
    except sqlite3.Error as e:
        print(f"Erro ao buscar detalhes de clientes do vendedor: {e}")
        return jsonify({"error": "Erro interno ao processar a solicitação."}), 500
    finally:
        if conn: conn.close()


@details_bp.route('/city_clients')
def api_city_clients():
    conn = get_db()
    try:
        city = request.args.get('city')
        client_type = request.args.get('type')
        limit = request.args.get('limit', 25, type=int)
        offset = request.args.get('offset', 0, type=int)
        year = request.args.get('year', '')
        month = request.args.get('month', '')
        relevance = request.args.get('relevance', '') # <-- NOVO

        if not city or not client_type:
            abort(400, "Cidade e tipo de cliente são obrigatórios.")

        params = []
        base_query = ""

        if client_type == 'cancelado':
            where_sql = "WHERE Cidade = ? AND Status_contrato = 'Inativo' AND Status_acesso = 'Desativado'"
            params.append(city)
            if year: where_sql += " AND STRFTIME('%Y', Data_cancelamento) = ?"; params.append(year)
            if month: where_sql += " AND STRFTIME('%m', Data_cancelamento) = ?"; params.append(f'{int(month):02d}')

            base_query = f"""
                SELECT Cliente, ID AS Contrato_ID, "Data_ativa_o", Data_cancelamento AS end_date
                FROM Contratos {where_sql}
            """
        elif client_type == 'negativado':
            where_cn = "WHERE Cidade = ? AND Cidade NOT IN ('Caçapava', 'Jacareí', 'São José dos Campos')"
            params_cn = [city]
            if year: where_cn += " AND STRFTIME('%Y', Data_negativa_o) = ?"; params_cn.append(year)
            if month: where_cn += " AND STRFTIME('%m', Data_negativa_o) = ?"; params_cn.append(f'{int(month):02d}')

            where_c = "WHERE Cidade = ? AND Status_contrato = 'Negativado' AND Cidade NOT IN ('Caçapava', 'Jacareí', 'São José dos Campos')"
            params_c = [city]
            if year: where_c += " AND STRFTIME('%Y', Data_cancelamento) = ?"; params_c.append(year)
            if month: where_c += " AND STRFTIME('%m', Data_cancelamento) = ?"; params_c.append(f'{int(month):02d}')

            base_query = f"""
                SELECT Cliente, ID AS Contrato_ID, Data_ativa_o, Data_negativa_o as end_date FROM Contratos_Negativacao {where_cn}
                UNION
                SELECT Cliente, ID AS Contrato_ID, Data_ativa_o, Data_cancelamento as end_date FROM Contratos {where_c}
            """
            params = params_cn + params_c
        else:
            abort(400, "Tipo de cliente inválido.")

        # --- MODIFICADO: Query de subseleção para filtrar por relevância ---
        sub_query_with_relevance = f"""
            SELECT
                sub.Cliente,
                sub.Contrato_ID,
                sub.Data_ativa_o,
                sub.end_date,
                CASE WHEN sub.Data_ativa_o IS NOT NULL AND sub.end_date IS NOT NULL AND sub.end_date != 'N/A' THEN JULIANDAY(sub.end_date) - JULIANDAY(sub.Data_ativa_o) ELSE NULL END AS permanencia_dias,
                CASE WHEN sub.Data_ativa_o IS NOT NULL AND sub.end_date IS NOT NULL AND sub.end_date != 'N/A' THEN CAST(ROUND((JULIANDAY(sub.end_date) - JULIANDAY(sub.Data_ativa_o)) / 30.44) AS INTEGER) ELSE NULL END AS permanencia_meses
            FROM ({base_query}) AS sub
        """

        relevance_where_clauses = []
        min_months, max_months = parse_relevance_filter(relevance)
        if min_months is not None:
            relevance_where_clauses.append("permanencia_meses >= ?")
            params.append(min_months)
        if max_months is not None:
            relevance_where_clauses.append("permanencia_meses <= ?")
            params.append(max_months)
        
        relevance_where_sql = " WHERE " + " AND ".join(relevance_where_clauses) if relevance_where_clauses else ""
        # --- FIM DA MODIFICAÇÃO ---
        
        count_query = f"SELECT COUNT(*) FROM ({sub_query_with_relevance}) AS sub_rel {relevance_where_sql}"
        total_rows = conn.execute(count_query, tuple(params)).fetchone()[0]

        paginated_query = f"""
            SELECT * FROM ({sub_query_with_relevance}) AS sub_rel
            {relevance_where_sql}
            ORDER BY sub_rel.end_date DESC
            LIMIT ? OFFSET ?
        """
        params.extend([limit, offset])

        data = conn.execute(paginated_query, tuple(params)).fetchall()

        return jsonify({"data": [dict(row) for row in data], "total_rows": total_rows})
    except sqlite3.Error as e:
        print(f"Erro ao buscar detalhes de clientes da cidade: {e}")
        return jsonify({"error": "Erro interno ao processar a solicitação."}), 500
    finally:
        if conn: conn.close()

@details_bp.route('/neighborhood_clients')
def api_neighborhood_clients():
    conn = get_db()
    try:
        city = request.args.get('city')
        neighborhood = request.args.get('neighborhood')
        client_type = request.args.get('type')
        limit = request.args.get('limit', 25, type=int)
        offset = request.args.get('offset', 0, type=int)
        year = request.args.get('year', '')
        month = request.args.get('month', '')
        relevance = request.args.get('relevance', '') # <-- NOVO

        if not city or not neighborhood or not client_type:
            abort(400, "Cidade, bairro e tipo de cliente são obrigatórios.")

        params = []
        base_query = ""

        if client_type == 'cancelado':
            where_sql = "WHERE Cidade = ? AND Bairro = ? AND Status_contrato = 'Inativo' AND Status_acesso = 'Desativado'"
            params.extend([city, neighborhood])
            if year: where_sql += " AND STRFTIME('%Y', Data_cancelamento) = ?"; params.append(year)
            if month: where_sql += " AND STRFTIME('%m', Data_cancelamento) = ?"; params.append(f'{int(month):02d}')

            base_query = f"""
                SELECT Cliente, ID AS Contrato_ID, "Data_ativa_o", Data_cancelamento AS end_date
                FROM Contratos {where_sql}
            """
        elif client_type == 'negativado':
            where_cn = "WHERE Cidade = ? AND Bairro = ? AND Cidade NOT IN ('Caçapava', 'Jacareí', 'São José dos Campos')"
            params_cn = [city, neighborhood]
            if year: where_cn += " AND STRFTIME('%Y', Data_negativa_o) = ?"; params_cn.append(year)
            if month: where_cn += " AND STRFTIME('%m', Data_negativa_o) = ?"; params_cn.append(f'{int(month):02d}')

            where_c = "WHERE Cidade = ? AND Bairro = ? AND Status_contrato = 'Negativado' AND Cidade NOT IN ('Caçapava', 'Jacareí', 'São José dos Campos')"
            params_c = [city, neighborhood]
            if year: where_c += " AND STRFTIME('%Y', Data_cancelamento) = ?"; params_c.append(year)
            if month: where_c += " AND STRFTIME('%m', Data_cancelamento) = ?"; params_c.append(f'{int(month):02d}')

            base_query = f"""
                SELECT Cliente, ID AS Contrato_ID, Data_ativa_o, Data_negativa_o as end_date FROM Contratos_Negativacao {where_cn}
                UNION
                SELECT Cliente, ID AS Contrato_ID, Data_ativa_o, Data_cancelamento as end_date FROM Contratos {where_c}
            """
            params = params_cn + params_c
        else:
            abort(400, "Tipo de cliente inválido.")

        # --- MODIFICADO: Query de subseleção para filtrar por relevância ---
        sub_query_with_relevance = f"""
            SELECT
                sub.Cliente,
                sub.Contrato_ID,
                sub.Data_ativa_o,
                sub.end_date,
                CASE WHEN sub.Data_ativa_o IS NOT NULL AND sub.end_date IS NOT NULL AND sub.end_date != 'N/A' THEN JULIANDAY(sub.end_date) - JULIANDAY(sub.Data_ativa_o) ELSE NULL END AS permanencia_dias,
                CASE WHEN sub.Data_ativa_o IS NOT NULL AND sub.end_date IS NOT NULL AND sub.end_date != 'N/A' THEN CAST(ROUND((JULIANDAY(sub.end_date) - JULIANDAY(sub.Data_ativa_o)) / 30.44) AS INTEGER) ELSE NULL END AS permanencia_meses
            FROM ({base_query}) AS sub
        """

        relevance_where_clauses = []
        min_months, max_months = parse_relevance_filter(relevance)
        if min_months is not None:
            relevance_where_clauses.append("permanencia_meses >= ?")
            params.append(min_months)
        if max_months is not None:
            relevance_where_clauses.append("permanencia_meses <= ?")
            params.append(max_months)
        
        relevance_where_sql = " WHERE " + " AND ".join(relevance_where_clauses) if relevance_where_clauses else ""
        # --- FIM DA MODIFICAÇÃO ---

        count_query = f"SELECT COUNT(*) FROM ({sub_query_with_relevance}) AS sub_rel {relevance_where_sql}"
        total_rows = conn.execute(count_query, tuple(params)).fetchone()[0]

        paginated_query = f"""
            SELECT * FROM ({sub_query_with_relevance}) AS sub_rel
            {relevance_where_sql}
            ORDER BY sub_rel.end_date DESC
            LIMIT ? OFFSET ?
        """
        params.extend([limit, offset])

        data = conn.execute(paginated_query, tuple(params)).fetchall()

        return jsonify({"data": [dict(row) for row in data], "total_rows": total_rows})
    except sqlite3.Error as e:
        print(f"Erro ao buscar detalhes de clientes do bairro: {e}")
        return jsonify({"error": "Erro interno ao processar a solicitação."}), 500
    finally:
        if conn: conn.close()

# --- ROTA CORRIGIDA PARA DETALHES DE EQUIPAMENTO (Cancelamento/Negativação) ---
@details_bp.route('/equipment_clients')
def api_equipment_clients():
    """
    Busca os detalhes dos clientes (cancelados/negativados)
    associados a um nome de equipamento específico, com filtros.
    VERSÃO ATUALIZADA COM RELEVÂNCIA
    """
    conn = get_db()
    try:
        equipment_name = request.args.get('equipment_name')
        year = request.args.get('year', '')
        month = request.args.get('month', '')
        city = request.args.get('city', '')
        limit = request.args.get('limit', 25, type=int)
        offset = request.args.get('offset', 0, type=int)
        relevance = request.args.get('relevance', '') # <-- NOVO

        if not equipment_name:
            abort(400, "O nome do equipamento é obrigatório.")

        # --- 1. Busca Contratos Cancelados/Negativados com Filtros ---
        params_cancelados = []
        where_cancelados_list = ["Status_contrato = 'Inativo'", "Status_acesso = 'Desativado'"]
        if year: where_cancelados_list.append("STRFTIME('%Y', Data_cancelamento) = ?"); params_cancelados.append(year)
        if month: where_cancelados_list.append("STRFTIME('%m', Data_cancelamento) = ?"); params_cancelados.append(f'{int(month):02d}')
        if city: where_cancelados_list.append("Cidade = ?"); params_cancelados.append(city)
        where_cancelados_sql = " AND ".join(where_cancelados_list)
        # --- MODIFICADO: Adiciona Data_ativa_o e end_date ---
        query_cancelados = f"SELECT ID, Cliente, Data_cancelamento, NULL AS Data_negativacao, Cidade, Data_ativa_o, Data_cancelamento AS end_date FROM Contratos WHERE {where_cancelados_sql}"

        params_negativados_cn = []
        where_negativados_cn_list = ["Cidade NOT IN ('Caçapava', 'Jacareí', 'São José dos Campos')"]
        if year: where_negativados_cn_list.append("STRFTIME('%Y', Data_negativa_o) = ?"); params_negativados_cn.append(year)
        if month: where_negativados_cn_list.append("STRFTIME('%m', Data_negativa_o) = ?"); params_negativados_cn.append(f'{int(month):02d}')
        if city: where_negativados_cn_list.append("Cidade = ?"); params_negativados_cn.append(city)
        where_negativados_cn_sql = " AND ".join(where_negativados_cn_list)
        # --- MODIFICADO: Adiciona Data_ativa_o e end_date ---
        query_negativados_cn = f"SELECT ID, Cliente, NULL AS Data_cancelamento, Data_negativa_o AS Data_negativacao, Cidade, Data_ativa_o, Data_negativa_o AS end_date FROM Contratos_Negativacao WHERE {where_negativados_cn_sql}"

        params_negativados_c = []
        where_negativados_c_list = ["Status_contrato = 'Negativado'", "Cidade NOT IN ('Caçapava', 'Jacareí', 'São José dos Campos')"]
        if year: where_negativados_c_list.append("STRFTIME('%Y', Data_cancelamento) = ?"); params_negativados_c.append(year)
        if month: where_negativados_c_list.append("STRFTIME('%m', Data_cancelamento) = ?"); params_negativados_c.append(f'{int(month):02d}')
        if city: where_negativados_c_list.append("Cidade = ?"); params_negativados_c.append(city)
        where_negativados_c_sql = " AND ".join(where_negativados_c_list)
        # --- MODIFICADO: Adiciona Data_ativa_o e end_date ---
        query_negativados_c = f"SELECT ID, Cliente, NULL AS Data_cancelamento, Data_cancelamento AS Data_negativacao, Cidade, Data_ativa_o, Data_cancelamento AS end_date FROM Contratos WHERE {where_negativados_c_sql}"

        # Executa as queries e combina os resultados
        df_cancelados = pd.read_sql_query(query_cancelados, conn, params=tuple(params_cancelados))
        df_negativados_c = pd.read_sql_query(query_negativados_c, conn, params=tuple(params_negativados_c))
        df_negativados_cn = pd.DataFrame()
        try:
             df_negativados_cn = pd.read_sql_query(query_negativados_cn, conn, params=tuple(params_negativados_cn))
        except pd.io.sql.DatabaseError as e:
            if "no such table" not in str(e): raise e
            print("Aviso: Tabela Contratos_Negativacao não encontrada.")

        df_contracts = pd.concat([df_cancelados, df_negativados_c, df_negativados_cn], ignore_index=True).drop_duplicates(subset=['ID'])
        df_contracts['ID'] = df_contracts['ID'].astype(str).str.strip()

        # --- LÓGICA DE FILTRO DE RELEVÂNCIA (APLICADA CEDO) ---
        if not df_contracts.empty:
            df_contracts['Data_ativa_o'] = pd.to_datetime(df_contracts['Data_ativa_o'], errors='coerce')
            df_contracts['end_date'] = pd.to_datetime(df_contracts['end_date'], errors='coerce')
            df_contracts['permanencia_dias'] = (df_contracts['end_date'] - df_contracts['Data_ativa_o']).dt.days
            df_contracts['permanencia_meses'] = (df_contracts['permanencia_dias'] / 30.44).round().astype('Int64')

            min_months, max_months = parse_relevance_filter(relevance)
            if min_months is not None:
                df_contracts = df_contracts[df_contracts['permanencia_meses'] >= min_months]
            if max_months is not None:
                df_contracts = df_contracts[df_contracts['permanencia_meses'] <= max_months]
        # --- FIM DA LÓGICA ---

        if df_contracts.empty:
            return jsonify({"data": [], "total_rows": 0})

        # --- 2. Busca Equipamentos Devolvidos com o Nome Especificado ---
        equipment_name_like = equipment_name.replace(' (Agrupado)', '') + '%' if ' (Agrupado)' in equipment_name else equipment_name

        query_equipment = """
            SELECT TRIM(ID_contrato) AS ID_contrato
            FROM Equipamento
            WHERE Descricao_produto LIKE ? AND Status_comodato = 'Baixa'
        """
        df_equipment = pd.read_sql_query(query_equipment, conn, params=(equipment_name_like,))
        df_equipment['ID_contrato'] = df_equipment['ID_contrato'].astype(str).str.strip()


        if df_equipment.empty:
            return jsonify({"data": [], "total_rows": 0})

        # --- 3. Faz o JOIN entre Contratos Filtrados e Equipamentos ---
        df_merged = pd.merge(df_contracts, df_equipment, left_on='ID', right_on='ID_contrato', how='inner')

        # Ordena e aplica paginação
        df_final = df_merged.sort_values(by=['Data_negativacao', 'Data_cancelamento'], ascending=False, na_position='last')
        total_rows = len(df_final)
        df_paginated = df_final.iloc[offset : offset + limit]

        # Converte para o formato de dicionário esperado
        data_list = []
        for _, row in df_paginated.iterrows():
            cancel_date_val = row['Data_cancelamento'] if pd.notna(row['Data_cancelamento']) else None
            neg_date_val = row['Data_negativacao'] if pd.notna(row['Data_negativacao']) else None
            permanencia_meses_val = int(row['permanencia_meses']) if pd.notna(row['permanencia_meses']) else None # <-- NOVO
            
            data_list.append({
                "Cliente": row['Cliente'],
                "Contrato_ID": row['ID'],
                "Data_cancelamento": cancel_date_val,
                "Data_negativacao": neg_date_val,
                "Cidade": row['Cidade'],
                "permanencia_meses": permanencia_meses_val # <-- NOVO
            })

        return jsonify({
            "data": data_list,
            "total_rows": total_rows
        })

    except sqlite3.Error as e:
        if "no such table" in str(e).lower():
             return jsonify({"error": "Uma das tabelas necessárias não foi encontrada."}), 500
        print(f"Erro SQLite ao buscar detalhes de clientes por equipamento: {e}")
        return jsonify({"error": "Erro interno no banco de dados ao processar a solicitação."}), 500
    except Exception as e:
         print(f"Erro inesperado ao buscar detalhes de clientes por equipamento: {e}")
         traceback.print_exc() 
         return jsonify({"error": f"Erro interno inesperado ao processar a solicitação. Verifique os logs do servidor."}), 500
    finally:
        if conn: conn.close()

@details_bp.route('/active_equipment_clients')
def api_active_equipment_clients():
    """
    Busca a lista de clientes ATIVOS que possuem um equipamento.
    """
    conn = get_db()
    try:
        equipment_name = request.args.get('equipment_name')
        city = request.args.get('city', '')
        limit = request.args.get('limit', 25, type=int)
        offset = request.args.get('offset', 0, type=int)

        if not equipment_name:
            abort(400, "O nome do equipamento é obrigatório.")

        # --- Lógica de Filtro ---
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

        # --- Query Base ---
        base_query = f"""
            FROM Logins L
            JOIN Contratos C ON L.ID_contrato = C.ID
            JOIN Equipamento E ON C.ID = TRIM(E.ID_contrato)
            WHERE {where_sql}
        """

        # --- Contagem ---
        count_query = f"SELECT COUNT(DISTINCT C.ID) {base_query}"
        total_rows = conn.execute(count_query, tuple(params)).fetchone()[0]

        # --- Dados Paginados ---
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


# --- ROTA ATUALIZADA PARA OS DETALHES DE ATIVAÇÃO DO VENDEDOR ---
@details_bp.route('/seller_activations')
def api_seller_activations():
    conn = get_db()
    try:
        seller_id = request.args.get('seller_id', type=int)
        client_type = request.args.get('type') # 'ativado', 'ativo_permanece', 'cancelado', 'negativado'
        city = request.args.get('city', '')
        year = request.args.get('year', '')
        month = request.args.get('month', '')
        limit = request.args.get('limit', 25, type=int)
        offset = request.args.get('offset', 0, type=int)

        if not seller_id or not client_type:
            abort(400, "ID do vendedor e tipo de cliente são obrigatórios.")

        # --- 1. Encontra todos os contratos ativados pelo vendedor com filtros ---
        where_contracts = ["C.Vendedor = ?"]
        params_contracts = [seller_id]
        if city: where_contracts.append("C.Cidade = ?"); params_contracts.append(city)
        if year: where_contracts.append("STRFTIME('%Y', C.Data_ativa_o) = ?"); params_contracts.append(year)
        if month: where_contracts.append("STRFTIME('%m', C.Data_ativa_o) = ?"); params_contracts.append(f'{int(month):02d}')
        
        # Substitui C. por "" nos nomes de colunas para funcionar no Contratos_Negativacao
        where_contracts_sql_union = " AND ".join(where_contracts).replace("C.", "")

        # --- ALTERAÇÃO: Adiciona a coluna 'Cidade' ao SELECT ---
        query_base = f"""
            SELECT 
                ID, Cliente, Data_ativa_o, Status_contrato, Data_cancelamento, 0 AS is_negativado_table, Cidade
            FROM Contratos C
            WHERE {" AND ".join(where_contracts)}
            
            UNION
            
            SELECT 
                ID, Cliente, Data_ativa_o, 'Negativado' AS Status_contrato, Data_negativa_o AS Data_cancelamento, 1 AS is_negativado_table, Cidade
            FROM Contratos_Negativacao C
            WHERE {where_contracts_sql_union}
        """

        try:
            # Passa os parâmetros duas vezes (um para cada parte do UNION)
            df_contracts_all = pd.read_sql_query(query_base, conn, params=tuple(params_contracts * 2))
            
            # Deduplica por ID, priorizando a tabela Contratos
            df_contracts_all.sort_values(by='is_negativado_table', ascending=True, inplace=True)
            df_contracts = df_contracts_all.drop_duplicates(subset=['ID'], keep='first')

        except pd.io.sql.DatabaseError as e:
            if "no such table" in str(e).lower(): # Fallback
                print("Aviso: Tabela Contratos_Negativacao não encontrada (detalhes). Usando apenas Contratos.")
                query_fallback = f"""
                    SELECT ID, Cliente, Data_ativa_o, Status_contrato, Data_cancelamento, Cidade
                    FROM Contratos C
                    WHERE {" AND ".join(where_contracts)}
                """
                df_contracts = pd.read_sql_query(query_fallback, conn, params=tuple(params_contracts))
            else:
                raise e
        
        if df_contracts.empty:
            return jsonify({"data": [], "total_rows": 0})

        df_merged = df_contracts
        
        df_merged['is_active'] = (df_merged['Status_contrato'] == 'Ativo')
        df_merged['is_cancelado'] = (df_merged['Status_contrato'] == 'Inativo')
        
        # --- ALTERAÇÃO: Adiciona o filtro de cidade para 'is_negativado' ---
        df_merged['is_negativado'] = (
            (df_merged['Status_contrato'] == 'Negativado') &
            (~df_merged['Cidade'].isin(['Caçapava', 'Jacareí', 'São José dos Campos']))
        )


        # --- 3. Filtra o DataFrame com base no tipo clicado ---
        if client_type == 'ativado':
            df_filtered = df_merged
        elif client_type == 'ativo_permanece':
            df_filtered = df_merged[df_merged['is_active'] == True]
        elif client_type == 'cancelado':
            df_filtered = df_merged[df_merged['is_cancelado'] == True]
        elif client_type == 'negativado':
            df_filtered = df_merged[df_merged['is_negativado'] == True]
        else:
            abort(400, "Tipo de cliente inválido.")

        total_rows = len(df_filtered)

        # --- 4. Prepara dados para o modal (incluindo data final e permanência) ---
        df_filtered = df_filtered.copy() # Evita SettingWithCopyWarning
        
        df_filtered.loc[:, 'end_date'] = pd.NaT
        df_filtered.loc[:, 'permanencia_dias'] = pd.NA
        df_filtered.loc[:, 'permanencia_meses'] = pd.NA
        
        df_filtered.loc[:, 'Data_ativa_o'] = pd.to_datetime(df_filtered['Data_ativa_o'], errors='coerce')

        if client_type in ['cancelado', 'negativado']:
            if 'Data_cancelamento' in df_filtered.columns:
                 df_filtered.loc[:, 'end_date'] = df_filtered['Data_cancelamento']
            
            df_filtered.loc[:, 'end_date'] = pd.to_datetime(df_filtered['end_date'], errors='coerce')
            
            # --- BLOCO DE CORREÇÃO DO TYPEERROR ---
            time_diff = (df_filtered['end_date'] - df_filtered['Data_ativa_o'])
            permanencia_dias_series = time_diff / pd.to_timedelta(1, 'D')
            permanencia_dias_numeric = pd.to_numeric(permanencia_dias_series, errors='coerce')
            permanencia_meses_series = (permanencia_dias_numeric / 30.44).round().astype('Int64')
            df_filtered.loc[:, 'permanencia_dias'] = permanencia_dias_numeric
            df_filtered.loc[:, 'permanencia_meses'] = permanencia_meses_series
            # --- FIM DO BLOCO DE CORREÇÃO ---
        
        df_paginated = df_filtered.sort_values(by='Data_ativa_o', ascending=False).iloc[offset : offset + limit]
        
        data_list = []
        for _, row in df_paginated.iterrows():
            data_list.append({
                "Cliente": row['Cliente'],
                "Contrato_ID": row['ID'],
                "Data_ativa_o": row['Data_ativa_o'].strftime('%Y-%m-%d') if pd.notna(row['Data_ativa_o']) else None,
                "Status_contrato": row['Status_contrato'],
                "end_date": row['end_date'].strftime('%Y-%m-%d') if pd.notna(row['end_date']) else None,
                "permanencia_meses": int(row['permanencia_meses']) if pd.notna(row['permanencia_meses']) else None
            })

        return jsonify({
            "data": data_list,
            "total_rows": total_rows
        })

    except sqlite3.Error as e:
        print(f"Erro ao buscar detalhes de ativação do vendedor: {e}")
        traceback.print_exc()
        return jsonify({"error": "Erro interno ao processar a solicitação."}), 500
    except Exception as e:
        print(f"Erro inesperado ao buscar detalhes de ativação do vendedor: {e}")
        traceback.print_exc()
        return jsonify({"error": "Erro interno inesperado."}), 500
    finally:
        if conn: conn.close()
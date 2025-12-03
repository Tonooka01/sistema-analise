import pandas as pd
import sqlite3
import traceback
from flask import Blueprint, jsonify, request, abort
from utils_api import get_db, parse_relevance_filter, add_date_range_filter

details_churn_bp = Blueprint('details_churn_bp', __name__)

@details_churn_bp.route('/cancellation_context/<contract_id>/<client_name>')
def api_cancellation_context(client_name, contract_id):
    """
    Busca o contexto de um cliente que cancelou ou foi negativado (OS, Atendimentos, Equipamentos).
    """
    conn = get_db()
    try:
        # Removida a lógica de pegar Data_cancelamento para filtro.
        # Agora buscamos TODOS os registros independentemente da data.

        equipamentos = conn.execute("SELECT Descricao_produto, Status_comodato, Data FROM Equipamento WHERE TRIM(ID_contrato) = ?", (contract_id,)).fetchall()
        
        # Filtro de data REMOVIDO aqui:
        os = conn.execute(f"SELECT ID, Abertura, Fechamento, SLA, Assunto, Mensagem FROM OS WHERE Cliente = ? ORDER BY Abertura DESC", (client_name,)).fetchall()
        
        # Filtro de data REMOVIDO aqui:
        atendimentos = conn.execute(f"SELECT ID, Criado_em, ltima_altera_o, Assunto, Novo_status, Descri_o FROM Atendimentos WHERE Cliente = ? ORDER BY Criado_em DESC", (client_name,)).fetchall()

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

@details_churn_bp.route('/city_clients')
def api_city_clients():
    conn = get_db()
    try:
        city = request.args.get('city')
        client_type = request.args.get('type')
        limit = request.args.get('limit', 25, type=int)
        offset = request.args.get('offset', 0, type=int)
        start_date = request.args.get('start_date', '')
        end_date = request.args.get('end_date', '')
        relevance = request.args.get('relevance', '')

        if not city or not client_type:
            abort(400, "Cidade e tipo de cliente são obrigatórios.")

        params = []
        base_query = ""

        if client_type == 'cancelado':
            where_clauses = ["Cidade = ?", "Status_contrato = 'Inativo'", "Status_acesso = 'Desativado'"]
            params.append(city)
            add_date_range_filter(where_clauses, params, "Data_cancelamento", start_date, end_date)
            where_sql = "WHERE " + " AND ".join(where_clauses)
            base_query = f"SELECT Cliente, ID AS Contrato_ID, \"Data_ativa_o\", Data_cancelamento AS end_date FROM Contratos {where_sql}"
        elif client_type == 'negativado':
            where_cn_clauses = ["Cidade = ?", "Cidade NOT IN ('Caçapava', 'Jacareí', 'São José dos Campos')"]
            params_cn = [city]
            add_date_range_filter(where_cn_clauses, params_cn, "Data_negativa_o", start_date, end_date)
            where_cn = "WHERE " + " AND ".join(where_cn_clauses)

            where_c_clauses = ["Cidade = ?", "Status_contrato = 'Negativado'", "Cidade NOT IN ('Caçapava', 'Jacareí', 'São José dos Campos')"]
            params_c = [city]
            add_date_range_filter(where_c_clauses, params_c, "Data_cancelamento", start_date, end_date)
            where_c = "WHERE " + " AND ".join(where_c_clauses)

            base_query = f"""
                SELECT Cliente, ID AS Contrato_ID, Data_ativa_o, Data_negativa_o as end_date FROM Contratos_Negativacao {where_cn}
                UNION
                SELECT Cliente, ID AS Contrato_ID, Data_ativa_o, Data_cancelamento as end_date FROM Contratos {where_c}
            """
            params = params_cn + params_c
        else:
            abort(400, "Tipo de cliente inválido.")

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
        
        count_query = f"SELECT COUNT(*) FROM ({sub_query_with_relevance}) AS sub_rel {relevance_where_sql}"
        total_rows = conn.execute(count_query, tuple(params)).fetchone()[0]

        paginated_query = f"SELECT * FROM ({sub_query_with_relevance}) AS sub_rel {relevance_where_sql} ORDER BY sub_rel.end_date DESC LIMIT ? OFFSET ?"
        params.extend([limit, offset])

        data = conn.execute(paginated_query, tuple(params)).fetchall()

        return jsonify({"data": [dict(row) for row in data], "total_rows": total_rows})
    except sqlite3.Error as e:
        print(f"Erro ao buscar detalhes de clientes da cidade: {e}")
        return jsonify({"error": "Erro interno ao processar a solicitação."}), 500
    finally:
        if conn: conn.close()

@details_churn_bp.route('/neighborhood_clients')
def api_neighborhood_clients():
    conn = get_db()
    try:
        city = request.args.get('city')
        neighborhood = request.args.get('neighborhood')
        client_type = request.args.get('type')
        limit = request.args.get('limit', 25, type=int)
        offset = request.args.get('offset', 0, type=int)
        start_date = request.args.get('start_date', '')
        end_date = request.args.get('end_date', '')
        relevance = request.args.get('relevance', '')

        if not city or not neighborhood or not client_type:
            abort(400, "Cidade, bairro e tipo de cliente são obrigatórios.")

        params = []
        base_query = ""

        if client_type == 'cancelado':
            where_sql = "WHERE Cidade = ? AND Bairro = ? AND Status_contrato = 'Inativo' AND Status_acesso = 'Desativado'"
            params.extend([city, neighborhood])
            add_date_range_filter([where_sql], params, "Data_cancelamento", start_date, end_date) # Ajuste manual pois where_sql já é string
            
            # Reconstruindo para usar a função padrão corretamente se possível, mas aqui já concatenamos.
            # Ajuste rápido:
            if start_date: where_sql += " AND DATE(Data_cancelamento) >= ?"; params.append(start_date)
            if end_date: where_sql += " AND DATE(Data_cancelamento) <= ?"; params.append(end_date)

            base_query = f"SELECT Cliente, ID AS Contrato_ID, \"Data_ativa_o\", Data_cancelamento AS end_date FROM Contratos {where_sql}"
        
        elif client_type == 'negativado':
            where_cn = "WHERE Cidade = ? AND Bairro = ? AND Cidade NOT IN ('Caçapava', 'Jacareí', 'São José dos Campos')"
            params_cn = [city, neighborhood]
            if start_date: where_cn += " AND DATE(Data_negativa_o) >= ?"; params_cn.append(start_date)
            if end_date: where_cn += " AND DATE(Data_negativa_o) <= ?"; params_cn.append(end_date)

            where_c = "WHERE Cidade = ? AND Bairro = ? AND Status_contrato = 'Negativado' AND Cidade NOT IN ('Caçapava', 'Jacareí', 'São José dos Campos')"
            params_c = [city, neighborhood]
            if start_date: where_c += " AND DATE(Data_cancelamento) >= ?"; params_c.append(start_date)
            if end_date: where_c += " AND DATE(Data_cancelamento) <= ?"; params_c.append(end_date)

            base_query = f"""
                SELECT Cliente, ID AS Contrato_ID, Data_ativa_o, Data_negativa_o as end_date FROM Contratos_Negativacao {where_cn}
                UNION
                SELECT Cliente, ID AS Contrato_ID, Data_ativa_o, Data_cancelamento as end_date FROM Contratos {where_c}
            """
            params = params_cn + params_c
        else:
            abort(400, "Tipo de cliente inválido.")

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

        count_query = f"SELECT COUNT(*) FROM ({sub_query_with_relevance}) AS sub_rel {relevance_where_sql}"
        total_rows = conn.execute(count_query, tuple(params)).fetchone()[0]

        paginated_query = f"SELECT * FROM ({sub_query_with_relevance}) AS sub_rel {relevance_where_sql} ORDER BY sub_rel.end_date DESC LIMIT ? OFFSET ?"
        params.extend([limit, offset])

        data = conn.execute(paginated_query, tuple(params)).fetchall()

        return jsonify({"data": [dict(row) for row in data], "total_rows": total_rows})
    except sqlite3.Error as e:
        print(f"Erro ao buscar detalhes de clientes do bairro: {e}")
        return jsonify({"error": "Erro interno ao processar a solicitação."}), 500
    finally:
        if conn: conn.close()

@details_churn_bp.route('/equipment_clients')
def api_equipment_clients():
    conn = get_db()
    try:
        equipment_name = request.args.get('equipment_name')
        start_date = request.args.get('start_date', '')
        end_date = request.args.get('end_date', '')
        city = request.args.get('city', '')
        limit = request.args.get('limit', 25, type=int)
        offset = request.args.get('offset', 0, type=int)
        relevance = request.args.get('relevance', '')

        if not equipment_name:
            abort(400, "O nome do equipamento é obrigatório.")

        # --- 1. Busca Contratos Cancelados/Negativados com Filtros ---
        params_cancelados = []
        where_cancelados_list = ["Status_contrato = 'Inativo'", "Status_acesso = 'Desativado'"]
        add_date_range_filter(where_cancelados_list, params_cancelados, "Data_cancelamento", start_date, end_date)
        if city: where_cancelados_list.append("Cidade = ?"); params_cancelados.append(city)
        where_cancelados_sql = " AND ".join(where_cancelados_list)
        query_cancelados = f"SELECT ID, Cliente, Data_cancelamento, NULL AS Data_negativacao, Cidade, Data_ativa_o, Data_cancelamento AS end_date FROM Contratos WHERE {where_cancelados_sql}"

        params_negativados_cn = []
        where_negativados_cn_list = ["Cidade NOT IN ('Caçapava', 'Jacareí', 'São José dos Campos')"]
        add_date_range_filter(where_negativados_cn_list, params_negativados_cn, "Data_negativa_o", start_date, end_date)
        if city: where_negativados_cn_list.append("Cidade = ?"); params_negativados_cn.append(city)
        where_negativados_cn_sql = " AND ".join(where_negativados_cn_list)
        query_negativados_cn = f"SELECT ID, Cliente, NULL AS Data_cancelamento, Data_negativa_o AS Data_negativacao, Cidade, Data_ativa_o, Data_negativa_o AS end_date FROM Contratos_Negativacao WHERE {where_negativados_cn_sql}"

        params_negativados_c = []
        where_negativados_c_list = ["Status_contrato = 'Negativado'", "Cidade NOT IN ('Caçapava', 'Jacareí', 'São José dos Campos')"]
        add_date_range_filter(where_negativados_c_list, params_negativados_c, "Data_cancelamento", start_date, end_date)
        if city: where_negativados_c_list.append("Cidade = ?"); params_negativados_c.append(city)
        where_negativados_c_sql = " AND ".join(where_negativados_c_list)
        query_negativados_c = f"SELECT ID, Cliente, NULL AS Data_cancelamento, Data_cancelamento AS Data_negativacao, Cidade, Data_ativa_o, Data_cancelamento AS end_date FROM Contratos WHERE {where_negativados_c_sql}"

        # Executa as queries
        df_cancelados = pd.read_sql_query(query_cancelados, conn, params=tuple(params_cancelados))
        df_negativados_c = pd.read_sql_query(query_negativados_c, conn, params=tuple(params_negativados_c))
        df_negativados_cn = pd.DataFrame()
        try:
             df_negativados_cn = pd.read_sql_query(query_negativados_cn, conn, params=tuple(params_negativados_cn))
        except pd.io.sql.DatabaseError as e:
            if "no such table" not in str(e): raise e

        df_contracts = pd.concat([df_cancelados, df_negativados_c, df_negativados_cn], ignore_index=True).drop_duplicates(subset=['ID'])
        df_contracts['ID'] = df_contracts['ID'].astype(str).str.strip()

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

        if df_contracts.empty:
            return jsonify({"data": [], "total_rows": 0})

        # --- 2. Busca Equipamentos ---
        equipment_name_like = equipment_name.replace(' (Agrupado)', '') + '%' if ' (Agrupado)' in equipment_name else equipment_name
        query_equipment = "SELECT TRIM(ID_contrato) AS ID_contrato FROM Equipamento WHERE Descricao_produto LIKE ? AND Status_comodato = 'Baixa'"
        df_equipment = pd.read_sql_query(query_equipment, conn, params=(equipment_name_like,))
        df_equipment['ID_contrato'] = df_equipment['ID_contrato'].astype(str).str.strip()

        if df_equipment.empty:
            return jsonify({"data": [], "total_rows": 0})

        # --- 3. Join ---
        df_merged = pd.merge(df_contracts, df_equipment, left_on='ID', right_on='ID_contrato', how='inner')
        df_final = df_merged.sort_values(by=['Data_negativacao', 'Data_cancelamento'], ascending=False, na_position='last')
        total_rows = len(df_final)
        df_paginated = df_final.iloc[offset : offset + limit]

        data_list = []
        for _, row in df_paginated.iterrows():
            cancel_date_val = row['Data_cancelamento'] if pd.notna(row['Data_cancelamento']) else None
            neg_date_val = row['Data_negativacao'] if pd.notna(row['Data_negativacao']) else None
            permanencia_meses_val = int(row['permanencia_meses']) if pd.notna(row['permanencia_meses']) else None
            
            data_list.append({
                "Cliente": row['Cliente'],
                "Contrato_ID": row['ID'],
                "Data_cancelamento": cancel_date_val,
                "Data_negativacao": neg_date_val,
                "Cidade": row['Cidade'],
                "permanencia_meses": permanencia_meses_val
            })

        return jsonify({
            "data": data_list,
            "total_rows": total_rows
        })

    except sqlite3.Error as e:
        if "no such table" in str(e).lower():
             return jsonify({"error": "Uma das tabelas necessárias não foi encontrada."}), 500
        print(f"Erro SQLite ao buscar detalhes de clientes por equipamento: {e}")
        return jsonify({"error": "Erro interno no banco de dados."}), 500
    except Exception as e:
         print(f"Erro inesperado: {e}")
         traceback.print_exc() 
         return jsonify({"error": "Erro interno inesperado."}), 500
    finally:
        if conn: conn.close()
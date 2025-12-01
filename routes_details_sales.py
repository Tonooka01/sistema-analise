import pandas as pd
import sqlite3
import traceback
from flask import Blueprint, jsonify, request, abort
from utils_api import get_db

details_sales_bp = Blueprint('details_sales_bp', __name__)

@details_sales_bp.route('/seller_clients')
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

@details_sales_bp.route('/seller_activations')
def api_seller_activations():
    conn = get_db()
    try:
        seller_id = request.args.get('seller_id', type=int)
        client_type = request.args.get('type')
        city = request.args.get('city', '')
        year = request.args.get('year', '')
        month = request.args.get('month', '')
        limit = request.args.get('limit', 25, type=int)
        offset = request.args.get('offset', 0, type=int)

        if not seller_id or not client_type:
            abort(400, "ID do vendedor e tipo de cliente são obrigatórios.")

        where_contracts = ["C.Vendedor = ?"]
        params_contracts = [seller_id]
        if city: where_contracts.append("C.Cidade = ?"); params_contracts.append(city)
        if year: where_contracts.append("STRFTIME('%Y', C.Data_ativa_o) = ?"); params_contracts.append(year)
        if month: where_contracts.append("STRFTIME('%m', C.Data_ativa_o) = ?"); params_contracts.append(f'{int(month):02d}')
        
        where_contracts_sql_union = " AND ".join(where_contracts).replace("C.", "")

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
            df_contracts_all = pd.read_sql_query(query_base, conn, params=tuple(params_contracts * 2))
            df_contracts_all.sort_values(by='is_negativado_table', ascending=True, inplace=True)
            df_contracts = df_contracts_all.drop_duplicates(subset=['ID'], keep='first')

        except pd.io.sql.DatabaseError as e:
            if "no such table" in str(e).lower():
                print("Aviso: Tabela Contratos_Negativacao não encontrada. Usando apenas Contratos.")
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
        df_merged['is_negativado'] = (
            (df_merged['Status_contrato'] == 'Negativado') &
            (~df_merged['Cidade'].isin(['Caçapava', 'Jacareí', 'São José dos Campos']))
        )

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

        df_filtered = df_filtered.copy()
        
        df_filtered.loc[:, 'end_date'] = pd.NaT
        df_filtered.loc[:, 'permanencia_dias'] = pd.NA
        df_filtered.loc[:, 'permanencia_meses'] = pd.NA
        
        df_filtered.loc[:, 'Data_ativa_o'] = pd.to_datetime(df_filtered['Data_ativa_o'], errors='coerce')

        if client_type in ['cancelado', 'negativado']:
            if 'Data_cancelamento' in df_filtered.columns:
                 df_filtered.loc[:, 'end_date'] = df_filtered['Data_cancelamento']
            
            df_filtered.loc[:, 'end_date'] = pd.to_datetime(df_filtered['end_date'], errors='coerce')
            
            time_diff = (df_filtered['end_date'] - df_filtered['Data_ativa_o'])
            permanencia_dias_series = time_diff / pd.to_timedelta(1, 'D')
            permanencia_dias_numeric = pd.to_numeric(permanencia_dias_series, errors='coerce')
            permanencia_meses_series = (permanencia_dias_numeric / 30.44).round().astype('Int64')
            df_filtered.loc[:, 'permanencia_dias'] = permanencia_dias_numeric
            df_filtered.loc[:, 'permanencia_meses'] = permanencia_meses_series
        
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
        return jsonify({"error": "Erro interno ao processar a solicitação."}), 500
    except Exception as e:
        print(f"Erro inesperado ao buscar detalhes de ativação do vendedor: {e}")
        traceback.print_exc()
        return jsonify({"error": "Erro interno inesperado."}), 500
    finally:
        if conn: conn.close()
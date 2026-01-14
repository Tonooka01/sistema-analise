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
        year_param = request.args.get('year', '')
        month_param = request.args.get('month', '')
        limit = request.args.get('limit', 25, type=int)
        offset = request.args.get('offset', 0, type=int)

        if not seller_id or not client_type:
            abort(400, "ID do vendedor e tipo de cliente são obrigatórios.")

        # --- CORREÇÃO DE DATA ---
        # Garante que usamos apenas o número do mês/ano, mesmo se vier data completa
        year = year_param
        month = month_param
        try:
            if month_param and '-' in str(month_param):
                month = str(int(month_param.split('-')[1]))
            if year_param and '-' in str(year_param):
                year = str(int(year_param.split('-')[0]))
        except:
            pass # Se falhar, mantém o original (pode ser vazio)

        params = []
        base_query = ""

        if client_type == 'cancelado':
            where_sql = "WHERE Vendedor = ? AND Status_contrato = 'Inativo' AND Status_acesso = 'Desativado'"
            params.append(seller_id)
            if year: 
                where_sql += " AND STRFTIME('%Y', Data_cancelamento) = ?"
                params.append(year)
            if month: 
                where_sql += " AND STRFTIME('%m', Data_cancelamento) = ?"
                params.append(f'{int(month):02d}')
            
            base_query = f"""
                SELECT Cliente, ID AS Contrato_ID, Data_ativa_o, Data_cancelamento as end_date
                FROM Contratos {where_sql}
            """
        elif client_type == 'negativado':
            where_cn = "WHERE Vendedor = ? AND Cidade NOT IN ('Caçapava', 'Jacareí', 'São José dos Campos')"
            params_cn = [seller_id]
            if year: 
                where_cn += " AND STRFTIME('%Y', Data_negativa_o) = ?"
                params_cn.append(year)
            if month: 
                where_cn += " AND STRFTIME('%m', Data_negativa_o) = ?"
                params_cn.append(f'{int(month):02d}')

            where_c = "WHERE Vendedor = ? AND Status_contrato = 'Negativado' AND Cidade NOT IN ('Caçapava', 'Jacareí', 'São José dos Campos')"
            params_c = [seller_id]
            if year: 
                where_c += " AND STRFTIME('%Y', Data_cancelamento) = ?"
                params_c.append(year)
            if month: 
                where_c += " AND STRFTIME('%m', Data_cancelamento) = ?"
                params_c.append(f'{int(month):02d}')

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
        year_param = request.args.get('year', '')
        month_param = request.args.get('month', '')
        limit = request.args.get('limit', 25, type=int)
        offset = request.args.get('offset', 0, type=int)

        if not seller_id or not client_type:
            abort(400, "ID do vendedor e tipo de cliente são obrigatórios.")

        # --- CORREÇÃO DE DATA ---
        year = year_param
        month = month_param
        try:
            if month_param and '-' in str(month_param):
                month = str(int(month_param.split('-')[1]))
            if year_param and '-' in str(year_param):
                year = str(int(year_param.split('-')[0]))
        except:
            pass

        # --- DETECÇÃO DE COLUNAS OPCIONAIS (Evita erro 'no such column') ---
        cursor = conn.cursor()
        
        # Verifica colunas em Contratos
        try:
            cols_c = [row[1] for row in cursor.execute("PRAGMA table_info(Contratos)").fetchall()]
            plano_c = "Plano" if "Plano" in cols_c else "NULL"
            valor_c = "Valor" if "Valor" in cols_c else "NULL"
        except:
            plano_c = "NULL"; valor_c = "NULL"

        # Verifica colunas em Contratos_Negativacao (se existir)
        try:
            cols_cn = [row[1] for row in cursor.execute("PRAGMA table_info(Contratos_Negativacao)").fetchall()]
            plano_cn = "Plano" if "Plano" in cols_cn else "NULL"
            valor_cn = "Valor" if "Valor" in cols_cn else "NULL"
            # Negativacao tem Data_negativa_o
            has_cn_table = True
        except:
            plano_cn = "NULL"; valor_cn = "NULL"
            has_cn_table = False

        # --- Construção dos Filtros ---
        where_contracts = ["Vendedor = ?"]
        params_contracts = [seller_id]
        
        if city: 
            where_contracts.append("Cidade = ?")
            params_contracts.append(city)
        if year: 
            where_contracts.append("STRFTIME('%Y', Data_ativa_o) = ?")
            params_contracts.append(year)
        if month: 
            where_contracts.append("STRFTIME('%m', Data_ativa_o) = ?")
            params_contracts.append(f'{int(month):02d}')
        
        where_clause_str = " AND ".join(where_contracts)

        # --- Construção da Query UNION ---
        # 1. Parte Contratos
        query_parts = []
        
        query_parts.append(f"""
            SELECT 
                ID, Cliente, Data_ativa_o, Status_contrato, Data_cancelamento, 
                0 AS is_negativado_table, Cidade, 
                {plano_c} as Plano, {valor_c} as Valor
            FROM Contratos
            WHERE {where_clause_str}
        """)

        # 2. Parte Contratos_Negativacao (se existir)
        if has_cn_table:
            query_parts.append(f"""
                SELECT 
                    ID, Cliente, Data_ativa_o, 'Negativado' AS Status_contrato, Data_negativa_o AS Data_cancelamento, 
                    1 AS is_negativado_table, Cidade, 
                    {plano_cn} as Plano, {valor_cn} as Valor
                FROM Contratos_Negativacao
                WHERE {where_clause_str}
            """)
        
        # Junta tudo
        query_base = " UNION ".join(query_parts)
        
        # Parametros duplicados se houver UNION
        final_params = params_contracts * len(query_parts)

        # Executa no Pandas
        df_contracts_all = pd.read_sql_query(query_base, conn, params=tuple(final_params))

        if df_contracts_all.empty:
            return jsonify({"data": [], "total_rows": 0})

        # Remove duplicados (priorizando Negativado se existir nos dois)
        df_contracts_all.sort_values(by='is_negativado_table', ascending=True, inplace=True)
        df_contracts = df_contracts_all.drop_duplicates(subset=['ID'], keep='first')
        
        # --- Lógica de Filtro por Tipo de Cliente ---
        df_merged = df_contracts.copy()
        
        # Normaliza colunas booleanas
        df_merged['is_active'] = (df_merged['Status_contrato'] == 'Ativo')
        df_merged['is_cancelado'] = (df_merged['Status_contrato'].isin(['Inativo', 'Cancelado']))
        # Negativado: status Negativado E cidade válida
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

        # --- Cálculo de Permanência ---
        df_filtered = df_filtered.copy()
        
        # Inicializa colunas
        df_filtered['end_date'] = pd.NaT
        df_filtered['permanencia_meses'] = pd.NA
        
        # Converte Data de Ativação
        df_filtered['Data_ativa_o'] = pd.to_datetime(df_filtered['Data_ativa_o'], errors='coerce')

        # Se for cancelado ou negativado, processa a data de saída
        if client_type in ['cancelado', 'negativado']:
            # Na query UNION, mapeamos tanto Data_cancelamento quanto Data_negativa_o para a coluna 'Data_cancelamento'
            if 'Data_cancelamento' in df_filtered.columns:
                 df_filtered['end_date'] = pd.to_datetime(df_filtered['Data_cancelamento'], errors='coerce')
            
            # Calcula permanência apenas onde temos as duas datas
            mask_valid = df_filtered['end_date'].notna() & df_filtered['Data_ativa_o'].notna()
            
            if mask_valid.any():
                time_diff = (df_filtered.loc[mask_valid, 'end_date'] - df_filtered.loc[mask_valid, 'Data_ativa_o'])
                # Converte para dias e depois meses
                days = time_diff.dt.days
                df_filtered.loc[mask_valid, 'permanencia_meses'] = (days / 30.44).round().astype('Int64')
        
        # Paginação
        df_paginated = df_filtered.sort_values(by='Data_ativa_o', ascending=False).iloc[offset : offset + limit]
        
        data_list = []
        for _, row in df_paginated.iterrows():
            data_list.append({
                "Cliente": row['Cliente'],
                "Contrato_ID": row['ID'],
                "Data_ativa_o": row['Data_ativa_o'].strftime('%Y-%m-%d') if pd.notna(row['Data_ativa_o']) else None,
                "Status_contrato": row['Status_contrato'],
                "end_date": row['end_date'].strftime('%Y-%m-%d') if pd.notna(row['end_date']) else None,
                "permanencia_meses": int(row['permanencia_meses']) if pd.notna(row['permanencia_meses']) else None,
                "Cidade": row['Cidade'] if 'Cidade' in row else None,
                "Bairro": row['Bairro'] if 'Bairro' in row else None, # Bairro pode não vir na query simplificada, mas se precisar pode adicionar
                "Plano": row['Plano'] if 'Plano' in row else None,
                "Valor": row['Valor'] if 'Valor' in row else None
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
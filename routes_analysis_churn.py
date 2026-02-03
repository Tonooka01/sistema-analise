import pandas as pd
import sqlite3
import traceback
from flask import Blueprint, jsonify, request
from utils_api import get_db, parse_relevance_filter, add_date_range_filter

churn_bp = Blueprint('churn_bp', __name__)

# --- CTE FINANCEIRA ESTÁTICA ---
financial_cte_static = """
    FinancialStats AS (
        SELECT
            ID_Contrato_Recorrente,
            SUM(CASE WHEN Data_pagamento > Vencimento THEN 1 ELSE 0 END) AS Atrasos_Pagos,
            SUM(CASE WHEN Status = 'A receber' AND Vencimento < date('now') THEN 1 ELSE 0 END) AS Faturas_Nao_Pagas,
            COUNT(*) AS Total_Faturas,
            SUM(CASE WHEN Data_pagamento IS NOT NULL THEN 1 ELSE 0 END) AS Faturas_Pagas,
            SUM(CASE WHEN Status = 'Cancelado' THEN 1 ELSE 0 END) AS Faturas_Canceladas,
            AVG(
                CASE 
                    WHEN Data_pagamento IS NOT NULL 
                    THEN JULIANDAY(Data_pagamento) - JULIANDAY(Vencimento) 
                    ELSE NULL 
                END
            ) AS Media_Atraso
        FROM Contas_a_Receber
        GROUP BY ID_Contrato_Recorrente
    )
"""

def apply_chart_filters(where_clauses, params, filter_col, filter_val):
    if not filter_col or not filter_val: return
    filter_val = filter_val.strip()
    if filter_col == 'motivo':
        if filter_val == 'Não Informado': where_clauses.append("(Motivo_cancelamento IS NULL OR TRIM(Motivo_cancelamento) = 'Não Informado')")
        else: where_clauses.append("UPPER(TRIM(Motivo_cancelamento)) = UPPER(TRIM(?))"); params.append(filter_val)
    elif filter_col == 'obs':
        if filter_val == 'Não Informado': where_clauses.append("(Obs_cancelamento IS NULL OR TRIM(Obs_cancelamento) = 'Não Informado')")
        else: where_clauses.append("UPPER(TRIM(Obs_cancelamento)) = UPPER(TRIM(?))"); params.append(filter_val)
    elif filter_col == 'financeiro':
        if filter_val == 'Em dia / Adiantado': where_clauses.append("Media_Atraso <= 0")
        elif filter_val == 'Pagamento Atrasado': where_clauses.append("Media_Atraso BETWEEN 1 AND 30")
        elif filter_val == 'Inadimplente (>30d)': where_clauses.append("Media_Atraso > 30")
        elif filter_val == 'Sem Histórico': where_clauses.append("Media_Atraso IS NULL")

# --- 1. ROTA DE PERMANÊNCIA REAL ---
@churn_bp.route('/real_permanence')
def api_real_permanence():
    conn = get_db()
    try:
        search_term = request.args.get('search_term', '').strip()
        limit = request.args.get('limit', 50, type=int)
        offset = request.args.get('offset', 0, type=int)
        
        start_date = request.args.get('start_date', '')
        end_date = request.args.get('end_date', '')
        relevance = request.args.get('relevance', '')
        relevance_real = request.args.get('relevance_real', '')
        status_contrato = request.args.get('status_contrato')
        status_acesso = request.args.get('status_acesso')

        cursor = conn.cursor()
        existing_tables = [row[0] for row in cursor.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
        has_equipamento = 'Equipamento' in existing_tables
        has_vendedores = 'Vendedores' in existing_tables
        has_negativacao = 'Contratos_Negativacao' in existing_tables
        
        contract_columns = [row[1] for row in cursor.execute("PRAGMA table_info(Contratos)").fetchall()]
        has_col_vendedor = 'Vendedor' in contract_columns

        col_status_equip = 'Status' 
        col_desc_equip = 'Descricao_produto' 
        col_data_equip = 'Data' 

        if has_equipamento:
            equip_columns = [row[1] for row in cursor.execute("PRAGMA table_info(Equipamento)").fetchall()]
            for cand in ['Status_comodato', 'Status', 'STATUS', 'status']:
                if cand in equip_columns: col_status_equip = cand; break
            for cand in ['Descricao_produto', 'Descri_o_produto', 'Produto', 'PRODUTO', 'produto', 'Equipamento']:
                if cand in equip_columns: col_desc_equip = cand; break
            for cand in ['Data', 'DATA', 'data', 'Data_movimento']:
                if cand in equip_columns: col_data_equip = cand; break

        contract_where_clauses = []
        contract_params = []

        if search_term:
            contract_where_clauses.append("(Cliente LIKE ? OR Cidade LIKE ?)")
            contract_params.extend([f'%{search_term}%', f'%{search_term}%'])

        if start_date:
            contract_where_clauses.append("DATE(Data_ativa_o) >= ?")
            contract_params.append(start_date)
        if end_date:
            contract_where_clauses.append("DATE(Data_ativa_o) <= ?")
            contract_params.append(end_date)

        if status_contrato:
            status_list = status_contrato.split(',')
            placeholders = ','.join(['?'] * len(status_list))
            contract_where_clauses.append(f"Status_contrato IN ({placeholders})")
            contract_params.extend(status_list)

        if status_acesso:
            acesso_list = status_acesso.split(',')
            placeholders = ','.join(['?'] * len(acesso_list))
            contract_where_clauses.append(f"Status_acesso IN ({placeholders})")
            contract_params.extend(acesso_list)

        cities_to_exclude = ['Caçapava', 'Jacareí', 'São José dos Campos']
        placeholders_excl = ','.join(['?'] * len(cities_to_exclude))
        contract_where_clauses.append(f"Cidade NOT IN ({placeholders_excl})")
        contract_params.extend(cities_to_exclude)

        contract_where_sql = " WHERE " + " AND ".join(contract_where_clauses) if contract_where_clauses else ""

        # --- CONSTRUÇÃO DAS CTES ---
        cols_contratos = "ID, Cliente, Cidade, Bairro, Data_ativa_o, Data_cancelamento, Status_contrato, Status_acesso"
        if has_col_vendedor: cols_contratos += ", Vendedor"
        else: cols_contratos += ", NULL AS Vendedor"

        cols_negativacao = "ID, Cliente, Cidade, Bairro, Data_ativa_o, Data_negativa_o AS Data_cancelamento, 'Negativado' AS Status_contrato, 'Desativado' AS Status_acesso"
        if has_col_vendedor: cols_negativacao += ", Vendedor"
        else: cols_negativacao += ", NULL AS Vendedor"

        if has_negativacao:
            cte_all_contracts = f"""
            AllContractsRaw AS (
                SELECT {cols_contratos} FROM Contratos
                UNION
                SELECT {cols_negativacao} FROM Contratos_Negativacao
            ),
            AllContracts AS (
                SELECT * FROM AllContractsRaw {contract_where_sql}
            )
            """
        else:
            cte_all_contracts = f"""
            AllContracts AS (
                SELECT {cols_contratos} FROM Contratos {contract_where_sql}
            )
            """

        cte_financial = """
            FinancialStats AS (
                SELECT
                    ID_Contrato_Recorrente,
                    SUM(CASE WHEN Data_pagamento > Vencimento THEN 1 ELSE 0 END) AS Atrasos_Pagos,
                    SUM(CASE WHEN Status = 'A receber' AND Vencimento < date('now') THEN 1 ELSE 0 END) AS Faturas_Nao_Pagas,
                    COUNT(*) AS Total_Faturas,
                    SUM(CASE WHEN Data_pagamento IS NOT NULL THEN 1 ELSE 0 END) AS Faturas_Pagas,
                    SUM(CASE WHEN Status = 'Cancelado' THEN 1 ELSE 0 END) AS Faturas_Canceladas,
                    AVG(CASE WHEN Data_pagamento IS NOT NULL THEN JULIANDAY(Data_pagamento) - JULIANDAY(Vencimento) ELSE NULL END) AS Media_Atraso
                FROM Contas_a_Receber
                WHERE ID_Contrato_Recorrente IN (SELECT ID FROM AllContracts)
                GROUP BY ID_Contrato_Recorrente
            )
        """

        if has_equipamento:
            cte_equipment = f"""
            ActiveEquipments AS (
                SELECT TRIM(ID_contrato) as ID_Contrato, GROUP_CONCAT({col_desc_equip}, ', ') as Equipamentos_Ativos
                FROM Equipamento 
                WHERE UPPER({col_status_equip}) = 'EMPRESTADO' AND TRIM(ID_contrato) IN (SELECT ID FROM AllContracts)
                GROUP BY ID_Contrato
            ),
            LastReturnedEquipments AS (
                SELECT ID_Contrato, {col_desc_equip} as Equipamento_Devolvido
                FROM (
                    SELECT TRIM(ID_contrato) as ID_Contrato, {col_desc_equip},
                        ROW_NUMBER() OVER (PARTITION BY TRIM(ID_contrato) ORDER BY {col_data_equip} DESC) as rn
                    FROM Equipamento
                    WHERE UPPER({col_status_equip}) IN ('BAIXA', 'DEVOLVIDO') AND TRIM(ID_contrato) IN (SELECT ID FROM AllContracts)
                ) WHERE rn = 1
            )"""
            equipment_joins = "LEFT JOIN ActiveEquipments AE ON C.ID = AE.ID_Contrato LEFT JOIN LastReturnedEquipments LRE ON C.ID = LRE.ID_Contrato"
            equipment_select = "COALESCE(AE.Equipamentos_Ativos, LRE.Equipamento_Devolvido, 'Nenhum') AS Equipamento_Comodato,"
        else:
            cte_equipment = "ActiveEquipments AS (SELECT 1 WHERE 0), LastReturnedEquipments AS (SELECT 1 WHERE 0)"
            equipment_joins = ""
            equipment_select = "'Nenhum' AS Equipamento_Comodato,"

        if has_vendedores:
            cte_seller = "SellerInfo AS (SELECT ID, Vendedor FROM Vendedores)"
            join_seller = "LEFT JOIN SellerInfo S ON C.Vendedor = S.ID"
            seller_select = "COALESCE(S.Vendedor, 'N/A') AS Vendedor_Nome,"
        else:
            cte_seller = "SellerInfo AS (SELECT 1 WHERE 0)"
            join_seller = ""
            seller_select = "'N/A' AS Vendedor_Nome,"

        base_query = f"""
            WITH 
            {cte_all_contracts},
            {cte_financial},
            {cte_equipment},
            {cte_seller},
            JoinedData AS (
                SELECT
                    C.ID AS Contrato_ID,
                    C.Cliente,
                    C.Vendedor AS Vendedor_ID,
                    {seller_select}
                    C.Cidade,
                    C.Bairro,
                    C.Data_ativa_o AS data_ativacao,
                    C.Data_cancelamento,
                    C.Status_contrato,
                    C.Status_acesso,
                    
                    COALESCE(FS.Total_Faturas, 0) AS Total_Faturas,
                    COALESCE(FS.Faturas_Pagas, 0) AS Faturas_Pagas,
                    COALESCE(FS.Faturas_Canceladas, 0) AS Faturas_Canceladas,
                    COALESCE(FS.Faturas_Nao_Pagas, 0) AS Faturas_Nao_Pagas,
                    COALESCE(FS.Atrasos_Pagos, 0) AS Atrasos_Pagos,
                    FS.Media_Atraso,
                    
                    {equipment_select}
                    
                    COALESCE(FS.Faturas_Pagas, 0) AS Permanencia_Paga,
                    
                    CASE 
                        WHEN C.Data_ativa_o IS NOT NULL THEN
                            CAST(ROUND((JULIANDAY(COALESCE(C.Data_cancelamento, DATE('now'))) - JULIANDAY(C.Data_ativa_o)) / 30.44) AS INTEGER)
                        ELSE 0
                    END AS Permanencia_Real_Calendario

                FROM AllContracts C
                LEFT JOIN FinancialStats FS ON C.ID = FS.ID_Contrato_Recorrente
                {equipment_joins}
                {join_seller}
            )
        """
        
        final_where_clauses = []
        final_params = [] 

        min_months, max_months = parse_relevance_filter(relevance)
        if min_months is not None:
            final_where_clauses.append("Permanencia_Paga >= ?")
            final_params.append(min_months)
        if max_months is not None:
            final_where_clauses.append("Permanencia_Paga <= ?")
            final_params.append(max_months)

        min_months_real, max_months_real = parse_relevance_filter(relevance_real)
        if min_months_real is not None:
            final_where_clauses.append("Permanencia_Real_Calendario >= ?")
            final_params.append(min_months_real)
        if max_months_real is not None:
            final_where_clauses.append("Permanencia_Real_Calendario <= ?")
            final_params.append(max_months_real)

        final_where_sql = " WHERE " + " AND ".join(final_where_clauses) if final_where_clauses else ""

        params_charts = []
        if search_term: params_charts.extend([f'%{search_term}%', f'%{search_term}%'])
        if start_date: params_charts.append(start_date)
        if end_date: params_charts.append(end_date)
        if status_contrato: params_charts.extend(status_contrato.split(','))
        if status_acesso: params_charts.extend(status_acesso.split(','))
        
        where_clauses_charts = []
        if search_term: where_clauses_charts.append("(JD.Cliente LIKE ? OR JD.Cidade LIKE ?)")
        if start_date: where_clauses_charts.append("DATE(JD.data_ativacao) >= ?")
        if end_date: where_clauses_charts.append("DATE(JD.data_ativacao) <= ?")
        if status_contrato: 
            placeholders = ','.join(['?'] * len(status_contrato.split(',')))
            where_clauses_charts.append(f"JD.Status_contrato IN ({placeholders})")
        if status_acesso: 
            placeholders = ','.join(['?'] * len(status_acesso.split(',')))
            where_clauses_charts.append(f"JD.Status_acesso IN ({placeholders})")
            
        where_sql_charts = " WHERE " + " AND ".join(where_clauses_charts) if where_clauses_charts else ""

        chart_paga_query = f"{base_query} SELECT CASE WHEN Permanencia_Paga <= 6 THEN '0-6' WHEN Permanencia_Paga BETWEEN 7 AND 12 THEN '7-12' WHEN Permanencia_Paga BETWEEN 13 AND 18 THEN '13-18' WHEN Permanencia_Paga BETWEEN 19 AND 25 THEN '19-25' WHEN Permanencia_Paga BETWEEN 26 AND 30 THEN '25-30' ELSE '31+' END as Faixa, COUNT(*) as Count FROM JoinedData AS JD {where_sql_charts} GROUP BY Faixa"
        chart_real_query = f"{base_query} SELECT CASE WHEN Permanencia_Real_Calendario <= 6 THEN '0-6' WHEN Permanencia_Real_Calendario BETWEEN 7 AND 12 THEN '7-12' WHEN Permanencia_Real_Calendario BETWEEN 13 AND 18 THEN '13-18' WHEN Permanencia_Real_Calendario BETWEEN 19 AND 25 THEN '19-25' WHEN Permanencia_Real_Calendario BETWEEN 26 AND 30 THEN '25-30' ELSE '31+' END as Faixa, COUNT(*) as Count FROM JoinedData AS JD {where_sql_charts} GROUP BY Faixa"

        city_clauses = list(where_clauses_charts)
        city_clauses.append("JD.Cidade IS NOT NULL AND TRIM(JD.Cidade) != ''")
        city_where_sql = " WHERE " + " AND ".join(city_clauses)
        chart_city_query = f"{base_query} SELECT Cidade, CASE WHEN Permanencia_Paga <= 6 THEN '0-6' WHEN Permanencia_Paga BETWEEN 7 AND 12 THEN '7-12' WHEN Permanencia_Paga BETWEEN 13 AND 18 THEN '13-18' WHEN Permanencia_Paga BETWEEN 19 AND 25 THEN '19-25' WHEN Permanencia_Paga BETWEEN 26 AND 30 THEN '25-30' ELSE '31+' END as Faixa, COUNT(*) as Count FROM JoinedData AS JD {city_where_sql} GROUP BY Cidade, Faixa"

        full_chart_params = contract_params + params_charts
        chart_paga_data = conn.execute(chart_paga_query, tuple(full_chart_params)).fetchall()
        chart_real_data = conn.execute(chart_real_query, tuple(full_chart_params)).fetchall()
        chart_city_data = conn.execute(chart_city_query, tuple(full_chart_params)).fetchall()

        all_params_table = contract_params + final_params
        count_query = f"{base_query} SELECT COUNT(*) FROM JoinedData {final_where_sql}"
        total_rows = conn.execute(count_query, tuple(all_params_table)).fetchone()[0]

        data_query = f"{base_query} SELECT * FROM JoinedData {final_where_sql} ORDER BY Permanencia_Paga DESC, Cliente LIMIT ? OFFSET ?"
        data_params = all_params_table + [limit, offset]
        data = conn.execute(data_query, tuple(data_params)).fetchall()

        return jsonify({
            "data": [dict(row) for row in data],
            "total_rows": total_rows,
            "charts": {
                "paga_distribution": [dict(row) for row in chart_paga_data],
                "real_distribution": [dict(row) for row in chart_real_data],
                "city_distribution": [dict(row) for row in chart_city_data]
            }
        })

    except sqlite3.Error as e:
        traceback.print_exc()
        return jsonify({"error": f"Erro interno ao processar análise. Detalhe: {e}"}), 500
    finally:
        if conn: conn.close()

# --- 2. ROTA DE CANCELAMENTO ---
@churn_bp.route('/cancellations')
def api_cancellation_analysis():
    conn = get_db()
    try:
        search_term = request.args.get('search_term', '').strip()
        limit = request.args.get('limit', 50, type=int)
        offset = request.args.get('offset', 0, type=int)
        relevance = request.args.get('relevance', '')
        sort_order = request.args.get('sort_order', '') 
        start_date = request.args.get('start_date', '')
        end_date = request.args.get('end_date', '')
        chart_filter_col = request.args.get('filter_column', '')
        chart_filter_val = request.args.get('filter_value', '').strip()

        params = []
        where_clauses = []
        if search_term:
            where_clauses.append("Cliente LIKE ?")
            params.append(f'%{search_term}%')
        min_months, max_months = parse_relevance_filter(relevance)
        if min_months is not None:
            where_clauses.append("permanencia_meses >= ?")
            params.append(min_months)
        if max_months is not None:
            where_clauses.append("permanencia_meses <= ?")
            params.append(max_months)
            
        date_filter_contratos = ""
        date_params_contratos = []
        date_where_list_c = []
        add_date_range_filter(date_where_list_c, date_params_contratos, "Data_cancelamento", start_date, end_date)
        if date_where_list_c:
            date_filter_contratos = " AND " + " AND ".join(date_where_list_c)
            
        date_filter_negativacao = ""
        date_params_negativacao = []
        date_where_list_n = []
        add_date_range_filter(date_where_list_n, date_params_negativacao, "Data_negativa_o", start_date, end_date)
        if date_where_list_n:
            date_filter_negativacao = " AND " + " AND ".join(date_where_list_n)

        final_params = date_params_contratos + date_params_negativacao + params 
        
        base_cte_logic = f"""
            WITH {financial_cte_static},
            RelevantTickets AS (
                 SELECT DISTINCT Cliente FROM (
                     SELECT Cliente FROM Atendimentos WHERE Assunto IN ('MANUTENÇÃO DE FIBRA', 'VISITA TECNICA')
                     UNION ALL
                     SELECT Cliente FROM OS WHERE Assunto IN ('MANUTENÇÃO DE FIBRA', 'VISITA TECNICA')
                 )
            ),
            AllCancellations AS (
                SELECT Cliente, ID AS Contrato_ID, Data_ativa_o, Data_cancelamento, Motivo_cancelamento, Obs_cancelamento
                FROM Contratos 
                WHERE Status_contrato = 'Inativo' AND Status_acesso = 'Desativado' {date_filter_contratos}
                UNION ALL
                SELECT Cliente, ID AS Contrato_ID, Data_ativa_o, Data_negativa_o AS Data_cancelamento, Motivo_cancelamento, Obs_cancelamento
                FROM Contratos_Negativacao 
                WHERE Status_contrato = 'Inativo' AND Status_acesso = 'Desativado' {date_filter_negativacao}
            ),
            BaseData AS (
                SELECT 
                    AC.Cliente, AC.Contrato_ID, 
                    COALESCE(AC.Motivo_cancelamento, 'Não Informado') AS Motivo_cancelamento,
                    COALESCE(AC.Obs_cancelamento, 'Não Informado') AS Obs_cancelamento,
                    AC.Data_cancelamento, 
                    AC.Data_ativa_o, -- ADICIONADO PARA EVITAR N/A NA TABELA
                    CASE WHEN RT.Cliente IS NOT NULL THEN 'Sim' ELSE 'Não' END AS Teve_Contato_Relevante,
                    CASE WHEN AC.Data_ativa_o IS NOT NULL AND AC.Data_cancelamento IS NOT NULL 
                          THEN CAST(ROUND((JULIANDAY(AC.Data_cancelamento) - JULIANDAY(AC.Data_ativa_o)) / 30.44) AS INTEGER) 
                          ELSE NULL 
                    END AS permanencia_meses
                FROM AllCancellations AC
                LEFT JOIN RelevantTickets RT ON AC.Cliente = RT.Cliente
            ),
            FinalView AS (
                SELECT 
                    BaseData.*,
                    COALESCE(FS.Atrasos_Pagos, 0) AS Atrasos_Pagos,
                    COALESCE(FS.Faturas_Nao_Pagas, 0) AS Faturas_Nao_Pagas,
                    COALESCE(FS.Total_Faturas, 0) AS Total_Faturas,
                    FS.Media_Atraso
                FROM BaseData
                LEFT JOIN FinancialStats FS ON BaseData.Contrato_ID = FS.ID_Contrato_Recorrente
            )
        """

        where_clauses_table = list(where_clauses)
        params_table = list(final_params)
        apply_chart_filters(where_clauses_table, params_table, chart_filter_col, chart_filter_val)
        where_sql_table = " WHERE " + " AND ".join(where_clauses_table) if where_clauses_table else ""

        count_query = f"{base_cte_logic} SELECT COUNT(*) FROM FinalView {where_sql_table}"
        total_rows = conn.execute(count_query, tuple(params_table)).fetchone()[0]

        order_by = "ORDER BY Cliente, Contrato_ID"
        if sort_order == 'asc': order_by = "ORDER BY permanencia_meses ASC, Cliente"
        elif sort_order == 'desc': order_by = "ORDER BY permanencia_meses DESC, Cliente"

        paginated_query = f"{base_cte_logic} SELECT * FROM FinalView {where_sql_table} {order_by} LIMIT ? OFFSET ?"
        params_table_paginated = params_table + [limit, offset]
        data = conn.execute(paginated_query, tuple(params_table_paginated)).fetchall()

        where_sql_charts = " WHERE " + " AND ".join(where_clauses) if where_clauses else ""
        
        chart_motivo_query = f"{base_cte_logic} SELECT Motivo_cancelamento, COUNT(*) as Count FROM FinalView {where_sql_charts} GROUP BY Motivo_cancelamento ORDER BY Count DESC"
        chart_motivo_data = conn.execute(chart_motivo_query, tuple(final_params)).fetchall()

        chart_obs_query = f"{base_cte_logic} SELECT Obs_cancelamento, COUNT(*) as Count FROM FinalView {where_sql_charts} GROUP BY Obs_cancelamento ORDER BY Count DESC"
        chart_obs_data = conn.execute(chart_obs_query, tuple(final_params)).fetchall()

        chart_finance_query = f"""
            {base_cte_logic}
            SELECT 
                CASE
                    WHEN Media_Atraso <= 0 THEN 'Em dia / Adiantado'
                    WHEN Media_Atraso BETWEEN 1 AND 30 THEN 'Pagamento Atrasado'
                    WHEN Media_Atraso > 30 THEN 'Inadimplente (>30d)'
                    ELSE 'Sem Histórico'
                END AS Status_Pagamento,
                COUNT(*) as Count 
            FROM FinalView {where_sql_charts} 
            GROUP BY Status_Pagamento 
            ORDER BY Count DESC
        """
        chart_finance_data = conn.execute(chart_finance_query, tuple(final_params)).fetchall()

        return jsonify({
            "data": [dict(row) for row in data],
            "total_rows": total_rows,
            "charts": {
                "motivo": [dict(row) for row in chart_motivo_data],
                "obs": [dict(row) for row in chart_obs_data],
                "financeiro": [dict(row) for row in chart_finance_data]
            }
        })

    except sqlite3.Error as e:
        print(f"Erro na base de dados na análise de cancelamento: {e}")
        traceback.print_exc()
        return jsonify({"error": f"Erro interno ao processar a análise de cancelamento. Detalhe: {e}"}), 500
    finally:
        if conn: conn.close()

# --- 3. ROTA DE NEGATIVAÇÃO ---
@churn_bp.route('/negativacao')
def api_negativacao_analysis():
    conn = get_db()
    try:
        search_term = request.args.get('search_term', '').strip()
        limit = request.args.get('limit', 50, type=int)
        offset = request.args.get('offset', 0, type=int)
        relevance = request.args.get('relevance', '')
        sort_order = request.args.get('sort_order', '')
        start_date = request.args.get('start_date', '')
        end_date = request.args.get('end_date', '')
        chart_filter_col = request.args.get('filter_column', '')
        chart_filter_val = request.args.get('filter_value', '').strip()

        params_neg = []
        where_date_neg = []
        add_date_range_filter(where_date_neg, params_neg, "Data_negativa_o", start_date, end_date)
        sql_date_neg = " AND " + " AND ".join(where_date_neg) if where_date_neg else ""
        
        params_canc = []
        where_date_canc = []
        add_date_range_filter(where_date_canc, params_canc, "Data_cancelamento", start_date, end_date)
        sql_date_canc = " AND " + " AND ".join(where_date_canc) if where_date_canc else ""

        base_cte_logic = f"""
            WITH {financial_cte_static},
            RelevantTickets AS (
                SELECT DISTINCT Cliente FROM (
                    SELECT Cliente FROM Atendimentos WHERE Assunto IN ('MANUTENÇÃO DE FIBRA', 'VISITA TECNICA')
                    UNION ALL
                    SELECT Cliente FROM OS WHERE Assunto IN ('MANUTENÇÃO DE FIBRA', 'VISITA TECNICA')
                )
            ),
            AllNegativados AS (
                SELECT Cliente, ID, Cidade, Data_ativa_o, Data_negativa_o AS end_date
                FROM Contratos_Negativacao WHERE Cidade NOT IN ('Caçapava', 'Jacareí', 'São José dos Campos') {sql_date_neg}
                UNION
                SELECT Cliente, ID, Cidade, Data_ativa_o, Data_cancelamento AS end_date
                FROM Contratos WHERE Status_contrato = 'Negativado' AND Cidade NOT IN ('Caçapava', 'Jacareí', 'São José dos Campos') {sql_date_canc}
            ),
            BaseData AS (
                SELECT
                    AN.Cliente,
                    AN.ID AS Contrato_ID,
                    AN.end_date,
                    AN.Data_ativa_o, -- ADICIONADO PARA EVITAR N/A NA TABELA
                    CASE WHEN RT.Cliente IS NOT NULL THEN 'Sim' ELSE 'Não' END AS Teve_Contato_Relevante,
                    CASE
                        WHEN AN.Data_ativa_o IS NOT NULL AND AN.end_date IS NOT NULL
                        THEN CAST(ROUND((JULIANDAY(AN.end_date) - JULIANDAY(AN.Data_ativa_o)) / 30.44) AS INTEGER)
                        ELSE NULL
                    END AS permanencia_meses
                FROM AllNegativados AN
                LEFT JOIN RelevantTickets RT ON AN.Cliente = RT.Cliente
            ),
            FinalView AS (
                SELECT 
                    BaseData.*,
                    COALESCE(FS.Atrasos_Pagos, 0) AS Atrasos_Pagos,
                    COALESCE(FS.Faturas_Nao_Pagas, 0) AS Faturas_Nao_Pagas,
                    COALESCE(FS.Total_Faturas, 0) AS Total_Faturas,
                    FS.Media_Atraso
                FROM BaseData
                LEFT JOIN FinancialStats FS ON BaseData.Contrato_ID = FS.ID_Contrato_Recorrente
            )
        """

        final_params = params_neg + params_canc

        where_clauses = []
        if search_term:
            where_clauses.append("Cliente LIKE ?")
            final_params.append(f'%{search_term}%')
        min_months, max_months = parse_relevance_filter(relevance)
        if min_months is not None:
            where_clauses.append("permanencia_meses >= ?")
            final_params.append(min_months)
        if max_months is not None:
            where_clauses.append("permanencia_meses <= ?")
            final_params.append(max_months)
        
        where_clauses_table = list(where_clauses)
        params_table = list(final_params)
        apply_chart_filters(where_clauses_table, params_table, chart_filter_col, chart_filter_val)
        where_sql_table = " WHERE " + " AND ".join(where_clauses_table) if where_clauses_table else ""

        count_query = f"{base_cte_logic} SELECT COUNT(*) FROM FinalView {where_sql_table}"
        total_rows = conn.execute(count_query, tuple(params_table)).fetchone()[0]

        order_by = "ORDER BY Cliente, Contrato_ID"
        if sort_order == 'asc': order_by = "ORDER BY permanencia_meses ASC, Cliente"
        elif sort_order == 'desc': order_by = "ORDER BY permanencia_meses DESC, Cliente"

        paginated_query = f"{base_cte_logic} SELECT * FROM FinalView {where_sql_table} {order_by} LIMIT ? OFFSET ?"
        params_table_paginated = params_table + [limit, offset]
        data = conn.execute(paginated_query, tuple(params_table_paginated)).fetchall()

        where_sql_charts = " WHERE " + " AND ".join(where_clauses) if where_clauses else ""
        chart_finance_query = f"""
            {base_cte_logic}
            SELECT 
                CASE
                    WHEN Media_Atraso <= 0 THEN 'Em dia / Adiantado'
                    WHEN Media_Atraso BETWEEN 1 AND 30 THEN 'Pagamento Atrasado'
                    WHEN Media_Atraso > 30 THEN 'Inadimplente (>30d)'
                    ELSE 'Sem Histórico'
                END AS Status_Pagamento,
                COUNT(*) as Count 
            FROM FinalView {where_sql_charts} 
            GROUP BY Status_Pagamento 
            ORDER BY Count DESC
        """
        chart_finance_data = conn.execute(chart_finance_query, tuple(final_params)).fetchall()

        return jsonify({
            "data": [dict(row) for row in data], 
            "total_rows": total_rows,
            "charts": {
                "financeiro": [dict(row) for row in chart_finance_data]
            }
        })

    except sqlite3.Error as e:
        if "no such table" in str(e).lower():
            return jsonify({"error": "A tabela 'Contratos_Negativacao' não foi encontrada."}), 500
        print(f"Erro na base de dados na análise de negativação: {e}")
        return jsonify({"error": f"Erro interno ao processar a análise. Detalhe: {e}"}), 500
    finally:
        if conn: conn.close()

# --- 4. ROTA DE COORTE (RETENÇÃO) ---
@churn_bp.route('/cohort')
def api_cohort_analysis():
    conn = get_db()
    fallback_filters = {"cities": [], "years": []}
    
    try:
        city = request.args.get('city', '')
        start_date = request.args.get('start_date', '')
        end_date = request.args.get('end_date', '')

        try:
            cities_query = """
                SELECT DISTINCT Cidade FROM (
                    SELECT Cidade FROM Contratos WHERE Cidade IS NOT NULL AND TRIM(Cidade) != ''
                    UNION
                    SELECT Cidade FROM Contratos_Negativacao WHERE Cidade IS NOT NULL AND TRIM(Cidade) != ''
                ) WHERE Cidade IS NOT NULL ORDER BY Cidade
            """
            cities_data = conn.execute(cities_query).fetchall()
            fallback_filters["cities"] = [row[0] for row in cities_data if row[0]]
        except sqlite3.Error:
            try:
                cities_query_fallback = "SELECT DISTINCT Cidade FROM Contratos WHERE Cidade IS NOT NULL AND TRIM(Cidade) != '' ORDER BY Cidade"
                cities_data = conn.execute(cities_query_fallback).fetchall()
                fallback_filters["cities"] = [row[0] for row in cities_data if row[0]]
            except sqlite3.Error:
                pass
                
        try:
            years_query = """
                SELECT DISTINCT STRFTIME('%Y', Data_ativa_o) AS Year FROM Contratos WHERE Data_ativa_o IS NOT NULL
                UNION
                SELECT DISTINCT STRFTIME('%Y', Data_ativa_o) AS Year FROM Contratos_Negativacao WHERE Data_ativa_o IS NOT NULL
                ORDER BY Year DESC
            """
            years_data = conn.execute(years_query).fetchall()
            fallback_filters["years"] = [row[0] for row in years_data if row[0]]
        except sqlite3.Error:
            try:
                years_query_fallback = "SELECT DISTINCT STRFTIME('%Y', Data_ativa_o) AS Year FROM Contratos WHERE Data_ativa_o IS NOT NULL ORDER BY Year DESC"
                years_data = conn.execute(years_query_fallback).fetchall()
                fallback_filters["years"] = [row[0] for row in years_data if row[0]]
            except sqlite3.Error:
                 pass

        where_clauses = ["C.Data_ativa_o IS NOT NULL"]
        params = []
        if city:
            where_clauses.append("C.Cidade = ?")
            params.append(city)
        add_date_range_filter(where_clauses, params, "C.Data_ativa_o", start_date, end_date)
        
        where_sql = " AND ".join(where_clauses)

        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='Contratos_Negativacao';")
        negativacao_table_exists = cursor.fetchone() is not None

        cast_as_int_c = "CAST(TRIM(ID) AS INTEGER)"
        cast_as_int_cn = "CAST(TRIM(ID) AS INTEGER)"
        cast_as_int_car = "CAST(TRIM(ID_Contrato_Recorrente) AS INTEGER)"

        if negativacao_table_exists:
            all_contracts_cte = f"""
                WITH AllContracts AS (
                    SELECT {cast_as_int_c} AS ID_Int, DATE(Data_ativa_o) AS Data_ativa_o, Cidade
                    FROM Contratos
                    WHERE Data_ativa_o IS NOT NULL
                    UNION
                    SELECT {cast_as_int_cn} AS ID_Int, DATE(Data_ativa_o) AS Data_ativa_o, Cidade
                    FROM Contratos_Negativacao
                    WHERE Data_ativa_o IS NOT NULL
                )
            """
            all_churn_cte = f"""
                , AllChurn AS (
                    SELECT {cast_as_int_c} AS ID_Int, MIN(DATE(Data_cancelamento)) as ChurnDate
                    FROM Contratos
                    WHERE Data_cancelamento IS NOT NULL
                    GROUP BY {cast_as_int_c}
                    UNION
                    SELECT {cast_as_int_cn} AS ID_Int, MIN(DATE(Data_negativa_o)) as ChurnDate
                    FROM Contratos_Negativacao
                    WHERE Data_negativa_o IS NOT NULL
                    GROUP BY {cast_as_int_cn}
                )
            """
        else:
            all_contracts_cte = f"""
                WITH AllContracts AS (
                    SELECT {cast_as_int_c} AS ID_Int, DATE(Data_ativa_o) AS Data_ativa_o, Cidade
                    FROM Contratos
                    WHERE Data_ativa_o IS NOT NULL
                )
            """
            all_churn_cte = f"""
                , AllChurn AS (
                    SELECT {cast_as_int_c} AS ID_Int, MIN(DATE(Data_cancelamento)) as ChurnDate
                    FROM Contratos
                    WHERE Data_cancelamento IS NOT NULL
                    GROUP BY {cast_as_int_c}
                )
            """

        query = f"""
            {all_contracts_cte}
            , AllInvoices AS (
                SELECT {cast_as_int_car} AS ID_Int, DATE(Vencimento) AS Vencimento
                FROM "Contas_a_Receber"
                WHERE Vencimento IS NOT NULL
            )
            {all_churn_cte}
            , FinalChurn AS (
                SELECT ID_Int, MIN(ChurnDate) as ChurnDate
                FROM AllChurn
                GROUP BY ID_Int
            )
            SELECT
                STRFTIME('%Y-%m', C.Data_ativa_o) AS CohortMonth,
                STRFTIME('%Y-%m', I.Vencimento) AS InvoiceMonth,
                COUNT(DISTINCT C.ID_Int) AS ActiveClients
            FROM AllContracts AS C
            JOIN AllInvoices AS I ON C.ID_Int = I.ID_Int
            LEFT JOIN FinalChurn AS CH ON C.ID_Int = CH.ID_Int
            WHERE
                {where_sql.replace('C.Data_ativa_o', 'DATE(C.Data_ativa_o)')}
                AND I.Vencimento >= C.Data_ativa_o
                AND (CH.ChurnDate IS NULL OR I.Vencimento < CH.ChurnDate)
            GROUP BY CohortMonth, InvoiceMonth
            ORDER BY CohortMonth, InvoiceMonth
        """
        
        cohort_data = pd.read_sql_query(query, conn, params=tuple(params))

        if cohort_data.empty:
             return jsonify({
                "datasets": [], 
                "labels": [],
                "cities": fallback_filters["cities"],
                "years": fallback_filters["years"]
            })

        cohort_data['CohortMonth'] = pd.to_datetime(cohort_data['CohortMonth']).dt.to_period('M')
        cohort_data['InvoiceMonth'] = pd.to_datetime(cohort_data['InvoiceMonth']).dt.to_period('M')
        
        all_months = sorted(cohort_data['InvoiceMonth'].unique())
        cohorts = sorted(cohort_data['CohortMonth'].unique())

        datasets = []
        for cohort in cohorts:
            cohort_df = cohort_data[cohort_data['CohortMonth'] == cohort]
            
            month_map = pd.Series(cohort_df['ActiveClients'].values, index=cohort_df['InvoiceMonth'])
            month_map = month_map.reindex(all_months, fill_value=0)
            
            month_map_filtered = month_map[month_map.index >= cohort]
            
            client_counts = [int(count) for count in month_map_filtered.values]
            padding = [0] * (len(all_months) - len(month_map_filtered))
            
            datasets.append({
                'label': str(cohort),
                'data': padding + client_counts,
                'fill': 'origin'
            })

        return jsonify({
            'labels': [str(m) for m in all_months],
            'datasets': datasets,
            "cities": fallback_filters["cities"],
            "years": fallback_filters["years"]
        })

    except Exception as e:
        print(f"Erro inesperado na análise de coorte: {e}")
        traceback.print_exc()
        return jsonify({
            "error": f"Ocorreu um erro inesperado: {e}",
            "datasets": [],
            "labels": [],
            "cities": fallback_filters.get("cities", []),
            "years": fallback_filters.get("years", [])
        }), 500
    finally:
        if conn: conn.close()


# --- 5. ROTA DE EVOLUÇÃO DE CLIENTES ATIVOS ---
@churn_bp.route('/active_clients_evolution')
def api_active_clients_evolution():
    conn = get_db()
    try:
        start_date_str = request.args.get('start_date')
        end_date_str = request.args.get('end_date')
        city = request.args.get('city', '')
        
        status_contrato_str = request.args.get('status_contrato', '')
        status_acesso_str = request.args.get('status_acesso', '')

        if not start_date_str or not end_date_str:
            return jsonify({"error": "Data inicial e final são obrigatórias."}), 400

        all_contracts_cte = """
            WITH AllContracts AS (
                SELECT ID, Data_ativa_o, Data_cancelamento AS End_Date, Status_contrato, Status_acesso, Cidade
                FROM Contratos
                WHERE Data_ativa_o IS NOT NULL
                UNION
                SELECT ID, Data_ativa_o, Data_negativa_o AS End_Date, 'Negativado' AS Status_contrato, 'Desativado' AS Status_acesso, Cidade
                FROM Contratos_Negativacao
                WHERE Data_ativa_o IS NOT NULL
            ),
            FilteredContracts AS (
                SELECT * FROM AllContracts
                WHERE Cidade NOT IN ('São José dos Campos', 'Jacareí', 'Caçapava')
        """
        
        params = []
        
        if city:
            all_contracts_cte += " AND Cidade = ?"
            params.append(city)
        
        if status_contrato_str:
            status_list = status_contrato_str.split(',')
            if len(status_list) == 1:
                all_contracts_cte += " AND Status_contrato = ?"
                params.append(status_list[0])
            else:
                placeholders = ','.join(['?'] * len(status_list))
                all_contracts_cte += f" AND Status_contrato IN ({placeholders})"
                params.extend(status_list)
            
        if status_acesso_str:
            acesso_list = status_acesso_str.split(',')
            placeholders = ','.join(['?'] * len(acesso_list))
            all_contracts_cte += f" AND Status_acesso IN ({placeholders})"
            params.extend(acesso_list)
            
        all_contracts_cte += ")" 

        params.extend([start_date_str, end_date_str])

        query = f"""
            {all_contracts_cte},
            month_series(month_start) AS (
                SELECT DATE(?, 'start of month')
                UNION ALL
                SELECT DATE(month_start, '+1 month')
                FROM month_series
                WHERE month_start < DATE(?, 'start of month')
            )
            SELECT
                STRFTIME('%Y-%m', ms.month_start) AS Month,
                (
                    SELECT COUNT(ID)
                    FROM FilteredContracts C
                    WHERE
                        DATE(C.Data_ativa_o) <= DATE(ms.month_start, 'start of month', '+1 month', '-1 day') AND
                        (C.End_Date IS NULL OR DATE(C.End_Date) > DATE(ms.month_start, 'start of month', '+1 month', '-1 day'))
                ) AS Active_Clients_Count
            FROM month_series ms;
        """

        try:
            data = conn.execute(query, tuple(params)).fetchall()
        except sqlite3.Error as e:
            if "no such table" in str(e).lower() and "contratos_negativacao" in str(e).lower():
                fallback_query = query.replace("UNION\n                SELECT ID, Data_ativa_o, Data_negativa_o AS End_Date, 'Negativado' AS Status_contrato, 'Desativado' AS Status_acesso, Cidade\n                FROM Contratos_Negativacao\n                WHERE Data_ativa_o IS NOT NULL", "")
                data = conn.execute(fallback_query, tuple(params)).fetchall()
            else:
                raise e 

        cities_query = """
            SELECT DISTINCT Cidade FROM Contratos 
            WHERE Cidade IS NOT NULL AND TRIM(Cidade) != '' 
            AND Cidade NOT IN ('São José dos Campos', 'Jacareí', 'Caçapava')
            ORDER BY Cidade
        """
        cities_data = conn.execute(cities_query).fetchall()

        return jsonify({
            "data": [dict(row) for row in data],
            "cities": [row[0] for row in cities_data]
        })

    except sqlite3.Error as e:
        print(f"Erro na base de dados na análise de evolução de clientes: {e}")
        return jsonify({"error": f"Erro interno ao processar a análise. Detalhe: {e}"}), 500
    finally:
        if conn: conn.close()

# --- 6. ROTA DE CANCELAMENTO POR CIDADE ---
@churn_bp.route('/cancellations_by_city')
def api_cancellations_by_city():
    conn = get_db()
    try:
        start_date = request.args.get('start_date', '')
        end_date = request.args.get('end_date', '')
        relevance = request.args.get('relevance', '')

        params_cancelados = []
        where_cancelados_list = ["Status_contrato = 'Inativo'", "Status_acesso = 'Desativado'", "Cidade IS NOT NULL", "TRIM(Cidade) != ''"]
        add_date_range_filter(where_cancelados_list, params_cancelados, "Data_cancelamento", start_date, end_date)
        where_cancelados = " AND ".join(where_cancelados_list)

        params_negativados_cn = []
        where_negativados_cn_list = ["Cidade IS NOT NULL", "TRIM(Cidade) != ''", "Cidade NOT IN ('Caçapava', 'Jacareí', 'São José dos Campos')"]
        add_date_range_filter(where_negativados_cn_list, params_negativados_cn, "Data_negativa_o", start_date, end_date)
        where_negativados_cn = " AND ".join(where_negativados_cn_list)

        params_negativados_c = []
        where_negativados_c_list = ["Status_contrato = 'Negativado'", "Cidade IS NOT NULL", "TRIM(Cidade) != ''", "Cidade NOT IN ('Caçapava', 'Jacareí', 'São José dos Campos')"]
        add_date_range_filter(where_negativados_c_list, params_negativados_c, "Data_cancelamento", start_date, end_date)
        where_negativados_c = " AND ".join(where_negativados_c_list)

        df_cancelados = pd.read_sql_query(f"SELECT Cidade, 'Cancelado' AS Status, Data_ativa_o, Data_cancelamento AS end_date FROM Contratos WHERE {where_cancelados}", conn, params=tuple(params_cancelados))
        df_negativados_c = pd.read_sql_query(f"SELECT Cidade, 'Negativado' AS Status, Data_ativa_o, Data_cancelamento AS end_date FROM Contratos WHERE {where_negativados_c}", conn, params=tuple(params_negativados_c))
        df_negativados_cn = pd.DataFrame()
        try:
            df_negativados_cn = pd.read_sql_query(f"SELECT Cidade, 'Negativado' AS Status, Data_ativa_o, Data_negativa_o AS end_date FROM Contratos_Negativacao WHERE {where_negativados_cn}", conn, params=tuple(params_negativados_cn))
        except pd.io.sql.DatabaseError as e:
            if "no such table" not in str(e): raise e

        df_all = pd.concat([df_cancelados, df_negativados_c, df_negativados_cn], ignore_index=True)
        
        if not df_all.empty:
            df_all['Data_ativa_o'] = pd.to_datetime(df_all['Data_ativa_o'], errors='coerce')
            df_all['end_date'] = pd.to_datetime(df_all['end_date'], errors='coerce')
            df_all['permanencia_dias'] = (df_all['end_date'] - df_all['Data_ativa_o']).dt.days
            df_all['permanencia_meses'] = (df_all['permanencia_dias'] / 30.44).round().astype('Int64')
            
            min_months, max_months = parse_relevance_filter(relevance)
            if min_months is not None:
                df_all = df_all[df_all['permanencia_meses'] >= min_months]
            if max_months is not None:
                df_all = df_all[df_all['permanencia_meses'] <= max_months]

        if df_all.empty:
            df_final = pd.DataFrame(columns=['Cidade', 'Cancelados', 'Negativados', 'Total'])
        else:
            df_grouped = df_all.groupby('Cidade').agg(
                Cancelados=('Status', lambda x: (x == 'Cancelado').sum()),
                Negativados=('Status', lambda x: (x == 'Negativado').sum())
            ).reset_index()

            df_grouped['Total'] = df_grouped['Cancelados'] + df_grouped['Negativados']
            df_final = df_grouped[df_grouped['Total'] > 0].sort_values(by='Total', ascending=False)

        total_pres_dutra = 0
        total_dom_pedro = 0
        if not df_final.empty:
            pd_data = df_final[df_final['Cidade'] == 'Presidente Dutra']
            if not pd_data.empty: total_pres_dutra = int(pd_data['Total'].values[0])
            dp_data = df_final[df_final['Cidade'] == 'Dom Pedro']
            if not dp_data.empty: total_dom_pedro = int(dp_data['Total'].values[0])

        data_list = df_final[['Cidade', 'Cancelados', 'Negativados', 'Total']].to_dict('records')

        years_query = "SELECT DISTINCT Year FROM ( SELECT STRFTIME('%Y', \"Data_cancelamento\") AS Year FROM Contratos WHERE \"Data_cancelamento\" IS NOT NULL UNION SELECT STRFTIME('%Y', \"Data_negativa_o\") AS Year FROM Contratos_Negativacao WHERE \"Data_negativa_o\" IS NOT NULL ) WHERE Year IS NOT NULL ORDER BY Year DESC"
        years_data = conn.execute(years_query).fetchall()

        total_cancelados = df_final['Cancelados'].sum()
        total_negativados = df_final['Negativados'].sum()

        return jsonify({
            "data": data_list,
            "years": [row[0] for row in years_data],
            "total_cancelados": int(total_cancelados),
            "total_negativados": int(total_negativados),
            "grand_total": int(total_cancelados + total_negativados),
            "total_pres_dutra": total_pres_dutra,
            "total_dom_pedro": total_dom_pedro
        })
    except sqlite3.Error as e:
        return jsonify({"error": f"Erro interno ao processar a análise por cidade: {e}"}), 500
    except Exception as e:
        return jsonify({"error": f"Erro interno inesperado: {e}"}), 500
    finally:
        if conn: conn.close()


# --- 7. ROTA DE CANCELAMENTO POR BAIRRO ---
@churn_bp.route('/cancellations_by_neighborhood')
def api_cancellations_by_neighborhood():
    conn = get_db()
    try:
        selected_city = request.args.get('city', '')
        start_date = request.args.get('start_date', '')
        end_date = request.args.get('end_date', '')
        relevance = request.args.get('relevance', '')

        cities_query = "SELECT DISTINCT Cidade FROM ( SELECT Cidade FROM Contratos WHERE Cidade IS NOT NULL AND TRIM(Cidade) != '' UNION SELECT Cidade FROM Contratos_Negativacao WHERE Cidade IS NOT NULL AND TRIM(Cidade) != '' ) ORDER BY Cidade;"
        try:
             cities_data = conn.execute(cities_query).fetchall()
        except sqlite3.Error:
             cities_data = conn.execute("SELECT DISTINCT Cidade FROM Contratos WHERE Cidade IS NOT NULL AND TRIM(Cidade) != '' ORDER BY Cidade").fetchall()

        years_query = "SELECT DISTINCT Year FROM ( SELECT STRFTIME('%Y', \"Data_cancelamento\") AS Year FROM Contratos WHERE \"Data_cancelamento\" IS NOT NULL UNION SELECT STRFTIME('%Y', \"Data_negativa_o\") AS Year FROM Contratos_Negativacao WHERE \"Data_negativa_o\" IS NOT NULL ) WHERE Year IS NOT NULL ORDER BY Year DESC"
        try:
             years_data = conn.execute(years_query).fetchall()
        except sqlite3.Error:
             years_data = conn.execute("SELECT DISTINCT STRFTIME('%Y', Data_cancelamento) AS Year FROM Contratos WHERE Data_cancelamento IS NOT NULL ORDER BY Year DESC").fetchall()

        data_list = []
        total_cancelados = 0
        total_negativados = 0

        if not selected_city:
             return jsonify({
                "data": [],
                "cities": [row[0] for row in cities_data if row[0]],
                "years": [row[0] for row in years_data if row[0]],
                "total_cancelados": 0,
                "total_negativados": 0,
                "grand_total": 0
            })

        if selected_city:
            params_cancelados = [selected_city]
            where_cancelados_list = ["TRIM(Cidade) = ?", "Status_contrato = 'Inativo'", "Status_acesso = 'Desativado'", "Bairro IS NOT NULL", "TRIM(Bairro) != ''"]
            add_date_range_filter(where_cancelados_list, params_cancelados, "Data_cancelamento", start_date, end_date)
            where_cancelados = " AND ".join(where_cancelados_list)

            params_negativados_cn = [selected_city]
            where_negativados_cn_list = ["TRIM(Cidade) = ?", "Bairro IS NOT NULL", "TRIM(Bairro) != ''", "Cidade NOT IN ('Caçapava', 'Jacareí', 'São José dos Campos')"]
            add_date_range_filter(where_negativados_cn_list, params_negativados_cn, "Data_negativa_o", start_date, end_date)
            where_negativados_cn = " AND ".join(where_negativados_cn_list)

            params_negativados_c = [selected_city]
            where_negativados_c_list = ["TRIM(Cidade) = ?", "Status_contrato = 'Negativado'", "Bairro IS NOT NULL", "TRIM(Bairro) != ''", "Cidade NOT IN ('Caçapava', 'Jacareí', 'São José dos Campos')"]
            add_date_range_filter(where_negativados_c_list, params_negativados_c, "Data_cancelamento", start_date, end_date)
            where_negativados_c = " AND ".join(where_negativados_c_list)

            df_cancelados = pd.read_sql_query(f"SELECT Bairro AS Bairro, 'Cancelado' AS Status, Data_ativa_o, Data_cancelamento AS end_date FROM Contratos WHERE {where_cancelados}", conn, params=tuple(params_cancelados))
            df_negativados_c = pd.read_sql_query(f"SELECT Bairro AS Bairro, 'Negativado' AS Status, Data_ativa_o, Data_cancelamento AS end_date FROM Contratos WHERE {where_negativados_c}", conn, params=tuple(params_negativados_c))
            df_negativados_cn = pd.DataFrame()
            try:
                df_negativados_cn = pd.read_sql_query(f"SELECT Bairro AS Bairro, 'Negativado' AS Status, Data_ativa_o, Data_negativa_o AS end_date FROM Contratos_Negativacao WHERE {where_negativados_cn}", conn, params=tuple(params_negativados_cn))
            except pd.io.sql.DatabaseError as e:
                if "no such table" not in str(e): raise e

            df_all = pd.concat([df_cancelados, df_negativados_c, df_negativados_cn], ignore_index=True)
            
            if not df_all.empty:
                df_all['Data_ativa_o'] = pd.to_datetime(df_all['Data_ativa_o'], errors='coerce')
                df_all['end_date'] = pd.to_datetime(df_all['end_date'], errors='coerce')
                df_all['permanencia_dias'] = (df_all['end_date'] - df_all['Data_ativa_o']).dt.days
                df_all['permanencia_meses'] = (df_all['permanencia_dias'] / 30.44).round().astype('Int64')

                min_months, max_months = parse_relevance_filter(relevance)
                if min_months is not None:
                    df_all = df_all[df_all['permanencia_meses'] >= min_months]
                if max_months is not None:
                    df_all = df_all[df_all['permanencia_meses'] <= max_months]

            if not df_all.empty:
                df_grouped = df_all.groupby('Bairro').agg(
                    Cancelados=('Status', lambda x: (x == 'Cancelado').sum()),
                    Negativados=('Status', lambda x: (x == 'Negativado').sum())
                ).reset_index()
                df_grouped['Total'] = df_grouped['Cancelados'] + df_grouped['Negativados']
                df_final = df_grouped[df_grouped['Total'] > 0].sort_values(by='Total', ascending=False)
                data_list = df_final[['Bairro', 'Cancelados', 'Negativados']].to_dict('records')
                total_cancelados = df_final['Cancelados'].sum()
                total_negativados = df_final['Negativados'].sum()

        return jsonify({
            "data": data_list,
            "cities": [row[0] for row in cities_data if row[0]],
            "years": [row[0] for row in years_data if row[0]],
            "total_cancelados": int(total_cancelados),
            "total_negativados": int(total_negativados),
            "grand_total": int(total_cancelados + total_negativados)
        })
    except sqlite3.Error as e:
        print(f"Erro na base de dados na análise por bairro: {e}")
        return jsonify({"error": f"Erro interno ao processar a análise por bairro. Detalhe: {e}"}), 500
    except Exception as e:
        print(f"Erro inesperado na análise por bairro: {e}")
        traceback.print_exc()
        return jsonify({"error": f"Erro interno inesperado ao processar a análise por bairro. Detalhe: {e}"}), 500
    finally:
        if conn: conn.close()

# --- 8. ROTA DE CANCELAMENTO POR EQUIPAMENTO ---
@churn_bp.route('/cancellations_by_equipment')
def api_cancellations_by_equipment():
    conn = get_db()
    try:
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        city = request.args.get('city')
        relevance = request.args.get('relevance')

        params_cancelados = []
        where_cancelados_list = ["C.Status_contrato = 'Inativo'", "C.Status_acesso = 'Desativado'"]
        add_date_range_filter(where_cancelados_list, params_cancelados, "C.Data_cancelamento", start_date, end_date)
        if city: 
            where_cancelados_list.append("C.Cidade = ?")
            params_cancelados.append(city)
        where_cancelados_sql = " AND ".join(where_cancelados_list)

        params_negativados_cn = []
        where_negativados_cn_list = ["CN.Cidade NOT IN ('Caçapava', 'Jacareí', 'São José dos Campos')"]
        add_date_range_filter(where_negativados_cn_list, params_negativados_cn, "CN.Data_negativa_o", start_date, end_date)
        if city: 
            where_negativados_cn_list.append("CN.Cidade = ?")
            params_negativados_cn.append(city)
        where_negativados_cn_sql = " AND ".join(where_negativados_cn_list)

        params_negativados_c = []
        where_negativados_c_list = ["C.Status_contrato = 'Negativado'", "C.Cidade NOT IN ('Caçapava', 'Jacareí', 'São José dos Campos')"]
        add_date_range_filter(where_negativados_c_list, params_negativados_c, "C.Data_cancelamento", start_date, end_date)
        if city: 
            where_negativados_c_list.append("C.Cidade = ?")
            params_negativados_c.append(city)
        where_negativados_c_sql = " AND ".join(where_negativados_c_list)

        df_cancelados = pd.read_sql_query(f"SELECT ID, Data_ativa_o, Data_cancelamento AS end_date FROM Contratos C WHERE {where_cancelados_sql}", conn, params=tuple(params_cancelados))
        df_negativados_c = pd.read_sql_query(f"SELECT ID, Data_ativa_o, Data_cancelamento AS end_date FROM Contratos C WHERE {where_negativados_c_sql}", conn, params=tuple(params_negativados_c))
        df_negativados_cn = pd.DataFrame()
        try:
             df_negativados_cn = pd.read_sql_query(f"SELECT ID, Data_ativa_o, Data_negativa_o AS end_date FROM Contratos_Negativacao CN WHERE {where_negativados_cn_sql}", conn, params=tuple(params_negativados_cn))
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
             data_list = []
             total_equipments = 0
        else:
            query_equipment = """
                SELECT TRIM(ID_contrato) AS ID_contrato, Descricao_produto
                FROM Equipamento
                WHERE Status_comodato = 'Baixa'
                  AND Descricao_produto IS NOT NULL
                  AND TRIM(Descricao_produto) != ''
            """
            df_equipment = pd.read_sql_query(query_equipment, conn)
            df_equipment['ID_contrato'] = df_equipment['ID_contrato'].astype(str).str.strip()

            df_merged = pd.merge(df_contracts, df_equipment, left_on='ID', right_on='ID_contrato', how='inner')

            onu_masks = df_merged['Descricao_produto'].str.contains('ONU AN5506-01|ONU AN5506-02', na=False)
            df_routers = df_merged[onu_masks].copy()
            if not df_routers.empty:
                df_routers['Descricao_produto'] = 'ROTEADOR (Associado a ONU)'
                df_expanded = pd.concat([df_merged, df_routers], ignore_index=True)
            else:
                df_expanded = df_merged

            df_grouped = df_expanded.groupby('Descricao_produto').size().reset_index(name='Count')

            df_grouped['Descricao_produto'] = df_grouped['Descricao_produto'].replace({
                r'^ONU AN5506-01.*': 'ONU AN5506-01 (Agrupado)',
                r'^ONU AN5506-02.*': 'ONU AN5506-02 (Agrupado)',
                r'^ONU HG6143D.*': 'ONU HG6143D (Agrupado)'
            }, regex=True)

            df_final = df_grouped.groupby('Descricao_produto')['Count'].sum().reset_index()
            df_final = df_final.sort_values(by='Count', ascending=False).head(20)

            data_list = df_final.to_dict('records')
            total_equipments = df_expanded.shape[0]

        years_query = "SELECT DISTINCT Year FROM ( SELECT STRFTIME('%Y', Data_cancelamento) AS Year FROM Contratos WHERE Data_cancelamento IS NOT NULL UNION SELECT STRFTIME('%Y', Data_negativa_o) AS Year FROM Contratos_Negativacao WHERE Data_negativa_o IS NOT NULL ) WHERE Year IS NOT NULL ORDER BY Year DESC"
        years_data = conn.execute(years_query).fetchall()

        cities_query = "SELECT DISTINCT Cidade FROM (SELECT Cidade FROM Contratos WHERE Cidade IS NOT NULL AND TRIM(Cidade) != '' UNION SELECT Cidade FROM Contratos_Negativacao WHERE Cidade IS NOT NULL AND TRIM(Cidade) != '') ORDER BY Cidade"
        cities_data = conn.execute(cities_query).fetchall()

        return jsonify({
            "data": data_list,
            "years": [row[0] for row in years_data if row[0]],
            "cities": [row[0] for row in cities_data if row[0]],
            "total_equipments": int(total_equipments)
        })

    except sqlite3.Error as e:
        if "no such table" in str(e).lower():
            return jsonify({"error": "A tabela 'Equipamento' ou 'Contratos_Negativacao' não foi encontrada. Esta análise requer ambas as tabelas."}), 500
        print(f"Erro na base de dados na análise por equipamento: {e}")
        return jsonify({"error": f"Erro interno ao processar a análise por equipamento. Detalhe: {e}"}), 500
    except Exception as e:
        print(f"Erro inesperado na análise por equipamento: {e}")
        return jsonify({"error": f"Erro interno inesperado ao processar a análise por equipamento. Detalhe: {e}"}), 500
    finally:
        if conn: conn.close()

# --- 9. ROTA DE EQUIPAMENTO POR OLT ---
@churn_bp.route('/equipment_by_olt')
def api_equipment_by_olt():
    conn = get_db()
    try:
        city = request.args.get('city', '')

        where_clauses = [
            "E.Status_comodato = 'Emprestado'",
            "L.Transmissor IS NOT NULL",
            "L.Transmissor != ''"
        ]
        params = []

        if city:
            where_clauses.append("C.Cidade = ?")
            params.append(city)

        where_sql = " AND ".join(where_clauses)

        query = f"""
            SELECT
                E.Descricao_produto,
                COUNT(*) AS Count
            FROM Logins L
            JOIN Contratos C ON L.ID_contrato = C.ID
            JOIN Equipamento E ON C.ID = TRIM(E.ID_contrato)
            WHERE {where_sql}
            GROUP BY E.Descricao_produto
            ORDER BY Count DESC
            LIMIT 30;
        """
        data = conn.execute(query, tuple(params)).fetchall()

        cities_query = """
            SELECT DISTINCT C.Cidade
            FROM Contratos C
            JOIN Logins L ON C.ID = L.ID_contrato
            WHERE C.Cidade IS NOT NULL AND TRIM(C.Cidade) != ''
            ORDER BY C.Cidade
        """
        cities_data = conn.execute(cities_query).fetchall()

        return jsonify({
            "data": [dict(row) for row in data],
            "cities": [row[0] for row in cities_data if row[0]]
        })

    except sqlite3.Error as e:
        if "no such table" in str(e).lower():
            return jsonify({"error": "As tabelas 'Logins', 'Contratos' e/ou 'Equipamento' não foram encontradas. Esta análise requer as três tabelas."}), 500
        print(f"Erro na base de dados na análise por OLT: {e}")
        return jsonify({"error": f"Erro interno ao processar a análise por OLT. Detalhe: {e}"}), 500
    finally:
        if conn: conn.close()
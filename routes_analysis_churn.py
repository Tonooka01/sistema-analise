import pandas as pd
import sqlite3
import traceback
from flask import Blueprint, jsonify, request
from utils_api import get_db, parse_relevance_filter, add_date_range_filter

# Define o Blueprint para rotas de churn e cancelamento
churn_bp = Blueprint('churn_bp', __name__)

# --- CTE FINANCEIRA ATUALIZADA ---
# Calcula Atrasos, Não Pagas, MÉDIA de dias de atraso e agora TOTAL DE FATURAS
financial_cte = """
    FinancialStats AS (
        SELECT
            ID_Contrato_Recorrente,
            SUM(CASE WHEN Data_pagamento > Vencimento THEN 1 ELSE 0 END) AS Atrasos_Pagos,
            SUM(CASE WHEN Status = 'A receber' AND Vencimento < date('now') THEN 1 ELSE 0 END) AS Faturas_Nao_Pagas,
            COUNT(*) AS Total_Faturas,
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
    """
    Helper function to apply filters clicked from charts.
    Uses TRIM() and UPPER() for more robust matching.
    """
    if not filter_col or not filter_val:
        return

    # Limpa espaços extras que possam vir do frontend
    filter_val = filter_val.strip()

    if filter_col == 'motivo':
        # Filtro por Motivo de Cancelamento
        if filter_val == 'Não Informado':
             where_clauses.append("(Motivo_cancelamento IS NULL OR TRIM(Motivo_cancelamento) = 'Não Informado')")
        else:
            # Usa UPPER para evitar problemas de case sensitivity
            where_clauses.append("UPPER(TRIM(Motivo_cancelamento)) = UPPER(TRIM(?))")
            params.append(filter_val)
            
    elif filter_col == 'obs':
        # Filtro por Observação de Cancelamento
        if filter_val == 'Não Informado':
             where_clauses.append("(Obs_cancelamento IS NULL OR TRIM(Obs_cancelamento) = 'Não Informado')")
        else:
            where_clauses.append("UPPER(TRIM(Obs_cancelamento)) = UPPER(TRIM(?))")
            params.append(filter_val)
            
    elif filter_col == 'financeiro':
        # Filtro por Comportamento Financeiro (baseado na Media_Atraso)
        if filter_val == 'Em dia / Adiantado':
            where_clauses.append("Media_Atraso <= 0")
        elif filter_val == 'Pagamento Atrasado':
            where_clauses.append("Media_Atraso BETWEEN 1 AND 30")
        elif filter_val == 'Inadimplente (>30d)':
            where_clauses.append("Media_Atraso > 30")
        elif filter_val == 'Sem Histórico':
            where_clauses.append("Media_Atraso IS NULL")


@churn_bp.route('/cancellations')
def api_cancellation_analysis():
    conn = get_db()
    try:
        # Parâmetros padrão
        search_term = request.args.get('search_term', '').strip()
        limit = request.args.get('limit', 50, type=int)
        offset = request.args.get('offset', 0, type=int)
        relevance = request.args.get('relevance', '')
        sort_order = request.args.get('sort_order', '') 
        
        start_date = request.args.get('start_date', '')
        end_date = request.args.get('end_date', '')

        # Novos parâmetros de filtro de gráfico (vindos do clique no frontend)
        chart_filter_col = request.args.get('filter_column', '')
        chart_filter_val = request.args.get('filter_value', '').strip()

        # --- PREPARAÇÃO DOS FILTROS GERAIS ---
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
            
        # Filtros de Data específicos para as subqueries
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

        # Parâmetros base (Datas + Filtros Gerais)
        # IMPORTANTE: A ordem deve ser (Datas Contratos) + (Datas Negativação) + (Filtros Gerais)
        final_params = date_params_contratos + date_params_negativacao + params 
        
        # CTEs combinadas (Base de dados unificada)
        base_cte_logic = f"""
            WITH {financial_cte},
            RelevantTickets AS (
                 SELECT DISTINCT Cliente FROM (
                     SELECT Cliente FROM Atendimentos WHERE Assunto IN ('MANUTENÇÃO DE FIBRA', 'VISITA TECNICA')
                     UNION ALL
                     SELECT Cliente FROM OS WHERE Assunto IN ('MANUTENÇÃO DE FIBRA', 'VISITA TECNICA')
                 )
            ),
            AllCancellations AS (
                -- Contratos Normais
                SELECT Cliente, ID AS Contrato_ID, Data_ativa_o, Data_cancelamento, Motivo_cancelamento, Obs_cancelamento
                FROM Contratos 
                WHERE Status_contrato = 'Inativo' AND Status_acesso = 'Desativado' {date_filter_contratos}
                
                UNION ALL
                
                -- Negativados (Também aparecem em cancelamentos se tiverem data)
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

        # --- Aplicação do Filtro de Gráfico para TABELA E CONTAGEM ---
        where_clauses_table = list(where_clauses) # Começa com os filtros gerais (busca, relevancia)
        params_table = list(final_params)         # Começa com os params globais (datas, busca, relevancia)
        
        # AQUI ESTAVA O PROBLEMA: O filtro de gráfico precisa ser aplicado AGORA, antes da count_query
        apply_chart_filters(where_clauses_table, params_table, chart_filter_col, chart_filter_val)

        where_sql_table = " WHERE " + " AND ".join(where_clauses_table) if where_clauses_table else ""

        try:
            # 1. Total de Linhas (CORRIGIDO: Agora usa os filtros completos, incluindo o do gráfico)
            count_query = f"{base_cte_logic} SELECT COUNT(*) FROM FinalView {where_sql_table}"
            total_rows = conn.execute(count_query, tuple(params_table)).fetchone()[0]
        except sqlite3.Error as e:
            if "no such table" in str(e).lower():
                return jsonify({"error": "Tabelas necessárias não encontradas."}), 500
            else:
                raise e

        # 2. Dados da Tabela (Paginados e com todos os filtros)
        order_by = "ORDER BY Cliente, Contrato_ID"
        if sort_order == 'asc': order_by = "ORDER BY permanencia_meses ASC, Cliente"
        elif sort_order == 'desc': order_by = "ORDER BY permanencia_meses DESC, Cliente"

        paginated_query = f"{base_cte_logic} SELECT * FROM FinalView {where_sql_table} {order_by} LIMIT ? OFFSET ?"
        
        # Adiciona limit e offset aos parametros da tabela
        params_table_paginated = params_table + [limit, offset]
        
        data = conn.execute(paginated_query, tuple(params_table_paginated)).fetchall()

        # --- DADOS DOS GRÁFICOS (Agregados - SEM O FILTRO DE GRÁFICO) ---
        # Mantemos apenas os filtros "Globais" (Data, Busca, Relevância) para os gráficos,
        # senão ao clicar numa fatia, o gráfico viraria 100% daquela fatia.
        
        # IMPORTANTE: Reconstruir where_sql apenas com where_clauses originais (sem filtro de gráfico)
        where_sql_charts = " WHERE " + " AND ".join(where_clauses) if where_clauses else ""
        
        # 1. Motivos
        chart_motivo_query = f"{base_cte_logic} SELECT Motivo_cancelamento, COUNT(*) as Count FROM FinalView {where_sql_charts} GROUP BY Motivo_cancelamento ORDER BY Count DESC"
        chart_motivo_data = conn.execute(chart_motivo_query, tuple(final_params)).fetchall()

        # 2. Observações
        chart_obs_query = f"{base_cte_logic} SELECT Obs_cancelamento, COUNT(*) as Count FROM FinalView {where_sql_charts} GROUP BY Obs_cancelamento ORDER BY Count DESC"
        chart_obs_data = conn.execute(chart_obs_query, tuple(final_params)).fetchall()

        # 3. Comportamento Financeiro (AGRUPADO)
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

        # Novos parâmetros de filtro de gráfico
        chart_filter_col = request.args.get('filter_column', '')
        chart_filter_val = request.args.get('filter_value', '').strip()

        # Filtros de data para subqueries
        where_date_neg = []
        add_date_range_filter(where_date_neg, [], "Data_negativa_o", start_date, end_date)
        sql_date_neg = " AND " + " AND ".join(where_date_neg) if where_date_neg else ""
        
        where_date_canc = []
        add_date_range_filter(where_date_canc, [], "Data_cancelamento", start_date, end_date)
        sql_date_canc = " AND " + " AND ".join(where_date_canc) if where_date_canc else ""

        # CTE Combinada
        base_cte_logic = f"""
            WITH {financial_cte},
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

        # Preparação dos parâmetros para Filtros Gerais
        final_params = []
        # Adiciona params de data (duas vezes, uma pra cada parte do UNION na CTE)
        temp_p = []
        add_date_range_filter([], temp_p, "x", start_date, end_date)
        final_params.extend(temp_p) # Para a primeira parte do union
        temp_p = []
        add_date_range_filter([], temp_p, "x", start_date, end_date)
        final_params.extend(temp_p) # Para a segunda parte do union

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
        
        # --- Aplicação do Filtro de Gráfico (apenas para a Tabela e Contagem) ---
        where_clauses_table = list(where_clauses)
        params_table = list(final_params)
        
        # IMPORTANTE: Filtro aplicado aqui
        apply_chart_filters(where_clauses_table, params_table, chart_filter_col, chart_filter_val)

        where_sql_table = " WHERE " + " AND ".join(where_clauses_table) if where_clauses_table else ""

        # 1. Total Rows (COM FILTROS DO GRÁFICO)
        count_query = f"{base_cte_logic} SELECT COUNT(*) FROM FinalView {where_sql_table}"
        total_rows = conn.execute(count_query, tuple(params_table)).fetchone()[0]

        # 2. Dados da Tabela (COM FILTROS DO GRÁFICO)
        order_by = "ORDER BY Cliente, Contrato_ID"
        if sort_order == 'asc': order_by = "ORDER BY permanencia_meses ASC, Cliente"
        elif sort_order == 'desc': order_by = "ORDER BY permanencia_meses DESC, Cliente"

        paginated_query = f"{base_cte_logic} SELECT * FROM FinalView {where_sql_table} {order_by} LIMIT ? OFFSET ?"
        params_table_paginated = params_table + [limit, offset]
        data = conn.execute(paginated_query, tuple(params_table_paginated)).fetchall()

        # --- DADOS DOS GRÁFICOS (Sem filtro de gráfico, apenas globais) ---
        where_sql_charts = " WHERE " + " AND ".join(where_clauses) if where_clauses else ""

        # --- Gráfico Financeiro (NOVO) ---
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
        # Usa final_params (lista limpa) para o gráfico
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

# Demais rotas (cancellations_by_city, etc) permanecem inalteradas...
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
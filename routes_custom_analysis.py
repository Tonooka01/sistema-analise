import pandas as pd
import sqlite3
from flask import Blueprint, jsonify, request, abort, current_app
import traceback # Importa traceback para logs de erro

# Define o Blueprint
custom_analysis_bp = Blueprint('custom_analysis_bp', __name__)

def get_db():
    """Função auxiliar para obter a conexão do banco de dados a partir do app_context."""
    return current_app.config['GET_DB_CONNECTION']()

# --- NOVA FUNÇÃO AUXILIAR ---
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

def add_date_range_filter(where_list, params, date_col, start_date, end_date):
    """
    Helper para adicionar filtros de data SQL de forma segura e consistente.
    """
    if start_date:
        where_list.append(f"DATE({date_col}) >= ?")
        params.append(start_date)
    if end_date:
        where_list.append(f"DATE({date_col}) <= ?")
        params.append(end_date)


# --- Definição das Rotas ---
@custom_analysis_bp.route('/contas_a_receber')
def api_custom_analysis_contas_a_receber():
    conn = get_db()
    try:
        search_term = request.args.get('search_term', '').strip()
        limit = request.args.get('limit', 50, type=int)
        offset = request.args.get('offset', 0, type=int)

        base_query_from = """
            FROM Contas_a_Receber AS CAR
            JOIN Contratos AS CON ON CAR.ID_Contrato_Recorrente = CON.ID
            JOIN Clientes AS C ON CON.Cliente = C.Raz_o_social
            WHERE (
                (CAR.Status = 'A receber' AND CAR.Vencimento < date('now'))
                OR (CAR.Data_pagamento > CAR.Vencimento)
            )
        """
        params = []
        where_search = ""
        if search_term:
            where_search = " AND C.Raz_o_social LIKE ?"
            params.append(f'%{search_term}%')

        # Contagem mais eficiente
        count_query = f"""
            SELECT COUNT(DISTINCT CON.ID)
            {base_query_from} {where_search}
        """
        total_rows = conn.execute(count_query, tuple(params)).fetchone()[0]

        # Query principal
        query = f"""
            SELECT
                C.Raz_o_social AS Cliente,
                CON.ID AS Contrato_ID,
                SUM(CASE WHEN CAR.Data_pagamento > CAR.Vencimento THEN 1 ELSE 0 END) AS Atrasos_Pagos,
                SUM(CASE WHEN CAR.Status = 'A receber' AND CAR.Vencimento < date('now') THEN 1 ELSE 0 END) AS Faturas_Nao_Pagas
            {base_query_from} {where_search}
            GROUP BY C.Raz_o_social, CON.ID
            HAVING Atrasos_Pagos > 0 OR Faturas_Nao_Pagas > 0
            ORDER BY C.Raz_o_social, CON.ID
            LIMIT ? OFFSET ?
        """
        params.extend([limit, offset])

        data = conn.execute(query, tuple(params)).fetchall()

        return jsonify({
            "data": [dict(row) for row in data],
            "total_rows": total_rows
        })
    except sqlite3.Error as e:
        print(f"Erro na base de dados ao procurar análise personalizada: {e}")
        return jsonify({"error": "Erro interno ao procurar dados para análise personalizada."}), 500
    finally:
        if conn: conn.close()

def execute_financial_health_query(delay_days):
    conn = get_db()
    try:
        search_term = request.args.get('search_term', '').strip()
        limit = request.args.get('limit', 50, type=int)
        offset = request.args.get('offset', 0, type=int)
        
        # Captura os filtros (podem vir separados por vírgula)
        status_contrato_str = request.args.get('status_contrato', '')
        status_acesso_str = request.args.get('status_acesso', '')
        relevance = request.args.get('relevance', '')

        params = []
        where_conditions = []

        if search_term:
            where_conditions.append("C.Cliente LIKE ?")
            params.append(f'%{search_term}%')

        # --- LÓGICA MULTI-SELECT PARA SAÚDE FINANCEIRA ---
        if status_contrato_str:
            status_list = status_contrato_str.split(',')
            placeholders = ','.join(['?'] * len(status_list))
            where_conditions.append(f"C.Status_contrato IN ({placeholders})")
            params.extend(status_list)

        if status_acesso_str:
            acesso_list = status_acesso_str.split(',')
            placeholders = ','.join(['?'] * len(acesso_list))
            where_conditions.append(f"C.Status_acesso IN ({placeholders})")
            params.extend(acesso_list)
        # -------------------------------------------------

        # Lógica de relevância
        months_calc = """
            CAST(ROUND(
                (JULIANDAY(SUBSTR(FLP.Primeira_Inadimplencia_Vencimento, 1, 10)) - JULIANDAY(SUBSTR(C.Data_ativa_o, 1, 10))) / 30.44
            ) AS INTEGER)
        """
        
        min_months, max_months = parse_relevance_filter(relevance)
        if min_months is not None:
            where_conditions.append(f"{months_calc} >= ?")
            params.append(min_months)
        if max_months is not None:
            where_conditions.append(f"{months_calc} <= ?")
            params.append(max_months)
        
        where_clause = " WHERE " + " AND ".join(where_conditions) if where_conditions else ""

        # CTE para encontrar a primeira inadimplência
        cte_flp = f"""
            SELECT 
                p.ID_Contrato_Recorrente, 
                MIN(p.Vencimento) as Primeira_Inadimplencia_Vencimento
            FROM Contas_a_Receber p
            JOIN Contratos c_inner ON p.ID_Contrato_Recorrente = c_inner.ID
            WHERE
                p.Data_pagamento IS NOT NULL AND
                JULIANDAY(p.Data_pagamento) - JULIANDAY(p.Vencimento) > {delay_days} AND
                p.Vencimento >= c_inner.Data_ativa_o
            GROUP BY p.ID_Contrato_Recorrente
        """

        # Query de contagem
        count_query = f"""
            SELECT COUNT(C.ID)
            FROM Contratos C
            JOIN ({cte_flp}) FLP ON C.ID = FLP.ID_Contrato_Recorrente
            {where_clause}
        """
        total_rows = conn.execute(count_query, tuple(params)).fetchone()[0]

        # Query Principal
        query_base = f"""
            WITH FirstLatePayment AS (
                {cte_flp}
            ),
            CustomerComplaints AS (
                SELECT
                    Cliente, 'Sim' AS Possui_Reclamacoes
                FROM ( SELECT Cliente FROM Atendimentos WHERE Cliente IS NOT NULL UNION SELECT Cliente FROM OS WHERE Cliente IS NOT NULL )
                GROUP BY Cliente
            ),
            LastConnection AS (
                SELECT ID_contrato, MAX(ltima_conex_o_final) as Ultima_Conexao
                FROM Logins
                WHERE ltima_conex_o_final IS NOT NULL AND ID_contrato IS NOT NULL
                GROUP BY ID_contrato
            )
            SELECT
                C.Cliente AS Razao_Social, C.ID AS Contrato_ID, C.Status_contrato, C.Status_acesso,
                C.Data_ativa_o, FLP.Primeira_Inadimplencia_Vencimento,
                COALESCE(CC.Possui_Reclamacoes, 'Não') AS Possui_Reclamacoes,
                LC.Ultima_Conexao
            FROM Contratos C
            JOIN FirstLatePayment FLP ON C.ID = FLP.ID_Contrato_Recorrente 
            LEFT JOIN CustomerComplaints CC ON C.Cliente = CC.Cliente
            LEFT JOIN LastConnection LC ON C.ID = LC.ID_contrato
            {where_clause} 
            ORDER BY C.Cliente, C.ID
            LIMIT ? OFFSET ?;
        """
        
        # Adiciona limit/offset aos parâmetros
        params.extend([limit, offset])
        
        data = conn.execute(query_base, tuple(params)).fetchall()

        return jsonify({"data": [dict(row) for row in data], "total_rows": total_rows})

    except sqlite3.Error as e:
        if "no such table" in str(e):
            return jsonify({"error": f"Erro de banco de dados: uma das tabelas necessárias não foi encontrada. Detalhe: {e}"}), 500
        print(f"Erro na base de dados ao realizar análise financeira: {e}")
        traceback.print_exc()
        return jsonify({"error": "Erro interno ao processar a análise financeira."}), 500
    finally:
        if conn: conn.close()


@custom_analysis_bp.route('/financial_health')
def api_financial_health():
    return execute_financial_health_query(delay_days=10)

@custom_analysis_bp.route('/financial_health_auto_block')
def api_financial_health_auto_block():
    return execute_financial_health_query(delay_days=20)

@custom_analysis_bp.route('/cancellations')
def api_cancellation_analysis():
    conn = get_db()
    try:
        search_term = request.args.get('search_term', '').strip()
        limit = request.args.get('limit', 50, type=int)
        offset = request.args.get('offset', 0, type=int)
        relevance = request.args.get('relevance', '')
        
        # --- LÓGICA DE ORDENAÇÃO (ATUALIZADA PARA EXCEL STYLE) ---
        # Aceita 'asc' ou 'desc' do frontend
        sort_order = request.args.get('sort_order', '') 

        # --- Query base movida para um CTE para permitir filtro de relevância ---
        base_query = """
            WITH RelevantTickets AS (
                 SELECT DISTINCT Cliente FROM (
                     SELECT Cliente FROM Atendimentos WHERE Assunto IN ('MANUTENÇÃO DE FIBRA', 'VISITA TECNICA')
                     UNION ALL
                     SELECT Cliente FROM OS WHERE Assunto IN ('MANUTENÇÃO DE FIBRA', 'VISITA TECNICA')
                 )
            ),
            BaseData AS (
                SELECT C.Cliente, C.ID AS Contrato_ID,
                       CASE WHEN RT.Cliente IS NOT NULL THEN 'Sim' ELSE 'Não' END AS Teve_Contato_Relevante,
                       CASE
                           WHEN C.Data_ativa_o IS NOT NULL AND C.Data_cancelamento IS NOT NULL
                           THEN CAST(ROUND((JULIANDAY(C.Data_cancelamento) - JULIANDAY(C.Data_ativa_o)) / 30.44) AS INTEGER)
                           ELSE NULL
                       END AS permanencia_meses
                FROM Contratos C
                LEFT JOIN RelevantTickets RT ON C.Cliente = RT.Cliente
                WHERE C.Status_contrato = 'Inativo' AND C.Status_acesso = 'Desativado'
            )
            SELECT * FROM BaseData
        """

        params = []
        where_clauses = []
        if search_term:
            where_clauses.append("Cliente LIKE ?")
            params.append(f'%{search_term}%')

        # --- LÓGICA DO FILTRO DE RELEVÂNCIA ---
        min_months, max_months = parse_relevance_filter(relevance)
        if min_months is not None:
            where_clauses.append("permanencia_meses >= ?")
            params.append(min_months)
        if max_months is not None:
            where_clauses.append("permanencia_meses <= ?")
            params.append(max_months)
        
        where_sql = " WHERE " + " AND ".join(where_clauses) if where_clauses else ""

        count_query = f"SELECT COUNT(*) FROM ({base_query}) AS sub {where_sql}"
        total_rows = conn.execute(count_query, tuple(params)).fetchone()[0]

        # --- DEFINE A CLÁUSULA ORDER BY ---
        order_by = "ORDER BY Cliente, Contrato_ID" # Padrão
        
        if sort_order == 'asc':
            order_by = "ORDER BY permanencia_meses ASC, Cliente"
        elif sort_order == 'desc':
            order_by = "ORDER BY permanencia_meses DESC, Cliente"

        paginated_query = f"SELECT * FROM ({base_query}) AS sub {where_sql} {order_by} LIMIT ? OFFSET ?"
        params.extend([limit, offset])
        data = conn.execute(paginated_query, tuple(params)).fetchall()

        return jsonify({"data": [dict(row) for row in data], "total_rows": total_rows})

    except sqlite3.Error as e:
        print(f"Erro na base de dados na análise de cancelamento: {e}")
        return jsonify({"error": "Erro interno ao processar a análise de cancelamento."}), 500
    finally:
        if conn: conn.close()


@custom_analysis_bp.route('/negativacao')
def api_negativacao_analysis():
    conn = get_db()
    try:
        search_term = request.args.get('search_term', '').strip()
        limit = request.args.get('limit', 50, type=int)
        offset = request.args.get('offset', 0, type=int)
        relevance = request.args.get('relevance', '')
        
        # --- LÓGICA DE ORDENAÇÃO (ATUALIZADA PARA EXCEL STYLE) ---
        sort_order = request.args.get('sort_order', '')

        # --- Query base movida para um CTE ---
        base_query = """
            WITH RelevantTickets AS (
                SELECT DISTINCT Cliente FROM (
                    SELECT Cliente FROM Atendimentos WHERE Assunto IN ('MANUTENÇÃO DE FIBRA', 'VISITA TECNICA')
                    UNION ALL
                    SELECT Cliente FROM OS WHERE Assunto IN ('MANUTENÇÃO DE FIBRA', 'VISITA TECNICA')
                )
            ),
            AllNegativados AS (
                SELECT Cliente, ID, Cidade, Data_ativa_o, Data_negativa_o AS end_date
                FROM Contratos_Negativacao WHERE Cidade NOT IN ('Caçapava', 'Jacareí', 'São José dos Campos')
                UNION
                SELECT Cliente, ID, Cidade, Data_ativa_o, Data_cancelamento AS end_date
                FROM Contratos WHERE Status_contrato = 'Negativado' AND Cidade NOT IN ('Caçapava', 'Jacareí', 'São José dos Campos')
            ),
            BaseData AS (
                SELECT
                    AN.Cliente,
                    AN.ID AS Contrato_ID,
                    CASE WHEN RT.Cliente IS NOT NULL THEN 'Sim' ELSE 'Não' END AS Teve_Contato_Relevante,
                    CASE
                        WHEN AN.Data_ativa_o IS NOT NULL AND AN.end_date IS NOT NULL
                        THEN CAST(ROUND((JULIANDAY(AN.end_date) - JULIANDAY(AN.Data_ativa_o)) / 30.44) AS INTEGER)
                        ELSE NULL
                    END AS permanencia_meses
                FROM AllNegativados AN
                LEFT JOIN RelevantTickets RT ON AN.Cliente = RT.Cliente
            )
            SELECT * FROM BaseData
        """

        params = []
        where_clauses = []
        if search_term:
            where_clauses.append("Cliente LIKE ?")
            params.append(f'%{search_term}%')

        # --- LÓGICA DO FILTRO DE RELEVÂNCIA ---
        min_months, max_months = parse_relevance_filter(relevance)
        if min_months is not None:
            where_clauses.append("permanencia_meses >= ?")
            params.append(min_months)
        if max_months is not None:
            where_clauses.append("permanencia_meses <= ?")
            params.append(max_months)
        
        where_sql = " WHERE " + " AND ".join(where_clauses) if where_clauses else ""

        count_query = f"SELECT COUNT(*) FROM ({base_query}) AS sub {where_sql}"
        total_rows = conn.execute(count_query, tuple(params)).fetchone()[0]

        # --- DEFINE A CLÁUSULA ORDER BY ---
        order_by = "ORDER BY Cliente, Contrato_ID" # Padrão
        
        # Verifica a direção da ordenação solicitada
        if sort_order == 'asc':
            order_by = "ORDER BY permanencia_meses ASC, Cliente"
        elif sort_order == 'desc':
            order_by = "ORDER BY permanencia_meses DESC, Cliente"

        paginated_query = f"SELECT * FROM ({base_query}) AS sub {where_sql} {order_by} LIMIT ? OFFSET ?"
        params.extend([limit, offset])
        data = conn.execute(paginated_query, tuple(params)).fetchall()

        return jsonify({"data": [dict(row) for row in data], "total_rows": total_rows})

    except sqlite3.Error as e:
        if "no such table" in str(e).lower():
            return jsonify({"error": "A tabela 'Contratos_Negativacao' não foi encontrada. Por favor, verifique se o arquivo foi carregado."}), 500
        print(f"Erro na base de dados na análise de negativação: {e}")
        return jsonify({"error": f"Erro interno ao processar a análise de negativação. Detalhe: {e}"}), 500
    finally:
        if conn: conn.close()

@custom_analysis_bp.route('/sellers')
def api_seller_analysis():
    conn = get_db()
    try:
        start_date = request.args.get('start_date', '')
        end_date = request.args.get('end_date', '')
        # Este filtro não usa relevância, então permanece o mesmo

        # Parâmetros e cláusulas WHERE para cada fonte de dados
        params_cancelados = []
        params_negativados_cn = []
        params_negativados_c = []

        where_cancelados_list = ["Status_contrato = 'Inativo'", "Status_acesso = 'Desativado'"]
        add_date_range_filter(where_cancelados_list, params_cancelados, "Data_cancelamento", start_date, end_date)
        where_cancelados = " AND ".join(where_cancelados_list)

        where_negativados_cn_list = ["Cidade NOT IN ('Caçapava', 'Jacareí', 'São José dos Campos')"]
        add_date_range_filter(where_negativados_cn_list, params_negativados_cn, "Data_negativa_o", start_date, end_date)
        where_negativados_cn = " AND ".join(where_negativados_cn_list)

        where_negativados_c_list = ["Status_contrato = 'Negativado'", "Cidade NOT IN ('Caçapava', 'Jacareí', 'São José dos Campos')"]
        add_date_range_filter(where_negativados_c_list, params_negativados_c, "Data_cancelamento", start_date, end_date)
        where_negativados_c = " AND ".join(where_negativados_c_list)

        # Executa as queries separadamente
        df_cancelados = pd.read_sql_query(f"SELECT Vendedor AS Vendedor_ID, 'Cancelado' AS Status FROM Contratos WHERE {where_cancelados}", conn, params=tuple(params_cancelados))
        df_negativados_c = pd.read_sql_query(f"SELECT Vendedor AS Vendedor_ID, 'Negativado' AS Status FROM Contratos WHERE {where_negativados_c}", conn, params=tuple(params_negativados_c))
        df_negativados_cn = pd.DataFrame()
        try:
            df_negativados_cn = pd.read_sql_query(f"SELECT Vendedor AS Vendedor_ID, 'Negativado' AS Status FROM Contratos_Negativacao WHERE {where_negativados_cn}", conn, params=tuple(params_negativados_cn))
        except pd.io.sql.DatabaseError as e:
            if "no such table" not in str(e): raise e
            print("Aviso: Tabela Contratos_Negativacao não encontrada.")

        df_all = pd.concat([df_cancelados, df_negativados_c, df_negativados_cn], ignore_index=True)

        # Junta com Vendedores
        df_vendedores = pd.read_sql_query("SELECT ID, Vendedor FROM Vendedores", conn)
        df_merged = pd.merge(df_all, df_vendedores, left_on='Vendedor_ID', right_on='ID', how='left')

        # Agrega os resultados
        df_grouped = df_merged.groupby(['Vendedor_ID', 'Vendedor']).agg(
            Cancelados_Count=('Status', lambda x: (x == 'Cancelado').sum()),
            Negativados_Count=('Status', lambda x: (x == 'Negativado').sum())
        ).reset_index()

        df_grouped['Total'] = df_grouped['Cancelados_Count'] + df_grouped['Negativados_Count']
        df_grouped = df_grouped.sort_values(by='Total', ascending=False)
        df_grouped.rename(columns={'Vendedor': 'Vendedor_Nome'}, inplace=True) # Renomeia para consistência

        data_list = df_grouped.to_dict('records')

        # Busca anos para o filtro
        years_query = "SELECT DISTINCT Year FROM ( SELECT STRFTIME('%Y', \"Data_cancelamento\") AS Year FROM Contratos WHERE \"Data_cancelamento\" IS NOT NULL UNION SELECT STRFTIME('%Y', \"Data_negativa_o\") AS Year FROM Contratos_Negativacao WHERE \"Data_negativa_o\" IS NOT NULL ) WHERE Year IS NOT NULL ORDER BY Year DESC"
        years_data = conn.execute(years_query).fetchall()

        total_cancelados = df_grouped['Cancelados_Count'].sum()
        total_negativados = df_grouped['Negativados_Count'].sum()

        return jsonify({
            "data": data_list,
            "total_rows": len(data_list),
            "years": [row[0] for row in years_data],
            "total_cancelados": int(total_cancelados), # Converte para int nativo
            "total_negativados": int(total_negativados),
            "grand_total": int(total_cancelados + total_negativados)
        })
    except sqlite3.Error as e:
        print(f"Erro na base de dados na análise de vendedores: {e}")
        return jsonify({"error": f"Erro interno ao processar a análise de vendedores. Detalhe: {e}"}), 500
    except Exception as e:
        print(f"Erro inesperado na análise de vendedores: {e}")
        return jsonify({"error": f"Erro interno inesperado ao processar a análise de vendedores. Detalhe: {e}"}), 500
    finally:
        if conn: conn.close()


@custom_analysis_bp.route('/cancellations_by_city')
def api_cancellations_by_city():
    conn = get_db()
    try:
        start_date = request.args.get('start_date', '')
        end_date = request.args.get('end_date', '')
        relevance = request.args.get('relevance', '') # <-- NOVO FILTRO

        # Filtros para Cancelados
        params_cancelados = []
        where_cancelados_list = ["Status_contrato = 'Inativo'", "Status_acesso = 'Desativado'", "Cidade IS NOT NULL", "TRIM(Cidade) != ''"]
        add_date_range_filter(where_cancelados_list, params_cancelados, "Data_cancelamento", start_date, end_date)
        where_cancelados = " AND ".join(where_cancelados_list)

        # Filtros para Negativados de Contratos_Negativacao
        params_negativados_cn = []
        where_negativados_cn_list = ["Cidade IS NOT NULL", "TRIM(Cidade) != ''", "Cidade NOT IN ('Caçapava', 'Jacareí', 'São José dos Campos')"]
        add_date_range_filter(where_negativados_cn_list, params_negativados_cn, "Data_negativa_o", start_date, end_date)
        where_negativados_cn = " AND ".join(where_negativados_cn_list)

        # Filtros para Negativados de Contratos
        params_negativados_c = []
        where_negativados_c_list = ["Status_contrato = 'Negativado'", "Cidade IS NOT NULL", "TRIM(Cidade) != ''", "Cidade NOT IN ('Caçapava', 'Jacareí', 'São José dos Campos')"]
        add_date_range_filter(where_negativados_c_list, params_negativados_c, "Data_cancelamento", start_date, end_date)
        where_negativados_c = " AND ".join(where_negativados_c_list)

        # --- MODIFICADO: Adiciona Data_ativa_o e end_date ---
        df_cancelados = pd.read_sql_query(f"SELECT Cidade, 'Cancelado' AS Status, Data_ativa_o, Data_cancelamento AS end_date FROM Contratos WHERE {where_cancelados}", conn, params=tuple(params_cancelados))
        df_negativados_c = pd.read_sql_query(f"SELECT Cidade, 'Negativado' AS Status, Data_ativa_o, Data_cancelamento AS end_date FROM Contratos WHERE {where_negativados_c}", conn, params=tuple(params_negativados_c))
        df_negativados_cn = pd.DataFrame()
        try:
            df_negativados_cn = pd.read_sql_query(f"SELECT Cidade, 'Negativado' AS Status, Data_ativa_o, Data_negativa_o AS end_date FROM Contratos_Negativacao WHERE {where_negativados_cn}", conn, params=tuple(params_negativados_cn))
        except pd.io.sql.DatabaseError as e:
            if "no such table" not in str(e): raise e
            print("Aviso: Tabela Contratos_Negativacao não encontrada.")

        df_all = pd.concat([df_cancelados, df_negativados_c, df_negativados_cn], ignore_index=True)
        # --- FIM DA MODIFICAÇÃO ---
        
        # --- LÓGICA DE FILTRO DE RELEVÂNCIA ---
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
        # --- FIM DA LÓGICA ---

        # Agrega os resultados (APÓS FILTRAR)
        if df_all.empty:
            df_final = pd.DataFrame(columns=['Cidade', 'Cancelados', 'Negativados', 'Total'])
        else:
            df_grouped = df_all.groupby('Cidade').agg(
                Cancelados=('Status', lambda x: (x == 'Cancelado').sum()),
                Negativados=('Status', lambda x: (x == 'Negativado').sum())
            ).reset_index()

            df_grouped['Total'] = df_grouped['Cancelados'] + df_grouped['Negativados']
            # Filtra cidades sem cancelados ou negativados e ordena
            df_final = df_grouped[df_grouped['Total'] > 0].sort_values(by='Total', ascending=False)

        # --- Extrai Totais para Cidades Específicas (NOVO) ---
        total_pres_dutra = 0
        total_dom_pedro = 0
        
        if not df_final.empty:
            # Usa try/except ou verificação de empty para segurança
            pd_data = df_final[df_final['Cidade'] == 'Presidente Dutra']
            if not pd_data.empty:
                total_pres_dutra = int(pd_data['Total'].values[0])
                
            dp_data = df_final[df_final['Cidade'] == 'Dom Pedro']
            if not dp_data.empty:
                total_dom_pedro = int(dp_data['Total'].values[0])

        # Inclui a coluna 'Total' na lista de dados para a tabela
        data_list = df_final[['Cidade', 'Cancelados', 'Negativados', 'Total']].to_dict('records')

        # Busca anos para o filtro (query original mantida, não depende da relevância)
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
            # --- NOVOS TOTAIS ---
            "total_pres_dutra": total_pres_dutra,
            "total_dom_pedro": total_dom_pedro
        })
    except sqlite3.Error as e:
        print(f"Erro na base de dados na análise por cidade: {e}")
        return jsonify({"error": f"Erro interno ao processar a análise por cidade. Detalhe: {e}"}), 500
    except Exception as e:
        print(f"Erro inesperado na análise por cidade: {e}")
        return jsonify({"error": f"Erro interno inesperado ao processar a análise por cidade. Detalhe: {e}"}), 500
    finally:
        if conn: conn.close()


@custom_analysis_bp.route('/cancellations_by_neighborhood')
def api_cancellations_by_neighborhood():
    conn = get_db()
    try:
        selected_city = request.args.get('city', '')
        start_date = request.args.get('start_date', '')
        end_date = request.args.get('end_date', '')
        relevance = request.args.get('relevance', '') # <-- NOVO FILTRO

        # Queries para filtros (não dependem da relevância)
        # Busca TODAS as cidades disponíveis (usadas para popular o dropdown no frontend)
        cities_query = "SELECT DISTINCT Cidade FROM ( SELECT Cidade FROM Contratos WHERE Cidade IS NOT NULL AND TRIM(Cidade) != '' UNION SELECT Cidade FROM Contratos_Negativacao WHERE Cidade IS NOT NULL AND TRIM(Cidade) != '' ) ORDER BY Cidade;"
        try:
             cities_data = conn.execute(cities_query).fetchall()
        except sqlite3.Error:
             # Fallback se Contratos_Negativacao não existir
             cities_data = conn.execute("SELECT DISTINCT Cidade FROM Contratos WHERE Cidade IS NOT NULL AND TRIM(Cidade) != '' ORDER BY Cidade").fetchall()

        years_query = "SELECT DISTINCT Year FROM ( SELECT STRFTIME('%Y', \"Data_cancelamento\") AS Year FROM Contratos WHERE \"Data_cancelamento\" IS NOT NULL UNION SELECT STRFTIME('%Y', \"Data_negativa_o\") AS Year FROM Contratos_Negativacao WHERE \"Data_negativa_o\" IS NOT NULL ) WHERE Year IS NOT NULL ORDER BY Year DESC"
        try:
             years_data = conn.execute(years_query).fetchall()
        except sqlite3.Error:
             years_data = conn.execute("SELECT DISTINCT STRFTIME('%Y', Data_cancelamento) AS Year FROM Contratos WHERE Data_cancelamento IS NOT NULL ORDER BY Year DESC").fetchall()

        data_list = []
        total_cancelados = 0
        total_negativados = 0

        # Se nenhuma cidade foi selecionada, retorna apenas as listas de filtros para popular a UI
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
            # Filtros para Cancelados
            params_cancelados = [selected_city]
            where_cancelados_list = ["TRIM(Cidade) = ?", "Status_contrato = 'Inativo'", "Status_acesso = 'Desativado'", "Bairro IS NOT NULL", "TRIM(Bairro) != ''"]
            add_date_range_filter(where_cancelados_list, params_cancelados, "Data_cancelamento", start_date, end_date)
            where_cancelados = " AND ".join(where_cancelados_list)

            # Filtros para Negativados de Contratos_Negativacao
            params_negativados_cn = [selected_city]
            where_negativados_cn_list = ["TRIM(Cidade) = ?", "Bairro IS NOT NULL", "TRIM(Bairro) != ''", "Cidade NOT IN ('Caçapava', 'Jacareí', 'São José dos Campos')"]
            add_date_range_filter(where_negativados_cn_list, params_negativados_cn, "Data_negativa_o", start_date, end_date)
            where_negativados_cn = " AND ".join(where_negativados_cn_list)

            # Filtros para Negativados de Contratos
            params_negativados_c = [selected_city]
            where_negativados_c_list = ["TRIM(Cidade) = ?", "Status_contrato = 'Negativado'", "Bairro IS NOT NULL", "TRIM(Bairro) != ''", "Cidade NOT IN ('Caçapava', 'Jacareí', 'São José dos Campos')"]
            add_date_range_filter(where_negativados_c_list, params_negativados_c, "Data_cancelamento", start_date, end_date)
            where_negativados_c = " AND ".join(where_negativados_c_list)

            # --- MODIFICADO: Adiciona Data_ativa_o e end_date ---
            # AS Bairro garante que o nome da coluna seja consistente
            df_cancelados = pd.read_sql_query(f"SELECT Bairro AS Bairro, 'Cancelado' AS Status, Data_ativa_o, Data_cancelamento AS end_date FROM Contratos WHERE {where_cancelados}", conn, params=tuple(params_cancelados))
            df_negativados_c = pd.read_sql_query(f"SELECT Bairro AS Bairro, 'Negativado' AS Status, Data_ativa_o, Data_cancelamento AS end_date FROM Contratos WHERE {where_negativados_c}", conn, params=tuple(params_negativados_c))
            df_negativados_cn = pd.DataFrame()
            try:
                df_negativados_cn = pd.read_sql_query(f"SELECT Bairro AS Bairro, 'Negativado' AS Status, Data_ativa_o, Data_negativa_o AS end_date FROM Contratos_Negativacao WHERE {where_negativados_cn}", conn, params=tuple(params_negativados_cn))
            except pd.io.sql.DatabaseError as e:
                if "no such table" not in str(e): raise e
                print("Aviso: Tabela Contratos_Negativacao não encontrada.")

            df_all = pd.concat([df_cancelados, df_negativados_c, df_negativados_cn], ignore_index=True)
            # --- FIM DA MODIFICAÇÃO ---
            
            # --- LÓGICA DE FILTRO DE RELEVÂNCIA ---
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
            # --- FIM DA LÓGICA ---

            if not df_all.empty:
                # Garante que 'Bairro' é a coluna usada para agrupar (case sensitive no pandas)
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


@custom_analysis_bp.route('/cancellations_by_equipment')
def api_cancellations_by_equipment():
    conn = get_db()
    try:
        start_date = request.args.get('start_date', '')
        end_date = request.args.get('end_date', '')
        city = request.args.get('city', '')
        relevance = request.args.get('relevance', '') # <-- NOVO FILTRO

        # --- CONSTRUÇÃO DOS FILTROS DINÂMICOS ---
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

        # --- MODIFICADO: Adiciona Data_ativa_o e end_date ---
        df_cancelados = pd.read_sql_query(f"SELECT ID, Data_ativa_o, Data_cancelamento AS end_date FROM Contratos C WHERE {where_cancelados_sql}", conn, params=tuple(params_cancelados))
        df_negativados_c = pd.read_sql_query(f"SELECT ID, Data_ativa_o, Data_cancelamento AS end_date FROM Contratos C WHERE {where_negativados_c_sql}", conn, params=tuple(params_negativados_c))
        df_negativados_cn = pd.DataFrame()
        try:
             df_negativados_cn = pd.read_sql_query(f"SELECT ID, Data_ativa_o, Data_negativa_o AS end_date FROM Contratos_Negativacao CN WHERE {where_negativados_cn_sql}", conn, params=tuple(params_negativados_cn))
        except pd.io.sql.DatabaseError as e:
            if "no such table" not in str(e): raise e
            print("Aviso: Tabela Contratos_Negativacao não encontrada.")

        df_contracts = pd.concat([df_cancelados, df_negativados_c, df_negativados_cn], ignore_index=True).drop_duplicates(subset=['ID'])
        df_contracts['ID'] = df_contracts['ID'].astype(str).str.strip()
        # --- FIM DA MODIFICAÇÃO ---

        # --- LÓGICA DE FILTRO DE RELEVÂNCIA ---
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
             data_list = []
             total_equipments = 0
        else:
            # Busca equipamentos devolvidos para os contratos relevantes
            # Garante que Descricao_produto não seja nulo ou vazio
            query_equipment = """
                SELECT TRIM(ID_contrato) AS ID_contrato, Descricao_produto
                FROM Equipamento
                WHERE Status_comodato = 'Baixa'
                  AND Descricao_produto IS NOT NULL
                  AND TRIM(Descricao_produto) != ''
            """
            df_equipment = pd.read_sql_query(query_equipment, conn)
            df_equipment['ID_contrato'] = df_equipment['ID_contrato'].astype(str).str.strip()

            # Junta e processa
            df_merged = pd.merge(df_contracts, df_equipment, left_on='ID', right_on='ID_contrato', how='inner')

            # Expande para incluir Roteador Associado
            onu_masks = df_merged['Descricao_produto'].str.contains('ONU AN5506-01|ONU AN5506-02', na=False)
            df_routers = df_merged[onu_masks].copy()
            if not df_routers.empty:
                df_routers['Descricao_produto'] = 'ROTEADOR (Associado a ONU)'
                df_expanded = pd.concat([df_merged, df_routers], ignore_index=True)
            else:
                df_expanded = df_merged

            # Agrupa e conta
            df_grouped = df_expanded.groupby('Descricao_produto').size().reset_index(name='Count')

            # Agrupa nomes similares
            df_grouped['Descricao_produto'] = df_grouped['Descricao_produto'].replace({
                r'^ONU AN5506-01.*': 'ONU AN5506-01 (Agrupado)',
                r'^ONU AN5506-02.*': 'ONU AN5506-02 (Agrupado)',
                r'^ONU HG6143D.*': 'ONU HG6143D (Agrupado)'
            }, regex=True)

            # Re-agrega após agrupar nomes
            df_final = df_grouped.groupby('Descricao_produto')['Count'].sum().reset_index()
            df_final = df_final.sort_values(by='Count', ascending=False).head(20)

            data_list = df_final.to_dict('records')
            total_equipments = df_expanded.shape[0] # Conta total antes de agrupar nomes


        # Busca anos e cidades para filtros (queries originais mantidas)
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


@custom_analysis_bp.route('/equipment_by_olt')
def api_equipment_by_olt():
    """
    Busca equipamentos em comodato, agrupados por descrição,
    com filtro opcional por cidade.
    """
    conn = get_db()
    try:
        city = request.args.get('city', '')

        # --- Lógica de Filtro ---
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

        # --- Query Principal (Modificada) ---
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

        # --- Query para Filtro de Cidades ---
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


# --- INÍCIO DA ROTA DE ANÁLISE DE COORTE DE RETENÇÃO (VERSÃO SUPER ROBUSTA) ---
@custom_analysis_bp.route('/cohort')
def api_cohort_analysis():
    """
    Endpoint para gerar dados para uma análise de coorte de retenção cumulativa.
    USA UMA ÚNICA QUERY SQL OTIMIZADA PARA EVITAR ERROS DE TIPO NO PANDAS.
    FORÇA A CONVERSÃO DE IDs PARA REAL PARA CORRESPONDER '12345' E '12345.0'.
    """
    conn = get_db()
    
    # Dicionário para guardar dados de fallback (listas de filtros)
    fallback_filters = {"cities": [], "years": []}
    
    try:
        # --- 1. Obter Filtros ---
        city = request.args.get('city', '')
        start_date = request.args.get('start_date', '')
        end_date = request.args.get('end_date', '')

        # --- 2. Buscar Cidades e Anos para os Filtros (sempre fazer isso) ---
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
        except sqlite3.Error as e:
            print(f"Aviso (Coorte - Cidades): Query UNION falhou ({e}). Usando fallback para Contratos.")
            try:
                cities_query_fallback = "SELECT DISTINCT Cidade FROM Contratos WHERE Cidade IS NOT NULL AND TRIM(Cidade) != '' ORDER BY Cidade"
                cities_data = conn.execute(cities_query_fallback).fetchall()
                fallback_filters["cities"] = [row[0] for row in cities_data if row[0]]
            except sqlite3.Error as e_fallback:
                print(f"Erro (Coorte - Cidades): Fallback também falhou: {e_fallback}")
                
        try:
            years_query = """
                SELECT DISTINCT STRFTIME('%Y', Data_ativa_o) AS Year FROM Contratos WHERE Data_ativa_o IS NOT NULL
                UNION
                SELECT DISTINCT STRFTIME('%Y', Data_ativa_o) AS Year FROM Contratos_Negativacao WHERE Data_ativa_o IS NOT NULL
                ORDER BY Year DESC
            """
            years_data = conn.execute(years_query).fetchall()
            fallback_filters["years"] = [row[0] for row in years_data if row[0]]
        except sqlite3.Error as e:
            print(f"Aviso (Coorte - Anos): Query UNION falhou ({e}). Usando fallback para Contratos.")
            try:
                years_query_fallback = "SELECT DISTINCT STRFTIME('%Y', Data_ativa_o) AS Year FROM Contratos WHERE Data_ativa_o IS NOT NULL ORDER BY Year DESC"
                years_data = conn.execute(years_query_fallback).fetchall()
                fallback_filters["years"] = [row[0] for row in years_data if row[0]]
            except sqlite3.Error as e_fallback:
                 print(f"Erro (Coorte - Anos): Fallback também falhou: {e_fallback}")

        # --- 3. Construir Cláusula WHERE e Parâmetros para Contratos ---
        where_clauses = ["C.Data_ativa_o IS NOT NULL"]
        params = []
        if city:
            where_clauses.append("C.Cidade = ?")
            params.append(city)
        add_date_range_filter(where_clauses, params, "C.Data_ativa_o", start_date, end_date)
        
        where_sql = " AND ".join(where_clauses)

        # --- 4. Determinar se a tabela Contratos_Negativacao existe ---
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='Contratos_Negativacao';")
        negativacao_table_exists = cursor.fetchone() is not None

        # --- 5. Construir a Query SQL Unificada dinamicamente ---
        
        # Partes da Query
        all_contracts_cte = ""
        all_churn_cte = ""

        # ***** CORREÇÃO DEFINITIVA: USAR CAST(TRIM(ID) AS INTEGER) *****
        # Isto força '12345' e '12345.0' a serem tratados como o mesmo número
        cast_as_int_c = "CAST(TRIM(ID) AS INTEGER)"
        cast_as_int_cn = "CAST(TRIM(ID) AS INTEGER)"
        cast_as_int_car = "CAST(TRIM(ID_Contrato_Recorrente) AS INTEGER)"

        
        if negativacao_table_exists:
            print("Info (Coorte): Tabela 'Contratos_Negativacao' encontrada. Usando query completa com CAST AS INTEGER.")
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
            print("Aviso (Coorte): Tabela 'Contratos_Negativacao' NÃO encontrada. Usando query de fallback (apenas Contratos) com CAST AS INTEGER.")
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

        # Query SQL Final (Otimizada para usar JOINs robustos)
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
        
        # --- 6. Executar a Query e Processar os dados ---
        cohort_data = pd.read_sql_query(query, conn, params=tuple(params))

        if cohort_data.empty:
             print("Aviso (Coorte): A query SQL (versão INTEGER) não retornou dados. Verifique a lógica de datas e IDs.")
             return jsonify({
                "datasets": [], 
                "labels": [],
                "cities": fallback_filters["cities"],
                "years": fallback_filters["years"]
            })

        # --- 7. Processamento com Pandas (para formatar para o gráfico) ---
        cohort_data['CohortMonth'] = pd.to_datetime(cohort_data['CohortMonth']).dt.to_period('M')
        cohort_data['InvoiceMonth'] = pd.to_datetime(cohort_data['InvoiceMonth']).dt.to_period('M')
        
        all_months = sorted(cohort_data['InvoiceMonth'].unique())
        cohorts = sorted(cohort_data['CohortMonth'].unique())

        datasets = []
        for cohort in cohorts:
            cohort_df = cohort_data[cohort_data['CohortMonth'] == cohort]
            
            # Mapeia os meses faturados para os seus valores
            month_map = pd.Series(cohort_df['ActiveClients'].values, index=cohort_df['InvoiceMonth'])
            # Reindexa para o range completo de meses (preenche com 0 se faltar)
            month_map = month_map.reindex(all_months, fill_value=0)
            
            # Filtra apenas os meses a partir do início do coorte
            month_map_filtered = month_map[month_map.index >= cohort]
            
            client_counts = [int(count) for count in month_map_filtered.values]
            padding = [0] * (len(all_months) - len(month_map_filtered)) # Padding para meses ANTES do coorte
            
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
        # Mesmo em erro, tenta retornar os filtros
        return jsonify({
            "error": f"Ocorreu um erro inesperado: {e}",
            "datasets": [],
            "labels": [],
            "cities": fallback_filters.get("cities", []),
            "years": fallback_filters.get("years", [])
        }), 500
    finally:
        if conn: conn.close()
# --- FIM DA ROTA DE ANÁLISE DE COORTE ---


@custom_analysis_bp.route('/daily_evolution_by_city')
def api_daily_evolution_by_city():
    conn = get_db()
    try:
        start_date_str = request.args.get('start_date')
        end_date_str = request.args.get('end_date')

        params = []
        where_clauses = []

        if start_date_str:
            where_clauses.append("event_date >= ?")
            params.append(start_date_str)
        if end_date_str:
            where_clauses.append("event_date <= ?")
            params.append(end_date_str)

        where_sql = "WHERE " + " AND ".join(where_clauses) if where_clauses else ""

        base_query = """
            WITH all_events AS (
                SELECT Cidade, DATE(Data_ativa_o) as event_date, 'ativacao' as event_type FROM Contratos WHERE Data_ativa_o IS NOT NULL AND Cidade IS NOT NULL AND TRIM(Cidade) != ''
                UNION ALL
                -- <<< INÍCIO DA CORREÇÃO (O ERRO ESTAVA AQUI) >>>
                SELECT Cidade, DATE(Data_ativa_o) as event_date, 'ativacao' as event_type FROM Contratos_Negativacao WHERE Data_ativa_o IS NOT NULL AND Cidade IS NOT NULL AND TRIM(Cidade) != ''
                -- <<< FIM DA CORREÇÃO (Era 'Data_iva_o') >>>
                UNION ALL
                SELECT Cidade, DATE(Data_cancelamento) as event_date, 'churn' as event_type FROM Contratos WHERE Data_cancelamento IS NOT NULL AND Status_contrato = 'Inativo' AND Cidade IS NOT NULL AND TRIM(Cidade) != ''
                UNION ALL
                SELECT Cidade, DATE(Data_negativa_o) as event_date, 'churn' as event_type FROM Contratos_Negativacao WHERE Data_negativa_o IS NOT NULL AND Cidade IS NOT NULL AND TRIM(Cidade) != ''
                UNION ALL
                SELECT Cidade, DATE(Data_cancelamento) as event_date, 'churn' as event_type FROM Contratos WHERE Data_cancelamento IS NOT NULL AND Status_contrato = 'Negativado' AND Cidade IS NOT NULL AND TRIM(Cidade) != ''
            )
        """

        query = f"""
            {base_query}
            SELECT
                Cidade,
                event_date,
                SUM(CASE WHEN event_type = 'ativacao' THEN 1 ELSE 0 END) AS ativacoes,
                SUM(CASE WHEN event_type = 'churn' THEN 1 ELSE 0 END) AS churn
            FROM all_events
            {where_sql}
            GROUP BY Cidade, event_date
            ORDER BY Cidade, event_date;
        """

        totals_query = f"""
            {base_query}
            SELECT
                Cidade,
                SUM(CASE WHEN event_type = 'ativacao' THEN 1 ELSE 0 END) AS total_ativacoes,
                SUM(CASE WHEN event_type = 'churn' THEN 1 ELSE 0 END) AS total_churn
            FROM all_events
            {where_sql}
            GROUP BY Cidade;
        """

        results = conn.execute(query, tuple(params)).fetchall()
        totals_results = conn.execute(totals_query, tuple(params)).fetchall()

        data_by_city = {}
        for row in results:
            city = row['Cidade']
            if city not in data_by_city:
                data_by_city[city] = {'daily_data': [], 'totals': {}}
            data_by_city[city]['daily_data'].append({
                'date': row['event_date'],
                'ativacoes': row['ativacoes'],
                'churn': row['churn']
            })

        for row in totals_results:
            city = row['Cidade']
            if city in data_by_city:
                data_by_city[city]['totals'] = {
                    'total_ativacoes': row['total_ativacoes'],
                    'total_churn': row['total_churn']
                }

        return jsonify({"data": data_by_city})

    except sqlite3.Error as e:
        if "no such table" in str(e).lower() and "contratos_negativacao" in str(e).lower():
             print("Aviso: Tabela 'Contratos_Negativacao' não encontrada. Executando query de fallback.")

             params = []
             where_clauses = []
             if start_date_str: where_clauses.append("event_date >= ?"); params.append(start_date_str)
             if end_date_str: where_clauses.append("event_date <= ?"); params.append(end_date_str)
             where_sql = "WHERE " + " AND ".join(where_clauses) if where_clauses else ""

             fallback_base_query = """
                WITH all_events AS (
                    SELECT Cidade, DATE(Data_ativa_o) as event_date, 'ativacao' as event_type FROM Contratos WHERE Data_ativa_o IS NOT NULL AND Cidade IS NOT NULL AND TRIM(Cidade) != ''
                    UNION ALL
                    SELECT Cidade, DATE(Data_cancelamento) as event_date, 'churn' as event_type FROM Contratos WHERE Data_cancelamento IS NOT NULL AND (Status_contrato = 'Inativo' OR Status_contrato = 'Negativado') AND Cidade IS NOT NULL AND TRIM(Cidade) != ''
                )
             """
             fallback_query = f"{fallback_base_query} SELECT Cidade, event_date, SUM(CASE WHEN event_type = 'ativacao' THEN 1 ELSE 0 END) AS ativacoes, SUM(CASE WHEN event_type = 'churn' THEN 1 ELSE 0 END) AS churn FROM all_events {where_sql} GROUP BY Cidade, event_date ORDER BY Cidade, event_date;"
             fallback_totals_query = f"{fallback_base_query} SELECT Cidade, SUM(CASE WHEN event_type = 'ativacao' THEN 1 ELSE 0 END) AS total_ativacoes, SUM(CASE WHEN event_type = 'churn' THEN 1 ELSE 0 END) AS total_churn FROM all_events {where_sql} GROUP BY Cidade;"

             results = conn.execute(fallback_query, tuple(params)).fetchall()
             totals_results = conn.execute(fallback_totals_query, tuple(params)).fetchall()

             data_by_city = {}
             for row in results:
                 city = row['Cidade']
                 if city not in data_by_city:
                     data_by_city[city] = {'daily_data': [], 'totals': {}}
                 data_by_city[city]['daily_data'].append({'date': row['event_date'], 'ativacoes': row['ativacoes'], 'churn': row['churn']})
             for row in totals_results:
                 city = row['Cidade']
                 if city in data_by_city:
                     data_by_city[city]['totals'] = {'total_ativacoes': row['total_ativacoes'], 'total_churn': row['total_churn']}
             return jsonify({"data": data_by_city})

        print(f"Erro na base de dados na análise de evolução diária: {e}")
        return jsonify({"error": f"Erro interno ao processar a análise. Detalhe: {e}"}), 500
    finally:
        if conn: conn.close()


@custom_analysis_bp.route('/active_clients_evolution')
def api_active_clients_evolution():
    conn = get_db()
    try:
        start_date_str = request.args.get('start_date')
        end_date_str = request.args.get('end_date')
        city = request.args.get('city', '')
        
        # Pega as strings separadas por vírgula
        status_contrato_str = request.args.get('status_contrato', '')
        status_acesso_str = request.args.get('status_acesso', '')

        if not start_date_str or not end_date_str:
            return jsonify({"error": "Data inicial e final são obrigatórias."}), 400

        # --- Query Base ---
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
        
        # --- LÓGICA MULTI-SELECT (SQL IN) ---
        if status_contrato_str:
            # Se vier separado por vírgula (embora seja select, pode ser útil se mudar para checkbox)
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
        # ------------------------------------
            
        all_contracts_cte += ")" 

        params.extend([start_date_str, end_date_str])

        # Query Principal (Mantida igual)
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
                print("Aviso: Tabela Contratos_Negativacao não encontrada (Evolução Ativos). Usando fallback.")
                # Versão simplificada sem UNION se a tabela não existir
                fallback_query = query.replace("UNION\n                SELECT ID, Data_ativa_o, Data_negativa_o AS End_Date, 'Negativado' AS Status_contrato, 'Desativado' AS Status_acesso, Cidade\n                FROM Contratos_Negativacao\n                WHERE Data_ativa_o IS NOT NULL", "")
                data = conn.execute(fallback_query, tuple(params)).fetchall()
            else:
                raise e

        # Query de Cidades (para o filtro) - Excluindo as 3 proibidas
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

@custom_analysis_bp.route('/faturamento_por_cidade')
def api_faturamento_por_cidade():
    """
    Busca dados de faturamento para três gráficos específicos, com filtros de período e cidade.
    """
    conn = get_db()
    try:
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        city = request.args.get('city', '')

        if not start_date or not end_date:
            return jsonify({"error": "As datas inicial e final são obrigatórias."}), 400

        params = {'start_date': start_date, 'end_date': end_date}
        
        # --- INÍCIO DA CORREÇÃO ---
        
        # CORREÇÃO 1: 'from_join_clause_ativos' (para query2) e 'from_join_clause_grafico3' (para query3)
        # SÃO DEFINIDAS AQUI FORA, incondicionalmente, pois essas queries SEMPRE precisam do JOIN com Contratos.
        from_join_clause_ativos = 'FROM "Contas_a_Receber" CR JOIN "Contratos" AS C ON CR.ID_Contrato_Recorrente = C.ID'
        from_join_clause_grafico3 = 'FROM "Contas_a_Receber" as CR JOIN "Contratos" as C ON CR.ID_Contrato_Recorrente = C.ID'

        # CORREÇÃO 2: Lógica do filtro de cidade para Query 1 (Faturamento Total) vs Queries 2 e 3.
        if city:
            params['city'] = city
            
            # Query 1 usa CR.Cidade e NÃO faz JOIN com Contratos
            city_clause_query1 = " AND CR.Cidade = :city "
            
            # Queries 2 e 3 usam C.Cidade e FAZEM JOIN com Contratos
            city_clause_query2_3 = " AND C.Cidade = :city "
        else:
            city_clause_query1 = ""
            city_clause_query2_3 = ""
        
        # Query 1 sempre sem JOIN para respeitar o filtro de cidade da tabela Contas_a_Receber
        from_join_clause_query1 = 'FROM "Contas_a_Receber" CR'
        
        # --- FIM DA CORREÇÃO ---


        # --- INÍCIO DA CONSTRUÇÃO DAS QUERIES ---
        
        # --- Query 1: Faturamento Total (Usa CR.Cidade) ---
        
        # 1. Recebido (usa Data_pagamento)
        where_recebido_q1 = f"WHERE CR.Data_pagamento BETWEEN :start_date AND :end_date {city_clause_query1}"
        # 2. A receber (usa Vencimento)
        where_areceber_q1 = f"WHERE CR.Status = 'A receber' AND CR.Vencimento BETWEEN :start_date AND :end_date {city_clause_query1}"
        # 3. Cancelado (usa Vencimento e Status = 'Cancelado')
        where_cancelado_q1 = f"WHERE CR.Status = 'Cancelado' AND CR.Vencimento BETWEEN :start_date AND :end_date {city_clause_query1}"

        query1 = f"""
            -- 1. Recebidos
            SELECT
                STRFTIME('%Y-%m', CR.Data_pagamento) AS Month,
                'Recebido' AS Status,
                SUM(CR.Valor_recebido) AS Total_Value
            {from_join_clause_query1}
            {where_recebido_q1}
            GROUP BY Month
            
            UNION ALL
            
            -- 2. A receber
            SELECT
                STRFTIME('%Y-%m', CR.Vencimento) AS Month,
                'A receber' AS Status,
                SUM(CR.Valor) AS Total_Value
            {from_join_clause_query1}
            {where_areceber_q1}
            GROUP BY Month
            
            UNION ALL
            
            -- 3. Cancelado
            SELECT
                STRFTIME('%Y-%m', CR.Vencimento) AS Month,
                'Cancelado' AS Status,
                SUM(CR.Valor_cancelado) AS Total_Value
            {from_join_clause_query1}
            {where_cancelado_q1}
            GROUP BY Month
        """

        # --- Query 2: Contas a Receber (Ativos) (Usa JOIN e C.Cidade) ---
        
        # Cláusulas WHERE específicas para query 2 (usando C.Cidade)
        where_recebido_q2 = f"WHERE CR.Data_pagamento BETWEEN :start_date AND :end_date {city_clause_query2_3}"
        where_areceber_q2 = f"WHERE CR.Status = 'A receber' AND CR.Vencimento BETWEEN :start_date AND :end_date {city_clause_query2_3}"
        where_cancelado_q2 = f"WHERE CR.Status = 'Cancelado' AND CR.Vencimento BETWEEN :start_date AND :end_date {city_clause_query2_3}"

        query2 = f"""
            WITH ActiveAndNonNegativeClients AS (
                SELECT DISTINCT C.Cliente FROM Contratos C
                WHERE C.Status_contrato = 'Ativo' AND C.Status_acesso != 'Desativado'
                AND C.Cliente NOT IN (SELECT DISTINCT CN.Cliente FROM Contratos_Negativacao CN)
            )
            -- 1. Recebidos
            SELECT
                STRFTIME('%Y-%m', CR.Data_pagamento) AS Month,
                'Recebido' AS Status,
                SUM(CR.Valor_recebido) AS Total_Value
            {from_join_clause_ativos}
            {where_recebido_q2}
            AND C.Cliente IN (SELECT Cliente FROM ActiveAndNonNegativeClients)
            GROUP BY Month
            
            UNION ALL
            
            -- 2. A receber
            SELECT
                STRFTIME('%Y-%m', CR.Vencimento) AS Month,
                'A receber' AS Status,
                SUM(CR.Valor) AS Total_Value
            {from_join_clause_ativos}
            {where_areceber_q2}
            AND C.Cliente IN (SELECT Cliente FROM ActiveAndNonNegativeClients)
            GROUP BY Month
            
            UNION ALL
            
            -- 3. Cancelado
            SELECT
                STRFTIME('%Y-%m', CR.Vencimento) AS Month,
                'Cancelado' AS Status,
                SUM(CR.Valor_cancelado) AS Total_Value
            {from_join_clause_ativos}
            {where_cancelado_q2}
            AND C.Cliente IN (SELECT Cliente FROM ActiveAndNonNegativeClients)
            GROUP BY Month
        """

        # --- Query 3: Comparativo por Dia de Vencimento (Usa JOIN e C.Cidade) ---
        query3 = f"""
            SELECT C.Dia_fixo_do_vencimento AS Due_Day, STRFTIME('%Y-%m', CR.Vencimento) AS Month, SUM(CR.Valor) AS Total_Value
            {from_join_clause_grafico3}
            WHERE CR.Vencimento BETWEEN :start_date AND :end_date {city_clause_query2_3}
              AND C.Dia_fixo_do_vencimento IS NOT NULL
            GROUP BY Due_Day, Month
        """

        # Obter Cidades para o Filtro (mantém consulta em Contratos pois é a lista mestre)
        cities_query = "SELECT DISTINCT Cidade FROM Contratos WHERE Cidade IS NOT NULL AND TRIM(Cidade) != '' ORDER BY Cidade"

        data1 = conn.execute(query1, params).fetchall()
        
        # O query2 precisa da tabela Contratos_Negativacao, então fazemos um try/except
        data2 = []
        try:
            data2 = conn.execute(query2, params).fetchall()
        except sqlite3.Error as e:
            if "no such table" in str(e).lower() and "contratos_negativacao" in str(e).lower():
                print("Aviso (Faturamento): Tabela Contratos_Negativacao não encontrada. Gráfico de Ativos (query2) será executado sem este filtro.")
                query2_fallback = query2.replace("AND C.Cliente NOT IN (SELECT DISTINCT CN.Cliente FROM Contratos_Negativacao CN)", "")
                data2 = conn.execute(query2_fallback, params).fetchall()
            else:
                raise e # Lança outros erros

        data3 = conn.execute(query3, params).fetchall()
        cities_data = conn.execute(cities_query).fetchall()

        return jsonify({
            "faturamento_total": [dict(row) for row in data1],
            "faturamento_ativos": [dict(row) for row in data2],
            "faturamento_por_dia_vencimento": [dict(row) for row in data3],
            "cities": [row[0] for row in cities_data]
        })

    except sqlite3.Error as e:
        print(f"Erro na base de dados ao buscar faturamento por cidade: {e}")
        traceback.print_exc()
        return jsonify({"error": "Erro interno ao processar a solicitação."}), 500
    except Exception as e:
        print(f"Erro inesperado ao buscar faturamento por cidade: {e}")
        traceback.print_exc()
        return jsonify({"error": f"Erro interno inesperado. Detalhe: {e}"}), 500
    finally:
        if conn: conn.close()

# --- ROTA ATUALIZADA PARA ATIVAÇÃO POR VENDEDOR ---
@custom_analysis_bp.route('/activations_by_seller')
def api_activations_by_seller():
    """
    Busca e renderiza a análise de "Ativação por Vendedor" com cards e tabela.
    Filtra por Cidade, Ano (Data_ativa_o) e Mês (Data_ativa_o).
    """
    conn = get_db()
    try:
        city = request.args.get('city', '')
        start_date = request.args.get('start_date', '')
        end_date = request.args.get('end_date', '')

        # --- 1. Constrói filtros para a query de Contratos ---
        params_contracts = []
        where_contracts_list = ["Data_ativa_o IS NOT NULL", "Vendedor IS NOT NULL"]
        
        if city:
            where_contracts_list.append("Cidade = ?")
            params_contracts.append(city)
        
        add_date_range_filter(where_contracts_list, params_contracts, "Data_ativa_o", start_date, end_date)
        
        # Substitui C. por "" nos nomes de colunas para funcionar no Contratos_Negativacao
        where_contracts_sql_union = " AND ".join(where_contracts_list).replace("C.", "")

        # --- 2. Busca todos os contratos que correspondem aos filtros de ativação ---
        # --- ALTERAÇÃO: Adiciona a coluna 'Cidade' ao SELECT ---
        query_all_activations = f"""
            SELECT ID, Vendedor AS Vendedor_ID, Status_contrato, Data_cancelamento, 0 AS is_negativado_table, Cidade
            FROM Contratos C
            WHERE {" AND ".join(where_contracts_list)}
            
            UNION
            
            SELECT ID, Vendedor AS Vendedor_ID, 'Negativado' AS Status_contrato, Data_negativa_o AS Data_cancelamento, 1 AS is_negativado_table, Cidade
            FROM Contratos_Negativacao C
            WHERE {where_contracts_sql_union}
        """

        try:
            # Passa os parâmetros duas vezes, um para cada lado do UNION
            df_contracts_all = pd.read_sql_query(query_all_activations, conn, params=tuple(params_contracts * 2))

            # Deduplica os IDs, priorizando a informação da tabela Contratos (is_negativado_table = 0)
            df_contracts_all.sort_values(by='is_negativado_table', ascending=True, inplace=True)
            df_contracts = df_contracts_all.drop_duplicates(subset=['ID'], keep='first')
        
        except pd.io.sql.DatabaseError as e:
            if "no such table" in str(e).lower(): # Fallback se Contratos_Negativacao não existir
                print("Aviso: Tabela Contratos_Negativacao não encontrada. Usando apenas Contratos para ativações.")
                query_fallback = f"""
                    SELECT ID, Vendedor AS Vendedor_ID, Status_contrato, Data_cancelamento, Cidade
                    FROM Contratos C
                    WHERE {" AND ".join(where_contracts_list)}
                """
                df_contracts = pd.read_sql_query(query_fallback, conn, params=tuple(params_contracts))
            else:
                raise e # Lança outros erros de DB

        # --- 3. Busca Cidades e Anos para os filtros (FAZENDO ISSO ANTES DE RETORNAR) ---
        
        # --- CORREÇÃO ROBUSTA PARA CIDADES ---
        cities = []
        try:
            cities_query = """
                SELECT DISTINCT Cidade FROM (
                    SELECT Cidade FROM Contratos WHERE Cidade IS NOT NULL AND TRIM(Cidade) != ''
                    UNION
                    SELECT Cidade FROM Contratos_Negativacao WHERE Cidade IS NOT NULL AND TRIM(Cidade) != ''
                ) WHERE Cidade IS NOT NULL ORDER BY Cidade
            """
            cities_data = conn.execute(cities_query).fetchall()
            cities = [row[0] for row in cities_data if row[0]]
        except sqlite3.Error as e:
            print(f"Aviso (Ativação Vendedor - Cidades): Query UNION falhou ({e}). Usando fallback para Contratos.")
            try:
                cities_query_fallback = "SELECT DISTINCT Cidade FROM Contratos WHERE Cidade IS NOT NULL AND TRIM(Cidade) != '' ORDER BY Cidade"
                cities_data = conn.execute(cities_query_fallback).fetchall()
                cities = [row[0] for row in cities_data if row[0]]
            except sqlite3.Error as e_fallback:
                print(f"Erro (Ativação Vendedor - Cidades): Fallback também falhou: {e_fallback}")
                
        # --- CORREÇÃO ROBUSTA PARA ANOS ---
        years = []
        try:
            years_query = """
                SELECT DISTINCT STRFTIME('%Y', Data_ativa_o) AS Year FROM Contratos WHERE Data_ativa_o IS NOT NULL
                UNION
                SELECT DISTINCT STRFTIME('%Y', Data_ativa_o) AS Year FROM Contratos_Negativacao WHERE Data_ativa_o IS NOT NULL
                ORDER BY Year DESC
            """
            years_data = conn.execute(years_query).fetchall()
            years = [row[0] for row in years_data if row[0]]
        except sqlite3.Error as e:
            print(f"Aviso (Ativação Vendedor - Anos): Query UNION falhou ({e}). Usando fallback para Contratos.")
            try:
                years_query_fallback = "SELECT DISTINCT STRFTIME('%Y', Data_ativa_o) AS Year FROM Contratos WHERE Data_ativa_o IS NOT NULL ORDER BY Year DESC"
                years_data = conn.execute(years_query_fallback).fetchall()
                years = [row[0] for row in years_data if row[0]]
            except sqlite3.Error as e_fallback:
                 print(f"Erro (Ativação Vendedor - Anos): Fallback também falhou: {e_fallback}")
        # --- FIM DAS CORREÇÕES ROBUSTAS ---
        

        # Se não houver contratos, retorna cedo (mas com as listas de filtros)
        if df_contracts.empty:
            return jsonify({"data": [], "totals": {}, "cities": cities, "years": years})

        # Garante que os IDs sejam strings para o merge
        df_contracts['ID'] = df_contracts['ID'].astype(str).str.strip()
        df_contracts['Vendedor_ID'] = df_contracts['Vendedor_ID'].astype(str)
        
        # --- 4. Busca Nomes dos Vendedores ---
        df_vendedores = pd.read_sql_query("SELECT ID, Vendedor FROM Vendedores", conn)
        df_vendedores['ID'] = df_vendedores['ID'].astype(str)

        # --- 5. Processamento e Lógica ---
        
        # Define colunas separadas para Cancelado e Negativado
        df_contracts['is_active'] = (df_contracts['Status_contrato'] == 'Ativo')
        df_contracts['is_cancelado'] = (df_contracts['Status_contrato'] == 'Inativo')
        
        # --- ALTERAÇÃO: Adiciona o filtro de cidade para 'is_negativado' ---
        df_contracts['is_negativado'] = (
            (df_contracts['Status_contrato'] == 'Negativado') &
            (~df_contracts['Cidade'].isin(['Caçapava', 'Jacareí', 'São José dos Campos']))
        )

        # Renomeia para df_merged para manter o resto do código
        df_merged = df_contracts

        # Agrupa por Vendedor para contar
        df_grouped = df_merged.groupby('Vendedor_ID').agg(
            Total_Ativacoes=('ID', 'count'),
            Permanecem_Ativos=('is_active', 'sum'),
            Cancelados=('is_cancelado', 'sum'),
            Negativados=('is_negativado', 'sum')
        ).reset_index()

        # Junta com os nomes dos vendedores
        df_final = pd.merge(df_grouped, df_vendedores, left_on='Vendedor_ID', right_on='ID', how='left')
        df_final.rename(columns={'Vendedor': 'Vendedor_Nome'}, inplace=True)
        df_final['Vendedor_Nome'] = df_final['Vendedor_Nome'].fillna('Não Identificado')
        
        # Calcula Churn Total
        df_final['Total_Churn'] = df_final['Cancelados'] + df_final['Negativados']

        df_final = df_final.sort_values(by='Total_Ativacoes', ascending=False)
        data_list = df_final.to_dict('records')

        # --- 6. Calcula Totais para os Cards ---
        totals = {
            'total_ativacoes': int(df_final['Total_Ativacoes'].sum()),
            'total_permanecem_ativos': int(df_final['Permanecem_Ativos'].sum()),
            'total_cancelados': int(df_final['Cancelados'].sum()),
            'total_negativados': int(df_final['Negativados'].sum()),
            'total_churn': int(df_final['Total_Churn'].sum())
        }

        # --- 7. Busca Cidades e Anos (JÁ FEITO NO PASSO 3) ---

        return jsonify({
            "data": data_list,
            "totals": totals,
            "cities": cities,
            "years": years
        })

    except sqlite3.Error as e:
        print(f"Erro na base de dados na análise de ativação por vendedor: {e}")
        return jsonify({"error": f"Erro interno ao processar a análise. Detalhe: {e}"}), 500
    except Exception as e:
        import traceback
        print(f"Erro inesperado na análise de ativação por vendedor: {e}")
        traceback.print_exc()
        return jsonify({"error": f"Erro interno inesperado. Detalhe: {e}"}), 500
    finally:
        if conn: conn.close()

# --- INÍCIO DA NOVA ROTA: ANÁLISE DE JUROS POR ATRASO ---
@custom_analysis_bp.route('/late_interest_analysis')
def api_late_interest_analysis():
    """
    Analisa o valor de juros/multas recebidos de faturas pagas com atraso,
    agrupados por faixas de dias de atraso.
    Filtra por ano e mês de PAGAMENTO.
    """
    conn = get_db()
    try:
        start_date = request.args.get('start_date', '')
        end_date = request.args.get('end_date', '')

        params = []
        where_clauses = [
            "CR.Data_pagamento IS NOT NULL",
            "CR.Vencimento IS NOT NULL",
            "CR.Data_pagamento > CR.Vencimento", # Garante que foi paga com atraso
            "(CR.Valor_recebido - CR.Valor) > 0.01" # Garante que houve juros/multa (evita erros de float)
        ]

        add_date_range_filter(where_clauses, params, "CR.Data_pagamento", start_date, end_date)
        
        where_sql = " AND ".join(where_clauses)

        # Query base com os cálculos
        base_query = f"""
            WITH LatePayments AS (
                SELECT
                    (CR.Valor_recebido - CR.Valor) AS Interest_Amount,
                    CAST(JULIANDAY(CR.Data_pagamento) - JULIANDAY(CR.Vencimento) AS INTEGER) AS Delay_Days
                FROM Contas_a_Receber AS CR
                WHERE {where_sql}
            )
        """

        # Query para os totais (Cards)
        totals_query = f"""
            {base_query}
            SELECT
                SUM(Interest_Amount) AS total_interest_amount,
                COUNT(*) AS total_late_payments_count
            FROM LatePayments
        """
        
        totals_data = conn.execute(totals_query, tuple(params)).fetchone()
        totals = dict(totals_data) if totals_data else {
            'total_interest_amount': 0,
            'total_late_payments_count': 0
        }
        # Garante que os valores não sejam None, mas 0
        totals['total_interest_amount'] = totals['total_interest_amount'] or 0
        totals['total_late_payments_count'] = totals['total_late_payments_count'] or 0


        # Query para a tabela (Agrupada por faixas)
        buckets_query = f"""
            {base_query}
            SELECT
                CASE
                    WHEN Delay_Days BETWEEN 1 AND 5 THEN '1-5 dias'
                    WHEN Delay_Days BETWEEN 6 AND 10 THEN '6-10 dias'
                    WHEN Delay_Days BETWEEN 11 AND 15 THEN '11-15 dias'
                    WHEN Delay_Days BETWEEN 16 AND 20 THEN '16-20 dias'
                    WHEN Delay_Days >= 21 THEN '21+ dias'
                    ELSE 'Outros'
                END AS Delay_Bucket,
                COUNT(*) AS Count,
                SUM(Interest_Amount) AS Total_Interest
            FROM LatePayments
            GROUP BY Delay_Bucket
            ORDER BY
                CASE Delay_Bucket
                    WHEN '1-5 dias' THEN 1
                    WHEN '6-10 dias' THEN 2
                    WHEN '11-15 dias' THEN 3
                    WHEN '16-20 dias' THEN 4
                    WHEN '21+ dias' THEN 5
                    ELSE 6
                END
        """

        data = conn.execute(buckets_query, tuple(params)).fetchall()
        data_list = [dict(row) for row in data]

        # Query para os anos (Filtro) - baseada na Data_pagamento
        years_query = """
            SELECT DISTINCT STRFTIME('%Y', Data_pagamento) AS Year
            FROM Contas_a_Receber
            WHERE Data_pagamento IS NOT NULL AND Data_pagamento > Vencimento
            ORDER BY Year DESC
        """
        years_data = conn.execute(years_query).fetchall()
        years = [row[0] for row in years_data if row[0]]

        return jsonify({
            "data": data_list,
            "totals": totals,
            "years": years
        })

    except sqlite3.Error as e:
        print(f"Erro na base de dados na análise de juros por atraso: {e}")
        traceback.print_exc()
        return jsonify({"error": f"Erro interno ao processar a análise. Detalhe: {e}"}), 500
    except Exception as e:
        print(f"Erro inesperado na análise de juros por atraso: {e}")
        traceback.print_exc()
        return jsonify({"error": f"Erro interno inesperado. Detalhe: {e}"}), 500
    finally:
        if conn: conn.close()

        
# --- FIM DA NOVA ROTA ---
import pandas as pd
import sqlite3
from flask import Blueprint, jsonify, request, abort, current_app

# Define o Blueprint
summary_bp = Blueprint('summary_bp', __name__)

# Mapeamento centralizado de colunas de data (movido do api_server.py)
DATE_COLUMN_MAP = {
    'Clientes': 'Data_Cadastro',
    'Contratos': 'Data_cadastro_sistema',
    'Logins': 'ltima_conex_o_final',
    # Adicione outras tabelas e suas colunas de data primárias aqui
}

def get_db():
    """Função auxiliar para obter a conexão do banco de dados a partir do app_context."""
    return current_app.config['GET_DB_CONNECTION']()

# --- Definição das Rotas ---

@summary_bp.route('/tables')
def api_tables():
    """
    Endpoint da API para listar todas as tabelas disponíveis na base de dados.
    """
    conn = get_db()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
        tables = [row[0] for row in cursor.fetchall()]
        return jsonify(tables)
    except sqlite3.Error as e:
        print(f"Erro na base de dados ao listar tabelas: {e}")
        return jsonify({"error": "Erro interno ao procurar tabelas"}), 500
    finally:
        if conn: conn.close()

@summary_bp.route('/data/full/<table_name>')
def api_data_full(table_name):
    """
    Endpoint da API para procurar TODOS os dados de uma tabela específica.
    Usado para análises completas no dashboard principal (quando nenhum filtro específico de data é aplicado).
    """
    conn = get_db()
    try:
        cursor = conn.cursor()
        # Validação segura do nome da tabela
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name = ?;", (table_name,))
        if not cursor.fetchone():
            abort(404, description=f"Tabela '{table_name}' não encontrada.")

        # Uso seguro de f-string após validação
        data = conn.execute(f'SELECT * FROM "{table_name}"').fetchall()
        data_list = [dict(row) for row in data]

        return jsonify(data_list)
    except sqlite3.Error as e:
        print(f"Erro na base de dados ao procurar dados completos da tabela '{table_name}': {e}")
        return jsonify({"error": f"Erro interno ao procurar dados completos da tabela '{table_name}'"}), 500
    finally:
        if conn: conn.close()

@summary_bp.route('/data/<table_name>')
def api_data_paginated(table_name):
    """
    Endpoint da API para procurar dados de uma tabela específica com paginação.
    Usado para a exibição da tabela no modal.
    """
    conn = get_db()
    try:
        cursor = conn.cursor()
        # Validação segura
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name = ?;", (table_name,))
        if not cursor.fetchone():
            abort(404, description=f"Tabela '{table_name}' não encontrada.")

        default_limit = 25
        limit = request.args.get('limit', default_limit, type=int)
        offset = request.args.get('offset', 0, type=int)

        # Garante que limit e offset sejam não negativos
        limit = max(1, limit)
        offset = max(0, offset)

        # Uso seguro de f-string após validação
        count_query = f'SELECT COUNT(*) FROM "{table_name}"'
        total_rows = conn.execute(count_query).fetchone()[0]

        # Uso de placeholders para limit e offset
        data_query = f'SELECT * FROM "{table_name}" LIMIT ? OFFSET ?'
        data = conn.execute(data_query, (limit, offset)).fetchall()

        data_list = [dict(row) for row in data]

        return jsonify({
            "data": data_list,
            "total_rows": total_rows,
            "limit": limit,
            "offset": offset
        })
    except sqlite3.Error as e:
        print(f"Erro na base de dados ao procurar dados paginados da tabela '{table_name}': {e}")
        return jsonify({"error": f"Erro interno ao procurar dados paginados da tabela '{table_name}'"}), 500
    finally:
        if conn: conn.close()

@summary_bp.route('/finance_summary/by_due_date')
def api_finance_summary_by_due_date():
    """
    Busca o faturamento total dos últimos 3 meses, agrupado pelo dia FIXO de vencimento do contrato.
    """
    conn = get_db()
    try:
        # Query otimizada e mais segura
        query = """
            SELECT
                C.Dia_fixo_do_vencimento AS Due_Day,
                STRFTIME('%Y-%m', CR.Vencimento) AS Month,
                SUM(CR.Valor) AS Total_Value
            FROM "Contas_a_Receber" as CR
            JOIN "Contratos" as C ON CR.ID_Contrato_Recorrente = C.ID
            WHERE
                CR.Vencimento >= DATE('now', 'start of month', '-2 months')
                AND CR.Vencimento < DATE('now', 'start of month', '+1 month')
                AND C.Dia_fixo_do_vencimento IS NOT NULL
            GROUP BY
                Due_Day, Month
            ORDER BY
                Due_Day, Month;
        """
        data = conn.execute(query).fetchall()
        data_list = [dict(row) for row in data]
        return jsonify(data_list)
    except sqlite3.Error as e:
        print(f"Erro na base de dados ao buscar faturamento por data de vencimento: {e}")
        return jsonify({"error": "Erro interno ao processar a solicitação."}), 500
    finally:
        if conn: conn.close()


@summary_bp.route('/finance_summary/<table_name>')
def api_finance_summary(table_name):
    """
    Endpoint de resumo para 'Contas a Receber'.
    CORRIGIDO: A lógica de JOIN agora é dinâmica para corresponder à
    soma manual (sem JOIN) quando nenhum filtro de cidade é aplicado.
    """
    conn = get_db()
    try:
        # Validação segura
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name = ?;", (table_name,))
        if not cursor.fetchone():
            abort(404, description=f"Tabela '{table_name}' não encontrada.")
        if table_name != 'Contas_a_Receber':
             abort(400, description="Endpoint inválido para esta tabela.")

        year = request.args.get('year', '')
        month = request.args.get('month', '')
        city = request.args.get('city', '')

        # --- Listas de filtros e parâmetros ---
        date_where_clauses = []
        date_params = {}
        if year:
            date_where_clauses.append("STRFTIME('%Y', {date_col}) = :year")
            date_params['year'] = year
        if month:
            date_where_clauses.append("STRFTIME('%m', {date_col}) = :month")
            date_params['month'] = f'{int(month):02d}'
        
        # --- INÍCIO DA CORREÇÃO ---
        # Define a cláusula JOIN dinamicamente.
        # Só fazemos o JOIN se um filtro de cidade for aplicado,
        # para que os totais (sem filtro) batam com a soma direta da tabela.
        
        base_from_join = ""
        city_where_clause = ""
        
        if city:
            # Usa 'CAR' e 'C' quando há JOIN
            base_from_join = 'FROM "Contas_a_Receber" AS CAR JOIN Contratos AS C ON CAR.ID_Contrato_Recorrente = C.ID'
            city_where_clause = "C.Cidade = :city"
            date_params['city'] = city
        else:
            # Usa 'CAR' sozinho quando NÃO há JOIN
            base_from_join = 'FROM "Contas_a_Receber" AS CAR'
            city_where_clause = "1=1" # Placeholder se não houver cidade

        # O Gráfico "Ativos" (active_clients_stacked_bar_query) SEMPRE precisa do JOIN.
        # Definimos sua cláusula 'from' separadamente.
        base_from_join_ativos = 'FROM "Contas_a_Receber" AS CAR JOIN Contratos AS C ON CAR.ID_Contrato_Recorrente = C.ID'
        # --- FIM DA CORREÇÃO ---


        # --- Status Query (CORRIGIDA com UNION ALL e JOIN dinâmico) ---
        
        # 1. Recebido (por Data_pagamento)
        where_recebido_list = date_where_clauses.copy()
        where_recebido = " AND ".join(where_recebido_list).format(date_col='CAR.Data_pagamento')
        where_recebido = f"WHERE CAR.Data_pagamento IS NOT NULL AND {city_where_clause} AND ({where_recebido})" if where_recebido_list else f"WHERE CAR.Data_pagamento IS NOT NULL AND {city_where_clause}"
        
        # 2. A receber (por Vencimento)
        where_areceber_list = date_where_clauses.copy()
        where_areceber = " AND ".join(where_areceber_list).format(date_col='CAR.Vencimento')
        where_areceber = f"WHERE CAR.Status = 'A receber' AND {city_where_clause} AND ({where_areceber})" if where_areceber_list else f"WHERE CAR.Status = 'A receber' AND {city_where_clause}"
        
        # 3. Cancelado (por Vencimento e Status)
        where_cancelado_list = date_where_clauses.copy()
        where_cancelado = " AND ".join(where_cancelado_list).format(date_col='CAR.Vencimento') # <-- Usa Vencimento
        where_cancelado = f"WHERE CAR.Status = 'Cancelado' AND {city_where_clause} AND ({where_cancelado})" if where_cancelado_list else f"WHERE CAR.Status = 'Cancelado' AND {city_where_clause}"


        status_query = f"""
            SELECT 'Recebido' AS Status, COUNT(CAR.ID) AS Count, SUM(CAR.Valor_recebido) AS Total_Value
            {base_from_join}
            {where_recebido}
            
            UNION ALL
            
            SELECT 'Aberto' AS Status, COUNT(CAR.ID) AS Count, SUM(CAR.Valor) AS Total_Value
            {base_from_join}
            {where_areceber}
            
            UNION ALL
            
            SELECT 'Cancelado' AS Status, COUNT(CAR.ID) AS Count, SUM(CAR.Valor_cancelado) AS Total_Value
            {base_from_join}
            {where_cancelado}
        """
        
        status_summary = conn.execute(status_query, date_params).fetchall()
        status_summary_list = [dict(row) for row in status_summary if row['Count'] is not None and row['Count'] > 0]


        # --- YOY Query (Ano a Ano) (CORRIGIDO: Baseado em Vencimento e JOIN dinâmico) ---
        yoy_params = {}
        if city:
            yoy_params['city'] = city

        yoy_query = f"""
            SELECT STRFTIME('%Y', CAR.Vencimento) AS Year, COUNT(CAR.ID) AS Total_Count, SUM(CAR.Valor) AS Total_Value
            {base_from_join} -- <<< CORRIGIDO (Usa JOIN dinâmico)
            WHERE {city_where_clause} AND CAR.Vencimento IS NOT NULL -- <<< CORRIGIDO (Usa city_where_clause)
            GROUP BY Year ORDER BY Year
        """
        yoy_summary = conn.execute(yoy_query, yoy_params).fetchall() # <<< CORRIGIDO (Usa yoy_params)
        yoy_summary_list = [dict(row) for row in yoy_summary]

        # --- MOM Query (Mês a Mês) (CORRIGIDO: Baseado em Vencimento e JOIN dinâmico) ---
        mom_where_clauses = [city_where_clause] # <<< CORRIGIDO (Começa com a cláusula da cidade)
        mom_params = {}
        if city:
            mom_params['city'] = city # <<< CORRIGIDO (Adiciona o param da cidade)

        if year:
            mom_where_clauses.append("STRFTIME('%Y', CAR.Vencimento) = :year")
            mom_params['year'] = year
        
        # Adiciona a condição base
        mom_where_clauses.append("CAR.Vencimento IS NOT NULL")

        mom_where_sql = "WHERE " + " AND ".join(mom_where_clauses)

        mom_query = f"""
            SELECT STRFTIME('%m', CAR.Vencimento) AS Month, COUNT(CAR.ID) AS Total_Count, SUM(CAR.Valor) AS Total_Value
            {base_from_join} -- (Usa JOIN dinâmico)
            {mom_where_sql}
            GROUP BY Month ORDER BY Month
        """
        mom_summary = conn.execute(mom_query, mom_params).fetchall() # (Usa mom_params)
        mom_summary_list = [dict(row) for row in mom_summary]

        # --- Years Query (para o filtro) (Mantém a lógica original, está OK) ---
        years_query = f"""
            SELECT DISTINCT Year FROM (
                SELECT STRFTIME('%Y', Vencimento) AS Year FROM Contas_a_Receber WHERE Vencimento IS NOT NULL
                UNION
                SELECT STRFTIME('%Y', Data_pagamento) AS Year FROM Contas_a_Receber WHERE Data_pagamento IS NOT NULL
                UNION
                SELECT STRFTIME('%Y', Data_cancelamento) AS Year FROM Contas_a_Receber WHERE Data_cancelamento IS NOT NULL
            )
            WHERE Year IS NOT NULL ORDER BY Year DESC
        """
        years_data = conn.execute(years_query).fetchall()
        unique_years = [row[0] for row in years_data if row[0]]

        # --- Cities Query (para o filtro) (Mantém a lógica original, está OK) ---
        cities_query = "SELECT DISTINCT C.Cidade FROM Contratos C JOIN Contas_a_Receber CAR ON C.ID = CAR.ID_Contrato_Recorrente WHERE C.Cidade IS NOT NULL AND TRIM(C.Cidade) != '' ORDER BY C.Cidade"
        cities_data = conn.execute(cities_query).fetchall()
        unique_cities = [row[0] for row in cities_data]

        # --- Gráficos Empilhados (CORRIGIDOS) ---
        
        date_range_query_part = ""
        start_date_stacked_sql = ""
        end_date_stacked_sql = ""

        if not year and not month:
            start_date_stacked_sql = "DATE('now', 'start of month', '-2 months')"
            end_date_stacked_sql = "DATE('now', 'start of month', '+1 month')"
            date_range_query_part = f"AllMonths AS (SELECT STRFTIME('%Y-%m', DATE({start_date_stacked_sql})) AS Month UNION SELECT STRFTIME('%Y-%m', DATE({start_date_stacked_sql}, '+1 month')) UNION SELECT STRFTIME('%Y-%m', DATE({start_date_stacked_sql}, '+2 months')))"
        elif year and not month:
            start_date_stacked_sql = f"DATE('{year}-01-01')"
            end_date_stacked_sql = f"DATE('{year}-12-31', '+1 day')"
            date_range_query_part = f"RECURSIVE AllMonths(Month) AS (SELECT STRFTIME('%Y-%m', DATE('{year}-01-01')) UNION ALL SELECT STRFTIME('%Y-%m', DATE(Month, '+1 month')) FROM AllMonths WHERE Month < STRFTIME('%Y-%m', DATE('{year}-12-01')))"
        else: 
            year_to_use = year if year else "STRFTIME('%Y', 'now')"
            month_to_use = f'{int(month):02d}'
            start_date_stacked_sql = f"DATE('{year_to_use}-{month_to_use}-01', 'start of month', '-2 months')"
            end_date_stacked_sql = f"DATE('{year_to_use}-{month_to_use}-01', 'start of month', '+1 month')"
            date_range_query_part = f"AllMonths AS (SELECT STRFTIME('%Y-%m', DATE({start_date_stacked_sql})) AS Month UNION SELECT STRFTIME('%Y-%m', DATE({start_date_stacked_sql}, '+1 month')) UNION SELECT STRFTIME('%Y-%m', DATE({start_date_stacked_sql}, '+2 months')))"
        

        # Parâmetros para os gráficos empilhados
        stacked_params = {}
        stacked_city_clause_sql = ""
        if city:
            # CORRIGIDO: Usa a variável city_where_clause que já tem o nome do parâmetro
            stacked_city_clause_sql = f"AND {city_where_clause}" 
            stacked_params['city'] = city
        
        keyword_with = "WITH RECURSIVE" if (year and not month) else "WITH"

        stacked_bar_query = f"""
            {keyword_with} {date_range_query_part},
            AggData AS (
                -- Recebidos (por Data_pagamento)
                SELECT STRFTIME('%Y-%m', CAR.Data_pagamento) AS Month, 'Recebido' AS Status, SUM(CAR.Valor_recebido) AS Total_Value
                {base_from_join} -- <<< CORRIGIDO (Usa JOIN dinâmico)
                WHERE CAR.Data_pagamento IS NOT NULL {stacked_city_clause_sql} AND CAR.Data_pagamento >= {start_date_stacked_sql} AND CAR.Data_pagamento < {end_date_stacked_sql}
                GROUP BY Month
                UNION ALL
                -- A receber (por Vencimento)
                SELECT STRFTIME('%Y-%m', CAR.Vencimento) AS Month, 'Aberto' AS Status, SUM(CAR.Valor) AS Total_Value
                {base_from_join} -- <<< CORRIGIDO (Usa JOIN dinâmico)
                WHERE CAR.Status = 'A receber' {stacked_city_clause_sql} AND CAR.Vencimento >= {start_date_stacked_sql} AND CAR.Vencimento < {end_date_stacked_sql}
                GROUP BY Month
                UNION ALL
                -- Cancelado (por Vencimento e Status = 'Cancelado')
                SELECT STRFTIME('%Y-%m', CAR.Vencimento) AS Month, 'Cancelado' AS Status, SUM(CAR.Valor_cancelado) AS Total_Value
                {base_from_join} -- <<< CORRIGIDO (Usa JOIN dinâmico)
                WHERE CAR.Status = 'Cancelado' {stacked_city_clause_sql} AND CAR.Vencimento >= {start_date_stacked_sql} AND CAR.Vencimento < {end_date_stacked_sql}
                GROUP BY Month
            ),
            GroupedData AS (
                SELECT Month, Status, SUM(Total_Value) AS Total_Value
                FROM AggData
                GROUP BY Month, Status
            )
            SELECT 
                M.Month, 
                S.Status,
                COALESCE(GD.Total_Value, 0) AS Total_Value
            FROM AllMonths M
            CROSS JOIN (SELECT 'Recebido' AS Status UNION SELECT 'Aberto' UNION SELECT 'Cancelado') S
            LEFT JOIN GroupedData GD ON M.Month = GD.Month AND S.Status = GD.Status
            ORDER BY M.Month, S.Status
        """
        stacked_bar_summary = conn.execute(stacked_bar_query, stacked_params).fetchall()
        stacked_bar_summary_list = [dict(row) for row in stacked_bar_summary]

        
        keyword_with_active = "WITH RECURSIVE" if (year and not month) else "WITH"
        
        # --- CORREÇÃO: Parâmetros para query de ativos ---
        # A query de ativos SEMPRE precisa do JOIN, então o city_clause dela é diferente
        stacked_params_ativos = {}
        stacked_city_clause_sql_ativos = ""
        if city:
            stacked_city_clause_sql_ativos = "AND C.Cidade = :city"
            stacked_params_ativos['city'] = city
        # --- FIM DA CORREÇÃO ---


        active_clients_stacked_bar_query = f"""
            {keyword_with_active} ActiveAndNonNegativeClients AS (
                SELECT DISTINCT C.Cliente FROM Contratos C
                WHERE C.Status_contrato = 'Ativo' AND C.Status_acesso != 'Desativado'
                AND C.Cliente NOT IN (SELECT DISTINCT Cliente FROM Contratos_Negativacao)
            ),
            {date_range_query_part},
            AggData AS (
                -- Recebidos (por Data_pagamento)
                SELECT STRFTIME('%Y-%m', CAR.Data_pagamento) AS Month, 'Recebido' AS Status, SUM(CAR.Valor_recebido) AS Total_Value
                {base_from_join_ativos} -- (Sempre usa JOIN)
                WHERE CAR.Data_pagamento IS NOT NULL {stacked_city_clause_sql_ativos} AND CAR.Data_pagamento >= {start_date_stacked_sql} AND CAR.Data_pagamento < {end_date_stacked_sql}
                  AND C.Cliente IN (SELECT Cliente FROM ActiveAndNonNegativeClients)
                GROUP BY Month
                UNION ALL
                -- A receber (por Vencimento)
                SELECT STRFTIME('%Y-%m', CAR.Vencimento) AS Month, 'Aberto' AS Status, SUM(CAR.Valor) AS Total_Value
                {base_from_join_ativos} -- (Sempre usa JOIN)
                WHERE CAR.Status = 'A receber' {stacked_city_clause_sql_ativos} AND CAR.Vencimento >= {start_date_stacked_sql} AND CAR.Vencimento < {end_date_stacked_sql}
                  AND C.Cliente IN (SELECT Cliente FROM ActiveAndNonNegativeClients)
                GROUP BY Month
                UNION ALL
                -- Cancelado (por Vencimento e Status = 'Cancelado')
                SELECT STRFTIME('%Y-%m', CAR.Vencimento) AS Month, 'Cancelado' AS Status, SUM(CAR.Valor_cancelado) AS Total_Value
                {base_from_join_ativos} -- (Sempre usa JOIN)
                WHERE CAR.Status = 'Cancelado' {stacked_city_clause_sql_ativos} AND CAR.Vencimento >= {start_date_stacked_sql} AND CAR.Vencimento < {end_date_stacked_sql}
                  AND C.Cliente IN (SELECT Cliente FROM ActiveAndNonNegativeClients)
                GROUP BY Month
            ),
            GroupedData AS (
                SELECT Month, Status, SUM(Total_Value) AS Total_Value
                FROM AggData
                GROUP BY Month, Status
            )
            SELECT 
                M.Month, 
                S.Status,
                COALESCE(GD.Total_Value, 0) AS Total_Value
            FROM AllMonths M
            CROSS JOIN (SELECT 'Recebido' AS Status UNION SELECT 'Aberto' UNION SELECT 'Cancelado') S
            LEFT JOIN GroupedData GD ON M.Month = GD.Month AND S.Status = GD.Status
            ORDER BY M.Month, S.Status
        """
        
        # Tenta executar a query completa, se falhar (sem Contratos_Negativacao), executa o fallback
        try:
            active_clients_summary = conn.execute(active_clients_stacked_bar_query, stacked_params_ativos).fetchall()
        except sqlite3.Error as e:
            if "no such table" in str(e).lower() and "contratos_negativacao" in str(e).lower():
                print("Aviso (Resumo Financeiro): Tabela Contratos_Negativacao não encontrada. Executando fallback para Clientes Ativos.")
                active_clients_stacked_bar_query_fallback = active_clients_stacked_bar_query.replace(
                    "AND C.Cliente NOT IN (SELECT DISTINCT Cliente FROM Contratos_Negativacao)",
                    ""
                )
                active_clients_summary = conn.execute(active_clients_stacked_bar_query_fallback, stacked_params_ativos).fetchall()
            else:
                raise e # Lança outros erros
                
        active_clients_summary_list = [dict(row) for row in active_clients_summary]

        return jsonify({
            "status_summary": status_summary_list,
            "yoy_summary": yoy_summary_list,
            "mom_summary": mom_summary_list,
            "years": unique_years,
            "cities": unique_cities,
            "last_3_months_stacked": stacked_bar_summary_list,
            "last_3_months_active_clients": active_clients_summary_list
        })
    except sqlite3.Error as e:
        print(f"Erro na base de dados ao procurar resumo financeiro da tabela 'Contas_a_Receber': {e}")
        return jsonify({"error": f"Erro interno ao procurar resumo financeiro da tabela '{table_name}'"}), 500
    finally:
        if conn: conn.close()


@summary_bp.route('/atendimento_summary/<table_name>')
def api_atendimento_summary(table_name):
    """
    Endpoint de resumo para 'Atendimentos'.
    Fornece resumos por estado, classificação de assuntos, evolução anual e mensal,
    e tempo médio de resolução, com filtros opcionais.
    Assume que a coluna de data de início é 'Criado_em' e a de fim é 'ltima_altera_o'.
    """
    conn = get_db()
    try:
        # Validação segura
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name = ?;", (table_name,))
        if not cursor.fetchone() or table_name != 'Atendimentos':
            abort(404, description=f"Tabela '{table_name}' não encontrada ou inválida para este endpoint.")

        year = request.args.get('year', '')
        month = request.args.get('month', '')

        where_clauses = []
        params = []

        if year:
            where_clauses.append("STRFTIME('%Y', Criado_em) = ?")
            params.append(year)
        if month:
            where_clauses.append("STRFTIME('%m', Criado_em) = ?")
            params.append(f'{int(month):02d}')

        where_sql = " WHERE " + " AND ".join(where_clauses) if where_clauses else ""

        status_query = f"SELECT Novo_Status AS Status, COUNT(*) AS Count FROM \"{table_name}\" {where_sql} GROUP BY Status ORDER BY Count DESC"
        status_summary = conn.execute(status_query, tuple(params)).fetchall()
        status_summary_list = [dict(row) for row in status_summary]

        subject_ranking_query = f"SELECT Assunto, COUNT(*) AS Count FROM \"{table_name}\" {where_sql} GROUP BY Assunto ORDER BY Count DESC LIMIT 10"
        subject_ranking = conn.execute(subject_ranking_query, tuple(params)).fetchall()
        subject_ranking_list = [dict(row) for row in subject_ranking]

        yoy_query = f"SELECT STRFTIME('%Y', Criado_em) AS Year, COUNT(*) AS Total_Count FROM \"{table_name}\" WHERE Criado_em IS NOT NULL GROUP BY Year ORDER BY Year"
        yoy_summary = conn.execute(yoy_query).fetchall()
        yoy_summary_list = [dict(row) for row in yoy_summary]

        # MOM query usa os filtros principais
        mom_where_sql = where_sql if where_clauses else "WHERE Criado_em IS NOT NULL"
        mom_query = f"SELECT STRFTIME('%m', Criado_em) AS Month, COUNT(*) AS Total_Count FROM \"{table_name}\" {mom_where_sql} GROUP BY Month ORDER BY Month"
        mom_summary = conn.execute(mom_query, tuple(params)).fetchall()
        mom_summary_list = [dict(row) for row in mom_summary]

        avg_resolution_time_query = f"""
            SELECT Assunto,
                   AVG(JULIANDAY(ltima_altera_o) - JULIANDAY(Criado_em)) AS Average_Resolution_Days
            FROM "{table_name}"
            WHERE Novo_Status = 'Solucionado' AND Criado_em IS NOT NULL AND ltima_altera_o IS NOT NULL
            {"AND " + " AND ".join(where_clauses) if where_clauses else ""}
            GROUP BY Assunto
            HAVING Average_Resolution_Days IS NOT NULL AND Average_Resolution_Days >= 0
            ORDER BY Average_Resolution_Days ASC
        """
        avg_resolution_time_by_subject = conn.execute(avg_resolution_time_query, tuple(params)).fetchall()
        avg_resolution_time_by_subject_list = [dict(row) for row in avg_resolution_time_by_subject]

        years_query = f"SELECT DISTINCT STRFTIME('%Y', Criado_em) AS Year FROM \"{table_name}\" WHERE Criado_em IS NOT NULL ORDER BY Year DESC"
        years_data = conn.execute(years_query).fetchall()
        unique_years = [row[0] for row in years_data if row[0]]

        return jsonify({
            "status_summary": status_summary_list,
            "subject_ranking": subject_ranking_list,
            "yoy_summary": yoy_summary_list,
            "mom_summary": mom_summary_list,
            "avg_resolution_time_by_subject": avg_resolution_time_by_subject_list,
            "years": unique_years
        })
    except sqlite3.Error as e:
        print(f"Erro na base de dados ao procurar resumo de atendimento da tabela '{table_name}': {e}")
        return jsonify({"error": f"Erro interno ao procurar resumo de atendimento da tabela '{table_name}'"}), 500
    finally:
        if conn: conn.close()

@summary_bp.route('/os_summary/<table_name>')
def api_os_summary(table_name):
    conn = get_db()
    try:
        # Validação segura
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name = ?;", (table_name,))
        if not cursor.fetchone() or table_name != 'OS':
            abort(404, description=f"Tabela '{table_name}' não encontrada ou inválida para este endpoint.")

        year = request.args.get('year', '')
        month = request.args.get('month', '')
        city = request.args.get('city', '')

        where_clauses = []
        params = []
        if year:
            where_clauses.append("STRFTIME('%Y', Abertura) = ?")
            params.append(year)
        if month:
            where_clauses.append("STRFTIME('%m', Abertura) = ?")
            params.append(f'{int(month):02d}')
        if city:
            where_clauses.append("Cidade = ?")
            params.append(city)
        where_sql = " WHERE " + " AND ".join(where_clauses) if where_clauses else ""

        status_by_subject_query = f"SELECT Assunto, Status, COUNT(*) AS Count FROM \"{table_name}\" {where_sql} GROUP BY Assunto, Status ORDER BY Assunto, Count DESC"
        status_by_subject = conn.execute(status_by_subject_query, tuple(params)).fetchall()
        status_by_subject_list = [dict(row) for row in status_by_subject]

        # MOM query usa os filtros principais
        mom_where_sql = where_sql if where_clauses else "WHERE Abertura IS NOT NULL"
        mom_query = f"SELECT STRFTIME('%m', Abertura) AS Month, COUNT(*) AS Total_Count FROM \"{table_name}\" {mom_where_sql} GROUP BY Month ORDER BY Month"
        mom_summary = conn.execute(mom_query, tuple(params)).fetchall()
        mom_summary_list = [dict(row) for row in mom_summary]

        avg_service_time_query = f"""
            SELECT Cidade,
                   AVG(JULIANDAY(Fechamento) - JULIANDAY(Abertura)) AS Average_Service_Days
            FROM "{table_name}"
            WHERE Abertura IS NOT NULL AND Fechamento IS NOT NULL AND Fechamento >= Abertura -- Garante tempo positivo
            {"AND " + " AND ".join(where_clauses) if where_clauses else ""}
            GROUP BY Cidade
            HAVING Average_Service_Days IS NOT NULL
            ORDER BY Average_Service_Days ASC
        """
        avg_service_time_by_city = conn.execute(avg_service_time_query, tuple(params)).fetchall()
        avg_service_time_by_city_list = [dict(row) for row in avg_service_time_by_city]

        # Filtros para anos/cidades não dependem de ano/mês selecionado
        years_query = f"SELECT DISTINCT STRFTIME('%Y', Abertura) AS Year FROM \"{table_name}\" WHERE Abertura IS NOT NULL ORDER BY Year DESC"
        years_data = conn.execute(years_query).fetchall()
        unique_years = [row[0] for row in years_data if row[0]]

        cities_query = f"SELECT DISTINCT Cidade FROM \"{table_name}\" WHERE Cidade IS NOT NULL ORDER BY Cidade ASC"
        cities_data = conn.execute(cities_query).fetchall()
        unique_cities = [row[0] for row in cities_data if row[0]]

        return jsonify({
            "status_by_subject": status_by_subject_list,
            "mom_summary": mom_summary_list,
            "avg_service_time_by_city": avg_service_time_by_city_list,
            "years": unique_years,
            "cities": unique_cities
        })
    except sqlite3.Error as e:
        print(f"Erro na base de dados ao procurar resumo de OS da tabela '{table_name}': {e}")
        return jsonify({"error": f"Erro interno ao procurar resumo de OS da tabela '{table_name}'"}), 500
    finally:
        if conn: conn.close()

@summary_bp.route('/summary/<table_name>')
def api_generic_summary(table_name):
    conn = get_db()
    try:
        # Validação segura
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name = ?;", (table_name,))
        if not cursor.fetchone():
            abort(404, description=f"Tabela '{table_name}' não encontrada.")

        year = request.args.get('year', '')
        month = request.args.get('month', '')
        city = request.args.get('city', '') # Adicionado para Contratos

        where_clauses = []
        params = []

        date_column = DATE_COLUMN_MAP.get(table_name)

        if date_column:
            if year:
                where_clauses.append(f"STRFTIME('%Y', \"{date_column}\") = ?")
                params.append(year)
            if month:
                where_clauses.append(f"STRFTIME('%m', \"{date_column}\") = ?")
                params.append(f'{int(month):02d}')

        # Adiciona filtro de cidade APENAS para a tabela 'Contratos'
        if table_name == 'Contratos' and city:
             where_clauses.append("Cidade = ?")
             params.append(city)

        where_sql = " WHERE " + " AND ".join(where_clauses) if where_clauses else ""

        summary_data = {}

        # Busca anos disponíveis (filtrado por cidade apenas para Contratos)
        if date_column:
            years_city_filter = ""
            years_params = []
            if table_name == 'Contratos' and city:
                years_city_filter = " WHERE Cidade = ? "
                years_params.append(city)

            years_query = f"SELECT DISTINCT STRFTIME('%Y', \"{date_column}\") AS Year FROM \"{table_name}\" {years_city_filter} {'AND' if years_city_filter else 'WHERE'} \"{date_column}\" IS NOT NULL ORDER BY Year DESC"
            years_data = conn.execute(years_query, tuple(years_params)).fetchall()
            summary_data['years'] = [row[0] for row in years_data if row[0]]


        # Lógica específica por tabela
        if table_name == 'Clientes':
            by_city_query = f"SELECT Cidade, COUNT(*) as Count FROM Clientes {where_sql} GROUP BY Cidade ORDER BY Count DESC LIMIT 20"
            by_city = conn.execute(by_city_query, tuple(params)).fetchall()
            summary_data['by_city'] = [dict(row) for row in by_city]

            by_neighborhood_query = f"SELECT Bairro, COUNT(*) as Count FROM Clientes {where_sql} GROUP BY Bairro ORDER BY Count DESC LIMIT 20"
            by_neighborhood = conn.execute(by_neighborhood_query, tuple(params)).fetchall()
            summary_data['by_neighborhood'] = [dict(row) for row in by_neighborhood]

        elif table_name == 'Contratos':
            by_status_query = f"SELECT Status_contrato, COUNT(*) as Count FROM Contratos {where_sql} GROUP BY Status_contrato ORDER BY Count DESC"
            by_status = conn.execute(by_status_query, tuple(params)).fetchall()
            summary_data['by_status'] = [dict(row) for row in by_status]

            by_access_status_query = f"SELECT Status_acesso, COUNT(*) as Count FROM Contratos {where_sql} GROUP BY Status_acesso ORDER BY Count DESC"
            by_access_status = conn.execute(by_access_status_query, tuple(params)).fetchall()
            summary_data['by_access_status'] = [dict(row) for row in by_access_status]

            # Busca cidades (sem filtro de ano/mês)
            cities_query = "SELECT DISTINCT Cidade FROM Contratos WHERE Cidade IS NOT NULL AND TRIM(Cidade) != '' ORDER BY Cidade"
            cities_data = conn.execute(cities_query).fetchall()
            summary_data['cities'] = [row[0] for row in cities_data]

            # Adiciona resumos por cidade se NÃO houver filtro de cidade aplicado
            # (Se já filtrou por cidade, não faz sentido agrupar por cidade de novo)
            if not city:
                 by_status_by_city_query = f"SELECT Cidade, Status_contrato, COUNT(*) as Count FROM Contratos {where_sql} GROUP BY Cidade, Status_contrato"
                 by_status_by_city = conn.execute(by_status_by_city_query, tuple(params)).fetchall()
                 summary_data['by_status_by_city'] = [dict(row) for row in by_status_by_city]

                 by_access_status_by_city_query = f"SELECT Cidade, Status_acesso, COUNT(*) as Count FROM Contratos {where_sql} GROUP BY Cidade, Status_acesso"
                 by_access_status_by_city = conn.execute(by_access_status_by_city_query, tuple(params)).fetchall()
                 summary_data['by_access_status_by_city'] = [dict(row) for row in by_access_status_by_city]
            else:
                 # Se filtrou por cidade, retorna listas vazias para consistência
                 summary_data['by_status_by_city'] = []
                 summary_data['by_access_status_by_city'] = []


        elif table_name == 'Logins':
            by_transmitter_query = f"SELECT Transmissor, COUNT(DISTINCT Login) as Count FROM Logins {where_sql} GROUP BY Transmissor ORDER BY Count DESC"
            by_transmitter = conn.execute(by_transmitter_query, tuple(params)).fetchall()
            summary_data['by_transmitter'] = [dict(row) for row in by_transmitter]

            by_plan_query = f"SELECT Contrato, COUNT(*) as Count FROM Logins {where_sql} GROUP BY Contrato ORDER BY Count DESC LIMIT 20"
            by_plan = conn.execute(by_plan_query, tuple(params)).fetchall()
            summary_data['by_plan'] = [dict(row) for row in by_plan]

        elif table_name in ['Cidade', 'Vendedor']:
             # Retorna apenas os anos disponíveis para estas tabelas simples
             if not date_column: # Se não definimos coluna de data, busca de outra tabela
                 years_query_fallback = "SELECT DISTINCT STRFTIME('%Y', Data_cadastro_sistema) AS Year FROM Contratos WHERE Data_cadastro_sistema IS NOT NULL ORDER BY Year DESC"
                 years_data_fallback = conn.execute(years_query_fallback).fetchall()
                 summary_data['years'] = [row[0] for row in years_data_fallback if row[0]]
             pass # Não há gráficos específicos definidos

        else: # Outras tabelas sem resumo específico
            count = conn.execute(f'SELECT COUNT(*) FROM "{table_name}" {where_sql}', tuple(params)).fetchone()[0]
            summary_data['total_rows'] = count
            summary_data['message'] = "Nenhum resumo específico definido, retornando contagem total."

        return jsonify(summary_data)

    except sqlite3.Error as e:
        print(f"Erro na base de dados ao gerar resumo para '{table_name}': {e}")
        return jsonify({"error": f"Erro interno ao gerar resumo para a tabela '{table_name}'"}), 500
    finally:
        if conn: conn.close()
import sqlite3
import traceback
from flask import Blueprint, jsonify, request
from utils_api import get_db, parse_relevance_filter, add_date_range_filter

# Define o Blueprint para rotas financeiras
finance_bp = Blueprint('finance_bp', __name__)

# --- FUNÇÕES AUXILIARES INTERNAS ---

def execute_financial_health_query(delay_days):
    """
    Função genérica para executar a query de Saúde Financeira.
    Pode ser usada para atrasos comuns (10 dias) ou bloqueio automático (20 dias).
    """
    conn = get_db()
    try:
        search_term = request.args.get('search_term', '').strip()
        limit = request.args.get('limit', 50, type=int)
        offset = request.args.get('offset', 0, type=int)
        status_contrato_str = request.args.get('status_contrato', '')
        status_acesso_str = request.args.get('status_acesso', '')
        relevance = request.args.get('relevance', '')

        params = []
        where_conditions = []

        if search_term:
            where_conditions.append("C.Cliente LIKE ?")
            params.append(f'%{search_term}%')

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

        # Cálculo de meses de permanência para o filtro de relevância
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

        # CTE para encontrar a primeira inadimplência que cumpre o critério de dias
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

        count_query = f"""
            SELECT COUNT(C.ID)
            FROM Contratos C
            JOIN ({cte_flp}) FLP ON C.ID = FLP.ID_Contrato_Recorrente
            {where_clause}
        """
        total_rows = conn.execute(count_query, tuple(params)).fetchone()[0]

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


# --- ROTAS DA API ---

@finance_bp.route('/contas_a_receber')
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

        count_query = f"""
            SELECT COUNT(DISTINCT CON.ID)
            {base_query_from} {where_search}
        """
        total_rows = conn.execute(count_query, tuple(params)).fetchone()[0]

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
        print(f"Erro ao buscar contas a receber: {e}")
        return jsonify({"error": "Erro interno ao procurar dados para análise personalizada."}), 500
    finally:
        if conn: conn.close()


@finance_bp.route('/financial_health')
def api_financial_health():
    """Rota para análise de saúde financeira (Atraso > 10 dias)"""
    return execute_financial_health_query(delay_days=10)


@finance_bp.route('/financial_health_auto_block')
def api_financial_health_auto_block():
    """Rota para análise de saúde financeira (Bloqueio Automático > 20 dias)"""
    return execute_financial_health_query(delay_days=20)


@finance_bp.route('/faturamento_por_cidade')
def api_faturamento_por_cidade():
    conn = get_db()
    try:
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        city = request.args.get('city', '')

        if not start_date or not end_date:
            return jsonify({"error": "As datas inicial e final são obrigatórias."}), 400

        params = {'start_date': start_date, 'end_date': end_date}
        
        from_join_clause_ativos = 'FROM "Contas_a_Receber" CR JOIN "Contratos" AS C ON CR.ID_Contrato_Recorrente = C.ID'
        from_join_clause_grafico3 = 'FROM "Contas_a_Receber" as CR JOIN "Contratos" as C ON CR.ID_Contrato_Recorrente = C.ID'

        if city:
            params['city'] = city
            city_clause_query1 = " AND CR.Cidade = :city "
            city_clause_query2_3 = " AND C.Cidade = :city "
        else:
            city_clause_query1 = ""
            city_clause_query2_3 = ""
        
        from_join_clause_query1 = 'FROM "Contas_a_Receber" CR'
        
        where_recebido_q1 = f"WHERE CR.Data_pagamento BETWEEN :start_date AND :end_date {city_clause_query1}"
        where_areceber_q1 = f"WHERE CR.Status = 'A receber' AND CR.Vencimento BETWEEN :start_date AND :end_date {city_clause_query1}"
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

        query3 = f"""
            SELECT C.Dia_fixo_do_vencimento AS Due_Day, STRFTIME('%Y-%m', CR.Vencimento) AS Month, SUM(CR.Valor) AS Total_Value
            {from_join_clause_grafico3}
            WHERE CR.Vencimento BETWEEN :start_date AND :end_date {city_clause_query2_3}
              AND C.Dia_fixo_do_vencimento IS NOT NULL
            GROUP BY Due_Day, Month
        """

        cities_query = "SELECT DISTINCT Cidade FROM Contratos WHERE Cidade IS NOT NULL AND TRIM(Cidade) != '' ORDER BY Cidade"

        data1 = conn.execute(query1, params).fetchall()
        
        data2 = []
        try:
            data2 = conn.execute(query2, params).fetchall()
        except sqlite3.Error as e:
            if "no such table" in str(e).lower() and "contratos_negativacao" in str(e).lower():
                query2_fallback = query2.replace("AND C.Cliente NOT IN (SELECT DISTINCT CN.Cliente FROM Contratos_Negativacao CN)", "")
                data2 = conn.execute(query2_fallback, params).fetchall()
            else:
                raise e 

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


@finance_bp.route('/late_interest_analysis')
def api_late_interest_analysis():
    conn = get_db()
    try:
        start_date = request.args.get('start_date', '')
        end_date = request.args.get('end_date', '')

        params = []
        where_clauses = [
            "CR.Data_pagamento IS NOT NULL",
            "CR.Vencimento IS NOT NULL",
            "CR.Data_pagamento > CR.Vencimento", 
            "(CR.Valor_recebido - CR.Valor) > 0.01" 
        ]

        add_date_range_filter(where_clauses, params, "CR.Data_pagamento", start_date, end_date)
        
        where_sql = " AND ".join(where_clauses)

        base_query = f"""
            WITH LatePayments AS (
                SELECT
                    (CR.Valor_recebido - CR.Valor) AS Interest_Amount,
                    CAST(JULIANDAY(CR.Data_pagamento) - JULIANDAY(CR.Vencimento) AS INTEGER) AS Delay_Days
                FROM Contas_a_Receber AS CR
                WHERE {where_sql}
            )
        """

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
        totals['total_interest_amount'] = totals['total_interest_amount'] or 0
        totals['total_late_payments_count'] = totals['total_late_payments_count'] or 0


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
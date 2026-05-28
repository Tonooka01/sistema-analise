"""
queries/finance_queries.py
Construtores de SQL para analises financeiras.
"""

from utils_api import add_date_range_filter


LAST_CONNECTION_CTE = """
    LastConnection AS (
        SELECT ID_contrato,
               MAX(ltima_conex_o_final) AS Ultima_Conexao
        FROM Logins
        WHERE ltima_conex_o_final IS NOT NULL
          AND ID_contrato IS NOT NULL
        GROUP BY ID_contrato
    )
"""

CUSTOMER_COMPLAINTS_CTE = """
    CustomerComplaints AS (
        SELECT Cliente, 'Sim' AS Possui_Reclamacoes
        FROM (
            SELECT Cliente FROM Atendimentos WHERE Cliente IS NOT NULL
            UNION
            SELECT Cliente FROM OS          WHERE Cliente IS NOT NULL
        )
        GROUP BY Cliente
    )
"""


def build_first_late_payment_cte(delay_days=10):
    return f"""
        FirstLatePayment AS (
            SELECT
                p.ID_Contrato_Recorrente,
                MIN(p.Vencimento) AS Primeira_Inadimplencia_Vencimento
            FROM Contas_a_Receber p
            JOIN Contratos c ON p.ID_Contrato_Recorrente = c.ID
            WHERE
                p.Data_pagamento IS NOT NULL
                AND p.Data_pagamento != ''
                AND JULIANDAY(p.Data_pagamento) - JULIANDAY(p.Vencimento) > {delay_days}
                AND p.Vencimento >= c.Data_ativa_o
            GROUP BY p.ID_Contrato_Recorrente
        )
    """


def build_financial_health_where(search_term="", status_contrato="", status_acesso="", relevance=""):
    params     = []
    conditions = []

    if search_term:
        conditions.append("C.Cliente LIKE ?")
        params.append(f"%{search_term}%")

    if status_contrato:
        items = status_contrato.split(",")
        ph    = ",".join(["?"] * len(items))
        conditions.append(f"C.Status_contrato IN ({ph})")
        params.extend(items)

    if status_acesso:
        items = status_acesso.split(",")
        ph    = ",".join(["?"] * len(items))
        conditions.append(f"C.Status_acesso IN ({ph})")
        params.extend(items)

    if relevance:
        min_m, max_m = _parse_relevance(relevance)
        expr = """CAST(ROUND(
            (JULIANDAY(SUBSTR(FLP.Primeira_Inadimplencia_Vencimento, 1, 10))
             - JULIANDAY(SUBSTR(C.Data_ativa_o, 1, 10))) / 30.44
        ) AS INTEGER)"""
        if min_m is not None:
            conditions.append(f"{expr} >= ?")
            params.append(min_m)
        if max_m is not None:
            conditions.append(f"{expr} <= ?")
            params.append(max_m)

    where_sql = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    return where_sql, params


def build_billing_queries(start_date, end_date, city=""):
    """
    Retorna dict com 4 queries de faturamento.
    
    IMPORTANTE: 
    - Recebido: filtra por Data_pagamento, soma Valor_recebido, exclui datas vazias
    - A receber: filtra por Vencimento, soma Valor
    - Cancelado: filtra por Vencimento, soma Valor_cancelado
    - Cidade: join com Contratos para obter cidade correta
    """
    # Cidade: usa Contratos como fonte pois CR.Cidade pode estar NULL
    c_car  = " AND C2.Cidade = :city " if city else ""
    c_join = " AND C.Cidade  = :city " if city else ""

    # JOIN de Contas_a_Receber com Contratos para filtro de cidade
    car_join = (
        'FROM "Contas_a_Receber" CR '
        'JOIN "Contratos" C2 ON CR.ID_contrato_recorrente = C2.ID'
        if city else
        'FROM "Contas_a_Receber" CR'
    )

    join = (
        'FROM "Contas_a_Receber" CR '
        'JOIN "Contratos" AS C ON CR.ID_contrato_recorrente = C.ID'
    )

    # Sem filtro de cidade — usa CR diretamente (mais performático)
    car_simple = 'FROM "Contas_a_Receber" CR'
    c_simple   = c_car if city else ""

    frm  = car_join if city else car_simple
    cit  = c_car    if city else ""

    total_query = f"""
        SELECT STRFTIME('%Y-%m', CR.Data_pagamento) AS Month,
               'Recebido' AS Status,
               SUM(CR.Valor_recebido) AS Total_Value
        {frm}
        WHERE CR.Data_pagamento IS NOT NULL
          AND CR.Data_pagamento != ''
          AND CR.Status = 'Recebido'
          AND CR.Data_pagamento BETWEEN :start_date AND :end_date {cit}
        GROUP BY Month

        UNION ALL

        SELECT STRFTIME('%Y-%m', CR.Vencimento) AS Month,
               'A receber' AS Status,
               SUM(CR.Valor) AS Total_Value
        {frm}
        WHERE CR.Status = 'A receber'
          AND CR.Vencimento BETWEEN :start_date AND :end_date {cit}
        GROUP BY Month

        UNION ALL

        SELECT STRFTIME('%Y-%m', CR.Vencimento) AS Month,
               'Cancelado' AS Status,
               SUM(CR.Valor_cancelado) AS Total_Value
        {frm}
        WHERE CR.Status = 'Cancelado'
          AND CR.Vencimento BETWEEN :start_date AND :end_date {cit}
        GROUP BY Month
    """

    credito_query = f"""
        SELECT STRFTIME('%Y-%m', CR.Data_cr_dito) AS Month,
               'Recebido' AS Status,
               SUM(CR.Valor_recebido) AS Total_Value
        {frm}
        WHERE CR.Data_cr_dito IS NOT NULL
          AND CR.Data_cr_dito != ''
          AND CR.Status = 'Recebido'
          AND CR.Data_cr_dito BETWEEN :start_date AND :end_date {cit}
        GROUP BY Month

        UNION ALL

        SELECT STRFTIME('%Y-%m', CR.Vencimento) AS Month,
               'A receber' AS Status,
               SUM(CR.Valor) AS Total_Value
        {frm}
        WHERE CR.Status = 'A receber'
          AND CR.Vencimento BETWEEN :start_date AND :end_date {cit}
        GROUP BY Month

        UNION ALL

        SELECT STRFTIME('%Y-%m', CR.Vencimento) AS Month,
               'Cancelado' AS Status,
               SUM(CR.Valor_cancelado) AS Total_Value
        {frm}
        WHERE CR.Status = 'Cancelado'
          AND CR.Vencimento BETWEEN :start_date AND :end_date {cit}
        GROUP BY Month
    """

    ativos_query = f"""
        WITH ActiveClients AS (
            SELECT DISTINCT C.Cliente
            FROM Contratos C
            WHERE C.Status_contrato = 'Ativo'
              AND C.Status_acesso = 'Ativo'
              AND C.Cliente NOT IN (
                  SELECT DISTINCT Cliente FROM Contratos_Negativacao
                  WHERE Cliente IS NOT NULL
              )
              AND C.Cliente IS NOT NULL
        )
        SELECT STRFTIME('%Y-%m', CR.Data_pagamento) AS Month,
               'Recebido' AS Status,
               SUM(CR.Valor_recebido) AS Total_Value
        {join}
        WHERE CR.Data_pagamento IS NOT NULL
          AND CR.Data_pagamento != ''
          AND CR.Status = 'Recebido'
          AND CR.Data_pagamento BETWEEN :start_date AND :end_date {c_join}
          AND C.Cliente IN (SELECT Cliente FROM ActiveClients)
        GROUP BY Month

        UNION ALL

        SELECT STRFTIME('%Y-%m', CR.Vencimento) AS Month,
               'A receber' AS Status,
               SUM(CR.Valor) AS Total_Value
        {join}
        WHERE CR.Status = 'A receber'
          AND CR.Vencimento BETWEEN :start_date AND :end_date {c_join}
          AND C.Cliente IN (SELECT Cliente FROM ActiveClients)
        GROUP BY Month

        UNION ALL

        SELECT STRFTIME('%Y-%m', CR.Vencimento) AS Month,
               'Cancelado' AS Status,
               SUM(CR.Valor_cancelado) AS Total_Value
        {join}
        WHERE CR.Status = 'Cancelado'
          AND CR.Vencimento BETWEEN :start_date AND :end_date {c_join}
          AND C.Cliente IN (SELECT Cliente FROM ActiveClients)
        GROUP BY Month
    """

    due_day_query = f"""
        SELECT
            CASE
                WHEN CAST(STRFTIME('%d', CR.Vencimento) AS INTEGER) BETWEEN 1  AND 7  THEN 5
                WHEN CAST(STRFTIME('%d', CR.Vencimento) AS INTEGER) BETWEEN 8  AND 12 THEN 10
                WHEN CAST(STRFTIME('%d', CR.Vencimento) AS INTEGER) BETWEEN 13 AND 17 THEN 15
                WHEN CAST(STRFTIME('%d', CR.Vencimento) AS INTEGER) BETWEEN 18 AND 22 THEN 20
                WHEN CAST(STRFTIME('%d', CR.Vencimento) AS INTEGER) BETWEEN 23 AND 24 THEN 23
                WHEN CAST(STRFTIME('%d', CR.Vencimento) AS INTEGER) BETWEEN 25 AND 31 THEN 25
            END AS Due_Day,
            STRFTIME('%Y-%m', CR.Vencimento) AS Month,
            SUM(CR.Valor) AS Total_Value
        FROM "Contas_a_Receber" CR
        WHERE CR.Vencimento BETWEEN :start_date AND :end_date
          AND CR.Vencimento IS NOT NULL
          AND CR.Vencimento != '' {cit}
        GROUP BY Due_Day, Month
        HAVING Due_Day IS NOT NULL
    """

    return {
        "total":   total_query,
        "credito": credito_query,
        "ativos":  ativos_query,
        "due_day": due_day_query,
    }


def build_late_interest_query(start_date="", end_date=""):
    params     = []
    conditions = [
        "CR.Data_pagamento IS NOT NULL",
        "CR.Data_pagamento != ''",
        "CR.Vencimento IS NOT NULL",
        "CR.Data_pagamento > CR.Vencimento",
        "(CR.Valor_recebido - CR.Valor) > 0.01",
    ]
    add_date_range_filter(conditions, params, "CR.Data_pagamento", start_date, end_date)
    where = " AND ".join(conditions)

    base_cte = f"""
        WITH LatePayments AS (
            SELECT
                (CR.Valor_recebido - CR.Valor) AS Interest_Amount,
                CAST(JULIANDAY(CR.Data_pagamento) - JULIANDAY(CR.Vencimento)
                     AS INTEGER) AS Delay_Days
            FROM Contas_a_Receber AS CR
            WHERE {where}
        )
    """

    buckets_sql = f"""
        {base_cte}
        SELECT
            CASE
                WHEN Delay_Days BETWEEN  1 AND  5 THEN '1-5 dias'
                WHEN Delay_Days BETWEEN  6 AND 10 THEN '6-10 dias'
                WHEN Delay_Days BETWEEN 11 AND 15 THEN '11-15 dias'
                WHEN Delay_Days BETWEEN 16 AND 20 THEN '16-20 dias'
                WHEN Delay_Days >= 21              THEN '21+ dias'
                ELSE 'Outros'
            END AS Delay_Bucket,
            COUNT(*)              AS Count,
            SUM(Interest_Amount)  AS Total_Interest
        FROM LatePayments
        GROUP BY Delay_Bucket
        ORDER BY
            CASE Delay_Bucket
                WHEN '1-5 dias'   THEN 1
                WHEN '6-10 dias'  THEN 2
                WHEN '11-15 dias' THEN 3
                WHEN '16-20 dias' THEN 4
                WHEN '21+ dias'   THEN 5
                ELSE 6
            END
    """

    totals_sql = f"""
        {base_cte}
        SELECT
            SUM(Interest_Amount) AS total_interest_amount,
            COUNT(*)             AS total_late_payments_count
        FROM LatePayments
    """

    return totals_sql, buckets_sql, params


def _parse_relevance(s):
    if not s:
        return (None, None)
    parts = s.split("-")
    try:
        if "+" in parts[0]:
            return (int(parts[0].replace("+", "")), None)
        return (int(parts[0]), int(parts[1]) if len(parts) > 1 else None)
    except ValueError:
        return (None, None)

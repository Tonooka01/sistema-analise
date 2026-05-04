"""
queries/churn_queries.py

Construtores de SQL para analises de churn (cancelamento, negativacao,
permanencia, coorte, evolucao de clientes ativos).

Nenhuma dependencia de Flask — so strings SQL e listas de parametros.
"""

from utils_api import add_date_range_filter

# ---------------------------------------------------------------------------
# Cidades excluidas das analises de negativacao
# ---------------------------------------------------------------------------

EXCLUDED_CITIES = ["Cacapava", "Jacarei", "Sao Jose dos Campos"]
_EX = "('Caçapava', 'Jacareí', 'São José dos Campos')"


# ---------------------------------------------------------------------------
# CTEs estaticas reutilizaveis
# ---------------------------------------------------------------------------

FINANCIAL_STATS_CTE = """
    FinancialStats AS (
        SELECT
            ID_Contrato_Recorrente,
            SUM(CASE WHEN Data_pagamento > Vencimento THEN 1 ELSE 0 END)
                AS Atrasos_Pagos,
            SUM(CASE WHEN Status = 'A receber'
                          AND Vencimento < date('now') THEN 1 ELSE 0 END)
                AS Faturas_Nao_Pagas,
            COUNT(*)
                AS Total_Faturas,
            SUM(CASE WHEN Data_pagamento IS NOT NULL THEN 1 ELSE 0 END)
                AS Faturas_Pagas,
            SUM(CASE WHEN Status = 'Cancelado' THEN 1 ELSE 0 END)
                AS Faturas_Canceladas,
            AVG(
                CASE WHEN Data_pagamento IS NOT NULL
                     THEN JULIANDAY(Data_pagamento) - JULIANDAY(Vencimento)
                     ELSE NULL END
            ) AS Media_Atraso
        FROM Contas_a_Receber
        GROUP BY ID_Contrato_Recorrente
    )
"""

RELEVANT_TICKETS_CTE = """
    RelevantTickets AS (
        SELECT DISTINCT Cliente
        FROM (
            SELECT Cliente FROM Atendimentos
            WHERE Assunto IN ('MANUTENCAO DE FIBRA', 'VISITA TECNICA')
            UNION ALL
            SELECT Cliente FROM OS
            WHERE Assunto IN ('MANUTENCAO DE FIBRA', 'VISITA TECNICA')
        )
    )
"""


# ---------------------------------------------------------------------------
# CTE: todos os cancelamentos (Contratos + Contratos_Negativacao)
# ---------------------------------------------------------------------------

def build_all_cancellations_cte(
    start_date="",
    end_date="",
    has_negativacao_table=True,
):
    """
    Retorna (cte_sql, params) para AllCancellations.

    Exemplo de uso:
        cte, params = build_all_cancellations_cte(start_date, end_date)
        sql = f"WITH {FINANCIAL_STATS_CTE}, {cte} SELECT ..."
    """
    params_c = []
    where_c  = ["Status_contrato = 'Inativo'", "Status_acesso = 'Desativado'"]
    add_date_range_filter(where_c, params_c, "Data_cancelamento", start_date, end_date)
    where_c_sql = " AND ".join(where_c)

    if not has_negativacao_table:
        cte = f"""
            AllCancellations AS (
                SELECT Cliente, ID AS Contrato_ID, Data_ativa_o,
                       Data_cancelamento, Motivo_cancelamento, Obs_cancelamento
                FROM Contratos
                WHERE {where_c_sql}
            )
        """
        return cte, params_c

    params_n = []
    where_n  = []
    add_date_range_filter(where_n, params_n, "Data_negativa_o", start_date, end_date)
    where_n_extra = (" AND " + " AND ".join(where_n)) if where_n else ""

    cte = f"""
        AllCancellations AS (
            SELECT Cliente, ID AS Contrato_ID, Data_ativa_o,
                   Data_cancelamento, Motivo_cancelamento, Obs_cancelamento
            FROM Contratos
            WHERE {where_c_sql}

            UNION ALL

            SELECT Cliente, ID AS Contrato_ID, Data_ativa_o,
                   Data_negativa_o AS Data_cancelamento,
                   Motivo_cancelamento, Obs_cancelamento
            FROM Contratos_Negativacao
            WHERE 1=1{where_n_extra}
        )
    """
    return cte, params_c + params_n


# ---------------------------------------------------------------------------
# CTE: todos os negativados
# ---------------------------------------------------------------------------

def build_all_negativados_cte(
    start_date="",
    end_date="",
    has_negativacao_table=True,
):
    """
    Retorna (cte_sql, params) para AllNegativados.
    Exclui cidades da sede (Cacapava, Jacarei, SJC).
    """
    params_cn = []
    where_cn  = [f"Cidade NOT IN {_EX}"]
    add_date_range_filter(where_cn, params_cn, "Data_negativa_o", start_date, end_date)

    params_c = []
    where_c  = ["Status_contrato = 'Negativado'", f"Cidade NOT IN {_EX}"]
    add_date_range_filter(where_c, params_c, "Data_cancelamento", start_date, end_date)

    if not has_negativacao_table:
        cte = f"""
            AllNegativados AS (
                SELECT Cliente, ID, Cidade, Data_ativa_o,
                       Data_cancelamento AS end_date
                FROM Contratos
                WHERE {' AND '.join(where_c)}
            )
        """
        return cte, params_c

    cte = f"""
        AllNegativados AS (
            SELECT Cliente, ID, Cidade, Data_ativa_o,
                   Data_negativa_o AS end_date
            FROM Contratos_Negativacao
            WHERE {' AND '.join(where_cn)}

            UNION

            SELECT Cliente, ID, Cidade, Data_ativa_o,
                   Data_cancelamento AS end_date
            FROM Contratos
            WHERE {' AND '.join(where_c)}
        )
    """
    return cte, params_cn + params_c


# ---------------------------------------------------------------------------
# CTE: permanencia em meses
# ---------------------------------------------------------------------------

def permanence_months_expr(start_col="Data_ativa_o", end_col="Data_cancelamento"):
    """
    Expressao SQL que calcula permanencia em meses inteiros.

    Uso:
        perm = permanence_months_expr()
        sql  = f"SELECT {perm} AS permanencia_meses FROM ..."
    """
    return (
        f"CASE WHEN {start_col} IS NOT NULL AND {end_col} IS NOT NULL "
        f"THEN CAST(ROUND("
        f"    (JULIANDAY({end_col}) - JULIANDAY({start_col})) / 30.44"
        f") AS INTEGER) "
        f"ELSE NULL END"
    )


# ---------------------------------------------------------------------------
# Filtros de WHERE para relevancia (meses)
# ---------------------------------------------------------------------------

def apply_relevance_filter(where_clauses, params, relevance_str, col="permanencia_meses"):
    """
    Adiciona filtros de faixa de meses a where_clauses e params.

    relevance_str exemplos: '0-6', '13-24', '37+'
    """
    if not relevance_str:
        return

    min_m, max_m = parse_relevance(relevance_str)
    if min_m is not None:
        where_clauses.append(f"{col} >= ?")
        params.append(min_m)
    if max_m is not None:
        where_clauses.append(f"{col} <= ?")
        params.append(max_m)


def parse_relevance(s):
    """
    '0-6'  -> (0, 6)
    '37+'  -> (37, None)
    ''     -> (None, None)
    """
    if not s:
        return (None, None)
    parts = s.split("-")
    try:
        if "+" in parts[0]:
            return (int(parts[0].replace("+", "")), None)
        min_m = int(parts[0])
        max_m = int(parts[1]) if len(parts) > 1 else None
        return (min_m, max_m)
    except ValueError:
        return (None, None)


# ---------------------------------------------------------------------------
# Filtro de clique no grafico (motivo / obs / financeiro)
# ---------------------------------------------------------------------------

def apply_chart_filter(where_clauses, params, filter_col, filter_val):
    """
    Aplica o filtro de clique no grafico de cancelamento/negativacao.

    filter_col: 'motivo' | 'obs' | 'financeiro'
    filter_val: valor clicado (ex: 'Financeira', 'Nao Informado')
    """
    if not filter_col or not filter_val:
        return

    v = filter_val.strip()

    if filter_col == "motivo":
        if v == "Nao Informado":
            where_clauses.append(
                "(Motivo_cancelamento IS NULL "
                "OR TRIM(Motivo_cancelamento) = 'Nao Informado')"
            )
        else:
            where_clauses.append(
                "UPPER(TRIM(Motivo_cancelamento)) = UPPER(TRIM(?))"
            )
            params.append(v)

    elif filter_col == "obs":
        if v == "Nao Informado":
            where_clauses.append(
                "(Obs_cancelamento IS NULL "
                "OR TRIM(Obs_cancelamento) = 'Nao Informado')"
            )
        else:
            where_clauses.append(
                "UPPER(TRIM(Obs_cancelamento)) = UPPER(TRIM(?))"
            )
            params.append(v)

    elif filter_col == "financeiro":
        _MAP = {
            "Em dia / Adiantado":  "Media_Atraso <= 0",
            "Pagamento Atrasado":  "Media_Atraso BETWEEN 1 AND 30",
            "Inadimplente (>30d)": "Media_Atraso > 30",
            "Sem Historico":       "Media_Atraso IS NULL",
        }
        clause = _MAP.get(v)
        if clause:
            where_clauses.append(clause)


# ---------------------------------------------------------------------------
# Query de evolucao de clientes ativos por mes
# ---------------------------------------------------------------------------

def build_active_clients_evolution_query(
    start_date,
    end_date,
    city="",
    status_contrato="",
    status_acesso="",
    has_negativacao_table=True,
):
    """
    Retorna (sql, params) para a serie temporal de clientes ativos.
    Usa recursive CTE month_series para gerar um ponto por mes.
    """
    params = []

    union_negativacao = ""
    if has_negativacao_table:
        union_negativacao = """
            UNION
            SELECT ID, Data_ativa_o, Data_negativa_o AS End_Date,
                   'Negativado' AS Status_contrato, 'Desativado' AS Status_acesso, Cidade
            FROM Contratos_Negativacao
            WHERE Data_ativa_o IS NOT NULL
        """

    # Filtros opcionais dentro do FilteredContracts
    extra_filters = f"AND Cidade NOT IN {_EX}"

    if city:
        extra_filters += " AND Cidade = ?"
        params.append(city)

    if status_contrato:
        items = status_contrato.split(",")
        ph = ",".join(["?"] * len(items))
        extra_filters += f" AND Status_contrato IN ({ph})"
        params.extend(items)

    if status_acesso:
        items = status_acesso.split(",")
        ph = ",".join(["?"] * len(items))
        extra_filters += f" AND Status_acesso IN ({ph})"
        params.extend(items)

    params += [start_date, end_date]

    sql = f"""
        WITH AllContracts AS (
            SELECT ID, Data_ativa_o, Data_cancelamento AS End_Date,
                   Status_contrato, Status_acesso, Cidade
            FROM Contratos
            WHERE Data_ativa_o IS NOT NULL
            {union_negativacao}
        ),
        FilteredContracts AS (
            SELECT * FROM AllContracts
            WHERE 1=1 {extra_filters}
        ),
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
                WHERE DATE(C.Data_ativa_o)
                          <= DATE(ms.month_start, 'start of month', '+1 month', '-1 day')
                  AND (C.End_Date IS NULL
                       OR DATE(C.End_Date)
                          > DATE(ms.month_start, 'start of month', '+1 month', '-1 day'))
            ) AS Active_Clients_Count
        FROM month_series ms
    """
    return sql, params


# ---------------------------------------------------------------------------
# Query de cohort (retencao)
# ---------------------------------------------------------------------------

def build_cohort_query(
    where_clauses,
    has_negativacao_table=True,
):
    """
    Retorna o SQL completo da analise de coorte.
    where_clauses: lista de condicoes ja montadas (ex: ["C.Cidade = ?"])
    """
    int_c  = "CAST(TRIM(ID) AS INTEGER)"
    int_car = "CAST(TRIM(ID_Contrato_Recorrente) AS INTEGER)"
    where_sql = " AND ".join(where_clauses) if where_clauses else "1=1"

    if has_negativacao_table:
        contracts_cte = f"""
            WITH AllContracts AS (
                SELECT {int_c} AS ID_Int,
                       DATE(Data_ativa_o) AS Data_ativa_o, Cidade
                FROM Contratos WHERE Data_ativa_o IS NOT NULL
                UNION
                SELECT {int_c} AS ID_Int,
                       DATE(Data_ativa_o) AS Data_ativa_o, Cidade
                FROM Contratos_Negativacao WHERE Data_ativa_o IS NOT NULL
            )
        """
        churn_cte = f"""
            , AllChurn AS (
                SELECT {int_c} AS ID_Int,
                       MIN(DATE(Data_cancelamento)) AS ChurnDate
                FROM Contratos WHERE Data_cancelamento IS NOT NULL
                GROUP BY {int_c}
                UNION
                SELECT {int_c} AS ID_Int,
                       MIN(DATE(Data_negativa_o)) AS ChurnDate
                FROM Contratos_Negativacao WHERE Data_negativa_o IS NOT NULL
                GROUP BY {int_c}
            )
        """
    else:
        contracts_cte = f"""
            WITH AllContracts AS (
                SELECT {int_c} AS ID_Int,
                       DATE(Data_ativa_o) AS Data_ativa_o, Cidade
                FROM Contratos WHERE Data_ativa_o IS NOT NULL
            )
        """
        churn_cte = f"""
            , AllChurn AS (
                SELECT {int_c} AS ID_Int,
                       MIN(DATE(Data_cancelamento)) AS ChurnDate
                FROM Contratos WHERE Data_cancelamento IS NOT NULL
                GROUP BY {int_c}
            )
        """

    sql = f"""
        {contracts_cte}
        , AllInvoices AS (
            SELECT {int_car} AS ID_Int,
                   DATE(Vencimento) AS Vencimento
            FROM Contas_a_Receber
            WHERE Vencimento IS NOT NULL
        )
        {churn_cte}
        , FinalChurn AS (
            SELECT ID_Int, MIN(ChurnDate) AS ChurnDate
            FROM AllChurn GROUP BY ID_Int
        )
        SELECT
            STRFTIME('%Y-%m', C.Data_ativa_o)  AS CohortMonth,
            STRFTIME('%Y-%m', I.Vencimento)    AS InvoiceMonth,
            COUNT(DISTINCT C.ID_Int)           AS ActiveClients
        FROM AllContracts AS C
        JOIN AllInvoices  AS I  ON C.ID_Int = I.ID_Int
        LEFT JOIN FinalChurn AS CH ON C.ID_Int = CH.ID_Int
        WHERE {where_sql.replace('C.Data_ativa_o', 'DATE(C.Data_ativa_o)')}
          AND I.Vencimento >= C.Data_ativa_o
          AND (CH.ChurnDate IS NULL OR I.Vencimento < CH.ChurnDate)
        GROUP BY CohortMonth, InvoiceMonth
        ORDER BY CohortMonth, InvoiceMonth
    """
    return sql

"""
queries/sales_queries.py

Construtores de SQL para analises de vendas (churn por vendedor,
ativacoes por vendedor).

Nenhuma dependencia de Flask — so strings SQL e listas de parametros.
"""

from utils_api import add_date_range_filter

_EX = "('Caçapava', 'Jacareí', 'São José dos Campos')"


# ---------------------------------------------------------------------------
# Queries para analise de vendedores (churn)
# ---------------------------------------------------------------------------

def build_seller_churn_queries(start_date="", end_date="", has_negativacao_table=True):
    """
    Retorna (query_cancelados_sql, params_c,
             query_negativados_c_sql, params_nc,
             query_negativados_cn_sql, params_ncn)

    Cada par (sql, params) pode ser executado individualmente e depois
    concatenado com pandas.concat.

    Uso:
        sql_c, p_c, sql_nc, p_nc, sql_cn, p_cn = build_seller_churn_queries(start, end)
        df_c   = pd.read_sql_query(sql_c,  conn, params=p_c)
        df_nc  = pd.read_sql_query(sql_nc, conn, params=p_nc)
        df_cn  = pd.DataFrame()
        try:
            df_cn = pd.read_sql_query(sql_cn, conn, params=p_cn)
        except Exception:
            pass  # tabela nao existe
        df_all = pd.concat([df_c, df_nc, df_cn], ignore_index=True)
    """
    params_c = []
    where_c  = ["Status_contrato = 'Inativo'", "Status_acesso = 'Desativado'"]
    add_date_range_filter(where_c, params_c, "Data_cancelamento", start_date, end_date)
    sql_c = f"""
        SELECT Vendedor AS Vendedor_ID, 'Cancelado' AS Status
        FROM Contratos
        WHERE {' AND '.join(where_c)}
    """

    params_nc = []
    where_nc  = ["Status_contrato = 'Negativado'", f"Cidade NOT IN {_EX}"]
    add_date_range_filter(where_nc, params_nc, "Data_cancelamento", start_date, end_date)
    sql_nc = f"""
        SELECT Vendedor AS Vendedor_ID, 'Negativado' AS Status
        FROM Contratos
        WHERE {' AND '.join(where_nc)}
    """

    params_cn = []
    where_cn  = [f"Cidade NOT IN {_EX}"]
    add_date_range_filter(where_cn, params_cn, "Data_negativa_o", start_date, end_date)
    sql_cn = f"""
        SELECT Vendedor AS Vendedor_ID, 'Negativado' AS Status
        FROM Contratos_Negativacao
        WHERE {' AND '.join(where_cn)}
    """

    return sql_c, params_c, sql_nc, params_nc, sql_cn, params_cn


# ---------------------------------------------------------------------------
# Query para analise de ativacoes por vendedor
# ---------------------------------------------------------------------------

def build_activations_query(
    city="",
    start_date="",
    end_date="",
    has_negativacao_table=True,
):
    """
    Retorna (sql_contratos, params_c, sql_negativacao, params_cn).

    sql_negativacao pode falhar se a tabela nao existir — trate com try/except.

    Os dois SQLs retornam as colunas:
        ID, Vendedor_ID, Status_contrato, Data_cancelamento,
        is_negativado_table, Cidade

    Uso:
        sql_c, p_c, sql_cn, p_cn = build_activations_query(city, start, end)

        try:
            df_all = pd.read_sql_query(
                sql_c + " UNION " + sql_cn, conn, params=p_c + p_cn
            )
        except Exception:
            df_all = pd.read_sql_query(sql_c, conn, params=p_c)
    """
    params_base = []
    where_base  = ["Data_ativa_o IS NOT NULL", "Vendedor IS NOT NULL"]

    if city:
        where_base.append("Cidade = ?")
        params_base.append(city)

    add_date_range_filter(where_base, params_base, "Data_ativa_o", start_date, end_date)
    where_base_sql = " AND ".join(where_base)
    # Versao sem alias de tabela para usar no Contratos_Negativacao
    where_no_alias = where_base_sql.replace("C.", "")

    sql_c = f"""
        SELECT ID,
               Vendedor        AS Vendedor_ID,
               Status_contrato,
               Data_cancelamento,
               0               AS is_negativado_table,
               Cidade
        FROM Contratos C
        WHERE {where_base_sql}
    """

    sql_cn = f"""
        SELECT ID,
               Vendedor           AS Vendedor_ID,
               'Negativado'       AS Status_contrato,
               Data_negativa_o    AS Data_cancelamento,
               1                  AS is_negativado_table,
               Cidade
        FROM Contratos_Negativacao C
        WHERE {where_no_alias}
    """

    return sql_c, list(params_base), sql_cn, list(params_base)


# ---------------------------------------------------------------------------
# Query: detalhes de clientes de um vendedor (modal)
# ---------------------------------------------------------------------------

def build_seller_clients_query(
    seller_id,
    client_type,
    year="",
    month="",
    limit=25,
    offset=0,
):
    """
    Retorna (sql, params) para o modal de detalhes do vendedor.

    client_type: 'cancelado' | 'negativado'

    Uso:
        sql, params = build_seller_clients_query(seller_id, 'cancelado', year, month)
        count_sql = "SELECT COUNT(*) FROM ({sql})"
        paged_sql = "SELECT sub.* FROM ({sql}) AS sub ORDER BY sub.end_date DESC LIMIT ? OFFSET ?"
    """
    _safe_month = f"{int(month):02d}" if month else ""

    if client_type == "cancelado":
        conditions = [
            "Vendedor = ?",
            "Status_contrato = 'Inativo'",
            "Status_acesso = 'Desativado'",
        ]
        params = [seller_id]
        if year:
            conditions.append("STRFTIME('%Y', Data_cancelamento) = ?")
            params.append(year)
        if _safe_month:
            conditions.append("STRFTIME('%m', Data_cancelamento) = ?")
            params.append(_safe_month)

        sql = f"""
            SELECT Cliente, ID AS Contrato_ID,
                   Data_ativa_o, Data_cancelamento AS end_date
            FROM Contratos
            WHERE {' AND '.join(conditions)}
        """
        return sql, params

    # negativado
    cond_cn = ["Vendedor = ?", f"Cidade NOT IN {_EX}"]
    params_cn = [seller_id]
    if year:
        cond_cn.append("STRFTIME('%Y', Data_negativa_o) = ?")
        params_cn.append(year)
    if _safe_month:
        cond_cn.append("STRFTIME('%m', Data_negativa_o) = ?")
        params_cn.append(_safe_month)

    cond_c = ["Vendedor = ?", "Status_contrato = 'Negativado'", f"Cidade NOT IN {_EX}"]
    params_c = [seller_id]
    if year:
        cond_c.append("STRFTIME('%Y', Data_cancelamento) = ?")
        params_c.append(year)
    if _safe_month:
        cond_c.append("STRFTIME('%m', Data_cancelamento) = ?")
        params_c.append(_safe_month)

    sql = f"""
        SELECT Cliente, ID AS Contrato_ID,
               Data_ativa_o, Data_negativa_o AS end_date
        FROM Contratos_Negativacao
        WHERE {' AND '.join(cond_cn)}

        UNION

        SELECT Cliente, ID AS Contrato_ID,
               Data_ativa_o, Data_cancelamento AS end_date
        FROM Contratos
        WHERE {' AND '.join(cond_c)}
    """
    return sql, params_cn + params_c

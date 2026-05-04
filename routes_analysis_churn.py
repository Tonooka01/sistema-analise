"""
routes_analysis_churn.py
Blueprint de analise de churn — usa queries/churn_queries.py.
"""
import sqlite3
import traceback
import pandas as pd
from flask import Blueprint, jsonify, request
from utils_api import get_db, add_date_range_filter
from queries.churn_queries import (
    FINANCIAL_STATS_CTE,
    RELEVANT_TICKETS_CTE,
    build_all_cancellations_cte,
    build_all_negativados_cte,
    build_cohort_query,
    build_active_clients_evolution_query,
    apply_relevance_filter,
    apply_chart_filter,
    parse_relevance,
    permanence_months_expr,
)

churn_bp = Blueprint("churn_bp", __name__)

_EX = "('Caçapava', 'Jacareí', 'São José dos Campos')"


def _has_neg(conn):
    row = conn.execute(
        "SELECT name FROM sqlite_master "
        "WHERE type='table' AND name='Contratos_Negativacao'"
    ).fetchone()
    return row is not None


# ---------------------------------------------------------------------------
# 1. Permanencia Real
# ---------------------------------------------------------------------------

@churn_bp.route("/real_permanence")
def api_real_permanence():
    conn = get_db()
    try:
        search_term     = request.args.get("search_term", "").strip()
        limit           = request.args.get("limit", 50, type=int)
        offset          = request.args.get("offset", 0, type=int)
        start_date      = request.args.get("start_date", "")
        end_date        = request.args.get("end_date", "")
        relevance       = request.args.get("relevance", "")
        relevance_real  = request.args.get("relevance_real", "")
        status_contrato = request.args.get("status_contrato")
        status_acesso   = request.args.get("status_acesso")

        has_neg = _has_neg(conn)
        cursor  = conn.cursor()

        contract_cols  = [r[1] for r in cursor.execute("PRAGMA table_info(Contratos)").fetchall()]
        has_vendedor   = "Vendedor" in contract_cols
        all_tables     = [r[0] for r in cursor.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
        has_eq         = "Equipamento" in all_tables
        has_vend_table = "Vendedores" in all_tables

        col_status_eq = "Status"
        col_desc_eq   = "Descricao_produto"
        col_data_eq   = "Data"
        if has_eq:
            eq_cols = [r[1] for r in cursor.execute("PRAGMA table_info(Equipamento)").fetchall()]
            for c in ["Status_comodato", "Status", "STATUS"]:
                if c in eq_cols: col_status_eq = c; break
            for c in ["Descricao_produto", "Descri_o_produto", "Produto"]:
                if c in eq_cols: col_desc_eq = c; break
            for c in ["Data", "DATA", "Data_movimento"]:
                if c in eq_cols: col_data_eq = c; break

        # WHERE para Contratos (tem Status_contrato e Status_acesso)
        contract_where, contract_params = [], []
        if search_term:
            contract_where.append("(Cliente LIKE ? OR Cidade LIKE ?)")
            contract_params += [f"%{search_term}%", f"%{search_term}%"]
        if start_date:
            contract_where.append("DATE(Data_ativa_o) >= ?")
            contract_params.append(start_date)
        if end_date:
            contract_where.append("DATE(Data_ativa_o) <= ?")
            contract_params.append(end_date)
        if status_contrato:
            items = status_contrato.split(",")
            ph    = ",".join(["?"] * len(items))
            contract_where.append(f"Status_contrato IN ({ph})")
            contract_params.extend(items)
        if status_acesso:
            items = status_acesso.split(",")
            ph    = ",".join(["?"] * len(items))
            contract_where.append(f"Status_acesso IN ({ph})")
            contract_params.extend(items)
        contract_where.append(f"Cidade NOT IN {_EX}")
        where_contracts_sql = ("WHERE " + " AND ".join(contract_where)) if contract_where else ""

        # WHERE para Contratos_Negativacao (NÃO tem Status_contrato/Status_acesso)
        neg_where, neg_params = [], []
        if search_term:
            neg_where.append("(Cliente LIKE ? OR Cidade LIKE ?)")
            neg_params += [f"%{search_term}%", f"%{search_term}%"]
        if start_date:
            neg_where.append("DATE(Data_ativa_o) >= ?")
            neg_params.append(start_date)
        if end_date:
            neg_where.append("DATE(Data_ativa_o) <= ?")
            neg_params.append(end_date)
        neg_where.append(f"Cidade NOT IN {_EX}")
        # Se filtro de status_acesso excluir 'Desativado'/'Negativado', ignora negativados
        if status_acesso and "Desativado" not in status_acesso:
            neg_where.append("1=0")  # retorna vazio
        if status_contrato and "Negativado" not in status_contrato:
            neg_where.append("1=0")  # retorna vazio
        where_neg_sql = ("WHERE " + " AND ".join(neg_where)) if neg_where else ""

        col_v = "Vendedor" if has_vendedor else "NULL AS Vendedor"
        if has_neg:
            all_contracts_cte = f"""
                AllContracts AS (
                    SELECT ID, Cliente, Cidade, Bairro, Data_ativa_o,
                           Data_cancelamento, Status_contrato, Status_acesso, {col_v}
                    FROM Contratos {where_contracts_sql}
                    UNION
                    SELECT ID, Cliente, Cidade, Bairro, Data_ativa_o,
                           Data_negativa_o AS Data_cancelamento,
                           'Negativado' AS Status_contrato, 'Desativado' AS Status_acesso, {col_v}
                    FROM Contratos_Negativacao {where_neg_sql}
                )
            """
        else:
            all_contracts_cte = f"""
                AllContracts AS (
                    SELECT ID, Cliente, Cidade, Bairro, Data_ativa_o,
                           Data_cancelamento, Status_contrato, Status_acesso, {col_v}
                    FROM Contratos {where_contracts_sql}
                )
            """

        financial_cte = """
            FinancialStats AS (
                SELECT
                    ID_Contrato_Recorrente,
                    SUM(CASE WHEN Data_pagamento > Vencimento THEN 1 ELSE 0 END) AS Atrasos_Pagos,
                    SUM(CASE WHEN Status = 'A receber' AND Vencimento < date('now') THEN 1 ELSE 0 END) AS Faturas_Nao_Pagas,
                    COUNT(*) AS Total_Faturas,
                    SUM(CASE WHEN Data_pagamento IS NOT NULL THEN 1 ELSE 0 END) AS Faturas_Pagas,
                    SUM(CASE WHEN Status = 'Cancelado' THEN 1 ELSE 0 END) AS Faturas_Canceladas,
                    AVG(CASE WHEN Data_pagamento IS NOT NULL
                             THEN JULIANDAY(Data_pagamento) - JULIANDAY(Vencimento)
                             ELSE NULL END) AS Media_Atraso
                FROM Contas_a_Receber
                GROUP BY ID_Contrato_Recorrente
            )
        """

        if has_eq:
            eq_cte = f"""
                ActiveEquipments AS (
                    SELECT TRIM(ID_contrato) AS ID_Contrato,
                           GROUP_CONCAT({col_desc_eq}, ', ') AS Equipamentos_Ativos
                    FROM Equipamento
                    WHERE UPPER({col_status_eq}) = 'EMPRESTADO'
                      AND TRIM(ID_contrato) IN (SELECT ID FROM AllContracts)
                    GROUP BY ID_Contrato
                ),
                LastReturnedEquipments AS (
                    SELECT ID_Contrato, {col_desc_eq} AS Equipamento_Devolvido
                    FROM (
                        SELECT TRIM(ID_contrato) AS ID_Contrato, {col_desc_eq},
                               ROW_NUMBER() OVER (PARTITION BY TRIM(ID_contrato) ORDER BY {col_data_eq} DESC) AS rn
                        FROM Equipamento
                        WHERE UPPER({col_status_eq}) IN ('BAIXA', 'DEVOLVIDO')
                          AND TRIM(ID_contrato) IN (SELECT ID FROM AllContracts)
                    ) WHERE rn = 1
                )
            """
            eq_join   = "LEFT JOIN ActiveEquipments AE ON C.ID = AE.ID_Contrato LEFT JOIN LastReturnedEquipments LRE ON C.ID = LRE.ID_Contrato"
            eq_select = "COALESCE(AE.Equipamentos_Ativos, LRE.Equipamento_Devolvido, 'Nenhum') AS Equipamento_Comodato,"
        else:
            eq_cte    = "ActiveEquipments AS (SELECT 1 WHERE 0), LastReturnedEquipments AS (SELECT 1 WHERE 0)"
            eq_join   = ""
            eq_select = "'Nenhum' AS Equipamento_Comodato,"

        if has_vend_table:
            vend_cte    = "SellerInfo AS (SELECT ID, Vendedor FROM Vendedores)"
            vend_join   = "LEFT JOIN SellerInfo S ON C.Vendedor = S.ID"
            vend_select = "COALESCE(S.Vendedor, 'N/A') AS Vendedor_Nome,"
        else:
            vend_cte    = "SellerInfo AS (SELECT 1 WHERE 0)"
            vend_join   = ""
            vend_select = "'N/A' AS Vendedor_Nome,"

        perm_paga = "COALESCE(FS.Faturas_Pagas, 0)"
        perm_cal  = permanence_months_expr("C.Data_ativa_o", "COALESCE(C.Data_cancelamento, DATE('now'))")

        base_query = f"""
            WITH
            {all_contracts_cte},
            {financial_cte},
            {eq_cte},
            {vend_cte},
            JoinedData AS (
                SELECT
                    C.ID AS Contrato_ID, C.Cliente,
                    C.Vendedor AS Vendedor_ID,
                    {vend_select}
                    C.Cidade, C.Bairro,
                    C.Data_ativa_o AS data_ativacao,
                    C.Data_cancelamento, C.Status_contrato, C.Status_acesso,
                    COALESCE(FS.Total_Faturas, 0)     AS Total_Faturas,
                    COALESCE(FS.Faturas_Pagas, 0)     AS Faturas_Pagas,
                    COALESCE(FS.Faturas_Canceladas, 0) AS Faturas_Canceladas,
                    COALESCE(FS.Faturas_Nao_Pagas, 0) AS Faturas_Nao_Pagas,
                    COALESCE(FS.Atrasos_Pagos, 0)     AS Atrasos_Pagos,
                    FS.Media_Atraso,
                    {eq_select}
                    {perm_paga} AS Permanencia_Paga,
                    {perm_cal}  AS Permanencia_Real_Calendario
                FROM AllContracts C
                LEFT JOIN FinancialStats FS ON C.ID = FS.ID_Contrato_Recorrente
                {eq_join}
                {vend_join}
            )
        """

        final_where, final_params = [], []
        apply_relevance_filter(final_where, final_params, relevance,      "Permanencia_Paga")
        apply_relevance_filter(final_where, final_params, relevance_real, "Permanencia_Real_Calendario")
        final_where_sql = ("WHERE " + " AND ".join(final_where)) if final_where else ""

        chart_paga = conn.execute(
            base_query +
            "SELECT CASE WHEN Permanencia_Paga<=6 THEN '0-6' "
            "WHEN Permanencia_Paga BETWEEN 7 AND 12 THEN '7-12' "
            "WHEN Permanencia_Paga BETWEEN 13 AND 18 THEN '13-18' "
            "WHEN Permanencia_Paga BETWEEN 19 AND 25 THEN '19-25' "
            "WHEN Permanencia_Paga BETWEEN 26 AND 30 THEN '25-30' "
            "ELSE '31+' END AS Faixa, COUNT(*) AS Count FROM JoinedData GROUP BY Faixa",
            tuple(contract_params + neg_params),
        ).fetchall()

        chart_real = conn.execute(
            base_query +
            "SELECT CASE WHEN Permanencia_Real_Calendario<=6 THEN '0-6' "
            "WHEN Permanencia_Real_Calendario BETWEEN 7 AND 12 THEN '7-12' "
            "WHEN Permanencia_Real_Calendario BETWEEN 13 AND 18 THEN '13-18' "
            "WHEN Permanencia_Real_Calendario BETWEEN 19 AND 25 THEN '19-25' "
            "WHEN Permanencia_Real_Calendario BETWEEN 26 AND 30 THEN '25-30' "
            "ELSE '31+' END AS Faixa, COUNT(*) AS Count FROM JoinedData GROUP BY Faixa",
            tuple(contract_params + neg_params),
        ).fetchall()

        chart_city = conn.execute(
            base_query +
            "SELECT Cidade, "
            "CASE WHEN Permanencia_Paga<=6 THEN '0-6' "
            "WHEN Permanencia_Paga BETWEEN 7 AND 12 THEN '7-12' "
            "WHEN Permanencia_Paga BETWEEN 13 AND 18 THEN '13-18' "
            "WHEN Permanencia_Paga BETWEEN 19 AND 25 THEN '19-25' "
            "WHEN Permanencia_Paga BETWEEN 26 AND 30 THEN '25-30' "
            "ELSE '31+' END AS Faixa, COUNT(*) AS Count "
            "FROM JoinedData WHERE Cidade IS NOT NULL AND TRIM(Cidade) != '' GROUP BY Cidade, Faixa",
            tuple(contract_params + neg_params),
        ).fetchall()

        total = conn.execute(
            base_query + "SELECT COUNT(*) FROM JoinedData " + final_where_sql,
            tuple(contract_params + neg_params + final_params),
        ).fetchone()[0]

        data = conn.execute(
            base_query + "SELECT * FROM JoinedData " + final_where_sql +
            " ORDER BY Permanencia_Paga DESC, Cliente LIMIT ? OFFSET ?",
            tuple(contract_params + neg_params + final_params + [limit, offset]),
        ).fetchall()

        return jsonify({
            "data": [dict(r) for r in data],
            "total_rows": total,
            "charts": {
                "paga_distribution": [dict(r) for r in chart_paga],
                "real_distribution": [dict(r) for r in chart_real],
                "city_distribution": [dict(r) for r in chart_city],
            },
        })

    except sqlite3.Error as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
    finally:
        if conn: conn.close()


# ---------------------------------------------------------------------------
# 2. Cancelamentos
# ---------------------------------------------------------------------------

@churn_bp.route("/cancellations")
def api_cancellation_analysis():
    conn = get_db()
    try:
        search_term      = request.args.get("search_term", "").strip()
        limit            = request.args.get("limit", 50, type=int)
        offset           = request.args.get("offset", 0, type=int)
        relevance        = request.args.get("relevance", "")
        sort_order       = request.args.get("sort_order", "")
        start_date       = request.args.get("start_date", "")
        end_date         = request.args.get("end_date", "")
        chart_filter_col = request.args.get("filter_column", "")
        chart_filter_val = request.args.get("filter_value", "").strip()

        has_neg          = _has_neg(conn)
        canc_cte, params = build_all_cancellations_cte(start_date, end_date, has_neg)
        perm             = permanence_months_expr("AC.Data_ativa_o", "AC.Data_cancelamento")

        base = (
            "WITH " + FINANCIAL_STATS_CTE + ", "
            + RELEVANT_TICKETS_CTE + ", "
            + canc_cte + ", "
            + f"""
            BaseData AS (
                SELECT
                    AC.Cliente, AC.Contrato_ID,
                    COALESCE(AC.Motivo_cancelamento, 'Não Informado') AS Motivo_cancelamento,
                    COALESCE(AC.Obs_cancelamento,   'Não Informado') AS Obs_cancelamento,
                    AC.Data_cancelamento, AC.Data_ativa_o,
                    CASE WHEN RT.Cliente IS NOT NULL THEN 'Sim' ELSE 'Não' END AS Teve_Contato_Relevante,
                    {perm} AS permanencia_meses
                FROM AllCancellations AC
                LEFT JOIN RelevantTickets RT ON AC.Cliente = RT.Cliente
            ),
            FinalView AS (
                SELECT BD.*,
                    COALESCE(FS.Atrasos_Pagos,     0) AS Atrasos_Pagos,
                    COALESCE(FS.Faturas_Nao_Pagas, 0) AS Faturas_Nao_Pagas,
                    COALESCE(FS.Total_Faturas,     0) AS Total_Faturas,
                    FS.Media_Atraso
                FROM BaseData BD
                LEFT JOIN FinancialStats FS ON BD.Contrato_ID = FS.ID_Contrato_Recorrente
            )
            """
        )

        table_where, table_params = [], list(params)
        if search_term:
            table_where.append("Cliente LIKE ?")
            table_params.append(f"%{search_term}%")
        apply_relevance_filter(table_where, table_params, relevance)
        apply_chart_filter(table_where, table_params, chart_filter_col, chart_filter_val)
        where_table = ("WHERE " + " AND ".join(table_where)) if table_where else ""

        total = conn.execute(base + "SELECT COUNT(*) FROM FinalView " + where_table, tuple(table_params)).fetchone()[0]

        order = "ORDER BY Cliente, Contrato_ID"
        if sort_order == "asc":  order = "ORDER BY permanencia_meses ASC, Cliente"
        elif sort_order == "desc": order = "ORDER BY permanencia_meses DESC, Cliente"

        data = conn.execute(
            base + "SELECT * FROM FinalView " + where_table + " " + order + " LIMIT ? OFFSET ?",
            tuple(table_params + [limit, offset]),
        ).fetchall()

        chart_where, chart_params = [], list(params)
        if search_term:
            chart_where.append("Cliente LIKE ?")
            chart_params.append(f"%{search_term}%")
        apply_relevance_filter(chart_where, chart_params, relevance)
        where_chart = ("WHERE " + " AND ".join(chart_where)) if chart_where else ""

        chart_motivo = conn.execute(base + "SELECT Motivo_cancelamento, COUNT(*) AS Count FROM FinalView " + where_chart + " GROUP BY Motivo_cancelamento ORDER BY Count DESC", tuple(chart_params)).fetchall()
        chart_obs    = conn.execute(base + "SELECT Obs_cancelamento, COUNT(*) AS Count FROM FinalView "    + where_chart + " GROUP BY Obs_cancelamento ORDER BY Count DESC",    tuple(chart_params)).fetchall()
        chart_fin    = conn.execute(
            base + """
            SELECT CASE
                WHEN Media_Atraso <= 0 THEN 'Em dia / Adiantado'
                WHEN Media_Atraso BETWEEN 1 AND 30 THEN 'Pagamento Atrasado'
                WHEN Media_Atraso > 30 THEN 'Inadimplente (>30d)'
                ELSE 'Sem Histórico'
            END AS Status_Pagamento, COUNT(*) AS Count
            FROM FinalView """ + where_chart + " GROUP BY Status_Pagamento ORDER BY Count DESC",
            tuple(chart_params),
        ).fetchall()

        return jsonify({
            "data": [dict(r) for r in data], "total_rows": total,
            "charts": {
                "motivo":     [dict(r) for r in chart_motivo],
                "obs":        [dict(r) for r in chart_obs],
                "financeiro": [dict(r) for r in chart_fin],
            },
        })

    except sqlite3.Error as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
    finally:
        if conn: conn.close()


# ---------------------------------------------------------------------------
# 3. Negativacao
# ---------------------------------------------------------------------------

@churn_bp.route("/negativacao")
def api_negativacao_analysis():
    conn = get_db()
    try:
        search_term      = request.args.get("search_term", "").strip()
        limit            = request.args.get("limit", 50, type=int)
        offset           = request.args.get("offset", 0, type=int)
        relevance        = request.args.get("relevance", "")
        sort_order       = request.args.get("sort_order", "")
        start_date       = request.args.get("start_date", "")
        end_date         = request.args.get("end_date", "")
        chart_filter_col = request.args.get("filter_column", "")
        chart_filter_val = request.args.get("filter_value", "").strip()

        has_neg         = _has_neg(conn)
        neg_cte, params = build_all_negativados_cte(start_date, end_date, has_neg)
        perm            = permanence_months_expr("AN.Data_ativa_o", "AN.end_date")

        base = (
            "WITH " + FINANCIAL_STATS_CTE + ", "
            + RELEVANT_TICKETS_CTE + ", "
            + neg_cte + ", "
            + f"""
            BaseData AS (
                SELECT
                    AN.Cliente, AN.ID AS Contrato_ID, AN.end_date, AN.Data_ativa_o,
                    CASE WHEN RT.Cliente IS NOT NULL THEN 'Sim' ELSE 'Não' END AS Teve_Contato_Relevante,
                    {perm} AS permanencia_meses
                FROM AllNegativados AN
                LEFT JOIN RelevantTickets RT ON AN.Cliente = RT.Cliente
            ),
            FinalView AS (
                SELECT BD.*,
                    COALESCE(FS.Atrasos_Pagos,     0) AS Atrasos_Pagos,
                    COALESCE(FS.Faturas_Nao_Pagas, 0) AS Faturas_Nao_Pagas,
                    COALESCE(FS.Total_Faturas,     0) AS Total_Faturas,
                    FS.Media_Atraso
                FROM BaseData BD
                LEFT JOIN FinancialStats FS ON BD.Contrato_ID = FS.ID_Contrato_Recorrente
            )
            """
        )

        table_where, table_params = [], list(params)
        if search_term:
            table_where.append("Cliente LIKE ?")
            table_params.append(f"%{search_term}%")
        apply_relevance_filter(table_where, table_params, relevance)
        apply_chart_filter(table_where, table_params, chart_filter_col, chart_filter_val)
        where_table = ("WHERE " + " AND ".join(table_where)) if table_where else ""

        total = conn.execute(base + "SELECT COUNT(*) FROM FinalView " + where_table, tuple(table_params)).fetchone()[0]

        order = "ORDER BY Cliente, Contrato_ID"
        if sort_order == "asc":   order = "ORDER BY permanencia_meses ASC, Cliente"
        elif sort_order == "desc": order = "ORDER BY permanencia_meses DESC, Cliente"

        data = conn.execute(
            base + "SELECT * FROM FinalView " + where_table + " " + order + " LIMIT ? OFFSET ?",
            tuple(table_params + [limit, offset]),
        ).fetchall()

        chart_where, chart_params = [], list(params)
        if search_term:
            chart_where.append("Cliente LIKE ?")
            chart_params.append(f"%{search_term}%")
        apply_relevance_filter(chart_where, chart_params, relevance)
        where_chart = ("WHERE " + " AND ".join(chart_where)) if chart_where else ""

        chart_fin = conn.execute(
            base + """
            SELECT CASE
                WHEN Media_Atraso <= 0 THEN 'Em dia / Adiantado'
                WHEN Media_Atraso BETWEEN 1 AND 30 THEN 'Pagamento Atrasado'
                WHEN Media_Atraso > 30 THEN 'Inadimplente (>30d)'
                ELSE 'Sem Histórico'
            END AS Status_Pagamento, COUNT(*) AS Count
            FROM FinalView """ + where_chart + " GROUP BY Status_Pagamento ORDER BY Count DESC",
            tuple(chart_params),
        ).fetchall()

        return jsonify({
            "data": [dict(r) for r in data], "total_rows": total,
            "charts": {"financeiro": [dict(r) for r in chart_fin]},
        })

    except sqlite3.Error as e:
        if "no such table" in str(e).lower():
            return jsonify({"error": "Tabela 'Contratos_Negativacao' não encontrada."}), 500
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
    finally:
        if conn: conn.close()


# ---------------------------------------------------------------------------
# 4. Coorte
# ---------------------------------------------------------------------------

@churn_bp.route("/cohort")
def api_cohort_analysis():
    conn    = get_db()
    fallback = {"cities": [], "years": []}
    try:
        city       = request.args.get("city", "")
        start_date = request.args.get("start_date", "")
        end_date   = request.args.get("end_date", "")
        has_neg    = _has_neg(conn)

        try:
            fallback["cities"] = [r[0] for r in conn.execute(
                "SELECT DISTINCT Cidade FROM (SELECT Cidade FROM Contratos UNION SELECT Cidade FROM Contratos_Negativacao) WHERE Cidade IS NOT NULL ORDER BY Cidade"
            ).fetchall() if r[0]]
        except Exception:
            fallback["cities"] = [r[0] for r in conn.execute(
                "SELECT DISTINCT Cidade FROM Contratos WHERE Cidade IS NOT NULL ORDER BY Cidade"
            ).fetchall() if r[0]]

        try:
            fallback["years"] = [r[0] for r in conn.execute(
                "SELECT DISTINCT STRFTIME('%Y', Data_ativa_o) AS Y FROM Contratos UNION SELECT DISTINCT STRFTIME('%Y', Data_ativa_o) FROM Contratos_Negativacao ORDER BY Y DESC"
            ).fetchall() if r[0]]
        except Exception:
            fallback["years"] = [r[0] for r in conn.execute(
                "SELECT DISTINCT STRFTIME('%Y', Data_ativa_o) AS Y FROM Contratos ORDER BY Y DESC"
            ).fetchall() if r[0]]

        where_clauses, params = ["C.Data_ativa_o IS NOT NULL"], []
        if city:
            where_clauses.append("C.Cidade = ?")
            params.append(city)
        add_date_range_filter(where_clauses, params, "C.Data_ativa_o", start_date, end_date)

        sql         = build_cohort_query(where_clauses, has_neg)
        cohort_data = pd.read_sql_query(sql, conn, params=tuple(params))

        if cohort_data.empty:
            return jsonify({"datasets": [], "labels": [], **fallback})

        cohort_data["CohortMonth"]  = pd.to_datetime(cohort_data["CohortMonth"]).dt.to_period("M")
        cohort_data["InvoiceMonth"] = pd.to_datetime(cohort_data["InvoiceMonth"]).dt.to_period("M")
        all_months = sorted(cohort_data["InvoiceMonth"].unique())
        cohorts    = sorted(cohort_data["CohortMonth"].unique())
        datasets   = []

        for cohort in cohorts:
            df        = cohort_data[cohort_data["CohortMonth"] == cohort]
            month_map = pd.Series(df["ActiveClients"].values, index=df["InvoiceMonth"]).reindex(all_months, fill_value=0)
            filtered  = month_map[month_map.index >= cohort]
            padding   = [0] * (len(all_months) - len(filtered))
            datasets.append({"label": str(cohort), "data": padding + [int(v) for v in filtered.values], "fill": "origin"})

        return jsonify({"labels": [str(m) for m in all_months], "datasets": datasets, **fallback})

    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e), "datasets": [], "labels": [], **fallback}), 500
    finally:
        if conn: conn.close()


# ---------------------------------------------------------------------------
# 5. Evolucao de clientes ativos
# ---------------------------------------------------------------------------

@churn_bp.route("/active_clients_evolution")
def api_active_clients_evolution():
    conn = get_db()
    try:
        start_date      = request.args.get("start_date")
        end_date        = request.args.get("end_date")
        city            = request.args.get("city", "")
        status_contrato = request.args.get("status_contrato", "")
        status_acesso   = request.args.get("status_acesso", "")

        if not start_date or not end_date:
            return jsonify({"error": "Data inicial e final são obrigatórias."}), 400

        has_neg    = _has_neg(conn)
        sql, params = build_active_clients_evolution_query(start_date, end_date, city, status_contrato, status_acesso, has_neg)
        data        = conn.execute(sql, tuple(params)).fetchall()
        cities      = conn.execute(
            f"SELECT DISTINCT Cidade FROM Contratos WHERE Cidade IS NOT NULL AND TRIM(Cidade) != '' AND Cidade NOT IN {_EX} ORDER BY Cidade"
        ).fetchall()

        return jsonify({"data": [dict(r) for r in data], "cities": [r[0] for r in cities]})

    except sqlite3.Error as e:
        return jsonify({"error": str(e)}), 500
    finally:
        if conn: conn.close()

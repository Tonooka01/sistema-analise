"""
routes_analysis_finance.py
Blueprint de analise financeira — usa queries/finance_queries.py.
"""
import sqlite3
import traceback
from flask import Blueprint, jsonify, request
from utils_api import get_db, add_date_range_filter
from queries.finance_queries import (
    build_first_late_payment_cte,
    build_financial_health_where,
    build_billing_queries,
    build_late_interest_query,
    LAST_CONNECTION_CTE,
    CUSTOMER_COMPLAINTS_CTE,
)

finance_bp = Blueprint("finance_bp", __name__)


# ---------------------------------------------------------------------------
# helper: monta e executa saude financeira para qualquer delay_days
# ---------------------------------------------------------------------------

def _run_health(delay_days):
    conn = get_db()
    try:
        search_term     = request.args.get("search_term", "").strip()
        limit           = request.args.get("limit", 50, type=int)
        offset          = request.args.get("offset", 0, type=int)
        status_contrato = request.args.get("status_contrato", "")
        status_acesso   = request.args.get("status_acesso", "")
        relevance       = request.args.get("relevance", "")

        # build_first_late_payment_cte retorna "FirstLatePayment AS (SELECT ...)"
        # Usamos direto apos WITH, sem repetir o nome
        flp              = build_first_late_payment_cte(delay_days)
        where_sql, params = build_financial_health_where(
            search_term, status_contrato, status_acesso, relevance
        )

        # --- contagem ---
        count_sql = (
            "WITH " + flp + " "
            "SELECT COUNT(C.ID) FROM Contratos C "
            "JOIN FirstLatePayment FLP ON C.ID = FLP.ID_Contrato_Recorrente "
            + where_sql
        )
        total = conn.execute(count_sql, tuple(params)).fetchone()[0]

        # --- dados paginados ---
        data_sql = (
            "WITH " + flp + ", "
            + CUSTOMER_COMPLAINTS_CTE + ", "
            + LAST_CONNECTION_CTE
            + """
            SELECT
                C.Cliente                               AS Razao_Social,
                C.ID                                    AS Contrato_ID,
                C.Status_contrato,
                C.Status_acesso,
                C.Data_ativa_o,
                FLP.Primeira_Inadimplencia_Vencimento,
                COALESCE(CC.Possui_Reclamacoes, 'Nao')  AS Possui_Reclamacoes,
                LC.Ultima_Conexao
            FROM Contratos C
            JOIN FirstLatePayment FLP ON C.ID = FLP.ID_Contrato_Recorrente
            LEFT JOIN CustomerComplaints CC ON C.Cliente = CC.Cliente
            LEFT JOIN LastConnection     LC ON C.ID      = LC.ID_contrato
            """
            + where_sql
            + " ORDER BY C.Cliente, C.ID LIMIT ? OFFSET ?"
        )
        data = conn.execute(data_sql, tuple(params + [limit, offset])).fetchall()

        return jsonify({"data": [dict(r) for r in data], "total_rows": total})

    except sqlite3.Error as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
    finally:
        if conn:
            conn.close()


# ---------------------------------------------------------------------------
# Rotas
# ---------------------------------------------------------------------------

@finance_bp.route("/financial_health")
def api_financial_health():
    return _run_health(delay_days=10)


@finance_bp.route("/financial_health_auto_block")
def api_financial_health_auto_block():
    return _run_health(delay_days=20)


@finance_bp.route("/contas_a_receber")
def api_contas_a_receber():
    conn = get_db()
    try:
        search_term = request.args.get("search_term", "").strip()
        limit       = request.args.get("limit", 50, type=int)
        offset      = request.args.get("offset", 0, type=int)

        base_from = """
            FROM Contas_a_Receber AS CAR
            JOIN Contratos AS CON ON CAR.ID_Contrato_Recorrente = CON.ID
            JOIN Clientes  AS C   ON CON.Cliente = C.Raz_o_social
            WHERE (
                (CAR.Status = 'A receber' AND CAR.Vencimento < date('now'))
                OR CAR.Data_pagamento > CAR.Vencimento
            )
        """
        extra, params = "", []
        if search_term:
            extra = " AND C.Raz_o_social LIKE ?"
            params.append(f"%{search_term}%")

        total = conn.execute(
            "SELECT COUNT(DISTINCT CON.ID) " + base_from + extra,
            tuple(params),
        ).fetchone()[0]

        data = conn.execute(
            """
            SELECT
                C.Raz_o_social  AS Cliente,
                CON.ID          AS Contrato_ID,
                SUM(CASE WHEN CAR.Data_pagamento > CAR.Vencimento THEN 1 ELSE 0 END)
                    AS Atrasos_Pagos,
                SUM(CASE WHEN CAR.Status = 'A receber'
                              AND CAR.Vencimento < date('now') THEN 1 ELSE 0 END)
                    AS Faturas_Nao_Pagas
            """
            + base_from + extra
            + """
            GROUP BY C.Raz_o_social, CON.ID
            HAVING Atrasos_Pagos > 0 OR Faturas_Nao_Pagas > 0
            ORDER BY C.Raz_o_social, CON.ID
            LIMIT ? OFFSET ?
            """,
            tuple(params + [limit, offset]),
        ).fetchall()

        return jsonify({"data": [dict(r) for r in data], "total_rows": total})

    except sqlite3.Error as e:
        return jsonify({"error": str(e)}), 500
    finally:
        if conn:
            conn.close()


@finance_bp.route("/faturamento_por_cidade")
def api_faturamento_por_cidade():
    conn = get_db()
    try:
        start_date = request.args.get("start_date")
        end_date   = request.args.get("end_date")
        city       = request.args.get("city", "")

        if not start_date or not end_date:
            return jsonify({"error": "As datas inicial e final sao obrigatorias."}), 400

        queries       = build_billing_queries(start_date, end_date, city)
        named_params  = {"start_date": start_date, "end_date": end_date}
        if city:
            named_params["city"] = city

        # ativos pode falhar sem Contratos_Negativacao
        try:
            ativos = conn.execute(queries["ativos"], named_params).fetchall()
        except sqlite3.Error as e:
            if "no such table" in str(e).lower():
                fallback = queries["ativos"].replace(
                    "AND C.Cliente NOT IN (\n"
                    "                  SELECT DISTINCT Cliente FROM Contratos_Negativacao\n"
                    "              )",
                    "",
                )
                ativos = conn.execute(fallback, named_params).fetchall()
            else:
                raise

        cities = conn.execute(
            "SELECT DISTINCT Cidade FROM Contratos "
            "WHERE Cidade IS NOT NULL AND TRIM(Cidade) != '' ORDER BY Cidade"
        ).fetchall()

        return jsonify({
            "faturamento_total":              [dict(r) for r in conn.execute(queries["total"],   named_params).fetchall()],
            "faturamento_credito":            [dict(r) for r in conn.execute(queries["credito"], named_params).fetchall()],
            "faturamento_ativos":             [dict(r) for r in ativos],
            "faturamento_por_dia_vencimento": [dict(r) for r in conn.execute(queries["due_day"], named_params).fetchall()],
            "cities":                         [r[0] for r in cities],
        })

    except sqlite3.Error as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
    finally:
        if conn:
            conn.close()


@finance_bp.route("/late_interest_analysis")
def api_late_interest_analysis():
    conn = get_db()
    try:
        start_date = request.args.get("start_date", "")
        end_date   = request.args.get("end_date", "")

        totals_sql, buckets_sql, params = build_late_interest_query(start_date, end_date)

        totals_row = conn.execute(totals_sql, tuple(params)).fetchone()
        totals = dict(totals_row) if totals_row else {
            "total_interest_amount":     0,
            "total_late_payments_count": 0,
        }
        totals["total_interest_amount"] = totals["total_interest_amount"] or 0

        data  = conn.execute(buckets_sql, tuple(params)).fetchall()
        years = [
            r[0] for r in conn.execute(
                "SELECT DISTINCT STRFTIME('%Y', Data_pagamento) AS Year "
                "FROM Contas_a_Receber "
                "WHERE Data_pagamento IS NOT NULL AND Data_pagamento > Vencimento "
                "ORDER BY Year DESC"
            ).fetchall()
            if r[0]
        ]

        return jsonify({
            "data":   [dict(r) for r in data],
            "totals": totals,
            "years":  years,
        })

    except sqlite3.Error as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
    finally:
        if conn:
            conn.close()

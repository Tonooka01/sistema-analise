"""
routes_analysis_sales.py
Blueprint de analise de vendas — usa queries/sales_queries.py.
"""
import sqlite3
import traceback
import pandas as pd
from flask import Blueprint, jsonify, request
from utils_api import get_db, add_date_range_filter
from queries.sales_queries import (
    build_seller_churn_queries,
    build_activations_query,
    build_seller_clients_query,
)

sales_bp = Blueprint("sales_bp", __name__)

_EX = "('Caçapava', 'Jacareí', 'São José dos Campos')"


# ---------------------------------------------------------------------------
# helper: listas de anos e cidades
# ---------------------------------------------------------------------------

def _get_years_cities(conn):
    years, cities = [], []
    try:
        years = [
            r[0] for r in conn.execute(
                "SELECT DISTINCT Year FROM ("
                "  SELECT STRFTIME('%Y', Data_cancelamento) AS Year FROM Contratos WHERE Data_cancelamento IS NOT NULL"
                "  UNION"
                "  SELECT STRFTIME('%Y', Data_negativa_o)   AS Year FROM Contratos_Negativacao WHERE Data_negativa_o IS NOT NULL"
                ") WHERE Year IS NOT NULL ORDER BY Year DESC"
            ).fetchall() if r[0]
        ]
    except Exception:
        years = [
            r[0] for r in conn.execute(
                "SELECT DISTINCT STRFTIME('%Y', Data_cancelamento) AS Year "
                "FROM Contratos WHERE Data_cancelamento IS NOT NULL ORDER BY Year DESC"
            ).fetchall() if r[0]
        ]

    try:
        cities = [
            r[0] for r in conn.execute(
                "SELECT DISTINCT Cidade FROM ("
                "  SELECT Cidade FROM Contratos WHERE Cidade IS NOT NULL AND TRIM(Cidade) != ''"
                "  UNION"
                "  SELECT Cidade FROM Contratos_Negativacao WHERE Cidade IS NOT NULL AND TRIM(Cidade) != ''"
                ") ORDER BY Cidade"
            ).fetchall() if r[0]
        ]
    except Exception:
        cities = [
            r[0] for r in conn.execute(
                "SELECT DISTINCT Cidade FROM Contratos "
                "WHERE Cidade IS NOT NULL AND TRIM(Cidade) != '' ORDER BY Cidade"
            ).fetchall() if r[0]
        ]

    return years, cities


# ---------------------------------------------------------------------------
# 1. Churn por vendedor
# ---------------------------------------------------------------------------

@sales_bp.route("/sellers")
def api_seller_analysis():
    conn = get_db()
    try:
        start_date = request.args.get("start_date", "")
        end_date   = request.args.get("end_date", "")

        sql_c, p_c, sql_nc, p_nc, sql_cn, p_cn = build_seller_churn_queries(
            start_date, end_date
        )

        df_c  = pd.read_sql_query(sql_c,  conn, params=tuple(p_c))
        df_nc = pd.read_sql_query(sql_nc, conn, params=tuple(p_nc))

        df_cn = pd.DataFrame()
        try:
            df_cn = pd.read_sql_query(sql_cn, conn, params=tuple(p_cn))
        except Exception:
            pass

        df_all = pd.concat([df_c, df_nc, df_cn], ignore_index=True)

        df_vend = pd.read_sql_query("SELECT ID, Vendedor FROM Vendedores", conn)
        df_merged = pd.merge(df_all, df_vend, left_on="Vendedor_ID", right_on="ID", how="left")

        df_grouped = (
            df_merged
            .groupby(["Vendedor_ID", "Vendedor"])
            .agg(
                Cancelados_Count=("Status", lambda x: (x == "Cancelado").sum()),
                Negativados_Count=("Status", lambda x: (x == "Negativado").sum()),
            )
            .reset_index()
        )
        df_grouped["Total"] = df_grouped["Cancelados_Count"] + df_grouped["Negativados_Count"]
        df_grouped = df_grouped.sort_values("Total", ascending=False)
        df_grouped.rename(columns={"Vendedor": "Vendedor_Nome"}, inplace=True)

        years, _ = _get_years_cities(conn)

        return jsonify({
            "data":              df_grouped.to_dict("records"),
            "total_rows":        len(df_grouped),
            "years":             years,
            "total_cancelados":  int(df_grouped["Cancelados_Count"].sum()),
            "total_negativados": int(df_grouped["Negativados_Count"].sum()),
            "grand_total":       int(df_grouped["Total"].sum()),
        })

    except sqlite3.Error as e:
        return jsonify({"error": str(e)}), 500
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
    finally:
        if conn:
            conn.close()


# ---------------------------------------------------------------------------
# 2. Ativacoes por vendedor
# ---------------------------------------------------------------------------

@sales_bp.route("/activations_by_seller")
def api_activations_by_seller():
    conn = get_db()
    try:
        city       = request.args.get("city", "")
        start_date = request.args.get("start_date", "")
        end_date   = request.args.get("end_date", "")

        sql_c, p_c, sql_cn, p_cn = build_activations_query(city, start_date, end_date)

        try:
            df_all = pd.read_sql_query(
                f"{sql_c} UNION {sql_cn}", conn, params=tuple(p_c + p_cn)
            )
            df_all.sort_values("is_negativado_table", ascending=True, inplace=True)
            df = df_all.drop_duplicates(subset=["ID"], keep="first")
        except Exception:
            df = pd.read_sql_query(sql_c, conn, params=tuple(p_c))

        years, cities = _get_years_cities(conn)

        if df.empty:
            return jsonify({"data": [], "totals": {}, "cities": cities, "years": years})

        df["Vendedor_ID"] = df["Vendedor_ID"].astype(str)
        df_vend = pd.read_sql_query("SELECT ID, Vendedor FROM Vendedores", conn)
        df_vend["ID"] = df_vend["ID"].astype(str)

        df["is_active"]    = df["Status_contrato"] == "Ativo"
        df["is_cancelado"] = df["Status_contrato"] == "Inativo"
        df["is_negativado"] = (
            (df["Status_contrato"] == "Negativado")
            & ~df["Cidade"].isin(["Caçapava", "Jacareí", "São José dos Campos"])
        )

        df_grouped = (
            df.groupby("Vendedor_ID")
            .agg(
                Total_Ativacoes    =("ID",            "count"),
                Permanecem_Ativos  =("is_active",     "sum"),
                Cancelados         =("is_cancelado",  "sum"),
                Negativados        =("is_negativado", "sum"),
            )
            .reset_index()
        )

        df_final = pd.merge(df_grouped, df_vend, left_on="Vendedor_ID", right_on="ID", how="left")
        df_final.rename(columns={"Vendedor": "Vendedor_Nome"}, inplace=True)
        df_final["Vendedor_Nome"] = df_final["Vendedor_Nome"].fillna("Nao Identificado")
        df_final["Total_Churn"]   = df_final["Cancelados"] + df_final["Negativados"]
        df_final = df_final.sort_values("Total_Ativacoes", ascending=False)

        totals = {
            "total_ativacoes":        int(df_final["Total_Ativacoes"].sum()),
            "total_permanecem_ativos": int(df_final["Permanecem_Ativos"].sum()),
            "total_cancelados":       int(df_final["Cancelados"].sum()),
            "total_negativados":      int(df_final["Negativados"].sum()),
            "total_churn":            int(df_final["Total_Churn"].sum()),
        }

        return jsonify({
            "data":   df_final.to_dict("records"),
            "totals": totals,
            "cities": cities,
            "years":  years,
        })

    except sqlite3.Error as e:
        return jsonify({"error": str(e)}), 500
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
    finally:
        if conn:
            conn.close()

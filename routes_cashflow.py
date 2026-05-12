"""
routes_cashflow.py
Blueprint de Fluxo de Caixa — entradas (Contas_a_Receber) vs saídas (Despesas).

Colunas Despesas: C_digo, Destinado, CPF_CNPJ, Descri_o, Plano_de_contas,
                  Forma_de_pagamento, Conta_banc_ria, Centro_de_custo,
                  Data_de_confirma_o (DD/MM/YYYY), Situa_o, Valor_total ('R$ 1.557,67')
"""

import sqlite3
import traceback
from flask import Blueprint, jsonify, request, current_app
from flask_login import login_required

cashflow_bp = Blueprint('cashflow_bp', __name__)


def get_db():
    return current_app.config['GET_DB_CONNECTION']()


# Converte DD/MM/YYYY → YYYY-MM-DD no SQLite
_DATE_ISO = (
    "SUBSTR(Data_de_confirma_o,7,4)||'-'||"
    "SUBSTR(Data_de_confirma_o,4,2)||'-'||"
    "SUBSTR(Data_de_confirma_o,1,2)"
)

# Converte 'R$ 1.557,67' → REAL no SQLite
_VALOR_REAL = (
    "CAST(REPLACE(REPLACE(REPLACE(REPLACE("
    "Valor_total,'R$',''),' ',''),'.',''),',','.') AS REAL)"
)


@cashflow_bp.route('/planos_contas')
@login_required
def api_planos_contas():
    conn = get_db()
    try:
        rows = conn.execute("""
            SELECT DISTINCT Plano_de_contas
            FROM Despesas
            WHERE Plano_de_contas IS NOT NULL AND Plano_de_contas != ''
            ORDER BY Plano_de_contas
        """).fetchall()
        return jsonify({"planos": [r[0] for r in rows]})
    except sqlite3.Error as e:
        return jsonify({"error": str(e)}), 500
    finally:
        if conn: conn.close()


@cashflow_bp.route('/fluxo_caixa')
@login_required
def api_cashflow():
    conn = get_db()
    try:
        start_date = request.args.get('start_date', '')
        end_date   = request.args.get('end_date', '')
        period     = request.args.get('period', 'month')
        planos_raw = request.args.get('planos', '')  # CSV de planos selecionados
        planos     = [p.strip() for p in planos_raw.split('||') if p.strip()] if planos_raw else []

        grp_entry = "STRFTIME('%Y-%m', Data_pagamento)"    if period == 'month' else "STRFTIME('%Y', Data_pagamento)"
        grp_exp   = f"STRFTIME('%Y-%m', {_DATE_ISO})"      if period == 'month' else f"STRFTIME('%Y', {_DATE_ISO})"

        # --- Entradas ---
        ew, ep = ["Data_pagamento IS NOT NULL", "Data_pagamento != ''"], []
        if start_date: ew.append("DATE(Data_pagamento) >= ?"); ep.append(start_date)
        if end_date:   ew.append("DATE(Data_pagamento) <= ?"); ep.append(end_date)

        entries = {
            r[0]: r[1]
            for r in conn.execute(
                f"SELECT {grp_entry} AS p, SUM(COALESCE(Valor_recebido,0)) "
                f"FROM Contas_a_Receber WHERE {' AND '.join(ew)} GROUP BY p ORDER BY p",
                ep
            ).fetchall()
            if r[0]
        }

        # --- Saídas ---
        xw, xp = [
            "Data_de_confirma_o IS NOT NULL",
            "LENGTH(Data_de_confirma_o)>=10"
        ], []
        if planos:
            ph = ','.join(['?'] * len(planos))
            xw.append(f"Plano_de_contas IN ({ph})")
            xp.extend(planos)
        if start_date: xw.append(f"DATE({_DATE_ISO}) >= ?"); xp.append(start_date)
        if end_date:   xw.append(f"DATE({_DATE_ISO}) <= ?"); xp.append(end_date)

        expenses = {
            r[0]: r[1]
            for r in conn.execute(
                f"SELECT {grp_exp} AS p, SUM({_VALOR_REAL}) "
                f"FROM Despesas WHERE {' AND '.join(xw)} GROUP BY p ORDER BY p",
                xp
            ).fetchall()
            if r[0]
        }

        # --- Merge ---
        all_periods = sorted(set(list(entries) + list(expenses)))
        data, total_in, total_out = [], 0.0, 0.0
        for p in all_periods:
            ent = entries.get(p) or 0.0
            sai = expenses.get(p) or 0.0
            total_in  += ent
            total_out += sai
            data.append({"periodo": p, "entrada": round(ent,2), "saida": round(sai,2), "saldo": round(ent-sai,2)})

        # --- Categorias (todos, sem LIMIT) ---
        cat_w = ["Plano_de_contas IS NOT NULL", "Plano_de_contas != ''", f"LENGTH(Data_de_confirma_o)>=10"]
        cat_p = []
        if planos:
            ph = ','.join(['?'] * len(planos))
            cat_w.append(f"Plano_de_contas IN ({ph})")
            cat_p.extend(planos)
        if start_date: cat_w.append(f"DATE({_DATE_ISO}) >= ?"); cat_p.append(start_date)
        if end_date:   cat_w.append(f"DATE({_DATE_ISO}) <= ?"); cat_p.append(end_date)
        categories = [
            {"categoria": r[0], "total": round(r[1] or 0, 2)}
            for r in conn.execute(
                f"SELECT Plano_de_contas, SUM({_VALOR_REAL}) AS t "
                f"FROM Despesas WHERE {' AND '.join(cat_w)} GROUP BY Plano_de_contas ORDER BY t DESC",
                cat_p
            ).fetchall()
        ]

        # --- Centro de custo (top 8) ---
        cen_w = ["Centro_de_custo IS NOT NULL", "Centro_de_custo != ''", f"LENGTH(Data_de_confirma_o)>=10"]
        cen_p = []
        if start_date: cen_w.append(f"DATE({_DATE_ISO}) >= ?"); cen_p.append(start_date)
        if end_date:   cen_w.append(f"DATE({_DATE_ISO}) <= ?"); cen_p.append(end_date)
        centros = [
            {"centro": r[0], "total": round(r[1] or 0, 2)}
            for r in conn.execute(
                f"SELECT Centro_de_custo, SUM({_VALOR_REAL}) AS t "
                f"FROM Despesas WHERE {' AND '.join(cen_w)} GROUP BY Centro_de_custo ORDER BY t DESC LIMIT 8",
                cen_p
            ).fetchall()
        ]

        return jsonify({
            "data":          data,
            "total_entrada": round(total_in, 2),
            "total_saida":   round(total_out, 2),
            "total_saldo":   round(total_in - total_out, 2),
            "categories":    categories,
            "centros":       centros
        })

    except sqlite3.Error as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
    finally:
        if conn: conn.close()

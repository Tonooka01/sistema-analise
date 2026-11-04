"""
routes_painel.py — Painel Executivo Unificado
GET /api/painel/resumo — snapshot consolidado: MRR, contratos, cancelamentos,
                          negativações, OS, atendimentos (tudo numa query passada)
"""
import json as _json
from flask import Blueprint, jsonify
from flask_login import current_user
from database import get_db_connection as get_db

painel_bp = Blueprint('painel_bp', __name__)

_CANCEL_IN = "('Cancelado','Inativo','Desistente')"


def _table_exists(conn, name):
    return conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (name,)
    ).fetchone() is not None


def _col_exists(conn, table, col):
    cols = [r[1] for r in conn.execute(f"PRAGMA table_info({table})").fetchall()]
    return col in cols


@painel_bp.route('/resumo')
def api_painel_resumo():
    if not current_user.is_authenticated:
        return jsonify({'error': 'Não autenticado'}), 401
    conn = get_db()
    try:
        # ── MRR + boletos em aberto ───────────────────────────────────────────
        mrr = dict(conn.execute("""
            SELECT
                COALESCE(SUM(CASE WHEN Status='Recebido'
                    AND strftime('%Y-%m', Data_pagamento) = strftime('%Y-%m','now')
                    THEN Valor_recebido ELSE 0 END), 0) AS mrr_mes,
                COALESCE(SUM(CASE WHEN Status='Recebido'
                    AND strftime('%Y-%m', Data_pagamento) = strftime('%Y-%m', date('now','-1 month'))
                    THEN Valor_recebido ELSE 0 END), 0) AS mrr_ant,
                COALESCE(SUM(CASE WHEN Status IN ('A receber','Aberto')
                    THEN Valor ELSE 0 END), 0) AS aberto_valor,
                COUNT(CASE WHEN Status IN ('A receber','Aberto') THEN 1 END) AS aberto_qty
            FROM Contas_a_Receber
        """).fetchone())

        # ── Contratos ─────────────────────────────────────────────────────────
        contratos = dict(conn.execute(f"""
            SELECT
                COALESCE(SUM(CASE WHEN Status_contrato='Ativo' THEN 1 ELSE 0 END), 0) AS ativos,
                COALESCE(SUM(CASE WHEN Status_contrato IN {_CANCEL_IN}
                    AND strftime('%Y-%m', Data_cancelamento) = strftime('%Y-%m','now') THEN 1 ELSE 0 END), 0) AS cancel_mes,
                COALESCE(SUM(CASE WHEN Status_contrato IN {_CANCEL_IN}
                    AND strftime('%Y-%m', Data_cancelamento) = strftime('%Y-%m', date('now','-1 month')) THEN 1 ELSE 0 END), 0) AS cancel_ant
            FROM Contratos
        """).fetchone())

        # ── Negativações ──────────────────────────────────────────────────────
        neg_mes, neg_ant = 0, 0
        if _table_exists(conn, 'Contratos_Negativacao'):
            # tenta coluna Data_negativa_o (IXC exporta com esse nome)
            col = 'Data_negativa_o' if _col_exists(conn, 'Contratos_Negativacao', 'Data_negativa_o') else 'Data_negativacao'
            try:
                r = dict(conn.execute(f"""
                    SELECT
                        COALESCE(SUM(CASE WHEN strftime('%Y-%m', {col}) = strftime('%Y-%m','now') THEN 1 ELSE 0 END), 0) AS neg_mes,
                        COALESCE(SUM(CASE WHEN strftime('%Y-%m', {col}) = strftime('%Y-%m', date('now','-1 month')) THEN 1 ELSE 0 END), 0) AS neg_ant
                    FROM Contratos_Negativacao
                """).fetchone())
                neg_mes, neg_ant = r['neg_mes'], r['neg_ant']
            except Exception:
                pass

        # ── Top cidades por cancelamento (últimos 3 meses) ───────────────────
        top_cidades = [dict(r) for r in conn.execute(f"""
            SELECT Cidade, COUNT(*) AS total
            FROM Contratos
            WHERE Status_contrato IN {_CANCEL_IN}
              AND Cidade IS NOT NULL AND Cidade != ''
              AND date(Data_cancelamento) >= date('now', '-3 months')
            GROUP BY Cidade ORDER BY total DESC LIMIT 6
        """).fetchall()]

        # ── Top bairros por cancelamento (últimos 3 meses) ───────────────────
        top_bairros = [dict(r) for r in conn.execute(f"""
            SELECT Bairro, COUNT(*) AS total
            FROM Contratos
            WHERE Status_contrato IN {_CANCEL_IN}
              AND Bairro IS NOT NULL AND Bairro != ''
              AND date(Data_cancelamento) >= date('now', '-3 months')
            GROUP BY Bairro ORDER BY total DESC LIMIT 6
        """).fetchall()]

        # ── Evolução MRR 12 meses ─────────────────────────────────────────────
        mrr_ev = [dict(r) for r in conn.execute("""
            SELECT strftime('%Y-%m', Data_pagamento) AS mes,
                   COALESCE(SUM(Valor_recebido), 0) AS receita
            FROM Contas_a_Receber
            WHERE Status = 'Recebido'
              AND date(Data_pagamento) >= date('now', '-11 months', 'start of month')
            GROUP BY mes ORDER BY mes
        """).fetchall()]

        # ── Evolução cancelamentos 12 meses ───────────────────────────────────
        cancel_ev = [dict(r) for r in conn.execute(f"""
            SELECT strftime('%Y-%m', Data_cancelamento) AS mes, COUNT(*) AS total
            FROM Contratos
            WHERE Status_contrato IN {_CANCEL_IN}
              AND date(Data_cancelamento) >= date('now', '-11 months', 'start of month')
            GROUP BY mes ORDER BY mes
        """).fetchall()]

        # ── OS ────────────────────────────────────────────────────────────────
        os_data = {'total': 0, 'abertas': 0}
        if _table_exists(conn, 'OS'):
            try:
                os_cols = [r[1] for r in conn.execute("PRAGMA table_info(OS)").fetchall()]
                sc = 'Status_OS' if 'Status_OS' in os_cols else 'Status'
                os_data = dict(conn.execute(f"""
                    SELECT COUNT(*) AS total,
                           COALESCE(SUM(CASE WHEN {sc} NOT IN ('Finalizado','Cancelado','F','C','Cancelada') THEN 1 ELSE 0 END), 0) AS abertas
                    FROM OS
                """).fetchone())
            except Exception:
                pass

        # ── Atendimentos ──────────────────────────────────────────────────────
        atend = {'mes': 0, 'ant': 0}
        if _table_exists(conn, 'Atendimentos'):
            try:
                atend_cols = [r[1] for r in conn.execute("PRAGMA table_info(Atendimentos)").fetchall()]
                dc = 'Data_abertura' if 'Data_abertura' in atend_cols else 'Data'
                r = dict(conn.execute(f"""
                    SELECT
                        COALESCE(SUM(CASE WHEN strftime('%Y-%m', {dc}) = strftime('%Y-%m','now') THEN 1 ELSE 0 END), 0) AS mes,
                        COALESCE(SUM(CASE WHEN strftime('%Y-%m', {dc}) = strftime('%Y-%m', date('now','-1 month')) THEN 1 ELSE 0 END), 0) AS ant
                    FROM Atendimentos
                """).fetchone())
                atend = {'mes': r['mes'], 'ant': r['ant']}
            except Exception:
                pass

        return _json.dumps({
            'mrr':           mrr,
            'contratos':     contratos,
            'negativacoes':  {'mes': neg_mes, 'ant': neg_ant},
            'top_cidades':   top_cidades,
            'top_bairros':   top_bairros,
            'mrr_ev':        mrr_ev,
            'cancel_ev':     cancel_ev,
            'os':            os_data,
            'atendimentos':  atend,
        }, ensure_ascii=False), 200, {'Content-Type': 'application/json'}
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()

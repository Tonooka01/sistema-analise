"""
routes_roi.py — Dashboard ROI / Valor do Sistema
GET  /api/roi/config       — retorna parâmetros configuráveis
POST /api/roi/config       — salva parâmetros (admin only)
GET  /api/roi/stats        — retorna estatísticas agregadas de valor
GET  /api/roi/vendas/stats — retorna métricas do app de vendas (app_vendas.db)
"""
import os
import sqlite3
from flask import Blueprint, jsonify, request
from flask_login import current_user
from database import get_db_connection as get_db
import json as _json

# Caminho para o banco de dados do app de vendas (mesmo servidor)
_VENDAS_DB = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    'app_vendas_netvale', 'app_vendas.db'
)

roi_bp = Blueprint('roi_bp', __name__)

DEFAULT_CONFIG = {
    "custo_equipamento":      237.0,
    "multa_equipamento":      500.0,
    "ticket_medio_cobranca":   89.0,
    "mensalidade_media":       99.0,
    "taxa_confirmacao_pagou":   0.85,
    "custo_operacional_mes":    0.0,
}


def _get_config(conn):
    row = conn.execute("SELECT value FROM Settings WHERE key = 'roi_config'").fetchone()
    cfg = DEFAULT_CONFIG.copy()
    if row and row['value']:
        try:
            cfg.update(_json.loads(row['value']))
        except Exception:
            pass
    return cfg


def _ensure_acomp(conn):
    conn.execute("""
        CREATE TABLE IF NOT EXISTS Acompanhamento_Clientes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            contrato_id TEXT, usuario TEXT, data_registro TEXT,
            tipo_acao TEXT, resultado TEXT, observacao TEXT,
            data_retorno TEXT, snooze_ate TEXT, ixc_os_id TEXT
        )
    """)


@roi_bp.route('/config', methods=['GET'])
def api_roi_config_get():
    if not current_user.is_authenticated:
        return jsonify({'error': 'Não autenticado'}), 401
    conn = get_db()
    try:
        return jsonify(_get_config(conn))
    finally:
        conn.close()


@roi_bp.route('/config', methods=['POST'])
def api_roi_config_post():
    if not current_user.is_authenticated:
        return jsonify({'error': 'Não autenticado'}), 401
    if current_user.username != 'admin':
        return jsonify({'error': 'Apenas admin pode alterar configurações'}), 403
    conn = get_db()
    try:
        data = request.get_json(force=True) or {}
        cfg = DEFAULT_CONFIG.copy()
        for k in DEFAULT_CONFIG:
            if k in data:
                try:
                    cfg[k] = float(data[k])
                except (ValueError, TypeError):
                    pass
        existing = conn.execute("SELECT 1 FROM Settings WHERE key = 'roi_config'").fetchone()
        if existing:
            conn.execute("UPDATE Settings SET value = ? WHERE key = 'roi_config'", (_json.dumps(cfg),))
        else:
            conn.execute("INSERT INTO Settings (key, value) VALUES ('roi_config', ?)", (_json.dumps(cfg),))
        conn.commit()
        return jsonify({'ok': True, 'config': cfg})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()


@roi_bp.route('/stats')
def api_roi_stats():
    if not current_user.is_authenticated:
        return jsonify({'error': 'Não autenticado'}), 401
    conn = get_db()
    try:
        _ensure_acomp(conn)
        cfg    = _get_config(conn)
        ticket = cfg['ticket_medio_cobranca']
        taxa   = cfg['taxa_confirmacao_pagou']
        mensal = cfg['mensalidade_media']

        def _calc(pagou, msg=0, sucesso=0):
            cobranca = (pagou or 0) * ticket * taxa
            msg_val  = (msg or 0) * ticket * taxa * 0.30
            ret_val  = (sucesso or 0) * mensal * 0.50
            return {
                'valor_cobranca':  round(cobranca, 2),
                'valor_mensagem':  round(msg_val, 2),
                'valor_retencao':  round(ret_val, 2),
                'valor_total':     round(cobranca + msg_val + ret_val, 2),
            }

        # Mês atual
        ma = dict(conn.execute("""
            SELECT
                COALESCE(SUM(CASE WHEN resultado='pagou'            THEN 1 ELSE 0 END),0) AS pagou,
                COALESCE(SUM(CASE WHEN resultado='mensagem_enviada' THEN 1 ELSE 0 END),0) AS msg_enviada,
                COALESCE(SUM(CASE WHEN resultado='sucesso'          THEN 1 ELSE 0 END),0) AS sucesso,
                COALESCE(SUM(CASE WHEN resultado='prometeu_pagar'   THEN 1 ELSE 0 END),0) AS prometeu,
                COUNT(*) AS total_atend,
                COUNT(DISTINCT contrato_id) AS clientes_unicos
            FROM Acompanhamento_Clientes
            WHERE strftime('%Y-%m', data_registro) = strftime('%Y-%m','now')
        """).fetchone())

        # Mês passado
        mp = dict(conn.execute("""
            SELECT
                COALESCE(SUM(CASE WHEN resultado='pagou'            THEN 1 ELSE 0 END),0) AS pagou,
                COALESCE(SUM(CASE WHEN resultado='mensagem_enviada' THEN 1 ELSE 0 END),0) AS msg_enviada,
                COALESCE(SUM(CASE WHEN resultado='sucesso'          THEN 1 ELSE 0 END),0) AS sucesso,
                COUNT(*) AS total_atend
            FROM Acompanhamento_Clientes
            WHERE strftime('%Y-%m', data_registro) = strftime('%Y-%m', date('now','-1 month'))
        """).fetchone())

        # Acumulado total
        tot = dict(conn.execute("""
            SELECT
                COALESCE(SUM(CASE WHEN resultado='pagou'            THEN 1 ELSE 0 END),0) AS pagou,
                COALESCE(SUM(CASE WHEN resultado='mensagem_enviada' THEN 1 ELSE 0 END),0) AS msg_enviada,
                COALESCE(SUM(CASE WHEN resultado='sucesso'          THEN 1 ELSE 0 END),0) AS sucesso,
                COUNT(*) AS total_atend,
                COUNT(DISTINCT contrato_id) AS clientes_unicos
            FROM Acompanhamento_Clientes
        """).fetchone())

        # Últimos 12 meses breakdown
        monthly = []
        rows = conn.execute("""
            SELECT
                strftime('%Y-%m', data_registro) AS mes,
                COALESCE(SUM(CASE WHEN resultado='pagou'            THEN 1 ELSE 0 END),0) AS pagou,
                COALESCE(SUM(CASE WHEN resultado='mensagem_enviada' THEN 1 ELSE 0 END),0) AS msg_enviada,
                COALESCE(SUM(CASE WHEN resultado='sucesso'          THEN 1 ELSE 0 END),0) AS sucesso,
                COALESCE(SUM(CASE WHEN resultado='prometeu_pagar'   THEN 1 ELSE 0 END),0) AS prometeu,
                COUNT(*) AS total_atend,
                COUNT(DISTINCT contrato_id) AS clientes_unicos
            FROM Acompanhamento_Clientes
            WHERE data_registro >= date('now','-12 months')
            GROUP BY mes
            ORDER BY mes
        """).fetchall()
        for r in rows:
            d = dict(r)
            d.update(_calc(d['pagou'], d['msg_enviada'], d['sucesso']))
            monthly.append(d)

        # Por usuário (mês atual)
        por_usuario = []
        for r in conn.execute("""
            SELECT usuario,
                COALESCE(SUM(CASE WHEN resultado='pagou' THEN 1 ELSE 0 END),0) AS pagou,
                COALESCE(SUM(CASE WHEN resultado='mensagem_enviada' THEN 1 ELSE 0 END),0) AS msg_enviada,
                COALESCE(SUM(CASE WHEN resultado='sucesso' THEN 1 ELSE 0 END),0) AS sucesso,
                COUNT(*) AS total
            FROM Acompanhamento_Clientes
            WHERE strftime('%Y-%m', data_registro) = strftime('%Y-%m','now')
            GROUP BY usuario
            ORDER BY total DESC
        """).fetchall():
            d = dict(r)
            d.update(_calc(d['pagou'], d['msg_enviada'], d['sucesso']))
            por_usuario.append(d)

        return _json.dumps({
            'config':      cfg,
            'mes_atual':   {**ma, **_calc(ma['pagou'], ma['msg_enviada'], ma['sucesso'])},
            'mes_passado': {**mp, **_calc(mp['pagou'], mp['msg_enviada'], mp['sucesso'])},
            'totais':      {**tot, **_calc(tot['pagou'], tot['msg_enviada'], tot['sucesso'])},
            'monthly':     monthly,
            'por_usuario': por_usuario,
        }, ensure_ascii=False), 200, {'Content-Type': 'application/json'}
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()


@roi_bp.route('/vendas/stats')
def api_roi_vendas_stats():
    if not current_user.is_authenticated:
        return jsonify({'error': 'Não autenticado'}), 401
    if not os.path.exists(_VENDAS_DB):
        return jsonify({'error': 'Banco de dados de vendas não encontrado', 'path': _VENDAS_DB}), 404
    try:
        vdb = sqlite3.connect(_VENDAS_DB)
        vdb.row_factory = sqlite3.Row

        # ── Mês atual ────────────────────────────────────────────────────────
        ma = dict(vdb.execute("""
            SELECT
                COUNT(*) AS total_vendas,
                COALESCE(SUM(CASE WHEN status='sucesso' AND contrato_removido_ixc=0 THEN 1 ELSE 0 END),0) AS vendas_ok,
                COALESCE(SUM(CASE WHEN status='erro'    THEN 1 ELSE 0 END),0)  AS vendas_erro,
                COALESCE(SUM(CASE WHEN status='sucesso' AND contrato_removido_ixc=0 THEN p.valor ELSE 0 END),0) AS receita_mrr
            FROM vendas_log vl
            LEFT JOIN planos_app p ON p.id = vl.plano_id_app
            WHERE strftime('%Y-%m', vl.criado_em) = strftime('%Y-%m','now','localtime')
        """).fetchone())

        # ── Mês passado ───────────────────────────────────────────────────────
        mp = dict(vdb.execute("""
            SELECT
                COALESCE(SUM(CASE WHEN status='sucesso' AND contrato_removido_ixc=0 THEN 1 ELSE 0 END),0) AS vendas_ok,
                COALESCE(SUM(CASE WHEN status='sucesso' AND contrato_removido_ixc=0 THEN p.valor ELSE 0 END),0) AS receita_mrr
            FROM vendas_log vl
            LEFT JOIN planos_app p ON p.id = vl.plano_id_app
            WHERE strftime('%Y-%m', vl.criado_em) = strftime('%Y-%m', date('now','localtime','-1 month'))
        """).fetchone())

        # ── Acumulado (base ativa) ────────────────────────────────────────────
        tot = dict(vdb.execute("""
            SELECT
                COALESCE(SUM(CASE WHEN status='sucesso' AND contrato_removido_ixc=0 THEN 1 ELSE 0 END),0) AS contratos_ativos,
                COALESCE(SUM(CASE WHEN status='sucesso' AND contrato_removido_ixc=0 THEN p.valor ELSE 0 END),0) AS mrr_total
            FROM vendas_log vl
            LEFT JOIN planos_app p ON p.id = vl.plano_id_app
        """).fetchone())

        # ── Taxa de conversão — mês atual ─────────────────────────────────────
        taxa_conv = 0.0
        if ma['total_vendas'] > 0:
            taxa_conv = round(ma['vendas_ok'] / ma['total_vendas'] * 100, 1)

        # ── Ranking por vendedor — mês atual ─────────────────────────────────
        por_vendedor = [dict(r) for r in vdb.execute("""
            SELECT v.nome AS vendedor,
                   COUNT(*) AS total_tentativas,
                   SUM(CASE WHEN vl.status='sucesso' AND vl.contrato_removido_ixc=0 THEN 1 ELSE 0 END) AS vendas_ok,
                   COALESCE(SUM(CASE WHEN vl.status='sucesso' AND vl.contrato_removido_ixc=0 THEN p.valor ELSE 0 END),0) AS receita
            FROM vendas_log vl
            JOIN vendedores_app v ON v.id = vl.id_vendedor_app
            LEFT JOIN planos_app p ON p.id = vl.plano_id_app
            WHERE strftime('%Y-%m', vl.criado_em) = strftime('%Y-%m','now','localtime')
            GROUP BY vl.id_vendedor_app, v.nome
            ORDER BY vendas_ok DESC
        """).fetchall()]

        # ── Evolução mensal (12 meses) ────────────────────────────────────────
        monthly = [dict(r) for r in vdb.execute("""
            SELECT strftime('%Y-%m', vl.criado_em) AS mes,
                   COUNT(*) AS total_tentativas,
                   SUM(CASE WHEN vl.status='sucesso' AND vl.contrato_removido_ixc=0 THEN 1 ELSE 0 END) AS vendas_ok,
                   COALESCE(SUM(CASE WHEN vl.status='sucesso' AND vl.contrato_removido_ixc=0 THEN p.valor ELSE 0 END),0) AS receita_mrr
            FROM vendas_log vl
            LEFT JOIN planos_app p ON p.id = vl.plano_id_app
            WHERE date(vl.criado_em) >= date('now','localtime','-11 months','start of month')
            GROUP BY mes
            ORDER BY mes
        """).fetchall()]

        vdb.close()
        return _json.dumps({
            'mes_atual':    {**ma, 'taxa_conversao': taxa_conv},
            'mes_passado':  mp,
            'totais':       tot,
            'por_vendedor': por_vendedor,
            'monthly':      monthly,
        }, ensure_ascii=False), 200, {'Content-Type': 'application/json'}
    except Exception as e:
        return jsonify({'error': str(e)}), 500

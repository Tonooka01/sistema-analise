"""
routes_painel.py — Painel Executivo Unificado
GET /api/painel/resumo — snapshot consolidado: MRR, contratos, cancelamentos,
                          negativações, OS, atendimentos (tudo numa query passada)
"""
import json as _json
import os as _os
import time as _time
import urllib.request as _urlreq
import urllib.parse as _urlparse
from datetime import date as _date, datetime as _datetime, timedelta as _td

from flask import Blueprint, jsonify
from flask_login import current_user
from database import get_db_connection as get_db

# ── ChatMix API ───────────────────────────────────────────────────────────────
_CM_CACHE: dict = {}   # url -> (ts, data)

def _cm_creds():
    """Lê URL e token do banco Settings (atualiza em tempo real sem restart)."""
    try:
        from database import get_db_connection as _gdb
        _c = _gdb()
        rows = {r[0]: r[1] for r in _c.execute(
            "SELECT key, value FROM Settings WHERE key IN ('chatmix_url','chatmix_api_token')"
        ).fetchall()}
        _c.close()
        url   = (rows.get('chatmix_url') or _os.environ.get('CHATMIX_URL') or '').rstrip('/')
        token = rows.get('chatmix_api_token') or _os.environ.get('CHATMIX_TOKEN') or ''
        if url and not url.endswith('/api-v2/public-api'):
            url = url.rstrip('/') + '/api-v2/public-api'
        return url, token
    except Exception:
        return '', ''

def _cm_req(path, params: dict | None = None, ttl: int = 300):
    """GET na API ChatMix com cache simples por TTL (segundos)."""
    base, token = _cm_creds()
    if not base or not token:
        return None
    qs  = ('?' + _urlparse.urlencode(params)) if params else ''
    url = f"{base}{path}{qs}"
    cached = _CM_CACHE.get(url)
    if cached and _time.time() - cached[0] < ttl:
        return cached[1]
    try:
        req = _urlreq.Request(url, headers={'X-Auth': token, 'Accept': 'application/json'})
        with _urlreq.urlopen(req, timeout=8) as r:
            data = _json.loads(r.read())
        _CM_CACHE[url] = (_time.time(), data)
        return data
    except Exception:
        return None


def _chatmix_data() -> dict | None:
    """Monta o snapshot ChatMix: contagens ao vivo + comparativo dia/semana."""
    base, token = _cm_creds()
    if not base or not token:
        return None

    hoje       = _date.today()
    sem_ant    = hoje - _td(days=7)
    DIAS_PT    = ['segunda','terça','quarta','quinta','sexta','sábado','domingo']
    dia_nome   = DIAS_PT[hoje.weekday()]

    fmt = '%Y-%m-%d %H:%M:%S'

    # Contagens ao vivo (25 req/min — sem problema)
    count_data = _cm_req('/attendances/count', ttl=60) or {}
    ats = count_data.get('attendances') or {}

    # Encerrados hoje com dados completos para breakdowns (cache 5 min)
    hoje_start = _datetime.combine(hoje, _datetime.min.time()).strftime(fmt)
    hoje_end   = _datetime.now().strftime(fmt)
    r_hoje = _cm_req('/attendances/closed',
                     {'date_start': hoje_start, 'date_end': hoje_end, 'per_page': 50},
                     ttl=300)
    hoje_enc = int((r_hoje or {}).get('meta', {}).get('total') or 0) if r_hoje else None

    # Agrega breakdowns a partir dos itens retornados
    por_canal     = {}
    por_setor     = {}
    por_atendente = {}
    for item in (r_hoje or {}).get('data') or []:
        # canal
        ch = item.get('channel') or {}
        ch_nome = ch.get('name') or ch.get('title') or ch.get('nome') or 'Desconhecido'
        por_canal[ch_nome] = por_canal.get(ch_nome, 0) + 1
        # setor / departamento
        dep = item.get('department') or {}
        dep_nome = dep.get('name') or dep.get('title') or dep.get('nome') or 'Sem setor'
        por_setor[dep_nome] = por_setor.get(dep_nome, 0) + 1
        # atendente / usuário
        usr = item.get('user') or {}
        usr_nome = usr.get('name') or usr.get('full_name') or usr.get('nome') or usr.get('username') or 'Sem atendente'
        por_atendente[usr_nome] = por_atendente.get(usr_nome, 0) + 1

    # Encerrados mesma semana passada — só total (cache 1h)
    ant_start = _datetime.combine(sem_ant, _datetime.min.time()).strftime(fmt)
    ant_end   = _datetime.combine(sem_ant, _datetime.max.time()).strftime(fmt)
    r_ant = _cm_req('/attendances/closed',
                    {'date_start': ant_start, 'date_end': ant_end, 'per_page': 1},
                    ttl=3600)
    ant_enc = int((r_ant or {}).get('meta', {}).get('total') or 0) if r_ant else None

    return {
        'dia_nome':       dia_nome,
        'hoje_enc':       hoje_enc,
        'ant_enc':        ant_enc,
        'em_atendimento': int(ats.get('progress') or 0),
        'fila_espera':    int(ats.get('waiting')  or 0),
        'em_automacao':   int(ats.get('automation') or 0),
        'por_canal':      dict(sorted(por_canal.items(),     key=lambda x: -x[1])),
        'por_setor':      dict(sorted(por_setor.items(),     key=lambda x: -x[1])),
        'por_atendente':  dict(sorted(por_atendente.items(), key=lambda x: -x[1])),
    }

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
        # ── MRR + boletos em aberto (Filial 2, mês atual e anterior) ─────────
        mrr = dict(conn.execute("""
            SELECT
                COALESCE(SUM(CASE WHEN Status='Recebido'
                    AND strftime('%Y-%m', Data_pagamento) = strftime('%Y-%m','now')
                    THEN Valor_recebido ELSE 0 END), 0) AS mrr_mes,
                COALESCE(SUM(CASE WHEN Status='Recebido'
                    AND strftime('%Y-%m', Data_pagamento) = strftime('%Y-%m', date('now','-1 month'))
                    THEN Valor_recebido ELSE 0 END), 0) AS mrr_ant,
                COALESCE(SUM(CASE WHEN Status IN ('A receber','Aberto')
                    AND strftime('%Y-%m', Vencimento) = strftime('%Y-%m','now')
                    THEN Valor ELSE 0 END), 0) AS aberto_mes_valor,
                COUNT(CASE WHEN Status IN ('A receber','Aberto')
                    AND strftime('%Y-%m', Vencimento) = strftime('%Y-%m','now')
                    THEN 1 END) AS aberto_mes_qty,
                COALESCE(SUM(CASE WHEN Status IN ('A receber','Aberto')
                    AND strftime('%Y-%m', Vencimento) = strftime('%Y-%m', date('now','-1 month'))
                    THEN Valor ELSE 0 END), 0) AS aberto_ant_valor,
                COUNT(CASE WHEN Status IN ('A receber','Aberto')
                    AND strftime('%Y-%m', Vencimento) = strftime('%Y-%m', date('now','-1 month'))
                    THEN 1 END) AS aberto_ant_qty
            FROM Contas_a_Receber
            WHERE Filial = 2
        """).fetchone())

        # ── Contratos (Filial 2) ──────────────────────────────────────────────
        contratos = dict(conn.execute(f"""
            SELECT
                COALESCE(SUM(CASE WHEN Status_contrato='Ativo' THEN 1 ELSE 0 END), 0) AS ativos,
                COALESCE(SUM(CASE WHEN Status_contrato IN {_CANCEL_IN}
                    AND strftime('%Y-%m', Data_cancelamento) = strftime('%Y-%m','now') THEN 1 ELSE 0 END), 0) AS cancel_mes,
                COALESCE(SUM(CASE WHEN Status_contrato IN {_CANCEL_IN}
                    AND strftime('%Y-%m', Data_cancelamento) = strftime('%Y-%m', date('now','-1 month')) THEN 1 ELSE 0 END), 0) AS cancel_ant
            FROM Contratos
            WHERE Filial = 2
        """).fetchone())

        # ── Negativações Filial 2 (ficam em Contratos com Data_negativa_o) ───
        neg_mes, neg_ant = 0, 0
        try:
            neg_col = 'Data_negativa_o' if _col_exists(conn, 'Contratos', 'Data_negativa_o') else 'ltima_negativa_o'
            r = dict(conn.execute(f"""
                SELECT
                    COALESCE(SUM(CASE WHEN strftime('%Y-%m', {neg_col}) = strftime('%Y-%m','now') THEN 1 ELSE 0 END), 0) AS neg_mes,
                    COALESCE(SUM(CASE WHEN strftime('%Y-%m', {neg_col}) = strftime('%Y-%m', date('now','-1 month')) THEN 1 ELSE 0 END), 0) AS neg_ant
                FROM Contratos
                WHERE Filial = 2 AND Status_contrato = 'Negativado'
            """).fetchone())
            neg_mes, neg_ant = r['neg_mes'], r['neg_ant']
        except Exception:
            pass

        # ── Top cidades por cancelamento (últimos 3 meses, Filial 2) ─────────
        top_cidades = [dict(r) for r in conn.execute(f"""
            SELECT Cidade, COUNT(*) AS total
            FROM Contratos
            WHERE Status_contrato IN {_CANCEL_IN}
              AND Filial = 2
              AND Cidade IS NOT NULL AND Cidade != ''
              AND date(Data_cancelamento) >= date('now', '-3 months')
            GROUP BY Cidade ORDER BY total DESC LIMIT 6
        """).fetchall()]

        # ── Top bairros por cancelamento (últimos 3 meses, Filial 2) ─────────
        top_bairros = [dict(r) for r in conn.execute(f"""
            SELECT Bairro, COUNT(*) AS total
            FROM Contratos
            WHERE Status_contrato IN {_CANCEL_IN}
              AND Filial = 2
              AND Bairro IS NOT NULL AND Bairro != ''
              AND date(Data_cancelamento) >= date('now', '-3 months')
            GROUP BY Bairro ORDER BY total DESC LIMIT 6
        """).fetchall()]

        # ── Evolução MRR 12 meses (Filial 2) ─────────────────────────────────
        mrr_ev = [dict(r) for r in conn.execute("""
            SELECT strftime('%Y-%m', Data_pagamento) AS mes,
                   COALESCE(SUM(Valor_recebido), 0) AS receita
            FROM Contas_a_Receber
            WHERE Status = 'Recebido'
              AND Filial = 2
              AND date(Data_pagamento) >= date('now', '-11 months', 'start of month')
            GROUP BY mes ORDER BY mes
        """).fetchall()]

        # ── Contas a Receber por Pagamento (Recebido→Data_pagamento; outros→Vencimento)
        ctr_pag_ev = [dict(r) for r in conn.execute("""
            SELECT strftime('%Y-%m', Data_pagamento) AS mes,
                   'Recebido' AS status_norm,
                   COALESCE(SUM(Valor_recebido), 0) AS total
            FROM Contas_a_Receber
            WHERE Filial = 2 AND Status = 'Recebido'
              AND Data_pagamento IS NOT NULL AND Data_pagamento != ''
              AND date(Data_pagamento) >= date('now', '-5 months', 'start of month')
              AND date(Data_pagamento) <= date('now', '+1 month', 'start of month', '+1 month', '-1 day')
            GROUP BY mes
            UNION ALL
            SELECT strftime('%Y-%m', Vencimento) AS mes,
                   CASE WHEN Status IN ('A receber','Aberto') THEN 'A receber' ELSE 'Cancelado' END AS status_norm,
                   COALESCE(SUM(Valor), 0) AS total
            FROM Contas_a_Receber
            WHERE Filial = 2 AND Status IN ('A receber','Aberto','Cancelado','Cancelada')
              AND date(Vencimento) >= date('now', '-5 months', 'start of month')
              AND date(Vencimento) <= date('now', '+1 month', 'start of month', '+1 month', '-1 day')
            GROUP BY mes, status_norm
            ORDER BY mes, status_norm
        """).fetchall()]

        # ── Contas a Receber por Data Crédito (Vencimento para todos os status)
        ctr_cred_ev = [dict(r) for r in conn.execute("""
            SELECT strftime('%Y-%m', Vencimento) AS mes,
                   CASE
                       WHEN Status = 'Recebido'              THEN 'Recebido'
                       WHEN Status IN ('A receber','Aberto') THEN 'A receber'
                       ELSE 'Cancelado'
                   END AS status_norm,
                   COALESCE(SUM(CASE WHEN Status='Recebido' THEN Valor_recebido ELSE Valor END), 0) AS total
            FROM Contas_a_Receber
            WHERE Filial = 2
              AND Status IN ('Recebido','A receber','Aberto','Cancelado','Cancelada')
              AND date(Vencimento) >= date('now', '-5 months', 'start of month')
              AND date(Vencimento) <= date('now', '+1 month', 'start of month', '+1 month', '-1 day')
            GROUP BY mes, status_norm
            ORDER BY mes, status_norm
        """).fetchall()]

        # ── Evolução cancelamentos 12 meses (Filial 2) ───────────────────────
        cancel_ev = [dict(r) for r in conn.execute(f"""
            SELECT strftime('%Y-%m', Data_cancelamento) AS mes, COUNT(*) AS total
            FROM Contratos
            WHERE Status_contrato IN {_CANCEL_IN}
              AND Filial = 2
              AND date(Data_cancelamento) >= date('now', '-11 months', 'start of month')
            GROUP BY mes ORDER BY mes
        """).fetchall()]

        # ── OS (Filial 2, apenas não-finalizadas) ────────────────────────────
        os_data = {'total': 0, 'abertas': 0}
        os_assuntos = []
        if _table_exists(conn, 'OS'):
            try:
                os_cols = [r[1] for r in conn.execute("PRAGMA table_info(OS)").fetchall()]
                sc = 'Status_OS' if 'Status_OS' in os_cols else 'Status'
                fc = 'Filial' if 'Filial' in os_cols else None
                fil = "AND Filial = 2" if fc else ""
                os_data = dict(conn.execute(f"""
                    SELECT COUNT(*) AS total, COUNT(*) AS abertas
                    FROM OS
                    WHERE {sc} NOT IN ('Finalizada','Finalizado','Cancelada','Cancelado','F','C') {fil}
                """).fetchone())
                os_assuntos = [dict(r) for r in conn.execute(f"""
                    SELECT COALESCE(Assunto,'Sem assunto') AS assunto,
                           COUNT(*) AS total
                    FROM OS
                    WHERE {sc} NOT IN ('Finalizada','Finalizado','Cancelada','Cancelado','F','C') {fil}
                    GROUP BY assunto
                    ORDER BY total DESC
                    LIMIT 10
                """).fetchall()]
            except Exception:
                pass

        # ── Atendimentos (Filial 2) ───────────────────────────────────────────
        atend = {'mes': 0, 'ant': 0}
        if _table_exists(conn, 'Atendimentos'):
            try:
                atend_cols = [r[1] for r in conn.execute("PRAGMA table_info(Atendimentos)").fetchall()]
                dc = 'Data_abertura' if 'Data_abertura' in atend_cols else 'Data'
                fa = 'Filial' if 'Filial' in atend_cols else None
                fil_a = "AND Filial = 2" if fa else ""
                r = dict(conn.execute(f"""
                    SELECT
                        COALESCE(SUM(CASE WHEN strftime('%Y-%m', {dc}) = strftime('%Y-%m','now') THEN 1 ELSE 0 END), 0) AS mes,
                        COALESCE(SUM(CASE WHEN strftime('%Y-%m', {dc}) = strftime('%Y-%m', date('now','-1 month')) THEN 1 ELSE 0 END), 0) AS ant
                    FROM Atendimentos
                    WHERE 1=1 {fil_a}
                """).fetchone())
                atend = {'mes': r['mes'], 'ant': r['ant']}
            except Exception:
                pass

        # ── ChatMix — API pública ─────────────────────────────────────────────
        chatmix = _chatmix_data()

        return _json.dumps({
            'mrr':           mrr,
            'contratos':     contratos,
            'negativacoes':  {'mes': neg_mes, 'ant': neg_ant},
            'top_cidades':   top_cidades,
            'top_bairros':   top_bairros,
            'mrr_ev':        mrr_ev,
            'ctr_pag_ev':    ctr_pag_ev,
            'ctr_cred_ev':   ctr_cred_ev,
            'cancel_ev':     cancel_ev,
            'os':            os_data,
            'os_assuntos':   os_assuntos,
            'atendimentos':  atend,
            'chatmix':       chatmix,
        }, ensure_ascii=False), 200, {'Content-Type': 'application/json'}
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()

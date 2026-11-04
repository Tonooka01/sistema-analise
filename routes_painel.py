"""
routes_painel.py — Painel Executivo Unificado
GET /api/painel/resumo — snapshot consolidado: MRR, contratos, cancelamentos,
                          negativações, OS, atendimentos (tudo numa query passada)
"""
import json as _json
import sqlite3 as _sqlite3
from pathlib import Path as _Path
from flask import Blueprint, jsonify
from flask_login import current_user
from database import get_db_connection as get_db

_HISTORICO_DB = _Path(r"C:\Users\User\Desktop\Arquivos e Programas Área Trabalho\Assistente\historico.db")

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

        # ── ChatMix — historico.db do Assistente (somente leitura) ───────────
        from datetime import date as _date, timedelta as _td
        chatmix = None
        try:
            if _HISTORICO_DB.exists():
                _hc = _sqlite3.connect(str(_HISTORICO_DB), timeout=5)
                _hc.row_factory = _sqlite3.Row
                _hrows = _hc.execute(
                    "SELECT criado_em, periodo, payload FROM execucoes ORDER BY id DESC"
                ).fetchall()

                # Agrupa por data: para cada dia guarda a execução com maior encerrados
                _daily = {}
                for _hr in _hrows:
                    try:
                        _pl  = _json.loads(_hr['payload'])
                        _cm  = _pl.get('metricas', {}).get('chatmix', {})
                        _enc = int(_cm.get('encerrados') or 0)
                        _d   = _hr['criado_em'][:10]
                        if _d not in _daily or _enc > _daily[_d]['encerrados']:
                            _daily[_d] = {'encerrados': _enc, 'criado_em': _hr['criado_em'],
                                          'periodo': _hr['periodo'], 'cm': _cm}
                    except Exception:
                        pass

                _hoje       = _date.today().isoformat()
                _semana_ant = (_date.today() - _td(days=7)).isoformat()
                _hoje_d     = _daily.get(_hoje)
                _ant_d      = _daily.get(_semana_ant)

                # Dados ao vivo vêm da execução mais recente
                _latest_cm  = _daily[max(_daily)] ['cm'] if _daily else {}

                DIAS_PT = ['segunda','terça','quarta','quinta','sexta','sábado','domingo']
                _dia_nome = DIAS_PT[_date.today().weekday()]

                chatmix = {
                    'criado_em':          _latest_cm and _daily[max(_daily)]['criado_em'],
                    'hoje_enc':           _hoje_d['encerrados'] if _hoje_d else None,
                    'ant_enc':            _ant_d['encerrados']  if _ant_d  else None,
                    'dia_nome':           _dia_nome,
                    'em_atendimento':     (_latest_cm.get('agora') or {}).get('em_atendimento', 0),
                    'em_automacao':       (_latest_cm.get('agora') or {}).get('em_automacao', 0),
                    'fila_espera':        (_latest_cm.get('agora') or {}).get('fila_espera', 0),
                    'duracao_media_min':  _latest_cm.get('duracao_media_min'),
                    'por_departamento':   _latest_cm.get('por_departamento') or {},
                    'principais_motivos': _latest_cm.get('principais_motivos') or {},
                }
                _hc.close()
        except Exception as _e:
            chatmix = {'_debug_error': str(_e)}

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

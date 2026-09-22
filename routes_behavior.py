import pandas as pd
import sqlite3
import json as _json
import base64
import requests
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
from flask import Blueprint, jsonify, request, abort, current_app
from flask_login import current_user

_IXC_BASE = 'https://sistema.netvaletelecom.com/webservice/v1'
_IXC_HOST = 'https://sistema.netvaletelecom.com'

def _ixc_fetch(endpoint, params, token):
    """Form-encoded POST (usado pelo sync de OS, contratos etc.)"""
    encoded = base64.b64encode(token.encode()).decode()
    headers = {'Authorization': f'Basic {encoded}', 'ixcsoft': 'listar'}
    resp = requests.post(
        f'{_IXC_BASE}/{endpoint}',
        data={**params, 'rp': '200', 'page': '1'},
        headers=headers, timeout=15, verify=False
    )
    resp.raise_for_status()
    data = resp.json()
    return data.get('registros', []) if isinstance(data, dict) else []


def _ixc_listar(endpoint, params, token):
    """JSON POST — igual ao automacao_ixc_api.py (Content-Type: application/json)"""
    encoded = base64.b64encode(token.encode()).decode()
    headers = {
        'Authorization': f'Basic {encoded}',
        'ixcsoft': 'listar',
        'Content-Type': 'application/json',
    }
    payload = {**params, 'rp': '200', 'page': '1'}
    resp = requests.post(
        f'{_IXC_BASE}/{endpoint}',
        json=payload,
        headers=headers, timeout=15, verify=False
    )
    resp.raise_for_status()
    txt = resp.text.strip()
    if not txt:
        logger.warning(f"_ixc_listar [{endpoint}]: resposta vazia")
        return []
    data = resp.json()
    return data.get('registros', []) if isinstance(data, dict) else []


def _ixc_query(sql, token):
    encoded = base64.b64encode(token.encode()).decode()
    headers = {'Authorization': f'Basic {encoded}', 'ixcsoft': 'listar'}
    resp = requests.post(
        f'{_IXC_BASE}/qb_query',
        data={'query': sql},
        headers=headers, timeout=15, verify=False
    )
    resp.raise_for_status()
    txt = resp.text.strip()
    if not txt:
        return []
    data = resp.json()
    return data.get('registros', []) if isinstance(data, dict) else (data if isinstance(data, list) else [])

# Define o Blueprint para rotas de comportamento
# O prefixo '/api/behavior' será definido no api_server.py
behavior_bp = Blueprint('behavior_bp', __name__)

from logger import get_logger
logger = get_logger(__name__)

# ---------------------------------------------------------------------------
# Mapeamento de endpoint de rota → chave de aba para controle de permissão
# ---------------------------------------------------------------------------
_TAB_ROUTE_KEYS = {
    '/complaint_patterns':        'reclamacoes',
    '/complaint_clients':         'reclamacoes',
    '/churn_pattern':             'churn',
    '/churn_clients':             'churn',
    '/predictive_churn':          'preditiva',
    '/predictive_churn_export':   'preditiva',
    '/qos_overview':              'qualidade',
    '/signal_clients':            'qualidade',
    '/action_plans':              'acoes',
    '/temporal_support':          'temporal_suporte',
    '/financial_behavior':        'financeiro_ativo',
    '/connection_inactivity':     'inatividade',
    '/cancellation_seasonality':  'sazonalidade_canc',
    '/signal_causes':             'causa_queda',
    '/contact_list':              'lista_retencao',
    '/action_alerts':             'alertas_acao',
    '/canc_reasons':              'motivos_canc',
    '/pre_canc_behavior':         'padrao_pre_canc',
    '/lifecycle_risk':            'lifecycle_risk',
    '/plan_risk':                 'risco_plano',
    '/payment_profile':           'perfil_pagamento',
    '/acompanhamento':            'acompanhamento',
    '/acompanhamento/all':        'acompanhamento',
    # /client_detail/<id> — sem restrição de aba, apenas módulo
    # /retiradas/* — controlado pelo módulo 'retiradas' ou 'behavior' diretamente
}

@behavior_bp.before_request
def _require_behavior_access():
    """Garante autenticação e verifica permissões de módulo e aba."""
    if not current_user.is_authenticated:
        return jsonify({"error": "Não autenticado"}), 401

    # Admin e usuários com permissões nulas têm acesso total
    if current_user.username == 'admin':
        return None
    raw = getattr(current_user, 'permissions', None)
    if raw is None:
        return None

    try:
        perm_list = _json.loads(raw) if isinstance(raw, str) else (raw or [])
    except Exception:
        perm_list = []

    # Retiradas: aceita permissão de módulo 'retiradas' OU 'behavior'
    suffix = request.path[len('/api/behavior'):]
    suffix_base = '/' + suffix.lstrip('/').split('/')[0]
    is_retiradas_route = suffix_base == '/retiradas'

    has_behavior  = 'behavior'  in perm_list
    has_retiradas = 'retiradas' in perm_list

    if is_retiradas_route:
        if not has_behavior and not has_retiradas:
            return jsonify({"error": "Sem acesso ao módulo de Retiradas"}), 403
    else:
        if not has_behavior:
            return jsonify({"error": "Sem acesso ao módulo de Análise de Comportamento"}), 403

    # Verifica acesso à aba específica (somente se existirem behavior:* na lista)
    if has_behavior:
        behavior_tab_perms = [p for p in perm_list if p.startswith('behavior:')]
        if behavior_tab_perms:
            tab_key = _TAB_ROUTE_KEYS.get(suffix_base)
            if tab_key and ('behavior:' + tab_key) not in perm_list:
                return jsonify({"error": f"Sem acesso à aba: {tab_key}"}), 403

    return None

def get_db():
    """Função auxiliar para obter a conexão do banco de dados a partir do app_context."""
    return current_app.config['GET_DB_CONNECTION']()

# --- ROTAS PARA ANÁLISE DE COMPORTAMENTO ---
@behavior_bp.route('/complaint_patterns')
def api_behavior_complaint_patterns():
    conn = get_db()
    try:
        city = request.args.get('city', '')

        params = []
        where_clause = ""
        if city:
            where_clause = "WHERE Cidade = ?"
            params.append(city)

        # CORREÇÃO: Junta as tabelas com 'Clientes' para obter a cidade.
        query = f"""
            SELECT Assunto, COUNT(*) as Count
            FROM (
                SELECT T1.Assunto, C.Cidade
                FROM OS AS T1
                JOIN Clientes AS C ON T1.Cliente = C.Raz_o_social
                UNION ALL
                SELECT T2.Assunto, C.Cidade
                FROM Atendimentos AS T2
                JOIN Clientes AS C ON T2.Cliente = C.Raz_o_social
            )
            {where_clause}
            GROUP BY Assunto
            ORDER BY Count DESC
            LIMIT 15;
        """

        top_subjects = conn.execute(query, tuple(params)).fetchall()

        # CORREÇÃO: A query para buscar cidades também precisa buscar da tabela 'Clientes'.
        cities_query = """
            SELECT DISTINCT Cidade FROM Clientes
            WHERE Cidade IS NOT NULL AND TRIM(Cidade) != ''
            AND Raz_o_social IN (
                SELECT Cliente FROM OS WHERE Cliente IS NOT NULL
                UNION
                SELECT Cliente FROM Atendimentos WHERE Cliente IS NOT NULL
            )
            ORDER BY Cidade;
        """
        cities_data = conn.execute(cities_query).fetchall()

        return jsonify({
            "top_subjects": [dict(row) for row in top_subjects],
            "cities": [row[0] for row in cities_data if row[0]]
        })

    except sqlite3.Error as e:
        logger.error(f"Erro na análise de padrão de reclamações: {e}", exc_info=True)
        return jsonify({"error": f"Erro interno ao processar a análise. Detalhe: {e}"}), 500
    finally:
        if conn: conn.close()

@behavior_bp.route('/churn_pattern')
def api_behavior_churn_pattern():
    conn = get_db()
    try:
        city = request.args.get('city', '').strip()

        has_neg = bool(conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='Contratos_Negativacao'"
        ).fetchone())

        city_sql = "AND Cidade = ?" if city else ""
        city_p   = [city] if city else []

        neg_union = ""
        if has_neg:
            neg_union = f"""
            UNION ALL
            SELECT ID AS Contrato_ID, Cliente, Data_ativa_o,
                   Data_negativa_o AS end_date, Cidade
            FROM Contratos_Negativacao
            WHERE Data_negativa_o IS NOT NULL {city_sql}
            """

        churners_cte = f"""
            Churners AS (
                SELECT ID AS Contrato_ID, Cliente, Data_ativa_o,
                       Data_cancelamento AS end_date, Cidade
                FROM Contratos
                WHERE Status_contrato = 'Inativo'
                  AND Status_acesso = 'Desativado'
                  AND Data_cancelamento IS NOT NULL
                  AND Data_cancelamento != ''
                  {city_sql}
                  AND Cidade IS NOT NULL AND TRIM(Cidade) != '' AND NOT (Cidade GLOB '[0-9]*')
                {neg_union}
            )
        """
        base_p = city_p + (city_p if has_neg else [])

        summary_sql = f"""
            WITH {churners_cte},
            ChurnPayments AS (
                SELECT
                    CR.ID_Contrato_Recorrente,
                    SUM(CASE WHEN CR.Data_pagamento > CR.Vencimento THEN 1 ELSE 0 END) AS Atrasos_Total,
                    SUM(CASE WHEN CR.Vencimento <= CH.end_date
                              AND (CR.Data_pagamento IS NULL OR CR.Data_pagamento = '')
                         THEN 1 ELSE 0 END) AS Faturas_Vencidas,
                    SUM(CASE WHEN CR.Data_pagamento > CR.Vencimento
                              AND CR.Vencimento >= DATE(CH.end_date, '-60 days')
                              AND CR.Vencimento <= CH.end_date THEN 1 ELSE 0 END) AS Atrasos_Pre_Churn
                FROM Contas_a_Receber CR
                JOIN Churners CH ON CR.ID_Contrato_Recorrente = CH.Contrato_ID
                GROUP BY CR.ID_Contrato_Recorrente
            ),
            ChurnTickets AS (
                SELECT DISTINCT CH.Contrato_ID
                FROM Churners CH
                JOIN (
                    SELECT Cliente FROM Atendimentos WHERE Cliente IS NOT NULL
                    UNION
                    SELECT Cliente FROM OS WHERE Cliente IS NOT NULL
                ) T ON CH.Cliente = T.Cliente
            ),
            PaidMonths AS (
                SELECT CR.ID_Contrato_Recorrente,
                       SUM(CASE WHEN CR.Data_pagamento IS NOT NULL AND CR.Data_pagamento != ''
                                THEN 1 ELSE 0 END) AS Meses_Pagos
                FROM Contas_a_Receber CR
                WHERE CR.ID_Contrato_Recorrente IN (SELECT Contrato_ID FROM Churners)
                GROUP BY CR.ID_Contrato_Recorrente
            )
            SELECT
                COUNT(CH.Contrato_ID) AS Total_Churners,
                ROUND(AVG(COALESCE(PM.Meses_Pagos, 0)), 1) AS Media_Permanencia_Meses,
                SUM(CASE WHEN CP.Atrasos_Total > 0 THEN 1 ELSE 0 END) AS Com_Historico_Atraso,
                SUM(CASE WHEN CP.Atrasos_Pre_Churn > 0 THEN 1 ELSE 0 END) AS Com_Atraso_Pre_Churn,
                SUM(CASE WHEN CP.Faturas_Vencidas > 0 THEN 1 ELSE 0 END) AS Com_Faturas_Vencidas,
                SUM(CASE WHEN CT.Contrato_ID IS NOT NULL THEN 1 ELSE 0 END) AS Com_Atendimentos,
                SUM(CASE WHEN COALESCE(PM.Meses_Pagos, 0) < 6 THEN 1 ELSE 0 END) AS Churners_Pre_6m
            FROM Churners CH
            LEFT JOIN ChurnPayments CP ON CH.Contrato_ID = CP.ID_Contrato_Recorrente
            LEFT JOIN ChurnTickets CT ON CH.Contrato_ID = CT.Contrato_ID
            LEFT JOIN PaidMonths PM ON CH.Contrato_ID = PM.ID_Contrato_Recorrente
            WHERE CH.end_date IS NOT NULL AND CH.Data_ativa_o IS NOT NULL
        """

        perm_sql = f"""
            WITH {churners_cte},
            PaidMonths AS (
                SELECT CR.ID_Contrato_Recorrente,
                       SUM(CASE WHEN CR.Data_pagamento IS NOT NULL AND CR.Data_pagamento != ''
                                THEN 1 ELSE 0 END) AS Meses_Pagos
                FROM Contas_a_Receber CR
                WHERE CR.ID_Contrato_Recorrente IN (SELECT Contrato_ID FROM Churners)
                GROUP BY CR.ID_Contrato_Recorrente
            )
            SELECT
                CASE
                    WHEN COALESCE(PM.Meses_Pagos, 0) <= 3  THEN '0-3m'
                    WHEN COALESCE(PM.Meses_Pagos, 0) <= 6  THEN '3-6m'
                    WHEN COALESCE(PM.Meses_Pagos, 0) <= 12 THEN '6-12m'
                    WHEN COALESCE(PM.Meses_Pagos, 0) <= 24 THEN '12-24m'
                    ELSE '24m+'
                END AS Faixa,
                COUNT(*) AS Count
            FROM Churners CH
            LEFT JOIN PaidMonths PM ON CH.Contrato_ID = PM.ID_Contrato_Recorrente
            GROUP BY Faixa
        """

        seasonal_sql = f"""
            WITH {churners_cte}
            SELECT
                CASE STRFTIME('%m', end_date)
                    WHEN '01' THEN 'Jan' WHEN '02' THEN 'Fev' WHEN '03' THEN 'Mar'
                    WHEN '04' THEN 'Abr' WHEN '05' THEN 'Mai' WHEN '06' THEN 'Jun'
                    WHEN '07' THEN 'Jul' WHEN '08' THEN 'Ago' WHEN '09' THEN 'Set'
                    WHEN '10' THEN 'Out' WHEN '11' THEN 'Nov' WHEN '12' THEN 'Dez'
                END AS Mes,
                STRFTIME('%m', end_date) AS Mes_Num,
                COUNT(*) AS Count
            FROM Churners
            WHERE end_date IS NOT NULL
            GROUP BY Mes_Num, Mes
            ORDER BY Mes_Num
        """

        if has_neg:
            cities_sql = """
                SELECT DISTINCT Cidade FROM (
                    SELECT Cidade FROM Contratos
                    WHERE Status_contrato='Inativo' AND Status_acesso='Desativado'
                    UNION
                    SELECT Cidade FROM Contratos_Negativacao
                ) WHERE Cidade IS NOT NULL AND TRIM(Cidade) != ''
                  AND Cidade NOT GLOB '*[0-9]*' ORDER BY Cidade
            """
        else:
            cities_sql = """
                SELECT DISTINCT Cidade FROM Contratos
                WHERE Status_contrato='Inativo' AND Status_acesso='Desativado'
                  AND Cidade IS NOT NULL AND TRIM(Cidade) != ''
                  AND Cidade NOT GLOB '*[0-9]*' ORDER BY Cidade
            """

        assunto_sql = f"""
            WITH {churners_cte}
            SELECT COALESCE(NULLIF(T.Assunto,''), 'Sem Assunto') AS Assunto,
                   COUNT(DISTINCT CH.Contrato_ID) AS Count
            FROM Churners CH
            JOIN (
                SELECT Cliente, Assunto FROM OS WHERE Cliente IS NOT NULL
                UNION ALL
                SELECT Cliente, Assunto FROM Atendimentos WHERE Cliente IS NOT NULL
            ) T ON CH.Cliente = T.Cliente
            GROUP BY Assunto
            ORDER BY Count DESC
            LIMIT 10
        """

        summary    = dict(conn.execute(summary_sql,  base_p).fetchone() or {})
        permanence = [dict(r) for r in conn.execute(perm_sql,     base_p).fetchall()]
        seasonal   = [dict(r) for r in conn.execute(seasonal_sql, base_p).fetchall()]
        assuntos   = [dict(r) for r in conn.execute(assunto_sql,  base_p).fetchall()]
        cities     = [r[0] for r in conn.execute(cities_sql).fetchall() if r[0]]

        return jsonify({
            'summary':                  summary,
            'permanence_distribution':  permanence,
            'seasonal_distribution':    seasonal,
            'assunto_distribution':     assuntos,
            'cities':                   cities,
        })

    except Exception as e:
        logger.error(f"Erro no padrão de churn: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500
    finally:
        if conn: conn.close()


_ACOMP_CONFIG_DEFAULT = {
    "tipos_acao": [
        {"value": "ligacao",  "label": "Ligação",   "emoji": "📞", "ativo": True},
        {"value": "whatsapp", "label": "WhatsApp",  "emoji": "💬", "ativo": True},
        {"value": "visita",   "label": "Visita",    "emoji": "🏠", "ativo": True},
        {"value": "email",    "label": "E-mail",    "emoji": "✉️", "ativo": True},
    ],
    "assuntos_os": [
        {"label": "Sem sinal",               "abre_os": False},
        {"label": "Lentidão",                "abre_os": False},
        {"label": "Retirada de equipamento", "abre_os": False},
        {"label": "Instalação",              "abre_os": False},
        {"label": "Suporte técnico",         "abre_os": False},
        {"label": "Mudança de endereço",     "abre_os": False},
        {"label": "Outros",                  "abre_os": False},
    ],
}

# IXC city name → ID (inverted from routes_ixc_sync.CIDADE_NOMES)
_CIDADE_IDS = {
    'Dom Pedro': '515',
    'Presidente Dutra': '599',
    'São Domingos do Maranhão': '624',
    'Tuntum': '656',
}


def _migrate_assuntos_os(assuntos):
    """Converte lista de strings para lista de {label, id_assunto} se necessário."""
    if not assuntos:
        return []
    if isinstance(assuntos[0], str):
        return [{"label": s, "id_assunto": ""} for s in assuntos]
    return assuntos


@behavior_bp.route('/acomp-config')
def api_behavior_acomp_config():
    """Retorna configuração de tipos de ação e assuntos de OS."""
    import copy
    try:
        conn = current_app.config['GET_DB_CONNECTION']()
        try:
            row = conn.execute("SELECT value FROM Settings WHERE key = 'acomp_config'").fetchone()
        finally:
            conn.close()
        cfg = _json.loads(row['value']) if (row and row['value']) else copy.deepcopy(_ACOMP_CONFIG_DEFAULT)
        cfg['tipos_acao'] = [t for t in cfg.get('tipos_acao', []) if t.get('ativo', True)]
        # Normaliza assuntos para {label, abre_os}
        raw = cfg.get('assuntos_os', [])
        cfg['assuntos_os'] = [
            s if isinstance(s, dict) else {"label": s, "abre_os": False}
            for s in raw
        ]
        return jsonify(cfg)
    except Exception as e:
        logger.warning(f"acomp-config: {e}")
        return jsonify(copy.deepcopy(_ACOMP_CONFIG_DEFAULT))


@behavior_bp.route('/ixc-assuntos')
def api_behavior_ixc_assuntos():
    """Lista assuntos de OS disponíveis no IXC para configuração admin."""
    try:
        token = _ret_get_token()
        if not token:
            return jsonify({"error": "Token IXC não configurado"}), 503

        debug = request.args.get('debug') == '1'
        debug_info = {}

        def _pick_label(r):
            for k in ('assunto', 'nome', 'descricao', 'titulo', 'title', 'name'):
                if r.get(k):
                    return r[k]
            return str(r.get('id', ''))

        # 1. Tenta SQL direto com diferentes nomes de tabela (su_ticket e su_oss_chamado)
        for tbl in ('su_ticket_assunto', 'su_oss_assunto', 'su_assunto', 'oss_assunto', 'su_oss_chamado_assunto'):
            try:
                recs = _ixc_query(f"SELECT * FROM {tbl} ORDER BY id LIMIT 100", token)
                if debug:
                    debug_info[f'sql_{tbl}'] = recs[:3] if recs else 'empty'
                if recs:
                    return jsonify([{"id": str(r.get('id')), "label": _pick_label(r)} for r in recs if r.get('id')])
            except Exception as ex:
                if debug:
                    debug_info[f'sql_{tbl}_err'] = str(ex)

        # 2. Tenta REST com diferentes nomes
        for ep in ('su_ticket_assunto', 'su_oss_assunto', 'su_assunto', 'oss_assunto', 'su_oss_chamado_assunto'):
            try:
                recs = _ixc_fetch(ep, {'sortname': 'id', 'sortorder': 'asc'}, token)
                if debug:
                    debug_info[f'rest_{ep}'] = recs[:3] if recs else 'empty'
                if recs:
                    return jsonify([{"id": str(r.get('id')), "label": _pick_label(r)} for r in recs if r.get('id')])
            except Exception as ex:
                if debug:
                    debug_info[f'rest_{ep}_err'] = str(ex)

        # 3. Extrai assuntos únicos de tickets/OS existentes como fallback
        for tbl2, id_col, lbl_col in [
            ('su_ticket',      'id_assunto', 'assunto'),
            ('su_oss_chamado', 'id_assunto', 'assunto'),
        ]:
            try:
                recs = _ixc_query(
                    f"SELECT DISTINCT {id_col}, {lbl_col} FROM {tbl2} WHERE {id_col} IS NOT NULL AND {id_col} != '' ORDER BY {id_col} LIMIT 50",
                    token
                )
                if debug:
                    debug_info[f'fallback_{tbl2}'] = recs[:5] if recs else 'empty'
                if recs:
                    seen = {}
                    for r in recs:
                        aid = str(r.get(id_col, '') or '')
                        if aid and aid not in seen:
                            seen[aid] = r.get(lbl_col) or aid
                    return jsonify([{"id": k, "label": v} for k, v in seen.items()])
            except Exception as ex:
                if debug:
                    debug_info[f'fallback_{tbl2}_err'] = str(ex)

        if debug:
            return jsonify({"debug": debug_info, "error": "Nenhuma tabela de assuntos encontrada"})
        return jsonify({"error": "Não foi possível listar assuntos do IXC. Acesse /api/behavior/ixc-assuntos?debug=1 para diagnóstico."})
    except Exception as e:
        logger.warning(f"ixc-assuntos: {e}")
        return jsonify({"error": str(e)}), 500


@behavior_bp.route('/ixc-setores')
def api_behavior_ixc_setores():
    """Lista setores (departamentos) de ticket disponíveis no IXC."""
    try:
        token = _ret_get_token()
        if not token:
            return jsonify({"error": "Token IXC não configurado"}), 503
        encoded = base64.b64encode(token.encode()).decode()
        headers = {'Authorization': f'Basic {encoded}', 'ixcsoft': 'listar'}
        resp = requests.post(
            f'{_IXC_BASE}/su_ticket_setor',
            data={'qtype': 'su_ticket_setor.id', 'query': '', 'oper': 'like',
                  'sortname': 'su_ticket_setor.id', 'sortorder': 'asc',
                  'page': '1', 'rp': '100'},
            headers=headers, timeout=15, verify=False
        )
        txt = resp.text.strip()
        logger.info(f"ixc-setores: status={resp.status_code} body={txt[:300]!r}")
        if not txt or txt.startswith('<'):
            return jsonify({"setores": [], "raw": txt[:200]})
        d = resp.json()
        records = d if isinstance(d, list) else d.get('registros', d.get('records', []))
        setores = [{'id': str(r.get('id', '')), 'label': r.get('setor', r.get('nome', r.get('descricao', str(r.get('id', '')))))} for r in records]
        return jsonify({"setores": setores})
    except Exception as e:
        logger.warning(f"ixc-setores: {e}")
        return jsonify({"error": str(e)}), 500


@behavior_bp.route('/fechar-ticket-ixc', methods=['POST'])
def api_fechar_ticket_ixc():
    """Finaliza manualmente um ticket IXC aberto."""
    data      = request.get_json(force=True) or {}
    ixc_os_id = str(data.get('ixc_os_id') or '').strip()
    acomp_id  = data.get('acomp_id')
    if not ixc_os_id:
        return jsonify({"error": "ixc_os_id obrigatório"}), 400
    try:
        token = _ret_get_token()
        if not token:
            return jsonify({"error": "Token IXC não configurado"}), 503

        # Busca configurações e dados do acompanhamento para montar payload completo
        id_resposta = id_ticket_setor = id_atendente = ''
        id_cliente_ixc = id_contrato = ''
        titulo = mensagem = ''
        try:
            _c = current_app.config['GET_DB_CONNECTION']()
            try:
                rows_s = _c.execute(
                    "SELECT key, value FROM Settings WHERE key IN ('ixc_id_resposta','ixc_setor_id','ixc_id_atendente')"
                ).fetchall()
                cm = {r['key']: (r['value'] or '').strip() for r in rows_s}
                id_resposta     = cm.get('ixc_id_resposta', '')
                id_ticket_setor = cm.get('ixc_setor_id', '')
                id_atendente    = cm.get('ixc_id_atendente', '')
            finally:
                _c.close()
        except Exception:
            pass

        if acomp_id:
            try:
                _db = get_db()
                try:
                    ac = _db.execute(
                        "SELECT contrato_id, observacao, tipo_acao FROM Acompanhamento_Clientes WHERE id = ?",
                        (acomp_id,)
                    ).fetchone()
                    if ac:
                        id_contrato = str(ac['contrato_id'] or '')
                        titulo      = ac['tipo_acao'] or 'Atendimento'
                        mensagem    = ac['observacao'] or titulo
                        # busca id_cliente_ixc pelo contrato
                        cr_row = _db.execute(
                            "SELECT Cliente FROM Contratos WHERE ID = ?", (id_contrato,)
                        ).fetchone()
                        if cr_row:
                            cl_row = _db.execute(
                                "SELECT ID FROM Clientes WHERE Raz_o_social = ? LIMIT 1",
                                (cr_row['Cliente'],)
                            ).fetchone()
                            if cl_row:
                                id_cliente_ixc = str(cl_row['ID'])
                finally:
                    _db.close()
            except Exception:
                pass

        encoded = base64.b64encode(token.encode()).decode()
        headers = {'Authorization': f'Basic {encoded}', 'Content-Type': 'application/json'}

        # Finaliza via su_mensagens com su_status=S (Solucionado)
        msg_body = {
            'id_ticket':   ixc_os_id,
            'id_cliente':  id_cliente_ixc or '',
            'su_status':   'S',
            'id_resposta': id_resposta or '',
            'mensagem':    mensagem or titulo or 'Atendimento resolvido',
        }
        cr = requests.post(f'{_IXC_BASE}/su_mensagens',
                           json=msg_body, headers=headers, timeout=15, verify=False)
        txt = cr.text.strip()
        logger.info(f"fechar-ticket-ixc #{ixc_os_id} su_mensagens status={cr.status_code} body={txt[:300]!r}")
        d = {}
        try:
            d = cr.json() if txt else {}
        except Exception:
            pass
        if isinstance(d, dict) and d.get('type') == 'error':
            return jsonify({"error": d.get('message', 'Erro IXC')}), 400
        ixc_ok = True

        # Só limpa local se IXC confirmou
        if acomp_id:
            try:
                conn = get_db()
                conn.execute("UPDATE Acompanhamento_Clientes SET ixc_os_id = NULL WHERE id = ?", (acomp_id,))
                conn.commit()
                conn.close()
            except Exception:
                pass

        return jsonify({"ok": True})
    except Exception as ex:
        logger.error(f"fechar-ticket-ixc: {ex}")
        return jsonify({"error": str(ex)}), 500


@behavior_bp.route('/predictive_churn')
def api_behavior_predictive_churn():
    conn = get_db()
    try:
        limit         = request.args.get('limit',      50,   type=int)
        offset        = request.args.get('offset',     0,    type=int)
        city          = request.args.get('city',       '').strip()
        risk_level    = request.args.get('risk_level', '').strip()
        status_acesso = [v for v in request.args.getlist('status_acesso') if v.strip()]

        active_conds = [
            "Status_contrato = 'Ativo'",
            "Status_acesso != 'Desativado'",
            "Cidade IS NOT NULL",
            "TRIM(Cidade) != ''",
            "NOT (Cidade GLOB '[0-9]*')",
        ]
        active_p = []
        if status_acesso:
            placeholders = ','.join('?' * len(status_acesso))
            active_conds.append(f"Status_acesso IN ({placeholders})")
            active_p.extend(status_acesso)
        if city:
            active_conds.append("Cidade = ?")
            active_p.append(city)
        where_active = " AND ".join(active_conds)

        risk_sql = ""
        risk_p   = []
        if risk_level == 'Altíssimo':
            risk_sql = "AND Risk_Score > 160"
        elif risk_level == 'Alto':
            risk_sql = "AND Risk_Score >= 60 AND Risk_Score <= 160"
        elif risk_level == 'Médio':
            risk_sql = "AND Risk_Score >= 25 AND Risk_Score < 60"
        elif risk_level == 'Baixo':
            risk_sql = "AND Risk_Score >= 10 AND Risk_Score < 25"

        base_cte = f"""
            WITH ActiveContracts AS (
                SELECT ID, Cliente, Cidade, Data_ativa_o, Status_contrato, Status_acesso
                FROM Contratos
                WHERE {where_active}
            ),
            PaymentProfile AS (
                SELECT
                    CR.ID_Contrato_Recorrente,
                    SUM(CASE WHEN CR.Status = 'A receber'
                              AND CR.Vencimento < date('now') THEN 1 ELSE 0 END) AS Faturas_Vencidas,
                    MAX(CASE WHEN CR.Status = 'A receber' AND CR.Vencimento < date('now')
                             THEN CAST(JULIANDAY(date('now')) - JULIANDAY(CR.Vencimento) AS INTEGER)
                             END) AS Dias_Vencido,
                    SUM(CASE WHEN CR.Data_pagamento > CR.Vencimento
                              AND CR.Vencimento >= date('now', '-90 days') THEN 1 ELSE 0 END) AS Atrasos_90d,
                    ROUND(AVG(CASE WHEN CR.Data_pagamento IS NOT NULL
                                   THEN JULIANDAY(CR.Data_pagamento) - JULIANDAY(CR.Vencimento)
                                   END), 1) AS Media_Atraso,
                    ROUND(SUM(CASE WHEN CR.Status = 'A receber' AND CR.Vencimento < date('now')
                                   THEN CR.Valor ELSE 0 END), 2) AS Valor_Vencido
                FROM Contas_a_Receber CR
                WHERE CR.ID_Contrato_Recorrente IN (SELECT ID FROM ActiveContracts)
                GROUP BY CR.ID_Contrato_Recorrente
            ),
            RecentTickets AS (
                SELECT Cliente, COUNT(*) AS Atendimentos_30d
                FROM (
                    SELECT Cliente FROM Atendimentos
                    WHERE Criado_em >= date('now', '-30 days') AND Cliente IS NOT NULL
                    UNION ALL
                    SELECT Cliente FROM OS
                    WHERE Abertura >= date('now', '-30 days') AND Cliente IS NOT NULL
                )
                GROUP BY Cliente
            ),
            ConnectionStatus AS (
                SELECT ID_contrato,
                       MAX(ltima_conex_o_final) AS Ultima_Conexao,
                       CAST(JULIANDAY(date('now')) - JULIANDAY(MAX(ltima_conex_o_final))
                            AS INTEGER) AS Dias_Sem_Conexao
                FROM Logins
                WHERE ltima_conex_o_final IS NOT NULL AND ID_contrato IS NOT NULL
                GROUP BY ID_contrato
            ),
            Scored AS (
                SELECT
                    AC.ID AS Contrato_ID,
                    AC.Cliente,
                    AC.Cidade,
                    AC.Status_contrato,
                    AC.Status_acesso,
                    CAST((JULIANDAY(date('now')) - JULIANDAY(AC.Data_ativa_o)) / 30.44
                         AS INTEGER) AS Meses_Ativo,
                    COALESCE(PP.Faturas_Vencidas, 0) AS Faturas_Vencidas,
                    COALESCE(PP.Dias_Vencido, 0)     AS Dias_Vencido,
                    COALESCE(PP.Atrasos_90d, 0)      AS Atrasos_90d,
                    COALESCE(PP.Media_Atraso, 0)     AS Media_Atraso,
                    COALESCE(PP.Valor_Vencido, 0)    AS Valor_Vencido,
                    COALESCE(RT.Atendimentos_30d, 0) AS Atendimentos_30d,
                    COALESCE(CS.Dias_Sem_Conexao, 0) AS Dias_Sem_Conexao,
                    CS.Ultima_Conexao,
                    (
                        COALESCE(PP.Faturas_Vencidas, 0) * 25
                        + CASE WHEN COALESCE(PP.Dias_Vencido, 0) > 60 THEN 30
                               WHEN COALESCE(PP.Dias_Vencido, 0) > 30 THEN 15
                               ELSE 0 END
                        + MIN(COALESCE(PP.Atrasos_90d, 0), 5) * 8
                        + CASE WHEN COALESCE(PP.Media_Atraso, 0) > 30 THEN 15
                               WHEN COALESCE(PP.Media_Atraso, 0) > 15 THEN 7
                               ELSE 0 END
                        + MIN(COALESCE(RT.Atendimentos_30d, 0), 3) * 8
                        + CASE WHEN COALESCE(CS.Dias_Sem_Conexao, 0) > 30 THEN 20
                               WHEN COALESCE(CS.Dias_Sem_Conexao, 0) > 14 THEN 10
                               ELSE 0 END
                    ) AS Risk_Score
                FROM ActiveContracts AC
                LEFT JOIN PaymentProfile PP ON AC.ID = PP.ID_Contrato_Recorrente
                LEFT JOIN RecentTickets RT ON AC.Cliente = RT.Cliente
                LEFT JOIN ConnectionStatus CS ON AC.ID = CS.ID_contrato
                WHERE (
                    COALESCE(PP.Faturas_Vencidas, 0) > 0
                    OR COALESCE(PP.Atrasos_90d, 0) > 1
                    OR COALESCE(RT.Atendimentos_30d, 0) > 1
                    OR COALESCE(CS.Dias_Sem_Conexao, 0) > 14
                )
            )
        """

        summary_sql = base_cte + """
            SELECT
                SUM(CASE WHEN Risk_Score > 160                              THEN 1 ELSE 0 END) AS Altissimo,
                SUM(CASE WHEN Risk_Score >= 60 AND Risk_Score <= 160        THEN 1 ELSE 0 END) AS Alto,
                SUM(CASE WHEN Risk_Score >= 25 AND Risk_Score < 60          THEN 1 ELSE 0 END) AS Medio,
                SUM(CASE WHEN Risk_Score >= 10 AND Risk_Score < 25          THEN 1 ELSE 0 END) AS Baixo,
                COUNT(*) AS Total
            FROM Scored WHERE Risk_Score >= 10
        """

        count_sql = base_cte + f"""
            SELECT COUNT(*) FROM Scored WHERE Risk_Score >= 10 {risk_sql}
        """

        data_sql = base_cte + f"""
            SELECT *,
                CASE WHEN Risk_Score > 160  THEN 'Altíssimo'
                     WHEN Risk_Score >= 60  THEN 'Alto'
                     WHEN Risk_Score >= 25  THEN 'Médio'
                     WHEN Risk_Score >= 10  THEN 'Baixo'
                     ELSE 'Saudável' END AS Nivel_Risco
            FROM Scored
            WHERE Risk_Score >= 10 {risk_sql}
            ORDER BY Risk_Score DESC
            LIMIT ? OFFSET ?
        """

        cities_sql = """
            SELECT DISTINCT Cidade FROM Contratos
            WHERE Status_contrato = 'Ativo' AND Cidade IS NOT NULL
              AND TRIM(Cidade) != '' AND Cidade NOT GLOB '*[0-9]*'
            ORDER BY Cidade
        """

        summary    = dict(conn.execute(summary_sql, active_p).fetchone() or {})
        total_rows = conn.execute(count_sql,         active_p + risk_p).fetchone()[0]
        data       = [dict(r) for r in conn.execute(data_sql, active_p + risk_p + [limit, offset]).fetchall()]
        cities     = [r[0] for r in conn.execute(cities_sql).fetchall() if r[0]]

        return jsonify({
            'data':       data,
            'summary':    summary,
            'total_rows': total_rows,
            'cities':     cities,
        })

    except Exception as e:
        logger.error(f"Erro na análise preditiva de churn: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500
    finally:
        if conn: conn.close()


@behavior_bp.route('/predictive_churn_export')
def api_behavior_predictive_churn_export():
    conn = get_db()
    try:
        limit      = request.args.get('limit',      5000, type=int)
        offset        = request.args.get('offset',     0,    type=int)
        city          = request.args.get('city',       '').strip()
        risk_level    = request.args.get('risk_level', '').strip()
        status_acesso = [v for v in request.args.getlist('status_acesso') if v.strip()]

        active_conds = [
            "Status_contrato = 'Ativo'",
            "Status_acesso != 'Desativado'",
            "Cidade IS NOT NULL",
            "TRIM(Cidade) != ''",
            "NOT (Cidade GLOB '[0-9]*')",
        ]
        active_p = []
        if status_acesso:
            placeholders = ','.join('?' * len(status_acesso))
            active_conds.append(f"Status_acesso IN ({placeholders})")
            active_p.extend(status_acesso)
        if city:
            active_conds.append("Cidade = ?")
            active_p.append(city)
        where_active = " AND ".join(active_conds)

        risk_sql = ""
        risk_p   = []
        if risk_level == 'Altíssimo':
            risk_sql = "AND Risk_Score > 160"
        elif risk_level == 'Alto':
            risk_sql = "AND Risk_Score >= 60 AND Risk_Score <= 160"
        elif risk_level == 'Médio':
            risk_sql = "AND Risk_Score >= 25 AND Risk_Score < 60"
        elif risk_level == 'Baixo':
            risk_sql = "AND Risk_Score >= 10 AND Risk_Score < 25"

        export_sql = f"""
            WITH ActiveContracts AS (
                SELECT ID, Cliente, Cidade, Data_ativa_o, Status_contrato, Status_acesso
                FROM Contratos
                WHERE {where_active}
            ),
            PaymentProfile AS (
                SELECT
                    CR.ID_Contrato_Recorrente,
                    SUM(CASE WHEN CR.Status = 'A receber'
                              AND CR.Vencimento < date('now') THEN 1 ELSE 0 END) AS Faturas_Vencidas,
                    MAX(CASE WHEN CR.Status = 'A receber' AND CR.Vencimento < date('now')
                             THEN CAST(JULIANDAY(date('now')) - JULIANDAY(CR.Vencimento) AS INTEGER)
                             END) AS Dias_Vencido,
                    SUM(CASE WHEN CR.Data_pagamento > CR.Vencimento
                              AND CR.Vencimento >= date('now', '-90 days') THEN 1 ELSE 0 END) AS Atrasos_90d,
                    ROUND(AVG(CASE WHEN CR.Data_pagamento IS NOT NULL
                                   THEN JULIANDAY(CR.Data_pagamento) - JULIANDAY(CR.Vencimento)
                                   END), 1) AS Media_Atraso,
                    ROUND(SUM(CASE WHEN CR.Status = 'A receber' AND CR.Vencimento < date('now')
                                   THEN CR.Valor ELSE 0 END), 2) AS Valor_Vencido
                FROM Contas_a_Receber CR
                WHERE CR.ID_Contrato_Recorrente IN (SELECT ID FROM ActiveContracts)
                GROUP BY CR.ID_Contrato_Recorrente
            ),
            RecentTickets AS (
                SELECT Cliente, COUNT(*) AS Atendimentos_30d
                FROM (
                    SELECT Cliente FROM Atendimentos
                    WHERE Criado_em >= date('now', '-30 days') AND Cliente IS NOT NULL
                    UNION ALL
                    SELECT Cliente FROM OS
                    WHERE Abertura >= date('now', '-30 days') AND Cliente IS NOT NULL
                )
                GROUP BY Cliente
            ),
            ConnectionStatus AS (
                SELECT ID_contrato,
                       CAST(JULIANDAY(date('now')) - JULIANDAY(MAX(ltima_conex_o_final))
                            AS INTEGER) AS Dias_Sem_Conexao
                FROM Logins
                WHERE ltima_conex_o_final IS NOT NULL AND ID_contrato IS NOT NULL
                GROUP BY ID_contrato
            ),
            Scored AS (
                SELECT
                    AC.ID AS Contrato_ID,
                    AC.Cliente,
                    AC.Cidade,
                    AC.Status_contrato,
                    AC.Status_acesso,
                    COALESCE(PP.Faturas_Vencidas, 0) AS Faturas_Vencidas,
                    COALESCE(PP.Dias_Vencido, 0)     AS Dias_Vencido,
                    COALESCE(PP.Atrasos_90d, 0)      AS Atrasos_90d,
                    COALESCE(PP.Valor_Vencido, 0)    AS Valor_Vencido,
                    COALESCE(RT.Atendimentos_30d, 0) AS Atendimentos_30d,
                    COALESCE(CS.Dias_Sem_Conexao, 0) AS Dias_Sem_Conexao,
                    (
                        COALESCE(PP.Faturas_Vencidas, 0) * 25
                        + CASE WHEN COALESCE(PP.Dias_Vencido, 0) > 60 THEN 30
                               WHEN COALESCE(PP.Dias_Vencido, 0) > 30 THEN 15
                               ELSE 0 END
                        + MIN(COALESCE(PP.Atrasos_90d, 0), 5) * 8
                        + CASE WHEN COALESCE(PP.Media_Atraso, 0) > 30 THEN 15
                               WHEN COALESCE(PP.Media_Atraso, 0) > 15 THEN 7
                               ELSE 0 END
                        + MIN(COALESCE(RT.Atendimentos_30d, 0), 3) * 8
                        + CASE WHEN COALESCE(CS.Dias_Sem_Conexao, 0) > 30 THEN 20
                               WHEN COALESCE(CS.Dias_Sem_Conexao, 0) > 14 THEN 10
                               ELSE 0 END
                    ) AS Risk_Score
                FROM ActiveContracts AC
                LEFT JOIN PaymentProfile PP ON AC.ID = PP.ID_Contrato_Recorrente
                LEFT JOIN RecentTickets RT ON AC.Cliente = RT.Cliente
                LEFT JOIN ConnectionStatus CS ON AC.ID = CS.ID_contrato
                WHERE (
                    COALESCE(PP.Faturas_Vencidas, 0) > 0
                    OR COALESCE(PP.Atrasos_90d, 0) > 1
                    OR COALESCE(RT.Atendimentos_30d, 0) > 1
                    OR COALESCE(CS.Dias_Sem_Conexao, 0) > 14
                )
            )
            SELECT
                S.*,
                CASE WHEN S.Risk_Score > 160 THEN 'Altíssimo'
                     WHEN S.Risk_Score >= 60 THEN 'Alto'
                     WHEN S.Risk_Score >= 25 THEN 'Médio'
                     WHEN S.Risk_Score >= 10 THEN 'Baixo'
                     ELSE 'Saudável' END AS Nivel_Risco,
                COALESCE(CLI.Telefone, '') AS Telefone,
                COALESCE(CLI.WhatsApp, '') AS WhatsApp
            FROM Scored S
            LEFT JOIN (
                SELECT Raz_o_social,
                       MAX(Telefone) AS Telefone,
                       MAX(WhatsApp) AS WhatsApp
                FROM Clientes
                GROUP BY Raz_o_social
            ) CLI ON CLI.Raz_o_social = S.Cliente
            WHERE S.Risk_Score >= 10 {risk_sql}
            ORDER BY S.Risk_Score DESC
            LIMIT ? OFFSET ?
        """

        data = [dict(r) for r in conn.execute(export_sql, active_p + risk_p + [limit, offset]).fetchall()]
        return jsonify({'data': data})

    except Exception as e:
        logger.error(f"Erro no export de churn preditivo: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500
    finally:
        if conn: conn.close()


@behavior_bp.route('/complaint_clients')
def api_behavior_complaint_clients():
    conn = get_db()
    try:
        subject = request.args.get('subject', '').strip()
        city    = request.args.get('city',    '').strip()
        if not subject:
            return jsonify({'data': [], 'total': 0})

        city_c = "AND C.Cidade = ?" if city else ""
        base_p = [subject] + ([city] if city else [])

        query = f"""
            SELECT T1.Cliente, C.Cidade, T1.Abertura AS Data, 'OS' AS Tipo
            FROM OS T1
            JOIN Clientes C ON T1.Cliente = C.Raz_o_social
            WHERE T1.Assunto = ? {city_c}
            UNION ALL
            SELECT T2.Cliente, C.Cidade, T2.Criado_em AS Data, 'Atendimento' AS Tipo
            FROM Atendimentos T2
            JOIN Clientes C ON T2.Cliente = C.Raz_o_social
            WHERE T2.Assunto = ? {city_c}
            ORDER BY Data DESC
            LIMIT 300
        """
        data = conn.execute(query, tuple(base_p + base_p)).fetchall()
        return jsonify({'data': [dict(r) for r in data], 'total': len(data)})

    except Exception as e:
        logger.error(f"Erro em complaint_clients: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()


@behavior_bp.route('/churn_clients')
def api_behavior_churn_clients():
    conn = get_db()
    try:
        filter_type  = request.args.get('filter_type',  '').strip()
        filter_value = request.args.get('filter_value', '').strip()
        city         = request.args.get('city',         '').strip()

        has_neg = bool(conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='Contratos_Negativacao'"
        ).fetchone())

        city_sql = "AND Cidade = ?" if city else ""
        city_p   = [city] if city else []

        neg_union = ""
        if has_neg:
            neg_union = f"""
            UNION ALL
            SELECT ID AS Contrato_ID, Cliente, Data_ativa_o,
                   Data_negativa_o AS end_date, Cidade
            FROM Contratos_Negativacao
            WHERE Data_negativa_o IS NOT NULL {city_sql}
            """

        churners_cte = f"""
            Churners AS (
                SELECT ID AS Contrato_ID, Cliente, Data_ativa_o,
                       Data_cancelamento AS end_date, Cidade
                FROM Contratos
                WHERE Status_contrato = 'Inativo'
                  AND Status_acesso = 'Desativado'
                  AND Data_cancelamento IS NOT NULL
                  AND Data_cancelamento != ''
                  {city_sql}
                  AND Cidade IS NOT NULL AND TRIM(Cidade) != '' AND NOT (Cidade GLOB '[0-9]*')
                {neg_union}
            )
        """
        base_p = city_p + (city_p if has_neg else [])

        perm_conditions = {
            '0-3m':   "COALESCE(PM.Meses_Pagos, 0) <= 3",
            '3-6m':   "COALESCE(PM.Meses_Pagos, 0) > 3  AND COALESCE(PM.Meses_Pagos, 0) <= 6",
            '6-12m':  "COALESCE(PM.Meses_Pagos, 0) > 6  AND COALESCE(PM.Meses_Pagos, 0) <= 12",
            '12-24m': "COALESCE(PM.Meses_Pagos, 0) > 12 AND COALESCE(PM.Meses_Pagos, 0) <= 24",
            '24m+':   "COALESCE(PM.Meses_Pagos, 0) > 24",
        }

        month_map = {
            'Jan':'01','Fev':'02','Mar':'03','Abr':'04','Mai':'05','Jun':'06',
            'Jul':'07','Ago':'08','Set':'09','Out':'10','Nov':'11','Dez':'12'
        }

        signal_conditions = {
            'atraso_pre_churn': 'CP.Atrasos_Pre_Churn > 0',
            'historico_atraso': 'CP.Atrasos_Total > 0',
            'com_atendimentos': 'CT.Contrato_ID IS NOT NULL',
            'faturas_vencidas': 'CP.Faturas_Vencidas > 0',
            'pre_6m':           'COALESCE(PM.Meses_Pagos, 0) < 6',
        }

        paid_months_cte = """
            PaidMonths AS (
                SELECT CR.ID_Contrato_Recorrente,
                       SUM(CASE WHEN CR.Data_pagamento IS NOT NULL AND CR.Data_pagamento != ''
                                THEN 1 ELSE 0 END) AS Meses_Pagos
                FROM Contas_a_Receber CR
                WHERE CR.ID_Contrato_Recorrente IN (SELECT Contrato_ID FROM Churners)
                GROUP BY CR.ID_Contrato_Recorrente
            )
        """

        if filter_type == 'permanencia' and filter_value in perm_conditions:
            cond = perm_conditions[filter_value]
            query = f"""
                WITH {churners_cte},
                {paid_months_cte}
                SELECT CH.Cliente, CH.Cidade, CH.Data_ativa_o, CH.end_date,
                       COALESCE(PM.Meses_Pagos, 0) AS Permanencia_Meses
                FROM Churners CH
                LEFT JOIN PaidMonths PM ON CH.Contrato_ID = PM.ID_Contrato_Recorrente
                WHERE CH.end_date IS NOT NULL AND {cond}
                ORDER BY CH.end_date DESC LIMIT 300
            """
            data = conn.execute(query, tuple(base_p)).fetchall()

        elif filter_type == 'mes' and filter_value in month_map:
            month_num = month_map[filter_value]
            query = f"""
                WITH {churners_cte},
                {paid_months_cte}
                SELECT CH.Cliente, CH.Cidade, CH.Data_ativa_o, CH.end_date,
                       COALESCE(PM.Meses_Pagos, 0) AS Permanencia_Meses
                FROM Churners CH
                LEFT JOIN PaidMonths PM ON CH.Contrato_ID = PM.ID_Contrato_Recorrente
                WHERE CH.end_date IS NOT NULL
                  AND STRFTIME('%m', CH.end_date) = ?
                ORDER BY CH.end_date DESC LIMIT 300
            """
            data = conn.execute(query, tuple(base_p + [month_num])).fetchall()

        elif filter_type == 'signal' and filter_value in signal_conditions:
            cond = signal_conditions[filter_value]
            query = f"""
                WITH {churners_cte},
                ChurnPayments AS (
                    SELECT
                        CR.ID_Contrato_Recorrente,
                        SUM(CASE WHEN CR.Data_pagamento > CR.Vencimento THEN 1 ELSE 0 END) AS Atrasos_Total,
                        SUM(CASE WHEN CR.Vencimento <= CH.end_date
                                  AND (CR.Data_pagamento IS NULL OR CR.Data_pagamento = '')
                             THEN 1 ELSE 0 END) AS Faturas_Vencidas,
                        SUM(CASE WHEN CR.Data_pagamento > CR.Vencimento
                                  AND CR.Vencimento >= DATE(CH.end_date, '-60 days')
                                  AND CR.Vencimento <= CH.end_date THEN 1 ELSE 0 END) AS Atrasos_Pre_Churn
                    FROM Contas_a_Receber CR
                    JOIN Churners CH ON CR.ID_Contrato_Recorrente = CH.Contrato_ID
                    GROUP BY CR.ID_Contrato_Recorrente
                ),
                ChurnTickets AS (
                    SELECT DISTINCT CH.Contrato_ID
                    FROM Churners CH
                    JOIN (
                        SELECT Cliente FROM Atendimentos WHERE Cliente IS NOT NULL
                        UNION
                        SELECT Cliente FROM OS WHERE Cliente IS NOT NULL
                    ) T ON CH.Cliente = T.Cliente
                ),
                {paid_months_cte}
                SELECT CH.Cliente, CH.Cidade, CH.Data_ativa_o, CH.end_date,
                       COALESCE(PM.Meses_Pagos, 0) AS Permanencia_Meses
                FROM Churners CH
                LEFT JOIN ChurnPayments CP ON CH.Contrato_ID = CP.ID_Contrato_Recorrente
                LEFT JOIN ChurnTickets CT ON CH.Contrato_ID = CT.Contrato_ID
                LEFT JOIN PaidMonths PM ON CH.Contrato_ID = PM.ID_Contrato_Recorrente
                WHERE CH.end_date IS NOT NULL AND {cond}
                ORDER BY CH.end_date DESC LIMIT 300
            """
            data = conn.execute(query, tuple(base_p)).fetchall()

        else:
            return jsonify({'data': [], 'total': 0})

        return jsonify({'data': [dict(r) for r in data], 'total': len(data)})

    except Exception as e:
        logger.error(f"Erro em churn_clients: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()


@behavior_bp.route('/qos_overview')
def api_behavior_qos_overview():
    conn = get_db()
    try:
        city     = request.args.get('city', '').strip()
        city_sql = "AND C.Cidade = ?" if city else ""
        city_p   = [city] if city else []

        base_join = """
            FROM Clientes_Fibra CF
            JOIN Logins L ON CF.Nome = L.Login
            JOIN Contratos C ON CAST(L.ID_contrato AS INTEGER) = C.ID
            WHERE C.Status_contrato = 'Ativo'
              AND C.Cidade IS NOT NULL AND TRIM(C.Cidade) != '' AND NOT (C.Cidade GLOB '[0-9]*')
        """

        signal_sql = f"""
            SELECT CF.Transmissor AS olt, COUNT(*) AS total,
                   SUM(CASE WHEN CF.Sinal_RX > -20                        THEN 1 ELSE 0 END) AS excelente,
                   SUM(CASE WHEN CF.Sinal_RX <= -20 AND CF.Sinal_RX >= -25 THEN 1 ELSE 0 END) AS boa,
                   SUM(CASE WHEN CF.Sinal_RX < -25 AND CF.Sinal_RX >= -27 THEN 1 ELSE 0 END) AS marginal,
                   SUM(CASE WHEN CF.Sinal_RX < -27                        THEN 1 ELSE 0 END) AS critica
            {base_join}
              AND CF.Sinal_RX IS NOT NULL AND CF.Sinal_RX != 0
              AND CF.Transmissor IS NOT NULL AND CF.Transmissor != '0'
              {city_sql}
            GROUP BY CF.Transmissor ORDER BY total DESC
        """

        onu_sql = f"""
            SELECT CF.ONU_tipo AS onu, COUNT(*) AS count
            {base_join}
              AND CF.ONU_tipo IS NOT NULL AND CF.ONU_tipo != ''
              {city_sql}
            GROUP BY CF.ONU_tipo ORDER BY count DESC LIMIT 10
        """

        instab_sql = f"""
            SELECT CF.Transmissor AS olt, COUNT(*) AS clients,
                   ROUND(AVG(COALESCE(L.Quantidade_de_desconex_es_no_dia_de_hoje, 0)), 1) AS avg_disc,
                   MAX(COALESCE(L.Quantidade_de_desconex_es_no_dia_de_hoje, 0)) AS max_disc
            {base_join}
              AND CF.Transmissor IS NOT NULL AND CF.Transmissor != '0'
              {city_sql}
            GROUP BY CF.Transmissor ORDER BY avg_disc DESC
        """

        kpi_sql = f"""
            SELECT
                SUM(CASE WHEN CF.Sinal_RX < -27 AND CF.Sinal_RX != 0 THEN 1 ELSE 0 END) AS signal_critical,
                SUM(CASE WHEN CF.Sinal_RX IS NOT NULL AND CF.Sinal_RX != 0 THEN 1 ELSE 0 END) AS signal_total,
                SUM(CASE WHEN L.Franquia_atingida = 'S' THEN 1 ELSE 0 END)   AS quota_atingiram,
                SUM(CASE WHEN L.Franquia > 0 THEN 1 ELSE 0 END)              AS quota_total,
                SUM(COALESCE(L.Quantidade_de_desconex_es_no_dia_de_hoje, 0)) AS disc_total
            {base_join} {city_sql}
        """

        signal_data = conn.execute(signal_sql, tuple(city_p)).fetchall()
        onu_data    = conn.execute(onu_sql,    tuple(city_p)).fetchall()
        instab_data = conn.execute(instab_sql, tuple(city_p)).fetchall()
        kpi         = conn.execute(kpi_sql,    tuple(city_p)).fetchone()

        quota_total     = kpi['quota_total']     or 0
        quota_atingiram = kpi['quota_atingiram'] or 0
        quota_pct       = round(100 * quota_atingiram / quota_total, 1) if quota_total > 0 else 0

        cities_data = conn.execute(
            "SELECT DISTINCT Cidade FROM Contratos WHERE Cidade IS NOT NULL AND TRIM(Cidade) != '' AND NOT (Cidade GLOB '[0-9]*') AND Status_contrato = 'Ativo' ORDER BY Cidade"
        ).fetchall()

        return jsonify({
            'signal_by_olt':      [dict(r) for r in signal_data],
            'onu_distribution':   [dict(r) for r in onu_data],
            'instability_by_olt': [dict(r) for r in instab_data],
            'kpis': {
                'signal_critical': kpi['signal_critical'] or 0,
                'signal_total':    kpi['signal_total']    or 0,
                'quota_atingiram': quota_atingiram,
                'quota_pct':       quota_pct,
                'disc_total':      kpi['disc_total']      or 0,
            },
            'cities': [r[0] for r in cities_data if r[0]]
        })
    except Exception as e:
        logger.error(f"Erro em qos_overview: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()


@behavior_bp.route('/signal_clients')
def api_behavior_signal_clients():
    conn = get_db()
    try:
        olt   = request.args.get('olt',   '').strip()
        level = request.args.get('level', '').strip()
        cause = request.args.get('cause', '').strip()
        city  = request.args.get('city',  '').strip()

        filters = ["C.Status_contrato = 'Ativo'", "CF.Sinal_RX IS NOT NULL",
                   "C.Cidade IS NOT NULL", "TRIM(C.Cidade) != ''", "NOT (C.Cidade GLOB '[0-9]*')"]
        params  = []

        if city:  filters.append("C.Cidade = ?");             params.append(city)
        if olt:   filters.append("CF.Transmissor = ?");       params.append(olt)
        if cause: filters.append("CF.Causa_ltima_queda = ?"); params.append(cause)
        if level == 'critical':   filters.append("CF.Sinal_RX < -27 AND CF.Sinal_RX != 0")
        elif level == 'marginal': filters.append("CF.Sinal_RX >= -27 AND CF.Sinal_RX < -25")
        elif level == 'good':     filters.append("CF.Sinal_RX >= -25 AND CF.Sinal_RX <= -20")
        elif level == 'excellent':filters.append("CF.Sinal_RX > -20 AND CF.Sinal_RX != 0")

        where = " AND ".join(filters)
        query = f"""
            SELECT C.Cliente, C.Cidade,
                   CF.Transmissor AS OLT,
                   ROUND(CF.Sinal_RX, 2) AS Sinal_RX,
                   ROUND(CF.Sinal_TX, 2) AS Sinal_TX,
                   COALESCE(CF.Causa_ltima_queda, '-') AS Causa_Queda,
                   COALESCE(CF.Status_ONU, '-')        AS Status_ONU,
                   COALESCE(L.Quantidade_de_desconex_es_no_dia_de_hoje, 0) AS Desconexoes_Hoje
            FROM Clientes_Fibra CF
            JOIN Logins L ON CF.Nome = L.Login
            JOIN Contratos C ON CAST(L.ID_contrato AS INTEGER) = C.ID
            WHERE {where}
            ORDER BY CF.Sinal_RX ASC
            LIMIT 300
        """
        data = conn.execute(query, tuple(params)).fetchall()
        return jsonify({'data': [dict(r) for r in data], 'total': len(data)})
    except Exception as e:
        logger.error(f"Erro em signal_clients: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()


@behavior_bp.route('/temporal_support')
def api_behavior_temporal_support():
    conn = get_db()
    try:
        city        = request.args.get('city', '').strip()
        period      = request.args.get('period', 90, type=int)
        ticket_type = request.args.get('ticket_type', 'both').strip()

        if city:
            os_join   = "JOIN Clientes C ON OS.Cliente = C.Raz_o_social"
            at_join   = "JOIN Clientes C ON A.Cliente = C.Raz_o_social"
            city_filt = "AND C.Cidade = ?"
            city_p    = [city]
        else:
            os_join   = ""
            at_join   = ""
            city_filt = ""
            city_p    = []

        # ── Query 1: volume by hour of day ────────────────────────────────────
        os_hour = f"""
            SELECT CAST(STRFTIME('%H', OS.Abertura) AS INTEGER) AS hour, COUNT(*) AS total
            FROM OS {os_join}
            WHERE OS.Abertura IS NOT NULL
              AND OS.Abertura >= date('now', '-{period} days')
              {city_filt}
            GROUP BY hour
        """
        at_hour = f"""
            SELECT CAST(STRFTIME('%H', A.Criado_em) AS INTEGER) AS hour, COUNT(*) AS total
            FROM Atendimentos A {at_join}
            WHERE A.Criado_em IS NOT NULL
              AND A.Criado_em >= date('now', '-{period} days')
              {city_filt}
            GROUP BY hour
        """
        if ticket_type == 'os':
            hour_union, hour_p = os_hour, city_p[:]
        elif ticket_type == 'atendimento':
            hour_union, hour_p = at_hour, city_p[:]
        else:
            hour_union = f"{os_hour} UNION ALL {at_hour}"
            hour_p     = city_p + city_p

        hour_sql = f"""
            SELECT hour, SUM(total) AS total
            FROM ({hour_union}) GROUP BY hour ORDER BY hour
        """

        # ── Query 2: volume by day of week ────────────────────────────────────
        os_dow = f"""
            SELECT CAST(STRFTIME('%w', OS.Abertura) AS INTEGER) AS dow, COUNT(*) AS total
            FROM OS {os_join}
            WHERE OS.Abertura IS NOT NULL
              AND OS.Abertura >= date('now', '-{period} days')
              {city_filt}
            GROUP BY dow
        """
        at_dow = f"""
            SELECT CAST(STRFTIME('%w', A.Criado_em) AS INTEGER) AS dow, COUNT(*) AS total
            FROM Atendimentos A {at_join}
            WHERE A.Criado_em IS NOT NULL
              AND A.Criado_em >= date('now', '-{period} days')
              {city_filt}
            GROUP BY dow
        """
        if ticket_type == 'os':
            dow_union, dow_p = os_dow, city_p[:]
        elif ticket_type == 'atendimento':
            dow_union, dow_p = at_dow, city_p[:]
        else:
            dow_union = f"{os_dow} UNION ALL {at_dow}"
            dow_p     = city_p + city_p

        dow_sql = f"""
            SELECT dow, SUM(total) AS total
            FROM ({dow_union}) GROUP BY dow ORDER BY dow
        """

        # ── Query 3: weekly trend (last 12 weeks ≈ 84 days) ──────────────────
        os_week = f"""
            SELECT STRFTIME('%Y-%W', OS.Abertura) AS week, COUNT(*) AS total
            FROM OS {os_join}
            WHERE OS.Abertura IS NOT NULL
              AND OS.Abertura >= date('now', '-84 days')
              {city_filt}
            GROUP BY week
        """
        at_week = f"""
            SELECT STRFTIME('%Y-%W', A.Criado_em) AS week, COUNT(*) AS total
            FROM Atendimentos A {at_join}
            WHERE A.Criado_em IS NOT NULL
              AND A.Criado_em >= date('now', '-84 days')
              {city_filt}
            GROUP BY week
        """
        if ticket_type == 'os':
            week_union, week_p = os_week, city_p[:]
        elif ticket_type == 'atendimento':
            week_union, week_p = at_week, city_p[:]
        else:
            week_union = f"{os_week} UNION ALL {at_week}"
            week_p     = city_p + city_p

        week_sql = f"""
            SELECT week, SUM(total) AS total
            FROM ({week_union}) GROUP BY week ORDER BY week LIMIT 12
        """

        # ── Query 4: top 10 subjects ──────────────────────────────────────────
        os_subj = f"""
            SELECT COALESCE(NULLIF(OS.Assunto, ''), 'Sem Assunto') AS assunto, COUNT(*) AS total
            FROM OS {os_join}
            WHERE OS.Abertura IS NOT NULL
              AND OS.Abertura >= date('now', '-{period} days')
              {city_filt}
            GROUP BY assunto
        """
        at_subj = f"""
            SELECT COALESCE(NULLIF(A.Assunto, ''), 'Sem Assunto') AS assunto, COUNT(*) AS total
            FROM Atendimentos A {at_join}
            WHERE A.Criado_em IS NOT NULL
              AND A.Criado_em >= date('now', '-{period} days')
              {city_filt}
            GROUP BY assunto
        """
        if ticket_type == 'os':
            subj_union, subj_p = os_subj, city_p[:]
        elif ticket_type == 'atendimento':
            subj_union, subj_p = at_subj, city_p[:]
        else:
            subj_union = f"{os_subj} UNION ALL {at_subj}"
            subj_p     = city_p + city_p

        subj_sql = f"""
            SELECT assunto, SUM(total) AS total
            FROM ({subj_union}) GROUP BY assunto ORDER BY total DESC LIMIT 10
        """

        cities_sql = """
            SELECT DISTINCT Cidade FROM Clientes
            WHERE Cidade IS NOT NULL AND TRIM(Cidade) != ''
              AND Raz_o_social IN (
                  SELECT Cliente FROM OS WHERE Cliente IS NOT NULL
                  UNION
                  SELECT Cliente FROM Atendimentos WHERE Cliente IS NOT NULL
              )
            ORDER BY Cidade
        """

        hour_rows   = conn.execute(hour_sql,  tuple(hour_p)).fetchall()
        dow_rows    = conn.execute(dow_sql,   tuple(dow_p)).fetchall()
        week_rows   = conn.execute(week_sql,  tuple(week_p)).fetchall()
        subj_rows   = conn.execute(subj_sql,  tuple(subj_p)).fetchall()
        cities_rows = conn.execute(cities_sql).fetchall()

        # Build full 24-hour array (fill zeros for missing hours)
        hour_map = {r['hour']: r['total'] for r in hour_rows}
        by_hour  = [{"hour": h, "label": f"{h:02d}h", "total": hour_map.get(h, 0)} for h in range(24)]

        # Build full weekday array with Portuguese labels
        short_labels = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
        full_labels  = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira',
                        'Quinta-feira', 'Sexta-feira', 'Sábado']
        dow_map    = {r['dow']: r['total'] for r in dow_rows}
        by_weekday = [{"day": d, "label": short_labels[d], "total": dow_map.get(d, 0)} for d in range(7)]

        # KPIs
        total_tickets  = sum(r['total'] for r in hour_rows)
        peak_hour_item = max(by_hour, key=lambda x: x['total'], default=None)
        peak_hour      = f"{peak_hour_item['hour']:02d}h" if peak_hour_item and peak_hour_item['total'] > 0 else "N/A"
        peak_dow_item  = max(by_weekday, key=lambda x: x['total'], default=None)
        peak_weekday   = full_labels[peak_dow_item['day']] if peak_dow_item and peak_dow_item['total'] > 0 else "N/A"
        top_subject    = subj_rows[0]['assunto'] if subj_rows else "N/A"

        return jsonify({
            "kpis": {
                "total_tickets": total_tickets,
                "peak_hour":     peak_hour,
                "peak_weekday":  peak_weekday,
                "top_subject":   top_subject,
            },
            "by_hour":      by_hour,
            "by_weekday":   by_weekday,
            "weekly_trend": [{"week": r['week'],  "total": r['total']} for r in week_rows],
            "top_subjects": [{"assunto": r['assunto'], "total": r['total']} for r in subj_rows],
            "cities":       [r[0] for r in cities_rows if r[0]],
        })

    except Exception as e:
        logger.error(f"Erro em temporal_support: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500
    finally:
        if conn: conn.close()


@behavior_bp.route('/financial_behavior')
def api_behavior_financial_behavior():
    conn = get_db()
    try:
        city          = request.args.get('city', '').strip()
        period_months = request.args.get('period_months', 6, type=int)

        city_cond = "AND Cidade = ?" if city else ""
        city_p    = [city] if city else []

        # ── Query 1: invoice status distribution for active contracts ─────────
        status_sql = f"""
            WITH ActiveContracts AS (
                SELECT ID, Cidade FROM Contratos
                WHERE Status_contrato = 'Ativo' {city_cond}
                  AND Cidade IS NOT NULL AND TRIM(Cidade) != '' AND NOT (Cidade GLOB '[0-9]*')
            )
            SELECT
                CASE
                    WHEN CR.Data_pagamento IS NOT NULL AND CR.Data_pagamento != ''
                         AND CR.Data_pagamento <= CR.Vencimento THEN 'Pago em dia'
                    WHEN CR.Data_pagamento IS NOT NULL AND CR.Data_pagamento != ''
                         AND CR.Data_pagamento >  CR.Vencimento THEN 'Pago com atraso'
                    WHEN CR.Status = 'A receber' AND CR.Vencimento >= date('now') THEN 'A receber no prazo'
                    ELSE 'Vencido não pago'
                END AS status_fatura,
                COUNT(*) AS qtd,
                ROUND(SUM(CAST(CR.Valor AS FLOAT)), 2) AS total_valor
            FROM Contas_a_Receber CR
            JOIN ActiveContracts AC ON CR.ID_Contrato_Recorrente = AC.ID
            WHERE CR.Vencimento >= date('now', '-{period_months} months')
            GROUP BY status_fatura
        """

        # ── Query 2: revenue at risk by city (top 15) ─────────────────────────
        risco_sql = f"""
            WITH ActiveContracts AS (
                SELECT ID, Cidade FROM Contratos
                WHERE Status_contrato = 'Ativo' {city_cond}
                  AND Cidade IS NOT NULL AND TRIM(Cidade) != '' AND NOT (Cidade GLOB '[0-9]*')
            )
            SELECT AC.Cidade AS cidade,
                   ROUND(SUM(CAST(CR.Valor AS FLOAT)), 2) AS valor_vencido,
                   COUNT(*) AS qtd_faturas
            FROM Contas_a_Receber CR
            JOIN ActiveContracts AC ON CR.ID_Contrato_Recorrente = AC.ID
            WHERE CR.Status = 'A receber' AND CR.Vencimento < date('now')
            GROUP BY AC.Cidade ORDER BY valor_vencido DESC LIMIT 15
        """

        # ── Query 3: delay distribution (buckets) ─────────────────────────────
        delay_sql = f"""
            WITH ActiveContracts AS (
                SELECT ID, Cidade FROM Contratos
                WHERE Status_contrato = 'Ativo' {city_cond}
                  AND Cidade IS NOT NULL AND TRIM(Cidade) != '' AND NOT (Cidade GLOB '[0-9]*')
            ),
            DaysLate AS (
                SELECT CR.ID_Contrato_Recorrente,
                    CAST(
                        CASE
                            WHEN CR.Data_pagamento IS NOT NULL AND CR.Data_pagamento != ''
                            THEN JULIANDAY(CR.Data_pagamento) - JULIANDAY(CR.Vencimento)
                            ELSE JULIANDAY(date('now'))       - JULIANDAY(CR.Vencimento)
                        END
                    AS INTEGER) AS days_late
                FROM Contas_a_Receber CR
                JOIN ActiveContracts AC ON CR.ID_Contrato_Recorrente = AC.ID
                WHERE (
                    (CR.Data_pagamento IS NOT NULL AND CR.Data_pagamento != ''
                     AND CR.Data_pagamento > CR.Vencimento)
                    OR (CR.Status = 'A receber' AND CR.Vencimento < date('now'))
                )
            )
            SELECT
                CASE
                    WHEN days_late <= 0  THEN 'Em dia'
                    WHEN days_late <= 7  THEN '1-7 dias'
                    WHEN days_late <= 15 THEN '8-15 dias'
                    WHEN days_late <= 30 THEN '16-30 dias'
                    WHEN days_late <= 60 THEN '31-60 dias'
                    ELSE '60+ dias'
                END AS faixa,
                COUNT(DISTINCT ID_Contrato_Recorrente) AS clientes
            FROM DaysLate
            GROUP BY faixa
            ORDER BY CASE faixa
                WHEN 'Em dia'     THEN 0
                WHEN '1-7 dias'   THEN 1
                WHEN '8-15 dias'  THEN 2
                WHEN '16-30 dias' THEN 3
                WHEN '31-60 dias' THEN 4
                ELSE 5
            END
        """

        # ── Query 4: payment day-of-month concentration ───────────────────────
        payment_day_sql = """
            SELECT CAST(STRFTIME('%d', Data_pagamento) AS INTEGER) AS dia_mes,
                   COUNT(*) AS pagamentos
            FROM Contas_a_Receber
            WHERE Data_pagamento IS NOT NULL AND Data_pagamento != ''
            GROUP BY dia_mes ORDER BY dia_mes
        """

        # ── KPI helper: average days late (paid-late invoices only) ──────────
        media_atraso_sql = f"""
            WITH ActiveContracts AS (
                SELECT ID, Cidade FROM Contratos
                WHERE Status_contrato = 'Ativo' {city_cond}
                  AND Cidade IS NOT NULL AND TRIM(Cidade) != '' AND NOT (Cidade GLOB '[0-9]*')
            )
            SELECT ROUND(AVG(JULIANDAY(CR.Data_pagamento) - JULIANDAY(CR.Vencimento)), 1) AS media_atraso
            FROM Contas_a_Receber CR
            JOIN ActiveContracts AC ON CR.ID_Contrato_Recorrente = AC.ID
            WHERE CR.Data_pagamento IS NOT NULL AND CR.Data_pagamento != ''
              AND CR.Data_pagamento > CR.Vencimento
              AND CR.Vencimento >= date('now', '-{period_months} months')
        """

        # ── KPI helper: clients with 2+ overdue unpaid invoices ───────────────
        multiplos_sql = f"""
            WITH ActiveContracts AS (
                SELECT ID, Cidade FROM Contratos
                WHERE Status_contrato = 'Ativo' {city_cond}
                  AND Cidade IS NOT NULL AND TRIM(Cidade) != '' AND NOT (Cidade GLOB '[0-9]*')
            )
            SELECT COUNT(*) AS cnt FROM (
                SELECT CR.ID_Contrato_Recorrente
                FROM Contas_a_Receber CR
                JOIN ActiveContracts AC ON CR.ID_Contrato_Recorrente = AC.ID
                WHERE CR.Status = 'A receber' AND CR.Vencimento < date('now')
                GROUP BY CR.ID_Contrato_Recorrente
                HAVING COUNT(*) >= 2
            )
        """

        cities_sql = """
            SELECT DISTINCT Cidade FROM Contratos
            WHERE Status_contrato = 'Ativo'
              AND Cidade IS NOT NULL AND TRIM(Cidade) != ''
              AND NOT (Cidade GLOB '[0-9]*')
            ORDER BY Cidade
        """

        status_rows   = conn.execute(status_sql,       tuple(city_p)).fetchall()
        risco_rows    = conn.execute(risco_sql,         tuple(city_p)).fetchall()
        delay_rows    = conn.execute(delay_sql,         tuple(city_p)).fetchall()
        payment_rows  = conn.execute(payment_day_sql).fetchall()
        media_row     = conn.execute(media_atraso_sql,  tuple(city_p)).fetchone()
        multiplos_row = conn.execute(multiplos_sql,     tuple(city_p)).fetchone()
        cities_rows   = conn.execute(cities_sql).fetchall()

        # Compute KPIs from status distribution
        total_qtd      = sum(r['qtd'] for r in status_rows) or 0
        pago_em_dia    = next((r['qtd'] for r in status_rows if r['status_fatura'] == 'Pago em dia'), 0)
        pct_em_dia     = round(100 * pago_em_dia / total_qtd, 1) if total_qtd > 0 else 0.0
        valor_em_risco = next(
            (r['total_valor'] or 0.0 for r in status_rows if r['status_fatura'] == 'Vencido não pago'), 0.0
        )
        media_atraso       = float(media_row['media_atraso'] or 0.0) if media_row else 0.0
        clientes_multiplos = int(multiplos_row['cnt'] or 0) if multiplos_row else 0

        return jsonify({
            "kpis": {
                "pct_em_dia":                 pct_em_dia,
                "valor_em_risco":             valor_em_risco,
                "media_atraso":               media_atraso,
                "clientes_multiplos_vencidos": clientes_multiplos,
            },
            "status_distribution": [
                {"status": r['status_fatura'], "qtd": r['qtd'], "valor": r['total_valor']}
                for r in status_rows
            ],
            "risco_por_cidade": [
                {"cidade": r['cidade'], "valor_vencido": r['valor_vencido'], "qtd_faturas": r['qtd_faturas']}
                for r in risco_rows
            ],
            "distribuicao_atraso": [
                {"faixa": r['faixa'], "clientes": r['clientes']}
                for r in delay_rows
            ],
            "concentracao_pagamento": [
                {"dia_mes": r['dia_mes'], "pagamentos": r['pagamentos']}
                for r in payment_rows
            ],
            "cities": [r[0] for r in cities_rows if r[0]],
        })

    except Exception as e:
        logger.error(f"Erro em financial_behavior: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500
    finally:
        if conn: conn.close()


@behavior_bp.route('/connection_inactivity')
def api_behavior_connection_inactivity():
    conn = get_db()
    try:
        city     = request.args.get('city',     '').strip()
        min_days = request.args.get('min_days', 1,  type=int)

        city_sql = "AND Contratos.Cidade = ?" if city else ""
        city_p   = [city] if city else []

        query = f"""
            SELECT
                Contratos.ID                                                                   AS contrato,
                Contratos.Cliente                                                              AS cliente,
                Contratos.Cidade                                                               AS cidade,
                Logins.Login                                                                   AS login,
                CAST(JULIANDAY('now') - JULIANDAY(Logins.ltima_conex_o_final) AS INTEGER)     AS dias_inativo,
                COALESCE(C.Telefone,  '') AS telefone,
                COALESCE(C.WhatsApp, '') AS whatsapp
            FROM Contratos
            JOIN Logins ON Contratos.ID = Logins.ID_contrato
            LEFT JOIN Clientes C ON Contratos.Cliente = C.Raz_o_social
            WHERE Contratos.Status_contrato = 'Ativo'
              AND Logins.ltima_conex_o_final IS NOT NULL
              AND Logins.ltima_conex_o_final != ''
              {city_sql}
              AND Contratos.Cidade IS NOT NULL AND TRIM(Contratos.Cidade) != '' AND NOT (Contratos.Cidade GLOB '[0-9]*')
        """
        rows = conn.execute(query, tuple(city_p)).fetchall()

        faixas = {"1-7 dias": 0, "8-14 dias": 0, "15-30 dias": 0, "30+ dias": 0}
        total_inativos_30d = 0
        total_inativos_15d = 0
        all_dias           = []
        cidade_map         = {}
        lista_inativos     = []

        for row in rows:
            dias = row['dias_inativo']
            if dias is None:
                continue

            all_dias.append(dias)

            if dias > 30:
                total_inativos_30d += 1
            if dias > 15:
                total_inativos_15d += 1
            if dias > 14:
                cid = row['cidade'] or ''
                cidade_map[cid] = cidade_map.get(cid, 0) + 1

            if dias >= min_days:
                if   1  <= dias <= 7:  faixas["1-7 dias"]   += 1
                elif 8  <= dias <= 14: faixas["8-14 dias"]  += 1
                elif 15 <= dias <= 30: faixas["15-30 dias"] += 1
                elif dias > 30:        faixas["30+ dias"]   += 1

                lista_inativos.append({
                    'contrato':    row['contrato'],
                    'cliente':     row['cliente'],
                    'cidade':      row['cidade'],
                    'dias_inativo': dias,
                    'login':       row['login'],
                    'telefone':    row['telefone'],
                    'whatsapp':    row['whatsapp'],
                })

        lista_inativos.sort(key=lambda x: x['dias_inativo'], reverse=True)

        media_dias = round(sum(all_dias) / len(all_dias), 1) if all_dias else 0.0

        distribuicao = [{"faixa": k, "clientes": v} for k, v in faixas.items()]
        por_cidade   = sorted(
            [{"cidade": k, "inativos": v} for k, v in cidade_map.items()],
            key=lambda x: x['inativos'], reverse=True
        )

        cities_rows = conn.execute("""
            SELECT DISTINCT Cidade FROM Contratos
            WHERE Status_contrato = 'Ativo'
              AND Cidade IS NOT NULL AND TRIM(Cidade) != ''
              AND NOT (Cidade GLOB '[0-9]*')
            ORDER BY Cidade
        """).fetchall()

        return jsonify({
            "kpis": {
                "total_inativos_30d": total_inativos_30d,
                "total_inativos_15d": total_inativos_15d,
                "media_dias_inativo": media_dias,
                "total_monitorados":  len(all_dias),
            },
            "distribuicao":   distribuicao,
            "por_cidade":     por_cidade,
            "lista_inativos": lista_inativos[:200],
            "cities":         [r[0] for r in cities_rows if r[0]],
        })

    except Exception as e:
        logger.error(f"Erro em connection_inactivity: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500
    finally:
        if conn: conn.close()


@behavior_bp.route('/cancellation_seasonality')
def api_behavior_cancellation_seasonality():
    conn = get_db()
    try:
        city     = request.args.get('city', '').strip()
        city_sql = "AND Cidade = ?" if city else ""
        city_p   = [city] if city else []

        base_where = f"""
            WHERE Data_cancelamento IS NOT NULL
              AND Data_cancelamento != ''
              {city_sql}
              AND Cidade IS NOT NULL AND TRIM(Cidade) != '' AND NOT (Cidade GLOB '[0-9]*')
        """

        month_sql = f"""
            SELECT STRFTIME('%m', Data_cancelamento) AS mes_num, COUNT(*) AS total
            FROM Contratos {base_where}
            GROUP BY mes_num ORDER BY mes_num
        """

        dow_sql = f"""
            SELECT CAST(STRFTIME('%w', Data_cancelamento) AS INTEGER) AS dia_num, COUNT(*) AS total
            FROM Contratos {base_where}
            GROUP BY dia_num ORDER BY dia_num
        """

        year_sql = f"""
            SELECT STRFTIME('%Y', Data_cancelamento) AS ano, COUNT(*) AS total
            FROM Contratos {base_where}
            GROUP BY ano ORDER BY ano
        """

        perm_sql = f"""
            SELECT
                CASE
                    WHEN CAST(JULIANDAY(Data_cancelamento) - JULIANDAY(Data_ativa_o) AS INTEGER) / 30 < 3  THEN '0-3 meses'
                    WHEN CAST(JULIANDAY(Data_cancelamento) - JULIANDAY(Data_ativa_o) AS INTEGER) / 30 < 6  THEN '3-6 meses'
                    WHEN CAST(JULIANDAY(Data_cancelamento) - JULIANDAY(Data_ativa_o) AS INTEGER) / 30 < 12 THEN '6-12 meses'
                    WHEN CAST(JULIANDAY(Data_cancelamento) - JULIANDAY(Data_ativa_o) AS INTEGER) / 30 < 24 THEN '12-24 meses'
                    ELSE '24+ meses'
                END AS faixa,
                COUNT(*) AS total
            FROM Contratos
            WHERE Data_cancelamento IS NOT NULL AND Data_cancelamento != ''
              AND Data_ativa_o IS NOT NULL AND Data_ativa_o != ''
              {city_sql}
              AND Cidade IS NOT NULL AND TRIM(Cidade) != '' AND NOT (Cidade GLOB '[0-9]*')
            GROUP BY faixa
        """

        kpi_sql = f"""
            SELECT COUNT(*) AS total,
                   AVG(JULIANDAY(Data_cancelamento) - JULIANDAY(Data_ativa_o)) AS avg_days
            FROM Contratos
            WHERE Data_cancelamento IS NOT NULL AND Data_cancelamento != ''
              AND Data_ativa_o IS NOT NULL AND Data_ativa_o != ''
              {city_sql}
              AND Cidade IS NOT NULL AND TRIM(Cidade) != '' AND NOT (Cidade GLOB '[0-9]*')
        """

        cities_sql = """
            SELECT DISTINCT Cidade FROM Contratos
            WHERE Data_cancelamento IS NOT NULL AND Data_cancelamento != ''
              AND Cidade IS NOT NULL AND TRIM(Cidade) != ''
              AND NOT (Cidade GLOB '[0-9]*')
            ORDER BY Cidade
        """

        month_rows = conn.execute(month_sql, tuple(city_p)).fetchall()
        dow_rows   = conn.execute(dow_sql,   tuple(city_p)).fetchall()
        year_rows  = conn.execute(year_sql,  tuple(city_p)).fetchall()
        perm_rows  = conn.execute(perm_sql,  tuple(city_p)).fetchall()
        kpi_row    = conn.execute(kpi_sql,   tuple(city_p)).fetchone()
        cities     = conn.execute(cities_sql).fetchall()

        month_names = {
            '01': 'Jan', '02': 'Fev', '03': 'Mar', '04': 'Abr',
            '05': 'Mai', '06': 'Jun', '07': 'Jul', '08': 'Ago',
            '09': 'Set', '10': 'Out', '11': 'Nov', '12': 'Dez',
        }
        month_map = {r['mes_num']: r['total'] for r in month_rows}
        por_mes   = [
            {"mes_num": int(k), "mes": v, "total": month_map.get(k, 0)}
            for k, v in sorted(month_names.items())
        ]

        day_short = {0: 'Dom', 1: 'Seg', 2: 'Ter', 3: 'Qua', 4: 'Qui', 5: 'Sex', 6: 'Sáb'}
        day_full  = {
            0: 'Domingo', 1: 'Segunda-feira', 2: 'Terça-feira', 3: 'Quarta-feira',
            4: 'Quinta-feira', 5: 'Sexta-feira', 6: 'Sábado',
        }
        dow_map        = {r['dia_num']: r['total'] for r in dow_rows}
        por_dia_semana = [
            {"dia_num": d, "dia": day_short[d], "total": dow_map.get(d, 0)}
            for d in range(7)
        ]

        total_cancelamentos = kpi_row['total'] if kpi_row else 0
        avg_days            = float(kpi_row['avg_days'] or 0) if kpi_row else 0.0
        media_permanencia   = round(avg_days / 30, 1)

        mes_pico_entry  = max(por_mes,        key=lambda x: x['total'], default=None)
        mes_pico        = mes_pico_entry['mes'] if (mes_pico_entry and mes_pico_entry['total'] > 0) else 'N/A'
        dia_pico_entry  = max(por_dia_semana, key=lambda x: x['total'], default=None)
        dia_semana_pico = day_full[dia_pico_entry['dia_num']] if (dia_pico_entry and dia_pico_entry['total'] > 0) else 'N/A'

        perm_order = ['0-3 meses', '3-6 meses', '6-12 meses', '12-24 meses', '24+ meses']
        perm_map   = {r['faixa']: r['total'] for r in perm_rows}
        por_permanencia = [{"faixa": f, "total": perm_map.get(f, 0)} for f in perm_order]

        return jsonify({
            "kpis": {
                "total_cancelamentos":     total_cancelamentos,
                "mes_pico":                mes_pico,
                "dia_semana_pico":         dia_semana_pico,
                "media_permanencia_meses": media_permanencia,
            },
            "por_mes":        por_mes,
            "por_dia_semana": por_dia_semana,
            "por_ano":        [{"ano": r['ano'], "total": r['total']} for r in year_rows],
            "por_permanencia": por_permanencia,
            "cities":          [r[0] for r in cities if r[0]],
        })

    except Exception as e:
        logger.error(f"Erro em cancellation_seasonality: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500
    finally:
        if conn: conn.close()


@behavior_bp.route('/signal_causes')
def api_behavior_signal_causes():
    """ONU fleet monitoring: type distribution, signal quality buckets, per-OLT stats."""
    conn = get_db()
    try:
        # Clientes_Fibra has no Cidade column — city filter not applicable here
        onu_tipo_sql = """
            SELECT ONU_tipo AS tipo, COUNT(*) AS total
            FROM Clientes_Fibra
            WHERE ONU_tipo IS NOT NULL AND ONU_tipo != ''
            GROUP BY tipo ORDER BY total DESC LIMIT 15
        """

        sinal_qualidade_sql = """
            SELECT
                SUM(CASE WHEN Sinal_RX > -20                        THEN 1 ELSE 0 END) AS excelente,
                SUM(CASE WHEN Sinal_RX <= -20 AND Sinal_RX >= -25   THEN 1 ELSE 0 END) AS boa,
                SUM(CASE WHEN Sinal_RX <  -25 AND Sinal_RX >= -27   THEN 1 ELSE 0 END) AS marginal,
                SUM(CASE WHEN Sinal_RX <  -27                       THEN 1 ELSE 0 END) AS critica,
                COUNT(Sinal_RX)                                                         AS com_sinal,
                COUNT(*)                                                                AS total
            FROM Clientes_Fibra
        """

        por_olt_sql = """
            SELECT
                Transmissor AS olt,
                COUNT(*) AS total,
                ROUND(AVG(Sinal_RX), 2) AS avg_rx,
                SUM(CASE WHEN Sinal_RX < -27 THEN 1 ELSE 0 END) AS criticos
            FROM Clientes_Fibra
            WHERE Transmissor IS NOT NULL AND Transmissor != '' AND Transmissor != '0'
            GROUP BY olt
            ORDER BY total DESC LIMIT 20
        """

        cities_sql = """
            SELECT DISTINCT Cidade FROM Contratos
            WHERE Status_contrato = 'Ativo'
              AND Cidade IS NOT NULL AND TRIM(Cidade) != ''
              AND NOT (Cidade GLOB '[0-9]*')
            ORDER BY Cidade
        """

        onu_tipo_rows = conn.execute(onu_tipo_sql).fetchall()
        kpi_row       = conn.execute(sinal_qualidade_sql).fetchone()
        olt_rows      = conn.execute(por_olt_sql).fetchall()
        cities        = conn.execute(cities_sql).fetchall()

        total      = kpi_row['total']     if kpi_row else 0
        com_sinal  = kpi_row['com_sinal'] if kpi_row else 0
        criticos   = kpi_row['critica']   if kpi_row else 0
        pct_critico = round(100 * criticos / com_sinal, 1) if com_sinal > 0 else 0.0

        qualidade_labels = ['Excelente (> -20)', 'Boa (-20 a -25)', 'Marginal (-25 a -27)', 'Crítico (< -27)']
        qualidade_vals   = [
            kpi_row['excelente'] or 0,
            kpi_row['boa']       or 0,
            kpi_row['marginal']  or 0,
            kpi_row['critica']   or 0,
        ] if kpi_row else [0, 0, 0, 0]

        return jsonify({
            "kpis": {
                "total_onus":    total,
                "com_sinal":     com_sinal,
                "sem_sinal":     total - com_sinal,
                "pct_critico":   pct_critico,
            },
            "por_onu_tipo":     [{"tipo": r['tipo'], "total": r['total']} for r in onu_tipo_rows],
            "qualidade_labels": qualidade_labels,
            "qualidade_vals":   qualidade_vals,
            "por_olt":          [
                {"olt": r['olt'], "total": r['total'],
                 "avg_rx": r['avg_rx'] or 0, "criticos": r['criticos'] or 0}
                for r in olt_rows
            ],
            "cities": [r[0] for r in cities if r[0]],
        })

    except Exception as e:
        logger.error(f"Erro em signal_causes: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500
    finally:
        if conn: conn.close()


@behavior_bp.route('/contact_list')
def api_behavior_contact_list():
    conn = get_db()
    try:
        city       = request.args.get('city',       '').strip()
        risk_level = request.args.get('risk_level', '').strip()
        min_score  = request.args.get('min_score',  25,  type=int)
        limit      = request.args.get('limit',      200, type=int)
        offset     = request.args.get('offset',     0,   type=int)

        city_cond = "AND Cidade = ?" if city else ""
        city_p    = [city] if city else []

        risk_sql = ""
        if risk_level in ('Altíssimo', 'Altissimo'):
            risk_sql = "AND score > 160"
        elif risk_level == 'Alto':
            risk_sql = "AND score > 60 AND score <= 160"
        elif risk_level in ('Médio', 'Medio'):
            risk_sql = "AND score > 25 AND score <= 60"
        elif risk_level == 'Baixo':
            risk_sql = "AND score >= 10 AND score <= 25"

        base_cte = f"""
            WITH ActiveContracts AS (
                SELECT ID, Cliente, Cidade, Data_ativa_o, Status_contrato, Status_acesso
                FROM Contratos
                WHERE Status_contrato = 'Ativo'
                  AND Status_acesso != 'Desativado'
                  {city_cond}
                  AND Cidade IS NOT NULL AND TRIM(Cidade) != '' AND NOT (Cidade GLOB '[0-9]*')
                  AND NOT EXISTS (
                      SELECT 1 FROM Acompanhamento_Clientes
                      WHERE contrato_id = ID
                        AND snooze_ate IS NOT NULL
                        AND snooze_ate > date('now')
                  )
            ),
            PaymentProfile AS (
                SELECT
                    CR.ID_Contrato_Recorrente,
                    SUM(CASE WHEN CR.Status = 'A receber'
                              AND CR.Vencimento < date('now') THEN 1 ELSE 0 END) AS Faturas_Vencidas,
                    MAX(CASE WHEN CR.Status = 'A receber' AND CR.Vencimento < date('now')
                             THEN CAST(JULIANDAY(date('now')) - JULIANDAY(CR.Vencimento) AS INTEGER)
                             END) AS Dias_Vencido,
                    SUM(CASE WHEN CR.Data_pagamento > CR.Vencimento
                              AND CR.Vencimento >= date('now', '-90 days') THEN 1 ELSE 0 END) AS Atrasos_90d,
                    ROUND(AVG(CASE WHEN CR.Data_pagamento IS NOT NULL
                                   THEN JULIANDAY(CR.Data_pagamento) - JULIANDAY(CR.Vencimento)
                                   END), 1) AS Media_Atraso,
                    ROUND(SUM(CASE WHEN CR.Status = 'A receber' AND CR.Vencimento < date('now')
                                   THEN CR.Valor ELSE 0 END), 2) AS Valor_Vencido
                FROM Contas_a_Receber CR
                WHERE CR.ID_Contrato_Recorrente IN (SELECT ID FROM ActiveContracts)
                GROUP BY CR.ID_Contrato_Recorrente
            ),
            RecentTickets AS (
                SELECT Cliente, COUNT(*) AS Atendimentos_30d
                FROM (
                    SELECT Cliente FROM Atendimentos
                    WHERE Criado_em >= date('now', '-30 days') AND Cliente IS NOT NULL
                    UNION ALL
                    SELECT Cliente FROM OS
                    WHERE Abertura >= date('now', '-30 days') AND Cliente IS NOT NULL
                )
                GROUP BY Cliente
            ),
            ConnectionStatus AS (
                SELECT ID_contrato,
                       CAST(JULIANDAY(date('now')) - JULIANDAY(MAX(ltima_conex_o_final))
                            AS INTEGER) AS Dias_Sem_Conexao
                FROM Logins
                WHERE ltima_conex_o_final IS NOT NULL AND ID_contrato IS NOT NULL
                GROUP BY ID_contrato
            ),
            Scored AS (
                SELECT
                    AC.ID            AS contrato,
                    AC.Cliente       AS cliente,
                    AC.Cidade        AS cidade,
                    AC.Status_acesso AS status_acesso,
                    COALESCE(PP.Faturas_Vencidas, 0) AS fat_vencidas,
                    COALESCE(PP.Dias_Vencido, 0)     AS dias_vencido,
                    COALESCE(PP.Atrasos_90d, 0)      AS atrasos_90d,
                    COALESCE(PP.Valor_Vencido, 0)    AS val_vencido,
                    COALESCE(RT.Atendimentos_30d, 0) AS atend_30d,
                    COALESCE(CS.Dias_Sem_Conexao, 0) AS sem_conexao,
                    (
                        COALESCE(PP.Faturas_Vencidas, 0) * 25
                        + CASE WHEN COALESCE(PP.Dias_Vencido, 0) > 60 THEN 30
                               WHEN COALESCE(PP.Dias_Vencido, 0) > 30 THEN 15
                               ELSE 0 END
                        + MIN(COALESCE(PP.Atrasos_90d, 0), 5) * 8
                        + CASE WHEN COALESCE(PP.Media_Atraso, 0) > 30 THEN 15
                               WHEN COALESCE(PP.Media_Atraso, 0) > 15 THEN 7
                               ELSE 0 END
                        + MIN(COALESCE(RT.Atendimentos_30d, 0), 3) * 8
                        + CASE WHEN COALESCE(CS.Dias_Sem_Conexao, 0) > 30 THEN 20
                               WHEN COALESCE(CS.Dias_Sem_Conexao, 0) > 14 THEN 10
                               ELSE 0 END
                    ) AS score
                FROM ActiveContracts AC
                LEFT JOIN PaymentProfile PP ON AC.ID = PP.ID_Contrato_Recorrente
                LEFT JOIN RecentTickets RT ON AC.Cliente = RT.Cliente
                LEFT JOIN ConnectionStatus CS ON AC.ID = CS.ID_contrato
                WHERE (
                    COALESCE(PP.Faturas_Vencidas, 0) > 0
                    OR COALESCE(PP.Atrasos_90d, 0) > 1
                    OR COALESCE(RT.Atendimentos_30d, 0) > 1
                    OR COALESCE(CS.Dias_Sem_Conexao, 0) > 14
                )
            )
        """

        summary_sql = base_cte + f"""
            SELECT
                SUM(CASE WHEN score > 160                 THEN 1 ELSE 0 END) AS altissimo,
                SUM(CASE WHEN score > 60 AND score <= 160 THEN 1 ELSE 0 END) AS alto,
                SUM(CASE WHEN score > 25 AND score <= 60  THEN 1 ELSE 0 END) AS medio,
                SUM(CASE WHEN score >= 10 AND score <= 25 THEN 1 ELSE 0 END) AS baixo,
                COUNT(*) AS total
            FROM Scored WHERE score >= {min_score}
        """

        count_sql = base_cte + f"""
            SELECT COUNT(*) AS cnt FROM Scored WHERE score >= {min_score} {risk_sql}
        """

        data_sql = base_cte + f"""
            SELECT
                S.contrato, S.cliente, S.cidade, S.status_acesso,
                S.fat_vencidas, S.dias_vencido, S.atrasos_90d, S.val_vencido,
                S.atend_30d, S.sem_conexao, S.score,
                CASE WHEN S.score > 160  THEN 'Altíssimo'
                     WHEN S.score > 60   THEN 'Alto'
                     WHEN S.score > 25   THEN 'Médio'
                     WHEN S.score >= 10  THEN 'Baixo'
                     ELSE 'Saudável' END AS risco,
                COALESCE(CLI.Telefone,  '') AS telefone,
                COALESCE(CLI.WhatsApp, '') AS whatsapp
            FROM Scored S
            LEFT JOIN Clientes CLI ON CLI.Raz_o_social = S.cliente
            WHERE S.score >= {min_score} {risk_sql}
            ORDER BY S.score DESC
            LIMIT ? OFFSET ?
        """

        cities_sql = """
            SELECT DISTINCT Cidade FROM Contratos
            WHERE Status_contrato = 'Ativo'
              AND Cidade IS NOT NULL AND TRIM(Cidade) != ''
              AND Cidade NOT GLOB '*[0-9]*'
            ORDER BY Cidade
        """

        summary_row = conn.execute(summary_sql, tuple(city_p)).fetchone()
        total_rows  = conn.execute(count_sql,   tuple(city_p)).fetchone()[0]
        data        = [dict(r) for r in conn.execute(data_sql, tuple(city_p) + (limit, offset)).fetchall()]
        cities      = [r[0] for r in conn.execute(cities_sql).fetchall() if r[0]]

        summary = dict(summary_row) if summary_row else {"altissimo": 0, "alto": 0, "medio": 0, "baixo": 0, "total": 0}

        return jsonify({
            "data":       data,
            "summary":    summary,
            "total_rows": total_rows,
            "cities":     cities,
        })

    except Exception as e:
        logger.error(f"Erro em contact_list: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500
    finally:
        if conn: conn.close()


# ---------------------------------------------------------------------------
# Route 1: /action_alerts
# 4-tier urgency list based on the same scoring CTE as /contact_list
# ---------------------------------------------------------------------------
@behavior_bp.route('/action_alerts')
def api_behavior_action_alerts():
    conn = get_db()
    try:
        _ensure_acompanhamento_table(conn)
        city    = request.args.get('city',    '').strip()
        tier    = request.args.get('tier',    '').strip()
        cliente = request.args.get('cliente', '').strip()
        limit   = request.args.get('limit',  50,  type=int)
        offset  = request.args.get('offset', 0,   type=int)

        city_cond    = "AND Cidade = ?" if city else ""
        city_p       = [city] if city else []

        tier_cond    = "AND tier = ?" if tier else ""
        tier_p       = [tier] if tier else []

        cliente_cond = "AND A.cliente LIKE ?" if cliente else ""
        cliente_p    = [f"%{cliente}%"] if cliente else []

        # Identical base CTE to /contact_list, extended with the Alerted tier CTE
        base_cte = f"""
            WITH ActiveContracts AS (
                SELECT ID, Cliente, Cidade, Data_ativa_o, Status_contrato, Status_acesso
                FROM Contratos
                WHERE Status_contrato = 'Ativo'
                  AND Status_acesso != 'Desativado'
                  {city_cond}
                  AND Cidade IS NOT NULL AND TRIM(Cidade) != '' AND NOT (Cidade GLOB '[0-9]*')
                  AND NOT EXISTS (
                      SELECT 1 FROM Acompanhamento_Clientes
                      WHERE contrato_id = ID
                        AND snooze_ate IS NOT NULL
                        AND snooze_ate > date('now')
                  )
            ),
            PaymentProfile AS (
                SELECT
                    CR.ID_Contrato_Recorrente,
                    SUM(CASE WHEN CR.Status = 'A receber'
                              AND CR.Vencimento < date('now') THEN 1 ELSE 0 END) AS Faturas_Vencidas,
                    MAX(CASE WHEN CR.Status = 'A receber' AND CR.Vencimento < date('now')
                             THEN CAST(JULIANDAY(date('now')) - JULIANDAY(CR.Vencimento) AS INTEGER)
                             END) AS Dias_Vencido,
                    SUM(CASE WHEN CR.Data_pagamento > CR.Vencimento
                              AND CR.Vencimento >= date('now', '-90 days') THEN 1 ELSE 0 END) AS Atrasos_90d,
                    ROUND(AVG(CASE WHEN CR.Data_pagamento IS NOT NULL
                                   THEN JULIANDAY(CR.Data_pagamento) - JULIANDAY(CR.Vencimento)
                                   END), 1) AS Media_Atraso,
                    ROUND(SUM(CASE WHEN CR.Status = 'A receber' AND CR.Vencimento < date('now')
                                   THEN CR.Valor ELSE 0 END), 2) AS Valor_Vencido
                FROM Contas_a_Receber CR
                WHERE CR.ID_Contrato_Recorrente IN (SELECT ID FROM ActiveContracts)
                GROUP BY CR.ID_Contrato_Recorrente
            ),
            RecentTickets AS (
                SELECT Cliente, COUNT(*) AS Atendimentos_30d
                FROM (
                    SELECT Cliente FROM Atendimentos
                    WHERE Criado_em >= date('now', '-30 days') AND Cliente IS NOT NULL
                    UNION ALL
                    SELECT Cliente FROM OS
                    WHERE Abertura >= date('now', '-30 days') AND Cliente IS NOT NULL
                )
                GROUP BY Cliente
            ),
            ConnectionStatus AS (
                SELECT ID_contrato,
                       CAST(JULIANDAY(date('now')) - JULIANDAY(MAX(ltima_conex_o_final))
                            AS INTEGER) AS Dias_Sem_Conexao
                FROM Logins
                WHERE ltima_conex_o_final IS NOT NULL AND ID_contrato IS NOT NULL
                GROUP BY ID_contrato
            ),
            Scored AS (
                SELECT
                    AC.ID            AS contrato,
                    AC.Cliente       AS cliente,
                    AC.Cidade        AS cidade,
                    AC.Status_acesso AS status_acesso,
                    COALESCE(PP.Faturas_Vencidas, 0) AS fat_vencidas,
                    COALESCE(PP.Dias_Vencido, 0)     AS dias_vencido,
                    COALESCE(PP.Atrasos_90d, 0)      AS atrasos_90d,
                    COALESCE(PP.Valor_Vencido, 0)    AS val_vencido,
                    COALESCE(RT.Atendimentos_30d, 0) AS atend_30d,
                    COALESCE(CS.Dias_Sem_Conexao, 0) AS sem_conexao,
                    (
                        COALESCE(PP.Faturas_Vencidas, 0) * 25
                        + CASE WHEN COALESCE(PP.Dias_Vencido, 0) > 60 THEN 30
                               WHEN COALESCE(PP.Dias_Vencido, 0) > 30 THEN 15
                               ELSE 0 END
                        + MIN(COALESCE(PP.Atrasos_90d, 0), 5) * 8
                        + CASE WHEN COALESCE(PP.Media_Atraso, 0) > 30 THEN 15
                               WHEN COALESCE(PP.Media_Atraso, 0) > 15 THEN 7
                               ELSE 0 END
                        + MIN(COALESCE(RT.Atendimentos_30d, 0), 3) * 8
                        + CASE WHEN COALESCE(CS.Dias_Sem_Conexao, 0) > 30 THEN 20
                               WHEN COALESCE(CS.Dias_Sem_Conexao, 0) > 14 THEN 10
                               ELSE 0 END
                    ) AS score
                FROM ActiveContracts AC
                LEFT JOIN PaymentProfile PP ON AC.ID = PP.ID_Contrato_Recorrente
                LEFT JOIN RecentTickets RT ON AC.Cliente = RT.Cliente
                LEFT JOIN ConnectionStatus CS ON AC.ID = CS.ID_contrato
                WHERE (
                    COALESCE(PP.Faturas_Vencidas, 0) > 0
                    OR COALESCE(PP.Atrasos_90d, 0) > 1
                    OR COALESCE(RT.Atendimentos_30d, 0) > 1
                    OR COALESCE(CS.Dias_Sem_Conexao, 0) > 14
                )
            ),
            Alerted AS (
                SELECT *,
                    CASE
                        WHEN sem_conexao >= 30 AND fat_vencidas >= 1 THEN 'Crítico'
                        WHEN fat_vencidas >= 3 OR dias_vencido >= 60 THEN 'Alto'
                        WHEN fat_vencidas >= 2 OR (fat_vencidas >= 1 AND atend_30d >= 2) THEN 'Médio'
                        WHEN fat_vencidas >= 1 THEN 'Baixo'
                    END AS tier
                FROM Scored
                WHERE (sem_conexao >= 30 AND fat_vencidas >= 1) OR fat_vencidas >= 1
            )
        """

        summary_sql = base_cte + """
            SELECT
                SUM(CASE WHEN tier = 'Crítico' THEN 1 ELSE 0 END) AS critico,
                SUM(CASE WHEN tier = 'Alto'    THEN 1 ELSE 0 END) AS alto,
                SUM(CASE WHEN tier = 'Médio'   THEN 1 ELSE 0 END) AS medio,
                SUM(CASE WHEN tier = 'Baixo'   THEN 1 ELSE 0 END) AS baixo,
                COUNT(*) AS total
            FROM Alerted
        """

        count_sql = base_cte + f"""
            SELECT COUNT(*) AS cnt FROM Alerted A WHERE 1=1 {tier_cond} {cliente_cond}
        """

        data_sql = base_cte + f"""
            SELECT A.contrato, A.cliente, A.cidade, A.fat_vencidas, A.dias_vencido,
                   A.atend_30d, A.sem_conexao, A.score, A.tier,
                   COALESCE(CLI.Telefone, '') AS telefone,
                   COALESCE(CLI.WhatsApp, '') AS whatsapp
            FROM Alerted A
            LEFT JOIN Clientes CLI ON CLI.Raz_o_social = A.cliente
            WHERE 1=1 {tier_cond} {cliente_cond}
            ORDER BY A.score DESC
            LIMIT ? OFFSET ?
        """

        cities_sql = """
            SELECT DISTINCT Cidade FROM Contratos
            WHERE Status_contrato = 'Ativo'
              AND Cidade IS NOT NULL AND TRIM(Cidade) != ''
              AND Cidade NOT GLOB '*[0-9]*'
            ORDER BY Cidade
        """

        summary_row = conn.execute(summary_sql, tuple(city_p)).fetchone()
        total_rows  = conn.execute(count_sql,   tuple(city_p) + tuple(tier_p) + tuple(cliente_p)).fetchone()[0]
        data_rows   = conn.execute(data_sql,    tuple(city_p) + tuple(tier_p) + tuple(cliente_p) + (limit, offset)).fetchall()
        cities      = [r[0] for r in conn.execute(cities_sql).fetchall() if r[0]]

        summary = dict(summary_row) if summary_row else {
            "critico": 0, "alto": 0, "medio": 0, "baixo": 0, "total": 0
        }

        def make_acao(r):
            if r['tier'] == 'Crítico':
                return (f"Ligar AGORA — cliente offline há {r['sem_conexao']} dias com fatura vencida. "
                        f"Ofereça desconto de reativação ou plano mais acessível.")
            elif r['tier'] == 'Alto':
                return (f"Negociar parcelamento urgente antes da suspensão. "
                        f"{r['fat_vencidas']} fatura(s) vencida(s), maior atraso: {r['dias_vencido']} dias.")
            elif r['tier'] == 'Médio':
                return (f"Enviar WhatsApp + verificar qualidade técnica. "
                        f"{r['fat_vencidas']} fatura(s) vencida(s) e {r['atend_30d']} atendimento(s) recente(s).")
            else:
                return f"Enviar lembrete amigável pelo WhatsApp — 1ª fatura em atraso há {r['dias_vencido']} dias."

        data = []
        for r in data_rows:
            row = dict(r)
            row['acao'] = make_acao(row)
            data.append(row)

        return jsonify({
            "summary":    summary,
            "data":       data,
            "total_rows": total_rows,
            "cities":     cities,
        })

    except Exception as e:
        logger.error(f"Erro em action_alerts: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500
    finally:
        if conn: conn.close()


# ---------------------------------------------------------------------------
# Route 2: /canc_reasons
# Cancellation reasons breakdown with permanence and yearly trends
# ---------------------------------------------------------------------------
@behavior_bp.route('/canc_reasons')
def api_behavior_canc_reasons():
    conn = get_db()
    try:
        MOTIVO_LABELS = {
            1:  'Alteração de contrato',
            2:  'Cancelamento renegociação',
            3:  'A pedido do cliente',
            4:  'Pendência financeira',
            5:  'Migração de plano',
            8:  'Migração de vencimento',
            9:  'Cancelamento',
            10: 'Insatisfação',
            11: 'Mudança de endereço',
            12: 'Dificuldades financeiras',
            13: 'Viagem',
            14: 'Término de contrato',
            15: 'Suspensão temporária',
        }

        kpi_row = conn.execute("""
            WITH PaidMonths AS (
                SELECT CR.ID_Contrato_Recorrente,
                       SUM(CASE WHEN CR.Data_pagamento IS NOT NULL AND CR.Data_pagamento != ''
                                THEN 1 ELSE 0 END) AS Meses_Pagos
                FROM Contas_a_Receber CR
                INNER JOIN Contratos C2 ON CR.ID_Contrato_Recorrente = C2.ID
                WHERE C2.Data_cancelamento IS NOT NULL AND C2.Data_cancelamento != ''
                  AND C2.Cidade IS NOT NULL AND TRIM(C2.Cidade) != '' AND NOT (C2.Cidade GLOB '[0-9]*')
                GROUP BY CR.ID_Contrato_Recorrente
            )
            SELECT
                COUNT(C.ID) AS total,
                SUM(CASE WHEN C.Motivo_cancelamento IS NULL
                              OR TRIM(C.Motivo_cancelamento) = ''
                              OR CAST(C.Motivo_cancelamento AS INTEGER) = 0
                         THEN 1 ELSE 0 END) AS sem_motivo,
                AVG(CASE WHEN C.Motivo_cancelamento IS NOT NULL
                              AND TRIM(C.Motivo_cancelamento) != ''
                              AND CAST(C.Motivo_cancelamento AS INTEGER) != 0
                         THEN COALESCE(PM.Meses_Pagos, 0) END) AS avg_permanencia
            FROM Contratos C
            LEFT JOIN PaidMonths PM ON PM.ID_Contrato_Recorrente = C.ID
            WHERE C.Data_cancelamento IS NOT NULL AND C.Data_cancelamento != ''
              AND C.Cidade IS NOT NULL AND TRIM(C.Cidade) != '' AND NOT (C.Cidade GLOB '[0-9]*')
        """).fetchone()

        motivo_rows = conn.execute("""
            WITH PaidMonths AS (
                SELECT CR.ID_Contrato_Recorrente,
                       SUM(CASE WHEN CR.Data_pagamento IS NOT NULL AND CR.Data_pagamento != ''
                                THEN 1 ELSE 0 END) AS Meses_Pagos
                FROM Contas_a_Receber CR
                INNER JOIN Contratos C2 ON CR.ID_Contrato_Recorrente = C2.ID
                WHERE C2.Data_cancelamento IS NOT NULL AND C2.Data_cancelamento != ''
                  AND C2.Motivo_cancelamento IS NOT NULL
                  AND TRIM(C2.Motivo_cancelamento) != ''
                  AND CAST(C2.Motivo_cancelamento AS INTEGER) != 0
                  AND C2.Cidade IS NOT NULL AND TRIM(C2.Cidade) != '' AND NOT (C2.Cidade GLOB '[0-9]*')
                GROUP BY CR.ID_Contrato_Recorrente
            )
            SELECT
                CAST(C.Motivo_cancelamento AS INTEGER) AS motivo_id,
                COUNT(*) AS total,
                AVG(COALESCE(PM.Meses_Pagos, 0)) AS avg_meses
            FROM Contratos C
            LEFT JOIN PaidMonths PM ON PM.ID_Contrato_Recorrente = C.ID
            WHERE C.Data_cancelamento IS NOT NULL AND C.Data_cancelamento != ''
              AND C.Motivo_cancelamento IS NOT NULL
              AND TRIM(C.Motivo_cancelamento) != ''
              AND CAST(C.Motivo_cancelamento AS INTEGER) != 0
              AND C.Cidade IS NOT NULL AND TRIM(C.Cidade) != '' AND NOT (C.Cidade GLOB '[0-9]*')
            GROUP BY C.Motivo_cancelamento
            ORDER BY total DESC
        """).fetchall()

        grand_total = kpi_row['total'] or 1

        por_motivo = []
        top_motivo = None
        top_motivo_count = 0
        for r in motivo_rows:
            mid   = r['motivo_id']
            label = MOTIVO_LABELS.get(mid, f'Código {mid}')
            cnt   = r['total']
            if cnt > top_motivo_count:
                top_motivo_count = cnt
                top_motivo = label
            por_motivo.append({
                "motivo_id": mid,
                "label":     label,
                "total":     cnt,
                "pct":       round(cnt / grand_total * 100, 1),
                "avg_meses": round(r['avg_meses'] or 0, 1),
            })

        # Top-5 motivo_ids for the yearly breakdown
        top5_ids = [r['motivo_id'] for r in motivo_rows[:5]]

        por_ano = []
        if top5_ids:
            placeholders = ','.join('?' * len(top5_ids))
            ano_rows = conn.execute(f"""
                SELECT
                    STRFTIME('%Y', Data_cancelamento) AS ano,
                    CAST(Motivo_cancelamento AS INTEGER) AS motivo_id,
                    COUNT(*) AS total
                FROM Contratos
                WHERE Data_cancelamento IS NOT NULL AND Data_cancelamento != ''
                  AND Motivo_cancelamento IS NOT NULL
                  AND TRIM(Motivo_cancelamento) != ''
                  AND CAST(Motivo_cancelamento AS INTEGER) IN ({placeholders})
                  AND Cidade IS NOT NULL AND TRIM(Cidade) != '' AND NOT (Cidade GLOB '[0-9]*')
                GROUP BY ano, Motivo_cancelamento
                ORDER BY ano, total DESC
            """, top5_ids).fetchall()

            for r in ano_rows:
                mid = r['motivo_id']
                por_ano.append({
                    "ano":   r['ano'],
                    "label": MOTIVO_LABELS.get(mid, f'Código {mid}'),
                    "total": r['total'],
                })

        total_geral  = kpi_row['total'] or 0
        sem_motivo   = kpi_row['sem_motivo'] or 0
        com_motivo   = total_geral - sem_motivo

        return jsonify({
            "kpis": {
                "total":           total_geral,
                "com_motivo":      com_motivo,
                "sem_motivo":      sem_motivo,
                "top_motivo":      top_motivo or '',
                "avg_permanencia": round(kpi_row['avg_permanencia'] or 0, 1),
            },
            "por_motivo": por_motivo,
            "por_ano":    por_ano,
        })

    except Exception as e:
        logger.error(f"Erro em canc_reasons: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500
    finally:
        if conn: conn.close()


# ---------------------------------------------------------------------------
# Route 3: /pre_canc_behavior
# Behavioral signals present in cancelled contracts
# ---------------------------------------------------------------------------
@behavior_bp.route('/pre_canc_behavior')
def api_behavior_pre_canc_behavior():
    conn = get_db()
    try:
        # Filtro para excluir cidades nulas, vazias ou com valores numéricos (dados inválidos)
        VALID_CITY = """
            c.Cidade IS NOT NULL
            AND TRIM(c.Cidade) != ''
            AND NOT (c.Cidade GLOB '[0-9]*')
        """

        kpi_row = conn.execute(f"""
            SELECT
                COUNT(*) AS total_cancelled,
                SUM(CASE WHEN pp.fat_vencidas > 0 THEN 1 ELSE 0 END) AS had_overdue,
                SUM(CASE WHEN att.cnt > 0 THEN 1 ELSE 0 END) AS had_tickets,
                AVG((JULIANDAY(c.Data_cancelamento) - JULIANDAY(c.Data_ativa_o)) / 30.44) AS avg_meses
            FROM Contratos c
            LEFT JOIN (
                SELECT cr.ID_Contrato_Recorrente, COUNT(*) AS fat_vencidas
                FROM Contas_a_Receber cr
                WHERE cr.Status = 'A receber'
                GROUP BY cr.ID_Contrato_Recorrente
            ) pp ON c.ID = pp.ID_Contrato_Recorrente
            LEFT JOIN (
                SELECT a.Cliente, COUNT(*) AS cnt
                FROM Atendimentos a
                WHERE a.Criado_em >= date('now', '-365 days')
                GROUP BY a.Cliente
            ) att ON c.Cliente = att.Cliente
            WHERE c.Data_cancelamento IS NOT NULL AND c.Data_cancelamento != ''
              AND c.Data_ativa_o IS NOT NULL AND c.Data_ativa_o != ''
              AND {VALID_CITY}
        """).fetchone()

        sinais_rows = conn.execute(f"""
            SELECT
                (CASE WHEN pp.fat_vencidas > 0 THEN 1 ELSE 0 END) +
                (CASE WHEN att.cnt > 0 THEN 1 ELSE 0 END) AS num_sinais,
                COUNT(*) AS total
            FROM Contratos c
            LEFT JOIN (
                SELECT cr.ID_Contrato_Recorrente, COUNT(*) AS fat_vencidas
                FROM Contas_a_Receber cr
                WHERE cr.Status = 'A receber'
                GROUP BY cr.ID_Contrato_Recorrente
            ) pp ON c.ID = pp.ID_Contrato_Recorrente
            LEFT JOIN (
                SELECT a.Cliente, COUNT(*) AS cnt
                FROM Atendimentos a
                WHERE a.Criado_em >= date('now', '-365 days')
                GROUP BY a.Cliente
            ) att ON c.Cliente = att.Cliente
            WHERE c.Data_cancelamento IS NOT NULL AND c.Data_cancelamento != ''
              AND c.Data_ativa_o IS NOT NULL AND c.Data_ativa_o != ''
              AND {VALID_CITY}
            GROUP BY num_sinais
            ORDER BY num_sinais
        """).fetchall()

        perm_rows = conn.execute(f"""
            SELECT faixa, COUNT(*) AS total
            FROM (
                SELECT
                    CASE
                        WHEN months < 3  THEN '0-3 meses'
                        WHEN months < 6  THEN '3-6 meses'
                        WHEN months < 12 THEN '6-12 meses'
                        WHEN months < 24 THEN '12-24 meses'
                        ELSE '24+ meses'
                    END AS faixa,
                    months
                FROM (
                    SELECT CAST((JULIANDAY(c.Data_cancelamento) - JULIANDAY(c.Data_ativa_o)) / 30.44
                                AS INTEGER) AS months
                    FROM Contratos c
                    WHERE c.Data_cancelamento IS NOT NULL AND c.Data_cancelamento != ''
                      AND c.Data_ativa_o IS NOT NULL AND c.Data_ativa_o != ''
                      AND {VALID_CITY}
                )
            )
            GROUP BY faixa
            ORDER BY MIN(months)
        """).fetchall()

        total_c     = kpi_row['total_cancelled'] or 1
        had_overdue = kpi_row['had_overdue'] or 0
        had_tickets = kpi_row['had_tickets'] or 0

        total_sinais = sum(r['total'] for r in sinais_rows) or 1
        por_num_sinais = [
            {
                "sinais": r['num_sinais'],
                "total":  r['total'],
                "pct":    round(r['total'] / total_sinais * 100, 1),
            }
            for r in sinais_rows
        ]

        total_perm = sum(r['total'] for r in perm_rows) or 1
        por_permanencia = [
            {
                "faixa": r['faixa'],
                "total": r['total'],
                "pct":   round(r['total'] / total_perm * 100, 1),
            }
            for r in perm_rows
        ]

        return jsonify({
            "kpis": {
                "total_cancelled":    kpi_row['total_cancelled'],
                "pct_had_overdue":    round(had_overdue / total_c * 100, 1),
                "pct_had_tickets":    round(had_tickets / total_c * 100, 1),
                "avg_meses_contrato": round(kpi_row['avg_meses'] or 0, 1),
            },
            "por_num_sinais":  por_num_sinais,
            "por_permanencia": por_permanencia,
        })

    except Exception as e:
        logger.error(f"Erro em pre_canc_behavior: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500
    finally:
        if conn: conn.close()


# ---------------------------------------------------------------------------
# Route 4: /lifecycle_risk
# Active contracts age distribution with risk scores + cancelled distribution
# ---------------------------------------------------------------------------
@behavior_bp.route('/lifecycle_risk')
def api_behavior_lifecycle_risk():
    conn = get_db()
    try:
        # Active contracts: same scoring formula as /contact_list but applied to
        # ALL active contracts (no flag filter on the scoring CTE)
        active_rows = conn.execute("""
            WITH PaymentProfile AS (
                SELECT
                    CR.ID_Contrato_Recorrente,
                    SUM(CASE WHEN CR.Status = 'A receber'
                              AND CR.Vencimento < date('now') THEN 1 ELSE 0 END) AS Faturas_Vencidas,
                    MAX(CASE WHEN CR.Status = 'A receber' AND CR.Vencimento < date('now')
                             THEN CAST(JULIANDAY(date('now')) - JULIANDAY(CR.Vencimento) AS INTEGER)
                             END) AS Dias_Vencido,
                    SUM(CASE WHEN CR.Data_pagamento > CR.Vencimento
                              AND CR.Vencimento >= date('now', '-90 days') THEN 1 ELSE 0 END) AS Atrasos_90d,
                    ROUND(AVG(CASE WHEN CR.Data_pagamento IS NOT NULL
                                   THEN JULIANDAY(CR.Data_pagamento) - JULIANDAY(CR.Vencimento)
                                   END), 1) AS Media_Atraso
                FROM Contas_a_Receber CR
                GROUP BY CR.ID_Contrato_Recorrente
            ),
            RecentTickets AS (
                SELECT Cliente, COUNT(*) AS Atendimentos_30d
                FROM (
                    SELECT Cliente FROM Atendimentos
                    WHERE Criado_em >= date('now', '-30 days') AND Cliente IS NOT NULL
                    UNION ALL
                    SELECT Cliente FROM OS
                    WHERE Abertura >= date('now', '-30 days') AND Cliente IS NOT NULL
                )
                GROUP BY Cliente
            ),
            ConnectionStatus AS (
                SELECT ID_contrato,
                       CAST(JULIANDAY(date('now')) - JULIANDAY(MAX(ltima_conex_o_final))
                            AS INTEGER) AS Dias_Sem_Conexao
                FROM Logins
                WHERE ltima_conex_o_final IS NOT NULL AND ID_contrato IS NOT NULL
                GROUP BY ID_contrato
            )
            SELECT
                CASE
                    WHEN age_months < 3  THEN '0-3 meses'
                    WHEN age_months < 6  THEN '3-6 meses'
                    WHEN age_months < 12 THEN '6-12 meses'
                    WHEN age_months < 24 THEN '12-24 meses'
                    ELSE '24+ meses'
                END AS faixa,
                COUNT(*) AS total,
                ROUND(AVG(score), 1) AS avg_score,
                SUM(CASE WHEN score >= 25 THEN 1 ELSE 0 END) AS em_risco,
                MIN(age_months) AS min_age
            FROM (
                SELECT
                    C.ID,
                    CAST((JULIANDAY(date('now')) - JULIANDAY(C.Data_ativa_o)) / 30.44
                         AS INTEGER) AS age_months,
                    (
                        COALESCE(PP.Faturas_Vencidas, 0) * 25
                        + CASE WHEN COALESCE(PP.Dias_Vencido, 0) > 60 THEN 30
                               WHEN COALESCE(PP.Dias_Vencido, 0) > 30 THEN 15
                               ELSE 0 END
                        + MIN(COALESCE(PP.Atrasos_90d, 0), 5) * 8
                        + CASE WHEN COALESCE(PP.Media_Atraso, 0) > 30 THEN 15
                               WHEN COALESCE(PP.Media_Atraso, 0) > 15 THEN 7
                               ELSE 0 END
                        + MIN(COALESCE(RT.Atendimentos_30d, 0), 3) * 8
                        + CASE WHEN COALESCE(CS.Dias_Sem_Conexao, 0) > 30 THEN 20
                               WHEN COALESCE(CS.Dias_Sem_Conexao, 0) > 14 THEN 10
                               ELSE 0 END
                    ) AS score
                FROM Contratos C
                LEFT JOIN PaymentProfile PP ON C.ID = PP.ID_Contrato_Recorrente
                LEFT JOIN RecentTickets RT ON C.Cliente = RT.Cliente
                LEFT JOIN ConnectionStatus CS ON C.ID = CS.ID_contrato
                WHERE C.Status_contrato = 'Ativo' AND C.Status_acesso != 'Desativado'
                  AND C.Data_ativa_o IS NOT NULL AND C.Data_ativa_o != ''
                  AND C.Cidade IS NOT NULL AND TRIM(C.Cidade) != '' AND NOT (C.Cidade GLOB '[0-9]*')
            ) sub
            GROUP BY faixa
            ORDER BY MIN(age_months)
        """).fetchall()

        cancel_rows = conn.execute("""
            SELECT faixa, COUNT(*) AS total
            FROM (
                SELECT
                    CASE
                        WHEN months < 3  THEN '0-3 meses'
                        WHEN months < 6  THEN '3-6 meses'
                        WHEN months < 12 THEN '6-12 meses'
                        WHEN months < 24 THEN '12-24 meses'
                        ELSE '24+ meses'
                    END AS faixa,
                    months
                FROM (
                    SELECT CAST((JULIANDAY(Data_cancelamento) - JULIANDAY(Data_ativa_o)) / 30.44
                                AS INTEGER) AS months
                    FROM Contratos
                    WHERE Data_cancelamento IS NOT NULL AND Data_cancelamento != ''
                      AND Data_ativa_o IS NOT NULL AND Data_ativa_o != ''
                      AND Cidade IS NOT NULL AND TRIM(Cidade) != '' AND NOT (Cidade GLOB '[0-9]*')
                )
            )
            GROUP BY faixa
            ORDER BY MIN(months)
        """).fetchall()

        total_ativos   = sum(r['total'] for r in active_rows)
        total_em_risco = sum(r['em_risco'] for r in active_rows)

        ativos_por_faixa = []
        faixa_maior_risco = ''
        max_pct_risco = -1.0
        for r in active_rows:
            t = r['total']
            pct_risco = round(r['em_risco'] / t * 100, 1) if t > 0 else 0.0
            if pct_risco > max_pct_risco:
                max_pct_risco = pct_risco
                faixa_maior_risco = r['faixa']
            ativos_por_faixa.append({
                "faixa":        r['faixa'],
                "total":        t,
                "avg_score":    r['avg_score'] or 0,
                "pct_em_risco": pct_risco,
            })

        total_cancel = sum(r['total'] for r in cancel_rows) or 1
        cancelados_por_faixa = []
        faixa_mais_cancelamentos = ''
        max_cancel = -1
        for r in cancel_rows:
            pct = round(r['total'] / total_cancel * 100, 1)
            if r['total'] > max_cancel:
                max_cancel = r['total']
                faixa_mais_cancelamentos = r['faixa']
            cancelados_por_faixa.append({
                "faixa": r['faixa'],
                "total": r['total'],
                "pct":   pct,
            })

        return jsonify({
            "kpis": {
                "total_ativos":             total_ativos,
                "em_risco":                 total_em_risco,
                "faixa_maior_risco":        faixa_maior_risco,
                "faixa_mais_cancelamentos": faixa_mais_cancelamentos,
            },
            "ativos_por_faixa":     ativos_por_faixa,
            "cancelados_por_faixa": cancelados_por_faixa,
        })

    except Exception as e:
        logger.error(f"Erro em lifecycle_risk: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500
    finally:
        if conn: conn.close()


# ---------------------------------------------------------------------------
# Route 5: /plan_risk
# By plan: active vs cancelled comparison with churn rate
# ---------------------------------------------------------------------------
@behavior_bp.route('/plan_risk')
def api_behavior_plan_risk():
    conn = get_db()
    try:
        rows = conn.execute("""
            SELECT
                Descri_o AS plano,
                SUM(CASE WHEN Status_contrato = 'Ativo' THEN 1 ELSE 0 END) AS ativos,
                SUM(CASE WHEN Data_cancelamento IS NOT NULL
                              AND Data_cancelamento != '' THEN 1 ELSE 0 END) AS cancelados,
                AVG(CASE WHEN Data_cancelamento IS NOT NULL AND Data_cancelamento != ''
                    THEN (JULIANDAY(Data_cancelamento) - JULIANDAY(Data_ativa_o)) / 30.44
                    END) AS avg_meses_ate_cancel
            FROM Contratos
            WHERE Descri_o IS NOT NULL AND Descri_o != ''
              AND Cidade IS NOT NULL AND TRIM(Cidade) != '' AND NOT (Cidade GLOB '[0-9]*')
            GROUP BY plano
            HAVING (ativos + cancelados) > 10
            ORDER BY cancelados DESC
            LIMIT 15
        """).fetchall()

        por_plano = []
        plano_maior_churn_label = ''
        plano_maior_churn_rate  = 0.0
        total_em_risco = 0

        for r in rows:
            ativos    = r['ativos']
            cancelados = r['cancelados']
            total     = ativos + cancelados
            churn_rate = round(cancelados / total * 100, 1) if total > 0 else 0.0
            avg_meses  = round(r['avg_meses_ate_cancel'] or 0, 1)
            if churn_rate > plano_maior_churn_rate:
                plano_maior_churn_rate  = churn_rate
                plano_maior_churn_label = r['plano']
            if churn_rate >= 30.0:
                total_em_risco += ativos
            por_plano.append({
                "plano":      r['plano'],
                "ativos":     ativos,
                "cancelados": cancelados,
                "total":      total,
                "churn_rate": churn_rate,
                "avg_meses":  avg_meses,
            })

        return jsonify({
            "kpis": {
                "total_planos":            len(por_plano),
                "plano_maior_churn_label": plano_maior_churn_label,
                "plano_maior_churn_rate":  plano_maior_churn_rate,
                "total_em_risco":          total_em_risco,
            },
            "por_plano": por_plano,
        })

    except Exception as e:
        logger.error(f"Erro em plan_risk: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500
    finally:
        if conn: conn.close()


# ---------------------------------------------------------------------------
# Route 6: /payment_profile
# Classifies active clients by payment behavior pattern
# ---------------------------------------------------------------------------
@behavior_bp.route('/payment_profile')
def api_behavior_payment_profile():
    conn = get_db()
    try:
        city      = request.args.get('city',    '').strip()
        perfil    = request.args.get('perfil',  '').strip()
        limit     = request.args.get('limit',   100, type=int)
        offset    = request.args.get('offset',  0,   type=int)

        city_cond = "AND C.Cidade = ?" if city else ""
        city_p    = [city] if city else []

        # sem alias (queries sem JOIN)
        perfil_cond    = "AND perfil = ?"    if perfil else ""
        # com alias C2 (data_sql que faz LEFT JOIN Clientes CL)
        perfil_cond_c2 = "AND C2.perfil = ?" if perfil else ""
        perfil_p       = [perfil] if perfil else []

        base_cte = f"""
            WITH ActiveContracts AS (
                SELECT ID, Cliente, Cidade
                FROM Contratos
                WHERE Status_contrato = 'Ativo'
                  AND Status_acesso != 'Desativado'
                  {city_cond}
                  AND Cidade IS NOT NULL AND TRIM(Cidade) != '' AND NOT (Cidade GLOB '[0-9]*')
                  AND NOT EXISTS (
                      SELECT 1 FROM Acompanhamento_Clientes
                      WHERE contrato_id = ID
                        AND snooze_ate IS NOT NULL
                        AND snooze_ate > date('now')
                  )
            ),
            PaymentHistory AS (
                SELECT
                    CR.ID_Contrato_Recorrente,
                    COUNT(CASE WHEN CR.Data_pagamento IS NOT NULL
                                AND CR.Data_pagamento != '' THEN 1 END) AS total_pagas,
                    COUNT(CASE WHEN CR.Data_pagamento IS NOT NULL
                                AND CR.Data_pagamento != ''
                                AND CR.Data_pagamento > CR.Vencimento THEN 1 END) AS total_atrasos,
                    COUNT(CASE WHEN CR.Status = 'A receber'
                                AND CR.Vencimento < date('now') THEN 1 END) AS fat_vencidas_hoje,
                    ROUND(AVG(CASE WHEN CR.Data_pagamento IS NOT NULL
                                    AND CR.Data_pagamento != ''
                                    AND CR.Data_pagamento > CR.Vencimento
                               THEN JULIANDAY(CR.Data_pagamento) - JULIANDAY(CR.Vencimento)
                               END), 1) AS media_atraso_dias,
                    MAX(CASE WHEN CR.Data_pagamento IS NOT NULL
                              AND CR.Data_pagamento != ''
                              AND CR.Data_pagamento > CR.Vencimento
                         THEN CAST(JULIANDAY(CR.Data_pagamento) - JULIANDAY(CR.Vencimento) AS INTEGER)
                         END) AS max_atraso_dias
                FROM Contas_a_Receber CR
                WHERE CR.ID_Contrato_Recorrente IN (SELECT ID FROM ActiveContracts)
                GROUP BY CR.ID_Contrato_Recorrente
            ),
            Classified AS (
                SELECT
                    AC.ID        AS contrato,
                    AC.Cliente   AS cliente,
                    AC.Cidade    AS cidade,
                    COALESCE(PH.total_pagas,         0) AS total_pagas,
                    COALESCE(PH.total_atrasos,        0) AS total_atrasos,
                    COALESCE(PH.fat_vencidas_hoje,    0) AS fat_vencidas_hoje,
                    COALESCE(PH.media_atraso_dias,    0) AS media_atraso_dias,
                    COALESCE(PH.max_atraso_dias,      0) AS max_atraso_dias,
                    CASE WHEN COALESCE(PH.total_pagas, 0) > 0
                         THEN ROUND(COALESCE(PH.total_atrasos, 0) * 100.0 / PH.total_pagas, 1)
                         ELSE 0 END AS pct_atraso,
                    CASE
                        WHEN COALESCE(PH.total_pagas, 0) = 0
                             THEN 'Sem histórico'
                        WHEN COALESCE(PH.total_atrasos, 0) = 0
                             AND COALESCE(PH.fat_vencidas_hoje, 0) = 0
                             THEN 'Nunca atrasou'
                        WHEN COALESCE(PH.total_atrasos, 0) = 0
                             AND COALESCE(PH.fat_vencidas_hoje, 0) = 1
                             THEN 'Atrasou pela 1ª vez'
                        WHEN COALESCE(PH.total_pagas, 0) > 0
                             AND COALESCE(PH.total_atrasos, 0) * 1.0 / PH.total_pagas >= 0.5
                             THEN 'Sempre atrasa'
                        WHEN COALESCE(PH.total_pagas, 0) > 0
                             AND COALESCE(PH.total_atrasos, 0) * 1.0 / PH.total_pagas >= 0.2
                             THEN 'Atrasa com frequência'
                        ELSE 'Raramente atrasa'
                    END AS perfil
                FROM ActiveContracts AC
                LEFT JOIN PaymentHistory PH ON AC.ID = PH.ID_Contrato_Recorrente
            )
        """

        # summary e faixa respeitam AMBOS os filtros (city + perfil)
        summary_sql = base_cte + f"""
            SELECT
                COUNT(*) AS total,
                SUM(CASE WHEN perfil = 'Nunca atrasou'        THEN 1 ELSE 0 END) AS nunca_atrasou,
                SUM(CASE WHEN perfil = 'Atrasou pela 1ª vez'  THEN 1 ELSE 0 END) AS primeira_vez,
                SUM(CASE WHEN perfil = 'Raramente atrasa'     THEN 1 ELSE 0 END) AS raramente,
                SUM(CASE WHEN perfil = 'Atrasa com frequência'THEN 1 ELSE 0 END) AS frequente,
                SUM(CASE WHEN perfil = 'Sempre atrasa'        THEN 1 ELSE 0 END) AS sempre,
                SUM(CASE WHEN perfil = 'Sem histórico'        THEN 1 ELSE 0 END) AS sem_historico,
                ROUND(AVG(CASE WHEN media_atraso_dias > 0 THEN media_atraso_dias END), 1) AS media_geral_atraso
            FROM Classified
            WHERE 1=1 {perfil_cond}
        """

        # dist sempre mostra todos os perfis (visão geral sem filtro de perfil)
        dist_sql = base_cte + """
            SELECT perfil, COUNT(*) AS total,
                   ROUND(AVG(CASE WHEN media_atraso_dias > 0 THEN media_atraso_dias END), 1) AS avg_atraso
            FROM Classified
            GROUP BY perfil ORDER BY total DESC
        """

        faixa_sql = base_cte + f"""
            SELECT
                CASE
                    WHEN media_atraso_dias = 0   THEN 'Em dia'
                    WHEN media_atraso_dias <= 5   THEN '1-5 dias'
                    WHEN media_atraso_dias <= 15  THEN '6-15 dias'
                    WHEN media_atraso_dias <= 30  THEN '16-30 dias'
                    ELSE '30+ dias'
                END AS faixa,
                COUNT(*) AS total
            FROM Classified
            WHERE total_pagas > 0 {perfil_cond}
            GROUP BY faixa
            ORDER BY MIN(media_atraso_dias)
        """

        # Clients with first-time late payment — always shown regardless of perfil filter
        primeira_vez_sql = base_cte + """
            SELECT contrato, cliente, cidade, fat_vencidas_hoje, total_pagas, max_atraso_dias
            FROM Classified
            WHERE perfil = 'Atrasou pela 1ª vez'
            ORDER BY fat_vencidas_hoje DESC, total_pagas DESC
            LIMIT 200
        """

        count_sql = base_cte + f"""
            SELECT COUNT(*) AS cnt FROM Classified WHERE 1=1 {perfil_cond}
        """

        data_sql = base_cte + f"""
            SELECT
                C2.contrato, C2.cliente, C2.cidade,
                C2.perfil, C2.total_pagas, C2.total_atrasos,
                C2.fat_vencidas_hoje, C2.media_atraso_dias,
                C2.max_atraso_dias, C2.pct_atraso,
                COALESCE(CL.Telefone,  '') AS telefone,
                COALESCE(CL.WhatsApp, '') AS whatsapp
            FROM Classified C2
            LEFT JOIN Clientes CL ON CL.Raz_o_social = C2.cliente
            WHERE 1=1 {perfil_cond_c2}
            ORDER BY
                CASE C2.perfil
                    WHEN 'Atrasou pela 1ª vez'   THEN 1
                    WHEN 'Sempre atrasa'          THEN 2
                    WHEN 'Atrasa com frequência'  THEN 3
                    WHEN 'Raramente atrasa'       THEN 4
                    WHEN 'Nunca atrasou'          THEN 5
                    ELSE 6
                END,
                C2.fat_vencidas_hoje DESC
            LIMIT ? OFFSET ?
        """

        cities_sql = """
            SELECT DISTINCT Cidade FROM Contratos
            WHERE Status_contrato = 'Ativo'
              AND Cidade IS NOT NULL AND TRIM(Cidade) != ''
              AND Cidade NOT GLOB '*[0-9]*'
            ORDER BY Cidade
        """

        both_p = tuple(city_p) + tuple(perfil_p)

        summary_row    = conn.execute(summary_sql,      both_p).fetchone()
        dist_rows      = conn.execute(dist_sql,         tuple(city_p)).fetchall()
        faixa_rows     = conn.execute(faixa_sql,        both_p).fetchall()
        primeira_rows  = conn.execute(primeira_vez_sql, tuple(city_p)).fetchall()
        total_rows     = conn.execute(count_sql,        both_p).fetchone()[0]
        data_rows      = conn.execute(data_sql,         both_p + (limit, offset)).fetchall()
        cities         = [r[0] for r in conn.execute(cities_sql).fetchall() if r[0]]

        summary = dict(summary_row) if summary_row else {}

        return jsonify({
            "summary":          summary,
            "por_perfil":       [dict(r) for r in dist_rows],
            "por_faixa_atraso": [dict(r) for r in faixa_rows],
            "primeira_vez":     [dict(r) for r in primeira_rows],
            "data":             [dict(r) for r in data_rows],
            "total_rows":       total_rows,
            "cities":           cities,
        })

    except Exception as e:
        logger.error(f"Erro em payment_profile: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500
    finally:
        if conn: conn.close()


# ---------------------------------------------------------------------------
# Route 7: /client_detail/<contrato_id>
# Full contract + contact + financial detail for the click-to-expand modal
# ---------------------------------------------------------------------------
MOTIVO_LABELS_DETAIL = {
    1:  'Alteração de contrato',
    2:  'Cancelamento renegociação',
    3:  'A pedido do cliente',
    4:  'Pendência financeira',
    5:  'Migração de plano',
    8:  'Migração de vencimento',
    9:  'Cancelamento',
    10: 'Insatisfação',
    11: 'Mudança de endereço',
    12: 'Dificuldades financeiras',
    13: 'Viagem',
    14: 'Término de contrato',
    15: 'Suspensão temporária',
}

@behavior_bp.route('/client_detail/<int:contrato_id>')
def api_behavior_client_detail(contrato_id):
    conn = get_db()
    try:
        # --- Contract ---
        contrato_row = conn.execute("""
            SELECT
                ID, Cliente, Cidade, Filial, Status_contrato, Status_acesso,
                Plano_de_venda, Descri_o AS descricao_plano,
                Data_ativa_o AS data_ativacao,
                Data_cancelamento, Motivo_cancelamento, Obs_cancelamento,
                Endere_o AS endereco, N_mero AS numero, Bairro, Complemento, Cep,
                Telefone_residencial, Telefone_celular,
                Dia_fixo_do_vencimento, Fidelidade,
                ltimo_bloqueio_autom_tico AS ultimo_bloqueio_auto,
                ltimo_bloqueio_manual     AS ultimo_bloqueio_manual,
                ltima_negativa_o          AS ultima_negativacao,
                Data_negativa_o           AS data_negativacao,
                Data_cadastro_sistema
            FROM Contratos
            WHERE ID = ?
        """, (contrato_id,)).fetchone()

        if not contrato_row:
            return jsonify({"error": "Contrato não encontrado"}), 404

        contrato = dict(contrato_row)

        # Decode motivo
        motivo_cod = contrato.get('Motivo_cancelamento')
        if motivo_cod:
            try:
                contrato['motivo_label'] = MOTIVO_LABELS_DETAIL.get(int(motivo_cod), f'Código {motivo_cod}')
            except (ValueError, TypeError):
                contrato['motivo_label'] = str(motivo_cod)
        else:
            contrato['motivo_label'] = None

        cliente_nome = contrato.get('Cliente', '')

        # --- Client contact ---
        cliente_row = conn.execute("""
            SELECT
                ID AS id_cliente_ixc,
                Raz_o_social AS razao_social,
                CNPJ_CPF AS cpf_cnpj,
                Telefone, Telefone_celular AS cel, Telefone_comercial AS comercial,
                WhatsApp, E_mail AS email,
                Endere_o AS endereco, Cidade, Bairro, CEP,
                Data_nascimento, Tipo_pessoa
            FROM Clientes
            WHERE Raz_o_social = ?
            LIMIT 1
        """, (cliente_nome,)).fetchone()

        if not cliente_row:
            # Tenta em clientes negativados (menos colunas disponíveis)
            neg_row = conn.execute(
                "SELECT ID AS id_cliente_ixc FROM Clientes_Negativacao WHERE Raz_o_social = ? LIMIT 1",
                (cliente_nome,)
            ).fetchone()
            cliente = {'id_cliente_ixc': neg_row['id_cliente_ixc']} if neg_row else {}
        else:
            cliente = dict(cliente_row)

        # --- Financial summary ---
        fin_summary = conn.execute("""
            SELECT
                COUNT(*)                                                         AS total_faturas,
                COUNT(CASE WHEN Status = 'Quitado' OR Data_pagamento IS NOT NULL
                            AND Data_pagamento != ''                  THEN 1 END) AS total_pagas,
                COUNT(CASE WHEN Status = 'A receber'
                            AND Vencimento < date('now')              THEN 1 END) AS fat_vencidas,
                ROUND(SUM(CASE WHEN Status = 'A receber'
                               AND Vencimento < date('now')
                          THEN Valor_aberto ELSE 0 END), 2)                      AS valor_vencido,
                COUNT(CASE WHEN Data_pagamento IS NOT NULL
                            AND Data_pagamento != ''
                            AND Data_pagamento > Vencimento          THEN 1 END) AS total_atrasos,
                ROUND(AVG(CASE WHEN Data_pagamento IS NOT NULL
                                AND Data_pagamento != ''
                                AND Data_pagamento > Vencimento
                           THEN JULIANDAY(Data_pagamento) - JULIANDAY(Vencimento)
                           END), 1)                                              AS media_atraso_dias,
                ROUND(MAX(CASE WHEN Data_pagamento IS NOT NULL
                                AND Data_pagamento != ''
                                AND Data_pagamento > Vencimento
                           THEN JULIANDAY(Data_pagamento) - JULIANDAY(Vencimento)
                           END), 0)                                              AS max_atraso_dias
            FROM Contas_a_Receber
            WHERE ID_contrato_recorrente = ?
        """, (contrato_id,)).fetchone()

        financeiro_summary = dict(fin_summary) if fin_summary else {}

        # --- Last 24 invoices ---
        faturas = conn.execute("""
            SELECT
                ID, Vencimento, Valor, Valor_recebido, Valor_aberto,
                Status, Data_pagamento,
                CASE WHEN Data_pagamento IS NOT NULL
                      AND Data_pagamento != ''
                      AND Data_pagamento > Vencimento
                     THEN CAST(JULIANDAY(Data_pagamento) - JULIANDAY(Vencimento) AS INTEGER)
                     WHEN Status = 'A receber' AND Vencimento < date('now')
                     THEN CAST(JULIANDAY('now') - JULIANDAY(Vencimento) AS INTEGER)
                END AS dias_atraso
            FROM Contas_a_Receber
            WHERE ID_contrato_recorrente = ?
            ORDER BY Vencimento DESC
            LIMIT 24
        """, (contrato_id,)).fetchall()

        # --- Last 10 atendimentos ---
        atendimentos = conn.execute("""
            SELECT ID, Assunto, Descri_o AS descricao, Criado_em,
                   ltima_altera_o AS ultima_alteracao,
                   Novo_status AS status
            FROM Atendimentos
            WHERE Cliente = ?
            ORDER BY Criado_em DESC
            LIMIT 10
        """, (cliente_nome,)).fetchall()

        return jsonify({
            "contrato":    contrato,
            "cliente":     cliente,
            "financeiro":  {
                "summary": financeiro_summary,
                "faturas": [dict(f) for f in faturas],
            },
            "atendimentos": [dict(a) for a in atendimentos],
        })

    except Exception as e:
        logger.error(f"Erro em client_detail {contrato_id}: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500
    finally:
        if conn: conn.close()


# ---------------------------------------------------------------------------
# Helpers — Acompanhamento de Clientes
# ---------------------------------------------------------------------------
def _ensure_acompanhamento_table(conn):
    conn.execute("""
        CREATE TABLE IF NOT EXISTS Acompanhamento_Clientes (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            contrato_id   INTEGER NOT NULL,
            usuario       TEXT    NOT NULL,
            data_registro TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
            tipo_acao     TEXT    NOT NULL,
            resultado     TEXT,
            observacao    TEXT,
            data_retorno  TEXT,
            snooze_ate    TEXT,
            ixc_os_id     TEXT
        )
    """)
    try:
        conn.execute("ALTER TABLE Acompanhamento_Clientes ADD COLUMN ixc_os_id TEXT")
    except Exception:
        pass
    conn.commit()


# ---------------------------------------------------------------------------
# Route: GET /api/behavior/acompanhamento/<contrato_id>
# Histórico de acompanhamento de um contrato específico
# ---------------------------------------------------------------------------
@behavior_bp.route('/acompanhamento/<int:contrato_id>', methods=['GET'])
def api_behavior_acompanhamento_get(contrato_id):
    conn = get_db()
    try:
        _ensure_acompanhamento_table(conn)
        rows = conn.execute("""
            SELECT id, contrato_id, usuario, data_registro,
                   tipo_acao, resultado, observacao, data_retorno, snooze_ate, ixc_os_id
            FROM Acompanhamento_Clientes
            WHERE contrato_id = ?
            ORDER BY data_registro DESC
        """, (contrato_id,)).fetchall()
        return jsonify([dict(r) for r in rows])
    except Exception as e:
        logger.error(f"Erro em acompanhamento_get {contrato_id}: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500
    finally:
        if conn: conn.close()


# ---------------------------------------------------------------------------
# Route: POST /api/behavior/acompanhamento
# Registrar nova ação de acompanhamento
# ---------------------------------------------------------------------------
@behavior_bp.route('/acompanhamento', methods=['POST'])
def api_behavior_acompanhamento_post():
    from datetime import date, timedelta
    conn = get_db()
    try:
        _ensure_acompanhamento_table(conn)
        data = request.get_json(force=True) or {}

        contrato_id     = data.get('contrato_id')
        tipo_acao       = (data.get('tipo_acao') or '').strip()
        resultado       = (data.get('resultado') or '').strip() or None
        observacao      = (data.get('observacao') or '').strip() or None
        data_retorno    = (data.get('data_retorno') or '').strip() or None
        os_assunto      = (data.get('os_assunto') or '').strip()
        abre_os         = bool(data.get('abre_os') or data.get('abrir_os_ixc', False))
        id_cliente_ixc  = data.get('id_cliente_ixc')
        usuario         = current_user.username if current_user.is_authenticated else 'sistema'

        if not contrato_id or not tipo_acao:
            return jsonify({"error": "contrato_id e tipo_acao são obrigatórios"}), 400

        # Calcular snooze_ate
        if resultado == 'cancelou':
            snooze_ate = None
        elif data_retorno:
            snooze_ate = data_retorno
        else:
            snooze_ate = (date.today() + timedelta(days=30)).isoformat()

        # Busca id_ixc do assunto selecionado no config
        # Labels podem ter o ID embutido como "[18] INFORMAÇÃO"
        import re as _re
        id_assunto_ixc = ''
        os_assunto_texto = os_assunto  # texto limpo para usar como título
        if os_assunto:
            # Tenta extrair ID do prefixo [N] no próprio label
            _m = _re.match(r'^\[(\d+)\]\s*(.*)', os_assunto)
            if _m:
                id_assunto_ixc  = _m.group(1)
                os_assunto_texto = _m.group(2).strip()
            else:
                # Busca no config pelo campo id_ixc
                try:
                    _cfg_conn2 = current_app.config['GET_DB_CONNECTION']()
                    try:
                        row_cfg = _cfg_conn2.execute(
                            "SELECT value FROM Settings WHERE key = 'acomp_config'"
                        ).fetchone()
                        if row_cfg and row_cfg['value']:
                            cfg_data = _json.loads(row_cfg['value'])
                            for s in cfg_data.get('assuntos_os', []):
                                if isinstance(s, dict) and s.get('label') == os_assunto:
                                    id_assunto_ixc = str(s.get('id_ixc') or '').strip()
                                    break
                    finally:
                        _cfg_conn2.close()
                except Exception:
                    pass

        # Sempre criar atendimento no IXC se houver cliente IXC
        ixc_os_id = None
        ixc_erro  = None
        titulo_ticket = os_assunto_texto or observacao or tipo_acao or 'Atendimento'
        logger.info(f"acompanhamento_post: id_cliente_ixc={id_cliente_ixc!r} contrato_id={contrato_id!r} abre_os={abre_os} id_assunto_ixc={id_assunto_ixc!r}")
        if id_cliente_ixc:
            try:
                token = _ret_get_token()
                logger.info(f"acompanhamento_post: token={'ok' if token else 'NONE'}")
                if token:
                    ixc_os_id = _ixc_criar_os(
                        id_cliente_ixc, contrato_id,
                        None,
                        observacao or '',
                        token,
                        titulo=titulo_ticket,
                        fechar=not abre_os,
                        id_assunto_ixc=id_assunto_ixc,
                    )
                    logger.info(f"acompanhamento_post: ixc_os_id={ixc_os_id!r}")
                else:
                    ixc_erro = 'Token IXC não configurado'
            except Exception as ex:
                ixc_erro = str(ex)
                logger.warning(f"Falha ao criar atendimento no IXC: {ex}")
        else:
            logger.warning("acompanhamento_post: id_cliente_ixc ausente — ticket IXC não criado")

        conn.execute("""
            INSERT INTO Acompanhamento_Clientes
                (contrato_id, usuario, data_registro, tipo_acao, resultado, observacao, data_retorno, snooze_ate, ixc_os_id)
            VALUES (?, ?, datetime('now', 'localtime'), ?, ?, ?, ?, ?, ?)
        """, (contrato_id, usuario, tipo_acao, resultado, observacao, data_retorno, snooze_ate, ixc_os_id))
        conn.commit()

        return jsonify({"ok": True, "snooze_ate": snooze_ate, "ixc_os_id": ixc_os_id, "ixc_erro": ixc_erro})
    except Exception as e:
        logger.error(f"Erro em acompanhamento_post: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500
    finally:
        if conn: conn.close()


# ---------------------------------------------------------------------------
# Route: GET /api/behavior/acompanhamento/all
# Visão geral de todos os acompanhamentos (aba dedicada)
# ---------------------------------------------------------------------------
@behavior_bp.route('/acompanhamento/all')
def api_behavior_acompanhamento_all():
    conn = get_db()
    try:
        _ensure_acompanhamento_table(conn)
        status  = request.args.get('status', '').strip()   # 'ativos' | 'vencidos' | ''
        usuario = request.args.get('usuario', '').strip()
        limit   = request.args.get('limit',  100, type=int)
        offset  = request.args.get('offset', 0,   type=int)

        conds = []
        params = []
        if status == 'ativos':
            conds.append("A.snooze_ate IS NOT NULL AND A.snooze_ate > date('now')")
        elif status == 'vencidos':
            conds.append("(A.snooze_ate IS NULL OR A.snooze_ate <= date('now'))")
        if usuario:
            conds.append("A.usuario = ?")
            params.append(usuario)

        where = ("WHERE " + " AND ".join(conds)) if conds else ""

        rows = conn.execute(f"""
            SELECT A.id, A.contrato_id, A.usuario, A.data_registro,
                   A.tipo_acao, A.resultado, A.observacao, A.data_retorno, A.snooze_ate,
                   C.Cliente AS cliente, C.Cidade AS cidade,
                   C.Status_contrato AS status_contrato, C.Status_acesso AS status_acesso
            FROM Acompanhamento_Clientes A
            LEFT JOIN Contratos C ON C.ID = A.contrato_id
            {where}
            ORDER BY A.data_registro DESC
            LIMIT ? OFFSET ?
        """, params + [limit, offset]).fetchall()

        total_row = conn.execute(f"""
            SELECT COUNT(*) AS cnt
            FROM Acompanhamento_Clientes A
            {where}
        """, params).fetchone()

        usuarios = [r[0] for r in conn.execute(
            "SELECT DISTINCT usuario FROM Acompanhamento_Clientes ORDER BY usuario"
        ).fetchall()]

        return jsonify({
            "registros": [dict(r) for r in rows],
            "total":     total_row['cnt'] if total_row else 0,
            "usuarios":  usuarios,
        })
    except Exception as e:
        logger.error(f"Erro em acompanhamento_all: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500
    finally:
        if conn: conn.close()


# ---------------------------------------------------------------------------
# Route: PUT /api/behavior/acompanhamento/<int:record_id>  (admin only)
# ---------------------------------------------------------------------------
@behavior_bp.route('/retorno')
def api_behavior_retorno():
    """Contratos com retorno vencido — último registro por contrato onde snooze_ate <= hoje."""
    if not current_user.is_authenticated:
        return jsonify({'error': 'Não autenticado'}), 401
    conn = get_db()
    try:
        _ensure_acompanhamento_table(conn)
        page    = max(1, int(request.args.get('page', 1)))
        limit   = min(100, int(request.args.get('limit', 100)))
        offset  = (page - 1) * limit
        usuario = request.args.get('usuario', '').strip()

        usr_cond = 'AND A.usuario = ?' if usuario else ''
        params   = [usuario] if usuario else []

        rows = conn.execute(f"""
            SELECT A.id, A.contrato_id, A.usuario, A.data_registro,
                   A.tipo_acao, A.resultado, A.observacao, A.data_retorno, A.snooze_ate,
                   C.Cliente AS cliente, C.Cidade AS cidade,
                   cl.Whatsapp         AS whatsapp,
                   cl.Telefone_celular AS telefone_cel
            FROM Acompanhamento_Clientes A
            LEFT JOIN Contratos C  ON C.ID  = A.contrato_id
            LEFT JOIN Clientes  cl ON cl.Raz_o_social = C.Cliente
            WHERE A.id IN (
                SELECT MAX(id) FROM Acompanhamento_Clientes
                {('WHERE ' + usr_cond.lstrip('AND ')) if usr_cond else ''}
                GROUP BY contrato_id
            )
            AND (A.snooze_ate IS NULL OR A.snooze_ate <= date('now', '+1 day'))
            ORDER BY A.snooze_ate ASC, A.data_registro ASC
            LIMIT ? OFFSET ?
        """, params + [limit, offset]).fetchall()

        total = conn.execute(f"""
            SELECT COUNT(*) FROM (
                SELECT MAX(id) AS mid FROM Acompanhamento_Clientes
                {('WHERE ' + usr_cond.lstrip('AND ')) if usr_cond else ''}
                GROUP BY contrato_id
            ) sub
            JOIN Acompanhamento_Clientes A ON A.id = sub.mid
            WHERE (A.snooze_ate IS NULL OR A.snooze_ate <= date('now', '+1 day'))
        """, params).fetchone()[0]

        usuarios = [r[0] for r in conn.execute(
            "SELECT DISTINCT usuario FROM Acompanhamento_Clientes ORDER BY usuario"
        ).fetchall()]

        return jsonify({
            'registros': [dict(r) for r in rows],
            'total':     total,
            'page':      page,
            'pages':     max(1, -(-total // limit)),
            'usuarios':  usuarios,
        })
    except Exception as e:
        logger.error(f"Erro em retorno: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500
    finally:
        if conn: conn.close()


@behavior_bp.route('/acompanhamento/<int:record_id>', methods=['PUT'])
def api_behavior_acompanhamento_put(record_id):
    if not current_user.is_authenticated:
        return jsonify({"error": "Não autenticado"}), 401
    if current_user.username != 'admin':
        return jsonify({"error": "Apenas administradores podem editar registros"}), 403

    conn = get_db()
    try:
        _ensure_acompanhamento_table(conn)
        data         = request.get_json(force=True)
        tipo_acao    = (data.get('tipo_acao')    or '').strip()
        resultado    = (data.get('resultado')    or '').strip() or None
        observacao   = (data.get('observacao')   or '').strip() or None
        data_retorno = (data.get('data_retorno') or '').strip() or None
        snooze_ate   = (data.get('snooze_ate')   or '').strip() or None

        if not tipo_acao:
            return jsonify({"error": "tipo_acao é obrigatório"}), 400

        conn.execute("""
            UPDATE Acompanhamento_Clientes
               SET tipo_acao    = ?,
                   resultado    = ?,
                   observacao   = ?,
                   data_retorno = ?,
                   snooze_ate   = ?
             WHERE id = ?
        """, (tipo_acao, resultado, observacao, data_retorno, snooze_ate, record_id))
        conn.commit()

        if conn.execute("SELECT changes()").fetchone()[0] == 0:
            return jsonify({"error": "Registro não encontrado"}), 404

        return jsonify({"ok": True})
    except Exception as e:
        logger.error(f"Erro em acompanhamento_put: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500
    finally:
        if conn: conn.close()


# ---------------------------------------------------------------------------
# Route: DELETE /api/behavior/acompanhamento/<int:record_id>  (admin only)
# ---------------------------------------------------------------------------
@behavior_bp.route('/acompanhamento/<int:record_id>', methods=['DELETE'])
def api_behavior_acompanhamento_delete(record_id):
    if not current_user.is_authenticated:
        return jsonify({"error": "Não autenticado"}), 401
    if current_user.username != 'admin':
        return jsonify({"error": "Apenas administradores podem excluir registros"}), 403

    conn = get_db()
    try:
        _ensure_acompanhamento_table(conn)
        conn.execute("DELETE FROM Acompanhamento_Clientes WHERE id = ?", (record_id,))
        conn.commit()
        return jsonify({"ok": True})
    except Exception as e:
        logger.error(f"Erro em acompanhamento_delete: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500
    finally:
        if conn: conn.close()


# ─────────────────────────────────────────────────────────────────────────────
# ANÁLISE DE RETIRADA
# ─────────────────────────────────────────────────────────────────────────────

RETIRADA_ASSUNTOS = (
    'RETIRADA DE EQUIPAMENTO',
    'INADIMPLENCIA RETIRADA',
    'EQUIPAMENTO NÃO RETIRADO',
    'RETIRADA DE EQUIPAMENTO PONTO ADICIONAL',
    'CANCELAMENTO RETIRADA',
)

# Cache de técnicos — populado uma vez, reusado nas requisições seguintes
_tecnicos_cache: dict = {}
_tecnicos_cache_ts: float = 0.0


def _get_tecnicos_map() -> dict:
    """Retorna mapa {id: nome} de técnicos, com cache de 1 hora."""
    import time
    global _tecnicos_cache, _tecnicos_cache_ts
    if _tecnicos_cache and (time.time() - _tecnicos_cache_ts) < 3600:
        return _tecnicos_cache
    try:
        token = _ret_get_token()
        if not token:
            return _tecnicos_cache
        encoded = base64.b64encode(token.encode()).decode()
        r = requests.post(
            f'{_IXC_BASE}/funcionarios',
            data={'sortname': 'funcionario', 'sortorder': 'asc', 'rp': '500', 'page': '1'},
            headers={'Authorization': f'Basic {encoded}', 'ixcsoft': 'listar'},
            timeout=10, verify=False
        )
        recs = r.json().get('registros', []) if r.ok else []
        m = {}
        for rec in recs:
            fid  = str(rec.get('id', ''))
            nome = (rec.get('funcionario') or '').strip()
            if fid and nome:
                m[fid] = nome
        if m:
            _tecnicos_cache    = m
            _tecnicos_cache_ts = time.time()
    except Exception:
        pass
    return _tecnicos_cache

# Cidades conhecidas — filtra IDs numéricos do IXC
_CIDADES_CONHECIDAS = {'Dom Pedro', 'Presidente Dutra', 'São Domingos do Maranhão', 'Tuntum'}

_MELHOR_HORARIO = {
    'M': 'Manhã', 'T': 'Tarde', 'N': 'Noite', 'Q': 'Qualquer', '': '—'
}


@behavior_bp.route('/retiradas/filtros')
def api_behavior_retiradas_filtros():
    if not current_user.is_authenticated:
        return jsonify({'error': 'Não autenticado'}), 401
    conn = None
    try:
        conn = current_app.config['GET_DB_CONNECTION']()
        ph = ','.join('?' * len(RETIRADA_ASSUNTOS))
        cidades = [r[0] for r in conn.execute(
            f"SELECT DISTINCT Cidade FROM OS WHERE Assunto IN ({ph}) AND Cidade IN ('Dom Pedro','Presidente Dutra','São Domingos do Maranhão','Tuntum') ORDER BY Cidade",
            RETIRADA_ASSUNTOS).fetchall()]
        bairros = [r[0] for r in conn.execute(
            f"SELECT DISTINCT Bairro FROM OS WHERE Assunto IN ({ph}) AND Bairro IS NOT NULL AND Bairro != '' ORDER BY Bairro",
            RETIRADA_ASSUNTOS).fetchall()]
        colab_ids = [str(r[0]) for r in conn.execute(
            f"SELECT DISTINCT Colaborador FROM OS WHERE Assunto IN ({ph}) AND Colaborador IS NOT NULL AND Colaborador != '' ORDER BY Colaborador",
            RETIRADA_ASSUNTOS).fetchall()]
        filiais = [r[0] for r in conn.execute(
            f"SELECT DISTINCT Filial FROM OS WHERE Assunto IN ({ph}) AND Filial IS NOT NULL ORDER BY Filial",
            RETIRADA_ASSUNTOS).fetchall()]
        try:
            equipamentos = [r[0] for r in conn.execute(
                "SELECT Descricao_produto, COUNT(*) AS cnt FROM Equipamento "
                "WHERE Descricao_produto IS NOT NULL AND Descricao_produto != '' "
                "AND (UPPER(Descricao_produto) LIKE '%ONU%' OR UPPER(Descricao_produto) LIKE '%ONT%' "
                "     OR UPPER(Descricao_produto) LIKE '%ROTEADOR%' OR UPPER(Descricao_produto) LIKE '%ROUTER%') "
                "GROUP BY Descricao_produto ORDER BY cnt DESC LIMIT 60"
            ).fetchall()]
        except Exception:
            equipamentos = []

        # Resolve nomes dos técnicos via cache (atualizado 1×/hora)
        tecnicos_map = _get_tecnicos_map()

        # Monta lista de colaboradores com nome se disponível
        colaboradores = []
        for cid in colab_ids:
            nome = tecnicos_map.get(cid, '')
            colaboradores.append({'id': cid, 'nome': nome or cid})

        return jsonify({
            'assuntos': list(RETIRADA_ASSUNTOS),
            'status': ['Aberta', 'Encaminhada', 'Agendada', 'Finalizada'],
            'cidades': cidades,
            'bairros': bairros,
            'colaboradores': colaboradores,
            'filiais': filiais,
            'equipamentos': equipamentos,
            'tecnicos_map': tecnicos_map,
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn: conn.close()


@behavior_bp.route('/retiradas')
def api_behavior_retiradas():
    if not current_user.is_authenticated:
        return jsonify({'error': 'Não autenticado'}), 401
    conn = None
    try:
        conn = current_app.config['GET_DB_CONNECTION']()
        conn.execute("""CREATE TABLE IF NOT EXISTS ret_visitas_cache
            (os_id TEXT PRIMARY KEY, visitas INTEGER DEFAULT 0, updated_at TEXT)""")
        conn.commit()

        status_f  = request.args.get('status', '')
        assunto_f = request.args.get('assunto', '')
        filial_f  = request.args.get('filial', '')
        cidade_f  = request.args.get('cidade', '')
        bairro_f  = request.args.get('bairro', '')
        colab_f   = request.args.get('colaborador', '')
        equip_f   = request.args.get('equipamento', '').strip()
        date_from = request.args.get('date_from', '')
        date_to   = request.args.get('date_to', '')
        search    = request.args.get('search', '').strip()
        page      = max(1, int(request.args.get('page', 1)))
        limit     = min(200, int(request.args.get('limit', 50)))

        ph = ','.join('?' * len(RETIRADA_ASSUNTOS))
        conds  = [f"o.Assunto IN ({ph})"]
        params = list(RETIRADA_ASSUNTOS)

        if status_f:
            status_list = [s.strip() for s in status_f.split(',') if s.strip()]
            if len(status_list) == 1:
                conds.append("o.Status = ?"); params.append(status_list[0])
            elif status_list:
                sph = ','.join('?' * len(status_list))
                conds.append(f"o.Status IN ({sph})"); params.extend(status_list)
        if assunto_f:
            conds.append("o.Assunto = ?"); params.append(assunto_f)
        if filial_f:
            conds.append("o.Filial = ?"); params.append(filial_f)
        if cidade_f:
            conds.append("o.Cidade = ?"); params.append(cidade_f)
        if bairro_f:
            conds.append("o.Bairro = ?"); params.append(bairro_f)
        if colab_f:
            conds.append("o.Colaborador = ?"); params.append(colab_f)
        contratos_com_equip = []
        if equip_f:
            contratos_com_equip = [
                str(r[0]) for r in conn.execute(
                    "SELECT DISTINCT ID_contrato FROM Equipamento WHERE Descricao_produto = ?",
                    (equip_f,)
                ).fetchall()
            ]
            if contratos_com_equip:
                ph_eq = ','.join('?' * len(contratos_com_equip))
                conds.append(f"CAST(o.Contrato AS TEXT) IN ({ph_eq})")
                params.extend(contratos_com_equip)
            else:
                conds.append("1=0")  # nenhum contrato tem esse equipamento
        if date_from:
            conds.append("o.Abertura >= ?"); params.append(date_from)
        if date_to:
            conds.append("o.Abertura <= ?"); params.append(date_to + ' 23:59:59')
        if search:
            conds.append("(o.Cliente LIKE ? OR o.Endere_o LIKE ? OR o.Bairro LIKE ? OR o.Mensagem LIKE ?)")
            s = f'%{search}%'
            params.extend([s, s, s, s])

        where = 'WHERE ' + ' AND '.join(conds)

        min_visitas_f = int(request.args.get('min_visitas') or 0)
        cached = {}
        qualified = []
        if min_visitas_f > 0:
            all_ids = [r[0] for r in conn.execute(
                f"SELECT o.ID FROM OS o {where}", params).fetchall()]

            if not all_ids:
                return jsonify({
                    'kpis': {'total':0,'abertas':0,'encaminhadas':0,'agendadas':0,
                             'finalizadas':0,'sem_agendamento':0},
                    'por_assunto':[], 'por_cidade':[], 'por_colaborador':[], 'tendencia':[],
                    'ordens':[], 'total':0, 'page':page, 'pages':0,
                    'visitas_map': {},
                })

            id_strs = [str(i) for i in all_ids]
            ph_ids  = ','.join('?' * len(id_strs))
            cached  = {r[0]: r[1] for r in conn.execute(
                f"SELECT os_id, visitas FROM ret_visitas_cache WHERE os_id IN ({ph_ids})",
                id_strs).fetchall()}

            # Usa só o cache — sem chamar IXC aqui.
            # Para atualizar, use o botão "🔄 Atualizar Visitas".
            qualified = [i for i in all_ids if cached.get(str(i), 0) >= min_visitas_f]
            if not qualified:
                return jsonify({
                    'kpis': {'total':0,'abertas':0,'encaminhadas':0,'agendadas':0,
                             'finalizadas':0,'sem_agendamento':0},
                    'por_assunto':[], 'por_cidade':[], 'por_colaborador':[], 'tendencia':[],
                    'ordens':[], 'total':0, 'page':page, 'pages':0,
                    'visitas_map': {}, 'visitas_sem_cache': len(all_ids) - len(cached),
                })

            ph_q = ','.join('?' * len(qualified))
            conds.append(f"o.ID IN ({ph_q})")
            params.extend(qualified)
            where = 'WHERE ' + ' AND '.join(conds)

        kpi_row = conn.execute(f"""
            SELECT
                COUNT(*) total,
                COUNT(CASE WHEN o.Status = 'Aberta'      THEN 1 END) abertas,
                COUNT(CASE WHEN o.Status = 'Encaminhada' THEN 1 END) encaminhadas,
                COUNT(CASE WHEN o.Status = 'Agendada'    THEN 1 END) agendadas,
                COUNT(CASE WHEN o.Status = 'Finalizada'  THEN 1 END) finalizadas,
                COUNT(CASE WHEN (o.Agendamento IS NULL OR o.Agendamento IN ('','0000-00-00 00:00:00'))
                                 AND o.Status != 'Finalizada' THEN 1 END) sem_agendamento
            FROM OS o {where}
        """, params).fetchone()

        por_assunto = conn.execute(f"""
            SELECT o.Assunto, COUNT(*) FROM OS o {where}
            GROUP BY o.Assunto ORDER BY COUNT(*) DESC
        """, params).fetchall()

        _CIDADES_OP = ('Dom Pedro', 'Presidente Dutra', 'Tuntum', 'São Domingos do Maranhão')

        por_cidade = conn.execute(f"""
            SELECT o.Cidade, COUNT(*) FROM OS o {where}
            AND o.Cidade IS NOT NULL AND TRIM(o.Cidade) != ''
            AND o.Cidade GLOB '*[A-Za-z]*'
            GROUP BY o.Cidade ORDER BY COUNT(*) DESC LIMIT 10
        """, params).fetchall()

        _ph_cid = ','.join('?' * len(_CIDADES_OP))

        # Tendência: WHERE sem filtro de status para mostrar TODAS as OS abertas no mês
        trend_conds  = [f"o.Assunto IN ({ph})"]
        trend_params = list(RETIRADA_ASSUNTOS)
        if assunto_f: trend_conds.append("o.Assunto = ?");     trend_params.append(assunto_f)
        if filial_f:  trend_conds.append("o.Filial = ?");      trend_params.append(filial_f)
        if cidade_f:  trend_conds.append("o.Cidade = ?");      trend_params.append(cidade_f)
        if bairro_f:  trend_conds.append("o.Bairro = ?");      trend_params.append(bairro_f)
        if colab_f:   trend_conds.append("o.Colaborador = ?"); trend_params.append(colab_f)
        if equip_f and contratos_com_equip:
            ph_eq2 = ','.join('?' * len(contratos_com_equip))
            trend_conds.append(f"CAST(o.Contrato AS TEXT) IN ({ph_eq2})")
            trend_params.extend(contratos_com_equip)
        elif equip_f:
            trend_conds.append("1=0")
        trend_where = 'WHERE ' + ' AND '.join(trend_conds)

        tend_rows = conn.execute(f"""
            SELECT o.Assunto,
                   strftime('%Y-%m', o.Abertura) ym,
                   COUNT(*),
                   COUNT(CASE WHEN o.Status = 'Finalizada' THEN 1 END),
                   COUNT(CASE WHEN o.Status IN ('Aberta','Encaminhada') THEN 1 END)
            FROM OS o {trend_where}
            AND o.Abertura >= date('now','-12 months')
            GROUP BY o.Assunto, ym ORDER BY o.Assunto, ym
        """, trend_params).fetchall()

        # Agrupa por assunto
        from collections import defaultdict as _dd
        _tend_map = _dd(list)
        for r in tend_rows:
            _tend_map[r[0]].append({'mes': r[1], 'total': r[2], 'finalizadas': r[3], 'abertas_status': r[4]})
        tendencia = dict(_tend_map)

        # Produção por técnico: dia-a-dia do mês atual
        from datetime import date as _date
        import calendar as _cal
        _today = _date.today()
        _cur_ym = _today.strftime('%Y-%m')
        _, _num_days = _cal.monthrange(_today.year, _today.month)

        por_dia_rows = conn.execute(f"""
            SELECT o.Colaborador,
                   CAST(strftime('%d', o.Abertura) AS INTEGER) AS dia,
                   COUNT(*) AS cnt
            FROM OS o
            WHERE o.Assunto IN ({ph})
            AND o.Cidade IN ({_ph_cid})
            AND o.Colaborador IS NOT NULL AND TRIM(o.Colaborador) != '' AND o.Colaborador != '0'
            AND strftime('%Y-%m', o.Abertura) = ?
            GROUP BY o.Colaborador, dia
            ORDER BY o.Colaborador, dia
        """, list(RETIRADA_ASSUNTOS) + list(_CIDADES_OP) + [_cur_ym]).fetchall()

        _tec_map = _get_tecnicos_map()
        _colab_dias = {}
        for r in por_dia_rows:
            cid = str(r[0]).strip()
            if cid not in _colab_dias:
                nome = _tec_map.get(cid) or _tec_map.get(cid.lstrip('0')) or f'#{cid}'
                _colab_dias[cid] = {'id': cid, 'nome': nome, 'dias': {}}
            _colab_dias[cid]['dias'][r[1]] = r[2]

        por_colab_fmt = sorted(
            [{'id': v['id'], 'nome': v['nome'], 'dias': v['dias'],
              'total': sum(v['dias'].values())}
             for v in _colab_dias.values()],
            key=lambda x: -x['total']
        )

        total  = kpi_row[0] if kpi_row else 0
        offset = (page - 1) * limit

        sort_by  = request.args.get('sort_by', '')
        sort_dir = request.args.get('sort_dir', 'desc').lower()
        if sort_dir not in ('asc', 'desc'):
            sort_dir = 'desc'

        _SORT_COLS = {
            'id':           'o.ID',
            'cliente':      'o.Cliente',
            'abertura':     'o.Abertura',
            'tempo_aberto': 'o.Abertura',   # mais dias = abertura mais antiga = ASC invertido
            'agendamento':  'o.Agendamento',
            'colaborador':  'o.Colaborador',
            'status':       'o.Status',
            'visitas':      'COALESCE(vc.visitas, 0)',
        }

        if sort_by in _SORT_COLS:
            # Para tempo_aberto: "maior = mais antigo", então invertemos a direção
            effective_dir = sort_dir
            if sort_by == 'tempo_aberto':
                effective_dir = 'asc' if sort_dir == 'desc' else 'desc'
            order_clause = f"{_SORT_COLS[sort_by]} {effective_dir.upper()}"
        else:
            order_clause = """CASE o.Status
                    WHEN 'Aberta'      THEN 1
                    WHEN 'Encaminhada' THEN 2
                    WHEN 'Agendada'    THEN 3
                    ELSE 4
                END, o.Abertura DESC"""

        rows = conn.execute(f"""
            SELECT
                o.ID, o.Assunto, o.Status, o.Cliente, o.Colaborador,
                o.Abertura, o.Agendamento, o.Melhor_hor_rio,
                o.Endere_o, o.Complemento, o.Bairro, o.Cidade, o.Refer_ncia,
                o.Telefone_celular, o.Whatsapp, o.Telefone_residencial, o.Telefone_comercial,
                o.Mensagem, o.Protocolo, o.SLA, o.Filial, o.Prioridade,
                o.In_cio, o.Final, o.Fechamento, o.Prazo_limite,
                o.Contrato, o.ID_Atendimento,
                a.Descri_o AS atend_descricao,
                a.Novo_status AS atend_status,
                cl.WhatsApp AS cl_whatsapp,
                cl.Telefone_celular AS cl_tel_cel,
                cl.Telefone AS cl_telefone
            FROM OS o
            LEFT JOIN Atendimentos a ON a.ID = o.ID_Atendimento
            LEFT JOIN Contratos ct ON CAST(ct.ID AS TEXT) = CAST(o.Contrato AS TEXT)
            LEFT JOIN Clientes cl ON cl.Raz_o_social = COALESCE(ct.Cliente, o.Cliente)
            LEFT JOIN ret_visitas_cache vc ON vc.os_id = CAST(o.ID AS TEXT)
            {where}
            ORDER BY {order_clause}
            LIMIT ? OFFSET ?
        """, params + [limit, offset]).fetchall()

        # Busca equipamentos em comodato para os contratos desta página (separado para não quebrar a query principal)
        contratos_pagina = [str(r[26]) for r in rows if r[26]]
        equip_map = {}
        if contratos_pagina:
            try:
                ph2 = ','.join('?' * len(contratos_pagina))
                eq_rows = conn.execute(
                    f"SELECT CAST(ID_contrato AS TEXT), GROUP_CONCAT(Descricao_produto, ' / ') "
                    f"FROM Equipamento WHERE CAST(ID_contrato AS TEXT) IN ({ph2}) GROUP BY CAST(ID_contrato AS TEXT)",
                    contratos_pagina
                ).fetchall()
                equip_map = {str(r2[0]): r2[1] or '' for r2 in eq_rows}
            except Exception:
                pass  # tabela Equipamento não existe ainda

        def _clean(v):
            return None if v in (None, '', '0000-00-00 00:00:00', '0000-00-00') else v

        def _cidade_nome(v):
            """Converte ID numérico de cidade para nome ou retorna o valor original."""
            if not v:
                return ''
            if v in _CIDADES_CONHECIDAS:
                return v
            _ID_MAP = {'3823': 'Presidente Dutra', '599': 'Presidente Dutra',
                       '656': 'Tuntum', '515': 'Dom Pedro', '624': 'São Domingos do Maranhão'}
            return _ID_MAP.get(str(v), v if not str(v).isdigit() else '')

        def fmt(r):
            # r[30]=cl_whatsapp, r[31]=cl_tel_cel (sempre NULL), r[32]=cl_telefone
            # Prioridade: campo da OS → campo do cliente via JOIN
            whatsapp = r[14] or r[30] or ''
            tel_cel  = r[13] or r[31] or r[30] or ''   # cel → cl.WhatsApp como fallback
            tel_res  = r[15] or r[32] or ''             # residencial → cl.Telefone como fallback
            telefone = whatsapp or tel_cel or tel_res or r[16] or ''
            return {
                'id':             r[0],
                'assunto':        r[1],
                'status':         r[2],
                'cliente':        r[3],
                'colaborador':    r[4],
                'abertura':       r[5],
                'agendamento':    _clean(r[6]),
                'melhor_horario': _MELHOR_HORARIO.get(r[7] or '', r[7] or '—'),
                'endereco':       r[8],
                'complemento':    r[9],
                'bairro':         r[10],
                'cidade':         _cidade_nome(r[11]),
                'referencia':     r[12],
                'telefone':       telefone,
                'telefone_cel':   tel_cel,
                'whatsapp':       whatsapp,
                'telefone_res':   tel_res,
                'telefone_com':   r[16],
                'mensagem':       r[17],
                'protocolo':      r[18],
                'sla':            r[19],
                'filial':         r[20],
                'prioridade':     r[21],
                'inicio':         _clean(r[22]),
                'final':          _clean(r[23]),
                'fechamento':     _clean(r[24]),
                'prazo_limite':   _clean(r[25]),
                'contrato':       r[26],
                'id_atendimento': r[27],
                'atend_descricao':       r[28],
                'atend_status':          r[29],
                'equipamentos_comodato': equip_map.get(str(r[26] or ''), ''),
            }

        return jsonify({
            'kpis': {
                'total':           kpi_row[0],
                'abertas':         kpi_row[1],
                'encaminhadas':    kpi_row[2],
                'agendadas':       kpi_row[3],
                'finalizadas':     kpi_row[4],
                'sem_agendamento': kpi_row[5],
            },
            'por_assunto':      [{'assunto': r[0], 'total': r[1]} for r in por_assunto],
            'por_cidade':       [{'cidade': r[0] or '—', 'total': r[1]} for r in por_cidade],
            'por_colaborador':  por_colab_fmt,
            'colab_num_days':   _num_days,
            'colab_mes':        _cur_ym,
            'tendencia':        tendencia,
            'ordens':      [fmt(r) for r in rows],
            'visitas_map': {str(i): cached.get(str(i), 0) for i in qualified} if min_visitas_f > 0 else {},
            'total':       total,
            'page':        page,
            'limit':       limit,
            'pages':       max(1, -(-total // limit)),
            'sort_by':     sort_by,
            'sort_dir':    sort_dir,
        })
    except Exception as e:
        import traceback
        logger.error(f"Erro retiradas: {e}", exc_info=True)
        return jsonify({'error': str(e), 'trace': traceback.format_exc()}), 500
    finally:
        if conn: conn.close()


@behavior_bp.route('/retiradas/historico')
def ret_historico():
    """Histórico de todas as OS de retirada de um cliente específico."""
    cliente  = request.args.get('cliente', '').strip()
    contrato = request.args.get('contrato', '').strip()
    if not cliente and not contrato:
        return jsonify({'error': 'cliente ou contrato requerido'}), 400

    conn = None
    try:
        conn = current_app.config['GET_DB_CONNECTION']()
        assuntos_ph = ','.join('?' * len(RETIRADA_ASSUNTOS))
        params_q = list(RETIRADA_ASSUNTOS)

        # Prefere busca por nome (traz todo histórico do cliente);
        # usa contrato só se o "cliente" parece ser ID numérico (OS antigas)
        if cliente and not cliente.isdigit():
            cond_cli = "AND o.Cliente = ?"
            params_q.append(cliente)
        elif contrato:
            cond_cli = "AND o.Contrato = ?"
            params_q.append(contrato)
        else:
            cond_cli = "AND o.Cliente = ?"
            params_q.append(cliente)

        rows = conn.execute(f"""
            SELECT o.ID, o.Status, o.Assunto, o.Abertura, o.Fechamento,
                   o.Final, o.Colaborador, o.Agendamento, o.Contrato
            FROM OS o
            WHERE o.Assunto IN ({assuntos_ph})
            {cond_cli}
            ORDER BY o.Abertura DESC
        """, params_q).fetchall()

        from datetime import datetime as _dt
        def _to_date(s):
            if not s or str(s).startswith('0000'): return None
            try: return _dt.fromisoformat(str(s)[:19])
            except: return None

        from collections import defaultdict
        por_mes   = defaultdict(int)
        dias_list = []
        hoje      = _dt.utcnow()

        ordens = []
        for r in rows:
            ab  = _to_date(r[3])
            fe  = _to_date(r[4]) or _to_date(r[5])
            agd = r[7]
            if ab:
                por_mes[ab.strftime('%Y-%m')] += 1
            if r[1] == 'Finalizada' and ab and fe:
                dias_list.append(max(0, (fe - ab).days))

            dias_aberto = (hoje - ab).days if ab and r[1] != 'Finalizada' else (
                (fe - ab).days if ab and fe else None)

            ordens.append({
                'id':          r[0],
                'status':      r[1],
                'assunto':     r[2],
                'abertura':    r[3],
                'fechamento':  r[4],
                'agendamento': str(agd) if agd and not str(agd).startswith('0000') else None,
                'contrato':    r[8],
                'dias_aberto': dias_aberto,
            })

        total       = len(ordens)
        finalizadas = sum(1 for o in ordens if o['status'] == 'Finalizada')
        abertas     = total - finalizadas
        media_dias  = round(sum(dias_list) / len(dias_list)) if dias_list else None

        return jsonify({
            'total':       total,
            'finalizadas': finalizadas,
            'abertas':     abertas,
            'media_dias':  media_dias,
            'por_mes':     [{'mes': k, 'total': v} for k, v in sorted(por_mes.items())],
            'ordens':      ordens,
        })
    except Exception as e:
        logger.error(f"Erro ret_historico: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500
    finally:
        if conn: conn.close()


def _ret_get_token():
    conn = current_app.config['GET_DB_CONNECTION']()
    try:
        row = conn.execute("SELECT value FROM Settings WHERE key = 'ixc_token'").fetchone()
        return row['value'] if row else None
    finally:
        conn.close()


def _ixc_raw(endpoint, params, token):
    """Tenta form-encoded (padrão sync) e JSON; loga resposta bruta para debug."""
    encoded = base64.b64encode(token.encode()).decode()
    base_headers = {'Authorization': f'Basic {encoded}', 'ixcsoft': 'listar'}
    payload = {**params, 'rp': '200', 'page': '1'}

    for fmt in ('form', 'json'):
        try:
            if fmt == 'form':
                resp = requests.post(f'{_IXC_BASE}/{endpoint}', data=payload,
                                     headers=base_headers, timeout=15, verify=False)
            else:
                resp = requests.post(f'{_IXC_BASE}/{endpoint}', json=payload,
                                     headers={**base_headers, 'Content-Type': 'application/json'},
                                     timeout=15, verify=False)

            txt = resp.text.strip()
            logger.info(f"_ixc_raw [{endpoint}] {fmt.upper()} status={resp.status_code} body={txt[:400]!r}")

            if resp.status_code >= 400:
                continue  # tenta próximo formato

            if not txt:
                continue

            data = resp.json()
            return data.get('registros', []) if isinstance(data, dict) else []

        except Exception as ex:
            logger.warning(f"_ixc_raw [{endpoint}] {fmt} erro: {ex}")

    return []


def _ixc_post(endpoint, payload, token):
    """POST com JSON body + ixcsoft:listar (padrão confirmado em automacao_ixc_api.py)."""
    encoded = base64.b64encode(token.encode()).decode()
    headers = {
        'Authorization': f'Basic {encoded}',
        'ixcsoft': 'listar',
        'Content-Type': 'application/json',
    }
    try:
        resp = requests.post(f'{_IXC_BASE}/{endpoint}', json=payload,
                             headers=headers, timeout=15, verify=False)
        txt = resp.text.strip()
        if not txt or txt.startswith('<'):
            return None
        d = resp.json()
        return d if isinstance(d, dict) else None
    except Exception as ex:
        logger.warning(f"_ixc_post [{endpoint}]: {ex}")
        return None


def _ixc_criar_os(id_cliente_ixc, id_contrato, id_assunto, mensagem, token, titulo='', fechar=False, id_assunto_ixc=''):
    """Cria um ticket de suporte no IXC (su_ticket). Retorna ID ou None."""
    # Busca endereço do contrato no banco local
    endereco = bairro = complemento = id_cidade = ''
    try:
        _conn = get_db()
        try:
            row = _conn.execute(
                "SELECT Endere_o, N_mero, Bairro, Complemento, Cidade FROM Contratos WHERE ID = ?",
                (id_contrato,)
            ).fetchone()
        finally:
            _conn.close()
        if row:
            num = (row['N_mero'] or '').strip()
            end = (row['Endere_o'] or '').strip()
            endereco    = f"{end}, {num}" if num else end
            bairro      = (row['Bairro'] or '').strip()
            complemento = (row['Complemento'] or '').strip()
            id_cidade   = _CIDADE_IDS.get(row['Cidade'] or '', '')
    except Exception as ex:
        logger.warning(f"_ixc_criar_os: erro ao buscar endereço: {ex}")

    # Busca configurações IXC salvas pelo admin
    id_ticket_setor = ''
    id_atendente    = ''
    id_resposta     = ''
    try:
        _cfg_conn = current_app.config['GET_DB_CONNECTION']()
        try:
            rows_cfg = _cfg_conn.execute(
                "SELECT key, value FROM Settings WHERE key IN ('ixc_setor_id','ixc_id_atendente','ixc_id_resposta')"
            ).fetchall()
            cfg_map = {r['key']: (r['value'] or '').strip() for r in rows_cfg}
            id_ticket_setor = cfg_map.get('ixc_setor_id', '')
            id_atendente    = cfg_map.get('ixc_id_atendente', '')
            id_resposta     = cfg_map.get('ixc_id_resposta', '')
        finally:
            _cfg_conn.close()
    except Exception:
        pass

    if not id_ticket_setor:
        logger.warning("_ixc_criar_os: ixc_setor_id não configurado")

    encoded = base64.b64encode(token.encode()).decode()
    headers = {
        'Authorization': f'Basic {encoded}',
        'Content-Type': 'application/json',
    }
    payload = {
        'tipo':             'C',
        'titulo':           titulo or mensagem or '',
        'id_cliente':       str(id_cliente_ixc),
        'id_filial':        '2',
        'id_contrato':      str(id_contrato),
        'id_ticket_setor':  id_ticket_setor,
        'origem_endereco':  'M',
        'prioridade':       'M',
        'menssagem':        mensagem or titulo or '',
        'status':           'A',
        'su_status':        'N',
        'atualizar_cliente':'N',
        'atualizar_login':  'N',
    }
    if id_assunto_ixc:
        payload['id_assunto'] = str(id_assunto_ixc)
    if id_atendente:
        payload['id_atendente']   = str(id_atendente)
        payload['id_colaborador'] = str(id_atendente)
    try:
        resp = requests.post(f'{_IXC_BASE}/su_ticket', json=payload,
                             headers=headers, timeout=15, verify=False)
        txt = resp.text.strip()
        logger.info(f"_ixc_criar_os status={resp.status_code} body={txt[:400]!r}")
        if not txt or txt.startswith('<'):
            return None
        d = resp.json()
        if d.get('type') == 'error':
            logger.warning(f"_ixc_criar_os IXC error: {d.get('message')}")
            return None
        os_id = d.get('id') or d.get('id_ticket') or d.get('id_chamado')
        if not os_id:
            return None
        os_id = str(os_id)

        # Se deve fechar, envia mensagem de resolução via su_mensagens
        if fechar:
            try:
                cr = requests.post(
                    f'{_IXC_BASE}/su_mensagens',
                    json={
                        'id_ticket':   os_id,
                        'id_cliente':  str(id_cliente_ixc),
                        'su_status':   'S',
                        'id_resposta': id_resposta or '',
                        'mensagem':    mensagem or titulo or 'Atendimento resolvido',
                    },
                    headers=headers, timeout=15, verify=False
                )
                logger.info(f"_ixc_criar_os fechar su_mensagens status={cr.status_code} body={cr.text[:300]!r}")
            except Exception as ex:
                logger.warning(f"_ixc_criar_os: falha ao fechar ticket {os_id}: {ex}")

        return os_id
    except Exception as ex:
        logger.error(f"_ixc_criar_os: {ex}")
        return None


def _ixc_mensagens(os_id, token):
    """Busca mensagens da OS. Tenta FKs alternativos pois o campo varia."""
    for fk in ('id_os', 'id_oss_chamado', 'id_chamado'):
        d = _ixc_post('su_oss_chamado_mensagem', {
            'qtype':     f'su_oss_chamado_mensagem.{fk}',
            'query':     str(os_id),
            'oper':      '=',
            'sortname':  'su_oss_chamado_mensagem.id',
            'sortorder': 'asc',
            'rp':        '200',
            'page':      '1',
        }, token)
        if d is not None:
            recs = d.get('registros', [])
            # IXCsoft retorna HTML de erro quando o campo não existe → d seria None
            # Se chegou aqui, o campo existe e total pode ser 0 (OS sem mensagens)
            logger.info(f"mensagens fk={fk} total={d.get('total')} recs={len(recs)}")
            return recs
    return []


def _ixc_arquivos(os_id, token):
    """Busca arquivos da OS. FK confirmado: id_oss_chamado."""
    d = _ixc_post('su_oss_chamado_arquivos', {
        'qtype':     'su_oss_chamado_arquivos.id_oss_chamado',
        'query':     str(os_id),
        'oper':      '=',
        'sortname':  'su_oss_chamado_arquivos.id',
        'sortorder': 'asc',
        'rp':        '200',
        'page':      '1',
    }, token)
    if d is not None:
        return d.get('registros', [])
    return []


@behavior_bp.route('/ixc-file')
def api_ixc_file():
    """Proxy autenticado para arquivos do IXC via endpoint visualizar_arquivo_os."""
    if not current_user.is_authenticated:
        return '', 401
    arquivo_id = request.args.get('id', '').strip()
    if not arquivo_id or not arquivo_id.isdigit():
        return '', 400
    try:
        token = _ret_get_token()
        if not token:
            return '', 500
        encoded = base64.b64encode(token.encode()).decode()
        headers = {
            'Authorization': f'Basic {encoded}',
            'Content-Type': 'application/json',
            'ixcsoft': 'listar',
        }
        # GET com JSON body — padrão IXC confirmado em app-netvale-acs
        r = requests.get(f'{_IXC_BASE}/visualizar_arquivo_os',
                         json={'id': arquivo_id},
                         headers=headers,
                         timeout=30, verify=False, stream=True)
        logger.info(f"ixc-file id={arquivo_id} status={r.status_code} ct={r.headers.get('Content-Type')}")
        if r.status_code != 200:
            return '', r.status_code
        from flask import Response, stream_with_context
        ct = r.headers.get('Content-Type', 'application/octet-stream')
        return Response(stream_with_context(r.iter_content(8192)),
                        status=200, content_type=ct)
    except Exception as e:
        logger.error(f"ixc-file id={arquivo_id}: {e}")
        return '', 502


@behavior_bp.route('/retiradas/<int:os_id>/mensagens')
def api_ret_mensagens(os_id):
    if not current_user.is_authenticated:
        return jsonify({'error': 'Não autenticado'}), 401
    try:
        token = _ret_get_token()
        if not token:
            return jsonify({'error': 'Token IXC não configurado'}), 500
        records = _ixc_mensagens(os_id, token)
        return jsonify({'mensagens': records})
    except Exception as e:
        logger.error(f"Erro mensagens OS {os_id}: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500


@behavior_bp.route('/retiradas/<int:os_id>/arquivos')
def api_ret_arquivos(os_id):
    if not current_user.is_authenticated:
        return jsonify({'error': 'Não autenticado'}), 401
    try:
        token = _ret_get_token()
        if not token:
            return jsonify({'error': 'Token IXC não configurado'}), 500
        records = _ixc_arquivos(os_id, token)
        return jsonify({'arquivos': records})
    except Exception as e:
        logger.error(f"Erro arquivos OS {os_id}: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500


@behavior_bp.route('/retiradas/arquivos-counts', methods=['POST'])
def api_ret_arquivos_counts():
    """Retorna contagem de arquivos para múltiplas OS (requests paralelos ao IXC)."""
    if not current_user.is_authenticated:
        return jsonify({'error': 'Não autenticado'}), 401
    try:
        os_ids = request.get_json(force=True).get('os_ids', [])
        if not os_ids:
            return jsonify({'counts': {}})
        token = _ret_get_token()
        if not token:
            return jsonify({'counts': {}})

        from concurrent.futures import ThreadPoolExecutor, as_completed

        def _count_one(os_id):
            try:
                recs = _ixc_arquivos(os_id, token)
                if not recs:
                    return str(os_id), 0
                # Conta dias distintos (cada dia com arquivo = 1 visita)
                dias = set()
                for rec in recs:
                    dt = (rec.get('data_envio') or rec.get('data') or '')[:10]
                    if dt and dt != '0000-00-00':
                        dias.add(dt)
                return str(os_id), len(dias) if dias else len(recs)
            except Exception:
                return str(os_id), 0

        counts = {str(i): 0 for i in os_ids}
        with ThreadPoolExecutor(max_workers=8) as ex:
            futures = {ex.submit(_count_one, oid): oid for oid in os_ids}
            for fut in as_completed(futures):
                k, n = fut.result()
                counts[k] = n

        # Salva no cache SQLite para uso pelo filtro server-side
        try:
            db = current_app.config['GET_DB_CONNECTION']()
            db.execute("""CREATE TABLE IF NOT EXISTS ret_visitas_cache
                (os_id TEXT PRIMARY KEY, visitas INTEGER DEFAULT 0, updated_at TEXT)""")
            db.executemany(
                "INSERT OR REPLACE INTO ret_visitas_cache VALUES(?,?,datetime('now'))",
                list(counts.items()))
            db.commit()
            db.close()
        except Exception as _ce:
            logger.warning(f"Erro ao salvar visitas cache: {_ce}")

        return jsonify({'counts': counts})
    except Exception as e:
        logger.error(f"Erro arquivos-counts: {e}", exc_info=True)
        return jsonify({'counts': {}})


@behavior_bp.route('/retiradas/cliente-perfil')
def api_ret_cliente_perfil():
    """Retorna dados completos de um cliente: OS, contratos, atendimentos, faturas, equipamentos."""
    if not current_user.is_authenticated:
        return jsonify({'error': 'Não autenticado'}), 401
    nome = request.args.get('cliente', '').strip()
    if not nome:
        return jsonify({'error': 'Cliente não informado'}), 400
    conn = None
    try:
        conn = current_app.config['GET_DB_CONNECTION']()
        like = f'%{nome}%'

        # Contratos
        contratos = conn.execute("""
            SELECT ID, Status_contrato, Status_acesso, Plano_de_venda, Descri_o,
                   Data_ativa_o, Cidade, Bairro, Endere_o, Telefone_celular,
                   Pago_at, Dia_fixo_do_vencimento, Filial
            FROM Contratos WHERE Cliente LIKE ? ORDER BY ID DESC LIMIT 20
        """, (like,)).fetchall()

        # OS (todas, não só retirada)
        os_rows = conn.execute("""
            SELECT ID, Assunto, Status, Colaborador, Abertura, Agendamento,
                   Cidade, Bairro, Mensagem, Protocolo, In_cio, Final
            FROM OS WHERE Cliente LIKE ? ORDER BY Abertura DESC LIMIT 100
        """, (like,)).fetchall()

        # Atendimentos
        atend = conn.execute("""
            SELECT ID, Assunto, Descri_o_assunto, Novo_status, Criado_em,
                   ltima_altera_o, Departamento, Respons_vel, Descri_o
            FROM Atendimentos WHERE Cliente LIKE ? ORDER BY Criado_em DESC LIMIT 50
        """, (like,)).fetchall()

        # Faturas (Contas_a_Receber)
        faturas = conn.execute("""
            SELECT ID, Status, Emissao, Vencimento, Valor, Valor_recebido,
                   Data_pagamento, Inadimpl_ncia, Parcela, Documento
            FROM Contas_a_Receber WHERE Cliente LIKE ? ORDER BY Vencimento DESC LIMIT 60
        """, (like,)).fetchall()

        # Equipamentos (via contratos)
        ct_ids = [str(r[0]) for r in contratos]
        equip = []
        if ct_ids:
            ph2 = ','.join('?' * len(ct_ids))
            equip = conn.execute(
                f"SELECT ID_contrato, Descricao_produto, Status_comodato, Quantidade FROM Equipamento WHERE CAST(ID_contrato AS TEXT) IN ({ph2}) LIMIT 30",
                ct_ids
            ).fetchall()

        def _c(v): return None if v in (None, '', '0000-00-00', '0000-00-00 00:00:00') else v

        return jsonify({
            'cliente': nome,
            'contratos': [{
                'id': r[0], 'status': r[1], 'status_acesso': r[2], 'plano': r[3],
                'descricao': r[4], 'ativacao': _c(r[5]), 'cidade': r[6],
                'bairro': r[7], 'endereco': r[8], 'telefone': r[9],
                'pago_ate': _c(r[10]), 'vencimento_dia': r[11], 'filial': r[12],
            } for r in contratos],
            'ordens': [{
                'id': r[0], 'assunto': r[1], 'status': r[2], 'colaborador': r[3],
                'abertura': _c(r[4]), 'agendamento': _c(r[5]), 'cidade': r[6],
                'bairro': r[7], 'mensagem': (r[8] or '')[:200], 'protocolo': r[9],
                'inicio': _c(r[10]), 'final': _c(r[11]),
            } for r in os_rows],
            'atendimentos': [{
                'id': r[0], 'assunto': r[1], 'tipo_assunto': r[2], 'status': r[3],
                'criado_em': _c(r[4]), 'ultima_alt': _c(r[5]), 'departamento': r[6],
                'responsavel': r[7], 'descricao': (r[8] or '')[:300],
            } for r in atend],
            'faturas': [{
                'id': r[0], 'status': r[1], 'emissao': _c(r[2]), 'vencimento': _c(r[3]),
                'valor': r[4], 'recebido': r[5], 'pagamento': _c(r[6]),
                'inadimplente': r[7], 'parcela': r[8], 'documento': r[9],
            } for r in faturas],
            'equipamentos': [{
                'contrato': r[0], 'descricao': r[1], 'status': r[2], 'quantidade': r[3],
            } for r in equip],
        })
    except Exception as e:
        logger.error(f"Erro cliente-perfil: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500
    finally:
        if conn: conn.close()


@behavior_bp.route('/retiradas/producao-tecnico')
def api_ret_producao_tecnico():
    """Produção dia-a-dia por técnico para um mês específico."""
    if not current_user.is_authenticated:
        return jsonify({'error': 'Não autenticado'}), 401
    import re as _re, calendar as _cal
    mes = request.args.get('mes', '')
    if not mes or not _re.match(r'^\d{4}-\d{2}$', mes):
        from datetime import date as _d
        mes = _d.today().strftime('%Y-%m')
    conn = None
    try:
        conn = current_app.config['GET_DB_CONNECTION']()
        ph = ','.join('?' * len(RETIRADA_ASSUNTOS))
        _CIDADES_OP = ('Dom Pedro', 'Presidente Dutra', 'Tuntum', 'São Domingos do Maranhão')
        _ph_cid = ','.join('?' * len(_CIDADES_OP))
        year, month = int(mes[:4]), int(mes[5:])
        _, num_days = _cal.monthrange(year, month)

        rows = conn.execute(f"""
            SELECT o.Colaborador,
                   CAST(strftime('%d',
                       CASE WHEN o.Fechamento IS NOT NULL AND o.Fechamento != ''
                                 AND o.Fechamento NOT LIKE '0000%'
                            THEN o.Fechamento ELSE o.Final END
                   ) AS INTEGER) AS dia,
                   COUNT(*) AS cnt
            FROM OS o
            WHERE o.Assunto IN ({ph})
            AND o.Cidade IN ({_ph_cid})
            AND o.Status = 'Finalizada'
            AND o.Colaborador IS NOT NULL AND TRIM(o.Colaborador) != '' AND o.Colaborador != '0'
            AND strftime('%Y-%m',
                CASE WHEN o.Fechamento IS NOT NULL AND o.Fechamento != ''
                          AND o.Fechamento NOT LIKE '0000%'
                     THEN o.Fechamento ELSE o.Final END
            ) = ?
            GROUP BY o.Colaborador, dia
            ORDER BY o.Colaborador, dia
        """, list(RETIRADA_ASSUNTOS) + list(_CIDADES_OP) + [mes]).fetchall()

        _tec_map = _get_tecnicos_map()
        _colab_dias = {}
        for r in rows:
            cid = str(r[0]).strip()
            if cid not in _colab_dias:
                nome = _tec_map.get(cid) or _tec_map.get(cid.lstrip('0')) or f'#{cid}'
                _colab_dias[cid] = {'id': cid, 'nome': nome, 'dias': {}}
            _colab_dias[cid]['dias'][r[1]] = r[2]

        por_colab = sorted(
            [{'id': v['id'], 'nome': v['nome'], 'dias': v['dias'],
              'total': sum(v['dias'].values())}
             for v in _colab_dias.values()],
            key=lambda x: -x['total']
        )
        return jsonify({'por_colaborador': por_colab, 'num_days': num_days, 'mes': mes})
    except Exception as e:
        logger.error(f"Erro producao-tecnico: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500
    finally:
        if conn: conn.close()


@behavior_bp.route('/retiradas/producao-tecnico-os')
def api_ret_producao_tecnico_os():
    """OS de um técnico em um dia específico (Abertura)."""
    if not current_user.is_authenticated:
        return jsonify({'error': 'Não autenticado'}), 401
    colab = request.args.get('colab', '').strip()
    mes   = request.args.get('mes', '').strip()
    dia   = request.args.get('dia', '').strip()
    if not colab or not mes or not dia:
        return jsonify({'error': 'Parâmetros faltando'}), 400
    conn = None
    try:
        conn = current_app.config['GET_DB_CONNECTION']()
        dia_fmt = dia.zfill(2)
        data_exata = f"{mes}-{dia_fmt}"
        rows = conn.execute("""
            SELECT o.ID, o.Cliente, o.Status, o.Bairro, o.Cidade,
                   o.Assunto, o.Abertura,
                   CASE WHEN o.Fechamento IS NOT NULL AND o.Fechamento != ''
                             AND o.Fechamento NOT LIKE '0000%'
                        THEN o.Fechamento ELSE o.Final END AS data_fin
            FROM OS o
            WHERE CAST(o.Colaborador AS TEXT) = ?
            AND o.Status = 'Finalizada'
            AND strftime('%Y-%m-%d',
                CASE WHEN o.Fechamento IS NOT NULL AND o.Fechamento != ''
                          AND o.Fechamento NOT LIKE '0000%'
                     THEN o.Fechamento ELSE o.Final END
            ) = ?
            ORDER BY data_fin
        """, (colab, data_exata)).fetchall()
        _tec_map = _get_tecnicos_map()
        nome_tec = _tec_map.get(str(colab)) or f'#{colab}'
        ordens = [{'id': r[0], 'cliente': r[1], 'status': r[2], 'bairro': r[3],
                   'cidade': r[4], 'assunto': r[5], 'abertura': r[6], 'fechamento': r[7]}
                  for r in rows]
        return jsonify({'ordens': ordens, 'tecnico': nome_tec, 'data': data_exata})
    except Exception as e:
        logger.error(f"Erro producao-tecnico-os: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500
    finally:
        if conn: conn.close()


@behavior_bp.route('/retiradas/atividade-tecnico-os')
def api_ret_atividade_tecnico_os():
    """OS com atividade (fotos/arquivos) de um técnico em um dia específico."""
    if not current_user.is_authenticated:
        return jsonify({'error': 'Não autenticado'}), 401
    import json as _json
    colab = request.args.get('colab', '').strip()
    mes   = request.args.get('mes', '').strip()
    dia   = request.args.get('dia', '').strip()
    if not colab or not mes or not dia:
        return jsonify({'error': 'Parâmetros faltando'}), 400
    conn = None
    try:
        conn = current_app.config['GET_DB_CONNECTION']()
        dia_fmt  = dia.zfill(2)
        data_exata = f"{mes}-{dia_fmt}"
        # Busca os_ids do cache cuja lista de datas inclui data_exata para esse colaborador
        cache_rows = conn.execute(
            "SELECT os_id, datas FROM ret_atividade_cache WHERE colaborador = ?",
            (colab,)
        ).fetchall()
        os_ids_com_ativ = []
        for os_id, datas_json in cache_rows:
            try:
                datas = _json.loads(datas_json or '[]')
                if data_exata in datas:
                    os_ids_com_ativ.append(str(os_id))
            except Exception:
                continue
        if not os_ids_com_ativ:
            _tec_map = _get_tecnicos_map()
            return jsonify({'ordens': [], 'tecnico': _tec_map.get(str(colab)) or f'#{colab}',
                            'data': data_exata})
        ph = ','.join('?' * len(os_ids_com_ativ))
        rows = conn.execute(f"""
            SELECT o.ID, o.Cliente, o.Status, o.Bairro, o.Cidade,
                   o.Assunto, o.Abertura, o.Mensagem
            FROM OS o WHERE CAST(o.ID AS TEXT) IN ({ph})
            ORDER BY o.Cliente
        """, os_ids_com_ativ).fetchall()
        _tec_map = _get_tecnicos_map()
        nome_tec = _tec_map.get(str(colab)) or f'#{colab}'
        ordens = [{'id': r[0], 'cliente': r[1], 'status': r[2], 'bairro': r[3],
                   'cidade': r[4], 'assunto': r[5], 'abertura': r[6], 'mensagem': r[7]}
                  for r in rows]
        return jsonify({'ordens': ordens, 'tecnico': nome_tec, 'data': data_exata})
    except Exception as e:
        logger.error(f"Erro atividade-tecnico-os: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500
    finally:
        if conn: conn.close()


@behavior_bp.route('/retiradas/atividade-tecnico')
def api_ret_atividade_tecnico():
    """Atividade dia-a-dia por técnico (fotos/arquivos IXC) para um mês, do cache."""
    if not current_user.is_authenticated:
        return jsonify({'error': 'Não autenticado'}), 401
    import re as _re, calendar as _cal, json as _json
    mes = request.args.get('mes', '')
    if not mes or not _re.match(r'^\d{4}-\d{2}$', mes):
        from datetime import date as _d
        mes = _d.today().strftime('%Y-%m')
    conn = None
    try:
        conn = current_app.config['GET_DB_CONNECTION']()
        conn.execute("""CREATE TABLE IF NOT EXISTS ret_atividade_cache
            (os_id TEXT PRIMARY KEY, colaborador TEXT, datas TEXT, updated_at TEXT)""")
        year, month = int(mes[:4]), int(mes[5:])
        _, num_days = _cal.monthrange(year, month)
        prefix = mes + '-'

        rows = conn.execute(
            "SELECT os_id, colaborador, datas FROM ret_atividade_cache"
        ).fetchall()

        # Técnicos com pelo menos uma OS Finalizada no mês (mesmo critério da tabela de Produção)
        _CIDADES_OP = ('Dom Pedro', 'Presidente Dutra', 'Tuntum', 'São Domingos do Maranhão')
        ph_ass = ','.join('?' * len(RETIRADA_ASSUNTOS))
        ph_cid = ','.join('?' * len(_CIDADES_OP))
        fin_rows = conn.execute(f"""
            SELECT DISTINCT o.Colaborador
            FROM OS o
            WHERE o.Assunto IN ({ph_ass})
            AND o.Cidade IN ({ph_cid})
            AND o.Status = 'Finalizada'
            AND strftime('%Y-%m',
                CASE WHEN o.Fechamento IS NOT NULL AND o.Fechamento != ''
                          AND o.Fechamento NOT LIKE '0000%'
                     THEN o.Fechamento ELSE o.Final END
            ) = ?
        """, list(RETIRADA_ASSUNTOS) + list(_CIDADES_OP) + [mes]).fetchall()
        colab_com_fin = {str(r[0]).strip() for r in fin_rows if r[0]}

        _tec_map = _get_tecnicos_map()
        _colab_dias = {}
        for os_id, cid, datas_json in rows:
            if not cid or cid == '0':
                continue
            cid = str(cid).strip()
            if cid not in colab_com_fin:
                continue  # só exibe técnicos com finalizada no mês
            try:
                datas = _json.loads(datas_json or '[]')
            except Exception:
                continue
            dias_mes = [int(d[8:10]) for d in datas if d.startswith(prefix)]
            if not dias_mes:
                continue
            if cid not in _colab_dias:
                nome = _tec_map.get(cid) or f'#{cid}'
                _colab_dias[cid] = {'id': cid, 'nome': nome, 'dias': {}}
            for dia in dias_mes:
                _colab_dias[cid]['dias'][dia] = _colab_dias[cid]['dias'].get(dia, 0) + 1

        por_colab = sorted(
            [{'id': v['id'], 'nome': v['nome'], 'dias': v['dias'],
              'total': sum(v['dias'].values())}
             for v in _colab_dias.values()],
            key=lambda x: -x['total']
        )
        return jsonify({'por_colaborador': por_colab, 'num_days': num_days, 'mes': mes,
                        'cache_updated': bool(rows)})
    except Exception as e:
        logger.error(f"Erro atividade-tecnico: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500
    finally:
        if conn: conn.close()


def _atividade_bg_sync(app, bg_ids, ativ_colab_map, token):
    """Thread de background: salva atividade IXC para OS do historico amplo."""
    import json as _json
    from concurrent.futures import ThreadPoolExecutor, as_completed
    try:
        with app.app_context():
            def _fetch_dates(os_id):
                try:
                    recs = _ixc_arquivos(os_id, token)
                    dias = set()
                    for rec in (recs or []):
                        dt = (rec.get('data_envio') or rec.get('data') or '')[:10]
                        if dt and dt != '0000-00-00':
                            dias.add(dt)
                    return str(os_id), dias
                except Exception:
                    return str(os_id), set()

            rows = []
            with ThreadPoolExecutor(max_workers=6) as ex:
                futures = {ex.submit(_fetch_dates, oid): oid for oid in bg_ids}
                for fut in as_completed(futures):
                    k, dias = fut.result()
                    rows.append((k, ativ_colab_map.get(k, ''), _json.dumps(sorted(dias))))

            db = app.config['GET_DB_CONNECTION']()
            db.execute("""CREATE TABLE IF NOT EXISTS ret_atividade_cache
                (os_id TEXT PRIMARY KEY, colaborador TEXT, datas TEXT, updated_at TEXT)""")
            db.executemany(
                "INSERT OR REPLACE INTO ret_atividade_cache VALUES(?,?,?,datetime('now'))",
                rows)
            db.commit()
            db.close()
            logger.info(f"BG atividade sync concluido: {len(rows)} OS")
    except Exception as e:
        logger.error(f"BG atividade sync erro: {e}", exc_info=True)


@behavior_bp.route('/retiradas/sync-visitas', methods=['POST'])
def api_ret_sync_visitas():
    """Busca e salva visitas no cache SQLite para as OS que batem os filtros.
    A parte de atividade historica (12 meses) roda em background para nao causar timeout."""
    if not current_user.is_authenticated:
        return jsonify({'error': 'Não autenticado'}), 401
    conn = None
    try:
        conn = current_app.config['GET_DB_CONNECTION']()

        # Filtros da UI (para visitas)
        status_f  = request.args.get('status', '')
        assunto_f = request.args.get('assunto', '')
        filial_f  = request.args.get('filial', '')
        cidade_f  = request.args.get('cidade', '')
        bairro_f  = request.args.get('bairro', '')
        colab_f   = request.args.get('colaborador', '')
        equip_f   = request.args.get('equipamento', '').strip()
        date_from = request.args.get('date_from', '')
        date_to   = request.args.get('date_to', '')
        search    = request.args.get('search', '').strip()

        ph = ','.join('?' * len(RETIRADA_ASSUNTOS))
        conds  = [f"o.Assunto IN ({ph})"]
        params = list(RETIRADA_ASSUNTOS)

        if status_f:
            status_list = [s.strip() for s in status_f.split(',') if s.strip()]
            if len(status_list) == 1:
                conds.append("o.Status = ?"); params.append(status_list[0])
            elif status_list:
                sph = ','.join('?' * len(status_list))
                conds.append(f"o.Status IN ({sph})"); params.extend(status_list)
        if assunto_f:
            conds.append("o.Assunto = ?"); params.append(assunto_f)
        if filial_f:
            conds.append("o.Filial = ?"); params.append(filial_f)
        if cidade_f:
            conds.append("o.Cidade = ?"); params.append(cidade_f)
        if bairro_f:
            conds.append("o.Bairro = ?"); params.append(bairro_f)
        if colab_f:
            conds.append("o.Colaborador = ?"); params.append(colab_f)
        if equip_f:
            contratos_com_equip = [
                str(r[0]) for r in conn.execute(
                    "SELECT DISTINCT ID_contrato FROM Equipamento WHERE Descricao_produto = ?",
                    (equip_f,)
                ).fetchall()
            ]
            if contratos_com_equip:
                ph_eq = ','.join('?' * len(contratos_com_equip))
                conds.append(f"CAST(o.Contrato AS TEXT) IN ({ph_eq})")
                params.extend(contratos_com_equip)
            else:
                conds.append("1=0")
        if date_from:
            conds.append("o.Abertura >= ?"); params.append(date_from)
        if date_to:
            conds.append("o.Abertura <= ?"); params.append(date_to + ' 23:59:59')
        if search:
            conds.append("(o.Cliente LIKE ? OR o.Endere_o LIKE ? OR o.Bairro LIKE ? OR o.Mensagem LIKE ?)")
            s = f'%{search}%'
            params.extend([s, s, s, s])

        where = 'WHERE ' + ' AND '.join(conds)
        os_rows = conn.execute(
            f"SELECT o.ID, o.Colaborador FROM OS o {where}", params).fetchall()

        # Query ampla para atividade (12 meses, sem filtros de data/status/pesquisa)
        ativ_ph = ','.join('?' * len(RETIRADA_ASSUNTOS))
        ativ_conds  = [f"o.Assunto IN ({ativ_ph})", "o.Abertura >= date('now', '-12 months')"]
        ativ_params = list(RETIRADA_ASSUNTOS)
        if assunto_f:
            ativ_conds.append("o.Assunto = ?"); ativ_params.append(assunto_f)
        if filial_f:
            ativ_conds.append("o.Filial = ?"); ativ_params.append(filial_f)
        if colab_f:
            ativ_conds.append("o.Colaborador = ?"); ativ_params.append(colab_f)
        ativ_where = 'WHERE ' + ' AND '.join(ativ_conds)
        ativ_rows = conn.execute(
            f"SELECT o.ID, o.Colaborador FROM OS o {ativ_where}", ativ_params).fetchall()

        # Quais OS do historico ja estao frescos no cache (atualizados ha menos de 7 dias)
        conn.execute("""CREATE TABLE IF NOT EXISTS ret_atividade_cache
            (os_id TEXT PRIMARY KEY, colaborador TEXT, datas TEXT, updated_at TEXT)""")
        fresh_set = set(
            r[0] for r in conn.execute(
                "SELECT os_id FROM ret_atividade_cache WHERE updated_at >= datetime('now', '-7 days')"
            ).fetchall()
        )

        conn.close()
        conn = None

        visitas_set    = set(str(r[0]) for r in os_rows)
        colab_map      = {str(r[0]): str(r[1] or '') for r in os_rows}
        ativ_colab_map = {str(r[0]): str(r[1] or '') for r in ativ_rows}
        ativ_colab_map.update(colab_map)  # filtrado tem prioridade

        # IDs a buscar agora (sync): apenas OS filtradas pelo usuario
        sync_ids = list(visitas_set)
        # IDs a buscar em background: OS do historico amplo nao frescas e nao no sync
        bg_ids   = [oid for oid in ativ_colab_map if oid not in visitas_set
                    and oid not in fresh_set]

        if not sync_ids and not bg_ids:
            return jsonify({'synced': 0, 'counts': {}, 'atividade_hoje': {},
                            'atividade_bg': 0})

        token = _ret_get_token()
        if not token:
            return jsonify({'error': 'Sem token IXC'}), 500

        from concurrent.futures import ThreadPoolExecutor, as_completed
        from datetime import date as _date
        import json as _json
        _today = _date.today().isoformat()

        def _count_one(os_id):
            try:
                recs = _ixc_arquivos(os_id, token)
                if not recs:
                    return str(os_id), 0, set()
                dias = set()
                for rec in recs:
                    dt = (rec.get('data_envio') or rec.get('data') or '')[:10]
                    if dt and dt != '0000-00-00':
                        dias.add(dt)
                return str(os_id), len(dias) if dias else len(recs), dias
            except Exception:
                return str(os_id), 0, set()

        # Busca sincrona: apenas OS filtradas
        counts    = {}
        datas_map = {}
        with ThreadPoolExecutor(max_workers=8) as ex:
            futures = {ex.submit(_count_one, oid): oid for oid in sync_ids}
            for fut in as_completed(futures):
                k, n, dias = fut.result()
                counts[k]    = n
                datas_map[k] = dias

        tec_map = _get_tecnicos_map()

        db = current_app.config['GET_DB_CONNECTION']()
        db.execute("""CREATE TABLE IF NOT EXISTS ret_visitas_cache
            (os_id TEXT PRIMARY KEY, visitas INTEGER DEFAULT 0, updated_at TEXT)""")
        db.execute("""CREATE TABLE IF NOT EXISTS ret_atividade_cache
            (os_id TEXT PRIMARY KEY, colaborador TEXT, datas TEXT, updated_at TEXT)""")
        db.executemany(
            "INSERT OR REPLACE INTO ret_visitas_cache VALUES(?,?,datetime('now'))",
            [(k, counts.get(k, 0)) for k in visitas_set])
        db.executemany(
            "INSERT OR REPLACE INTO ret_atividade_cache VALUES(?,?,?,datetime('now'))",
            [(k, colab_map.get(k, ''), _json.dumps(sorted(datas_map.get(k, set()))))
             for k in visitas_set if k in datas_map])
        db.commit()
        db.close()

        # Atividade hoje (apenas das OS ja buscadas)
        from collections import defaultdict as _dd
        _ativ_colab = _dd(int)
        for oid, dias in datas_map.items():
            if _today in dias:
                cid  = colab_map.get(oid, '')
                nome = tec_map.get(cid, cid) if cid else '—'
                _ativ_colab[nome] += 1
        atividade_hoje = dict(_ativ_colab)

        # Dispara sync de historico em background (nao bloqueia resposta)
        import threading
        if bg_ids:
            app_obj = current_app._get_current_object()
            threading.Thread(
                target=_atividade_bg_sync,
                args=(app_obj, bg_ids, ativ_colab_map, token),
                daemon=True
            ).start()

        return jsonify({
            'synced': len(visitas_set),
            'synced_atividade': len(bg_ids),
            'counts': counts,
            'atividade_hoje': atividade_hoje,
            'atividade_bg': len(bg_ids),
        })
    except Exception as e:
        if conn:
            try: conn.close()
            except: pass
        logger.error(f"Erro sync-visitas: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500

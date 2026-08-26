import pandas as pd
import sqlite3
import json as _json
from flask import Blueprint, jsonify, request, abort, current_app
from flask_login import current_user

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
    # /client_detail/<id> — sem restrição de aba, apenas módulo
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

    # Verifica acesso ao módulo behavior
    if 'behavior' not in perm_list:
        return jsonify({"error": "Sem acesso ao módulo de Análise de Comportamento"}), 403

    # Verifica acesso à aba específica (somente se existirem behavior:* na lista)
    behavior_tab_perms = [p for p in perm_list if p.startswith('behavior:')]
    if behavior_tab_perms:
        # Normaliza path: /api/behavior/payment_profile → /payment_profile
        suffix = request.path[len('/api/behavior'):]
        # Remove parâmetros de rota dinâmicos ex: /client_detail/123 → /client_detail
        suffix_base = '/' + suffix.lstrip('/').split('/')[0]
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
                CASE WHEN S.Risk_Score >= 60 THEN 'Alto'
                     WHEN S.Risk_Score >= 25 THEN 'Médio'
                     WHEN S.Risk_Score >= 10 THEN 'Baixo'
                     ELSE 'Saudável' END AS Nivel_Risco,
                COALESCE(CLI.Telefone, '') AS Telefone,
                COALESCE(CLI.WhatsApp, '') AS WhatsApp
            FROM Scored S
            LEFT JOIN Clientes CLI ON CLI.Raz_o_social = S.Cliente
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
            "SELECT DISTINCT Cidade FROM Contratos WHERE Cidade IS NOT NULL AND TRIM(Cidade) != '' AND Status_contrato = 'Ativo' ORDER BY Cidade"
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

        filters = ["C.Status_contrato = 'Ativo'", "CF.Sinal_RX IS NOT NULL"]
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
            GROUP BY faixa
        """

        kpi_sql = f"""
            SELECT COUNT(*) AS total,
                   AVG(JULIANDAY(Data_cancelamento) - JULIANDAY(Data_ativa_o)) AS avg_days
            FROM Contratos
            WHERE Data_cancelamento IS NOT NULL AND Data_cancelamento != ''
              AND Data_ativa_o IS NOT NULL AND Data_ativa_o != ''
              {city_sql}
        """

        cities_sql = """
            SELECT DISTINCT Cidade FROM Contratos
            WHERE Data_cancelamento IS NOT NULL AND Data_cancelamento != ''
              AND Cidade IS NOT NULL AND TRIM(Cidade) != ''
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
        city   = request.args.get('city',   '').strip()
        tier   = request.args.get('tier',   '').strip()
        limit  = request.args.get('limit',  50,  type=int)
        offset = request.args.get('offset', 0,   type=int)

        city_cond = "AND Cidade = ?" if city else ""
        city_p    = [city] if city else []

        tier_cond = "AND tier = ?" if tier else ""
        tier_p    = [tier] if tier else []

        # Identical base CTE to /contact_list, extended with the Alerted tier CTE
        base_cte = f"""
            WITH ActiveContracts AS (
                SELECT ID, Cliente, Cidade, Data_ativa_o, Status_contrato, Status_acesso
                FROM Contratos
                WHERE Status_contrato = 'Ativo'
                  AND Status_acesso != 'Desativado'
                  {city_cond}
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
            SELECT COUNT(*) AS cnt FROM Alerted WHERE 1=1 {tier_cond}
        """

        data_sql = base_cte + f"""
            SELECT A.contrato, A.cliente, A.cidade, A.fat_vencidas, A.dias_vencido,
                   A.atend_30d, A.sem_conexao, A.score, A.tier,
                   COALESCE(CLI.Telefone, '') AS telefone,
                   COALESCE(CLI.WhatsApp, '') AS whatsapp
            FROM Alerted A
            LEFT JOIN Clientes CLI ON CLI.Raz_o_social = A.cliente
            WHERE 1=1 {tier_cond}
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
        total_rows  = conn.execute(count_sql,   tuple(city_p) + tuple(tier_p)).fetchone()[0]
        data_rows   = conn.execute(data_sql,    tuple(city_p) + tuple(tier_p) + (limit, offset)).fetchall()
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
            SELECT
                COUNT(*) AS total,
                SUM(CASE WHEN Motivo_cancelamento IS NULL
                              OR TRIM(Motivo_cancelamento) = ''
                              OR CAST(Motivo_cancelamento AS INTEGER) = 0
                         THEN 1 ELSE 0 END) AS sem_motivo,
                AVG((JULIANDAY(Data_cancelamento) - JULIANDAY(Data_ativa_o)) / 30.0) AS avg_permanencia
            FROM Contratos
            WHERE Data_cancelamento IS NOT NULL AND Data_cancelamento != ''
        """).fetchone()

        motivo_rows = conn.execute("""
            SELECT
                CAST(Motivo_cancelamento AS INTEGER) AS motivo_id,
                COUNT(*) AS total,
                AVG((JULIANDAY(Data_cancelamento) - JULIANDAY(Data_ativa_o)) / 30.0) AS avg_meses
            FROM Contratos
            WHERE Data_cancelamento IS NOT NULL AND Data_cancelamento != ''
              AND Motivo_cancelamento IS NOT NULL
              AND TRIM(Motivo_cancelamento) != ''
              AND CAST(Motivo_cancelamento AS INTEGER) != 0
            GROUP BY Motivo_cancelamento
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

        return jsonify({
            "kpis": {
                "total":           kpi_row['total'],
                "sem_motivo":      kpi_row['sem_motivo'],
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
        kpi_row = conn.execute("""
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
        """).fetchone()

        sinais_rows = conn.execute("""
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
            GROUP BY num_sinais
            ORDER BY num_sinais
        """).fetchall()

        perm_rows = conn.execute("""
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
                             AND COALESCE(PH.fat_vencidas_hoje, 0) > 0
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

        cliente = dict(cliente_row) if cliente_row else {}

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

        # --- Last 5 atendimentos ---
        atendimentos = conn.execute("""
            SELECT ID, Assunto, Descri_o_assunto AS descricao, Criado_em,
                   Novo_status AS status, Prioridade, Departamento
            FROM Atendimentos
            WHERE Cliente = ?
            ORDER BY Criado_em DESC
            LIMIT 5
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

import pandas as pd
import sqlite3
from flask import Blueprint, jsonify, request, abort, current_app

# Define o Blueprint para rotas de comportamento
# O prefixo '/api/behavior' será definido no api_server.py
behavior_bp = Blueprint('behavior_bp', __name__)

from logger import get_logger
logger = get_logger(__name__)

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
        if risk_level == 'Alto':
            risk_sql = "AND Risk_Score >= 60"
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
                SUM(CASE WHEN Risk_Score >= 60 THEN 1 ELSE 0 END) AS Alto,
                SUM(CASE WHEN Risk_Score >= 25 AND Risk_Score < 60 THEN 1 ELSE 0 END) AS Medio,
                SUM(CASE WHEN Risk_Score >= 10 AND Risk_Score < 25 THEN 1 ELSE 0 END) AS Baixo,
                COUNT(*) AS Total
            FROM Scored WHERE Risk_Score >= 10
        """

        count_sql = base_cte + f"""
            SELECT COUNT(*) FROM Scored WHERE Risk_Score >= 10 {risk_sql}
        """

        data_sql = base_cte + f"""
            SELECT *,
                CASE WHEN Risk_Score >= 60 THEN 'Alto'
                     WHEN Risk_Score >= 25 THEN 'Médio'
                     WHEN Risk_Score >= 10 THEN 'Baixo'
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
        if risk_level == 'Alto':
            risk_sql = "AND Risk_Score >= 60"
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
                   SUM(CASE WHEN CF.Sinal_RX >= -25                        THEN 1 ELSE 0 END) AS boa,
                   SUM(CASE WHEN CF.Sinal_RX < -25 AND CF.Sinal_RX >= -27 THEN 1 ELSE 0 END) AS marginal,
                   SUM(CASE WHEN CF.Sinal_RX < -27                        THEN 1 ELSE 0 END) AS critica
            {base_join}
              AND CF.Sinal_RX IS NOT NULL
              AND CF.Transmissor IS NOT NULL AND CF.Transmissor != '0'
              {city_sql}
            GROUP BY CF.Transmissor ORDER BY total DESC
        """

        causes_sql = f"""
            SELECT CF.Causa_ltima_queda AS causa, COUNT(*) AS count
            {base_join}
              AND CF.Causa_ltima_queda IS NOT NULL AND CF.Causa_ltima_queda != ''
              {city_sql}
            GROUP BY CF.Causa_ltima_queda ORDER BY count DESC LIMIT 10
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
                SUM(CASE WHEN CF.Sinal_RX < -27 THEN 1 ELSE 0 END)          AS signal_critical,
                SUM(CASE WHEN CF.Sinal_RX IS NOT NULL THEN 1 ELSE 0 END)     AS signal_total,
                SUM(CASE WHEN L.Franquia_atingida = 'S' THEN 1 ELSE 0 END)   AS quota_atingiram,
                SUM(CASE WHEN L.Franquia > 0 THEN 1 ELSE 0 END)              AS quota_total,
                SUM(COALESCE(L.Quantidade_de_desconex_es_no_dia_de_hoje, 0)) AS disc_total
            {base_join} {city_sql}
        """

        signal_data = conn.execute(signal_sql, tuple(city_p)).fetchall()
        causes_data = conn.execute(causes_sql, tuple(city_p)).fetchall()
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
            'top_causes':         [dict(r) for r in causes_data],
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
        if level == 'critical': filters.append("CF.Sinal_RX < -27")
        elif level == 'marginal': filters.append("CF.Sinal_RX >= -27 AND CF.Sinal_RX < -25")
        elif level == 'good':   filters.append("CF.Sinal_RX >= -25")

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

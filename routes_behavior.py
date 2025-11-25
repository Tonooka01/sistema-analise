import pandas as pd
import sqlite3
from flask import Blueprint, jsonify, request, abort, current_app

# Define o Blueprint para rotas de comportamento
# O prefixo '/api/behavior' será definido no api_server.py
behavior_bp = Blueprint('behavior_bp', __name__)

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
        print(f"Erro na análise de padrão de reclamações: {e}")
        return jsonify({"error": f"Erro interno ao processar a análise. Detalhe: {e}"}), 500
    finally:
        if conn: conn.close()

@behavior_bp.route('/predictive_churn')
def api_behavior_predictive_churn():
    conn = get_db()
    try:
        # Reutiliza a lógica da "Saúde Financeira", mas foca em clientes com reclamações
        delay_days = 10 # Considera atrasos acima de 10 dias como um sinal

        # Filtros do frontend
        limit = request.args.get('limit', 50, type=int)
        offset = request.args.get('offset', 0, type=int)
        status_contrato = request.args.get('status_contrato', 'Ativo')
        status_acesso = request.args.get('status_acesso', '')

        params = []
        where_conditions = [
            "FLP.ID_Contrato_Recorrente IS NOT NULL", # Garante que o cliente já teve ao menos um atraso significativo
            "CC.Possui_Reclamacoes = 'Sim'" # Garante que o cliente já abriu alguma reclamação
        ]

        if status_contrato:
            where_conditions.append("C.Status_contrato = ?")
            params.append(status_contrato)
        if status_acesso:
            where_conditions.append("C.Status_acesso = ?")
            params.append(status_acesso)

        where_clause = " WHERE " + " AND ".join(where_conditions) if where_conditions else ""

        query_base_from = f"""
            FROM Contratos C
            JOIN FirstLatePayment FLP ON C.ID = FLP.ID_Contrato_Recorrente
            JOIN CustomerComplaints CC ON C.Cliente = CC.Cliente
            LEFT JOIN LastConnection LC ON C.ID = LC.ID_contrato
        """

        full_query_select = f"""
            WITH FirstLatePayment AS (
                SELECT DISTINCT p.ID_Contrato_Recorrente
                FROM Contas_a_Receber p
                JOIN Contratos c ON p.ID_Contrato_Recorrente = c.ID
                WHERE p.Data_pagamento IS NOT NULL AND JULIANDAY(p.Data_pagamento) - JULIANDAY(p.Vencimento) > {delay_days} AND p.Vencimento >= c.Data_ativa_o
            ),
            CustomerComplaints AS (
                SELECT Cliente, 'Sim' AS Possui_Reclamacoes
                FROM ( SELECT Cliente FROM Atendimentos WHERE Cliente IS NOT NULL UNION SELECT Cliente FROM OS WHERE Cliente IS NOT NULL )
                GROUP BY Cliente
            ),
            LastConnection AS (
                SELECT ID_contrato, MAX(ltima_conex_o_final) as Ultima_Conexao
                FROM Logins WHERE ltima_conex_o_final IS NOT NULL AND ID_contrato IS NOT NULL
                GROUP BY ID_contrato
            )
            SELECT C.Cliente AS Razao_Social, C.ID AS Contrato_ID, C.Status_contrato, C.Status_acesso, C.Data_ativa_o,
                   'Sim' AS Primeira_Inadimplencia_Vencimento, -- Simplificado
                   'Sim' AS Possui_Reclamacoes,
                   LC.Ultima_Conexao
            {query_base_from}
            {where_clause}
        """

        # CORREÇÃO: A contagem deve usar a estrutura da query principal
        count_query = f"""
             WITH FirstLatePayment AS (
                 SELECT DISTINCT p.ID_Contrato_Recorrente
                 FROM Contas_a_Receber p JOIN Contratos c ON p.ID_Contrato_Recorrente = c.ID
                 WHERE p.Data_pagamento IS NOT NULL AND JULIANDAY(p.Data_pagamento) - JULIANDAY(p.Vencimento) > {delay_days} AND p.Vencimento >= c.Data_ativa_o
             ),
             CustomerComplaints AS (
                 SELECT Cliente, 'Sim' AS Possui_Reclamacoes
                 FROM ( SELECT Cliente FROM Atendimentos WHERE Cliente IS NOT NULL UNION SELECT Cliente FROM OS WHERE Cliente IS NOT NULL ) GROUP BY Cliente
             )
             SELECT COUNT(C.ID)
             FROM Contratos C JOIN FirstLatePayment FLP ON C.ID = FLP.ID_Contrato_Recorrente JOIN CustomerComplaints CC ON C.Cliente = CC.Cliente
             {where_clause}
        """
        total_rows = conn.execute(count_query, tuple(params)).fetchone()[0]

        # CORREÇÃO: A ordenação deve usar os nomes das colunas do resultado (Razao_Social, Contrato_ID).
        paginated_query = f"{full_query_select} ORDER BY Razao_Social, Contrato_ID LIMIT ? OFFSET ?;"
        params.extend([limit, offset])
        data = conn.execute(paginated_query, tuple(params)).fetchall()

        return jsonify({"data": [dict(row) for row in data], "total_rows": total_rows})

    except sqlite3.Error as e:
        print(f"Erro na análise preditiva de churn: {e}")
        return jsonify({"error": f"Erro interno ao processar a análise preditiva. Detalhe: {e}"}), 500
    finally:
        if conn: conn.close()

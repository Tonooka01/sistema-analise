import pandas as pd
import sqlite3
import traceback
from flask import Blueprint, jsonify, request
from utils_api import get_db, parse_relevance_filter, add_date_range_filter

# Define o Blueprint para rotas de análise técnica
tech_bp = Blueprint('tech_bp', __name__)

@tech_bp.route('/cancellations_by_equipment')
def api_cancellations_by_equipment():
    conn = get_db()
    try:
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        city = request.args.get('city')
        relevance = request.args.get('relevance')

        params_cancelados = []
        where_cancelados_list = ["C.Status_contrato = 'Inativo'", "C.Status_acesso = 'Desativado'"]
        add_date_range_filter(where_cancelados_list, params_cancelados, "C.Data_cancelamento", start_date, end_date)
        if city: 
            where_cancelados_list.append("C.Cidade = ?")
            params_cancelados.append(city)
        where_cancelados_sql = " AND ".join(where_cancelados_list)

        params_negativados_cn = []
        where_negativados_cn_list = ["CN.Cidade NOT IN ('Caçapava', 'Jacareí', 'São José dos Campos')"]
        add_date_range_filter(where_negativados_cn_list, params_negativados_cn, "CN.Data_negativa_o", start_date, end_date)
        if city: 
            where_negativados_cn_list.append("CN.Cidade = ?")
            params_negativados_cn.append(city)
        where_negativados_cn_sql = " AND ".join(where_negativados_cn_list)

        params_negativados_c = []
        where_negativados_c_list = ["C.Status_contrato = 'Negativado'", "C.Cidade NOT IN ('Caçapava', 'Jacareí', 'São José dos Campos')"]
        add_date_range_filter(where_negativados_c_list, params_negativados_c, "C.Data_cancelamento", start_date, end_date)
        if city: 
            where_negativados_c_list.append("C.Cidade = ?")
            params_negativados_c.append(city)
        where_negativados_c_sql = " AND ".join(where_negativados_c_list)

        df_cancelados = pd.read_sql_query(f"SELECT ID, Data_ativa_o, Data_cancelamento AS end_date FROM Contratos C WHERE {where_cancelados_sql}", conn, params=tuple(params_cancelados))
        df_negativados_c = pd.read_sql_query(f"SELECT ID, Data_ativa_o, Data_cancelamento AS end_date FROM Contratos C WHERE {where_negativados_c_sql}", conn, params=tuple(params_negativados_c))
        df_negativados_cn = pd.DataFrame()
        try:
             df_negativados_cn = pd.read_sql_query(f"SELECT ID, Data_ativa_o, Data_negativa_o AS end_date FROM Contratos_Negativacao CN WHERE {where_negativados_cn_sql}", conn, params=tuple(params_negativados_cn))
        except pd.io.sql.DatabaseError as e:
            if "no such table" not in str(e): raise e

        df_contracts = pd.concat([df_cancelados, df_negativados_c, df_negativados_cn], ignore_index=True).drop_duplicates(subset=['ID'])
        df_contracts['ID'] = df_contracts['ID'].astype(str).str.strip()

        if not df_contracts.empty:
            df_contracts['Data_ativa_o'] = pd.to_datetime(df_contracts['Data_ativa_o'], errors='coerce')
            df_contracts['end_date'] = pd.to_datetime(df_contracts['end_date'], errors='coerce')
            df_contracts['permanencia_dias'] = (df_contracts['end_date'] - df_contracts['Data_ativa_o']).dt.days
            df_contracts['permanencia_meses'] = (df_contracts['permanencia_dias'] / 30.44).round().astype('Int64')

            min_months, max_months = parse_relevance_filter(relevance)
            if min_months is not None:
                df_contracts = df_contracts[df_contracts['permanencia_meses'] >= min_months]
            if max_months is not None:
                df_contracts = df_contracts[df_contracts['permanencia_meses'] <= max_months]

        if df_contracts.empty:
             data_list = []
             total_equipments = 0
        else:
            query_equipment = """
                SELECT TRIM(ID_contrato) AS ID_contrato, Descricao_produto
                FROM Equipamento
                WHERE Status_comodato = 'Baixa'
                  AND Descricao_produto IS NOT NULL
                  AND TRIM(Descricao_produto) != ''
            """
            df_equipment = pd.read_sql_query(query_equipment, conn)
            df_equipment['ID_contrato'] = df_equipment['ID_contrato'].astype(str).str.strip()

            df_merged = pd.merge(df_contracts, df_equipment, left_on='ID', right_on='ID_contrato', how='inner')

            onu_masks = df_merged['Descricao_produto'].str.contains('ONU AN5506-01|ONU AN5506-02', na=False)
            df_routers = df_merged[onu_masks].copy()
            if not df_routers.empty:
                df_routers['Descricao_produto'] = 'ROTEADOR (Associado a ONU)'
                df_expanded = pd.concat([df_merged, df_routers], ignore_index=True)
            else:
                df_expanded = df_merged

            df_grouped = df_expanded.groupby('Descricao_produto').size().reset_index(name='Count')

            df_grouped['Descricao_produto'] = df_grouped['Descricao_produto'].replace({
                r'^ONU AN5506-01.*': 'ONU AN5506-01 (Agrupado)',
                r'^ONU AN5506-02.*': 'ONU AN5506-02 (Agrupado)',
                r'^ONU HG6143D.*': 'ONU HG6143D (Agrupado)'
            }, regex=True)

            df_final = df_grouped.groupby('Descricao_produto')['Count'].sum().reset_index()
            df_final = df_final.sort_values(by='Count', ascending=False).head(20)

            data_list = df_final.to_dict('records')
            total_equipments = df_expanded.shape[0]

        years_query = "SELECT DISTINCT Year FROM ( SELECT STRFTIME('%Y', Data_cancelamento) AS Year FROM Contratos WHERE Data_cancelamento IS NOT NULL UNION SELECT STRFTIME('%Y', Data_negativa_o) AS Year FROM Contratos_Negativacao WHERE Data_negativa_o IS NOT NULL ) WHERE Year IS NOT NULL ORDER BY Year DESC"
        years_data = conn.execute(years_query).fetchall()

        cities_query = "SELECT DISTINCT Cidade FROM (SELECT Cidade FROM Contratos WHERE Cidade IS NOT NULL AND TRIM(Cidade) != '' UNION SELECT Cidade FROM Contratos_Negativacao WHERE Cidade IS NOT NULL AND TRIM(Cidade) != '') ORDER BY Cidade"
        cities_data = conn.execute(cities_query).fetchall()

        return jsonify({
            "data": data_list,
            "years": [row[0] for row in years_data if row[0]],
            "cities": [row[0] for row in cities_data if row[0]],
            "total_equipments": int(total_equipments)
        })

    except sqlite3.Error as e:
        if "no such table" in str(e).lower():
            return jsonify({"error": "A tabela 'Equipamento' ou 'Contratos_Negativacao' não foi encontrada. Esta análise requer ambas as tabelas."}), 500
        print(f"Erro na base de dados na análise por equipamento: {e}")
        return jsonify({"error": f"Erro interno ao processar a análise por equipamento. Detalhe: {e}"}), 500
    except Exception as e:
        print(f"Erro inesperado na análise por equipamento: {e}")
        return jsonify({"error": f"Erro interno inesperado ao processar a análise por equipamento. Detalhe: {e}"}), 500
    finally:
        if conn: conn.close()

@tech_bp.route('/equipment_by_olt')
def api_equipment_by_olt():
    conn = get_db()
    try:
        city = request.args.get('city', '')

        where_clauses = [
            "E.Status_comodato = 'Emprestado'",
            "L.Transmissor IS NOT NULL",
            "L.Transmissor != ''"
        ]
        params = []

        if city:
            where_clauses.append("C.Cidade = ?")
            params.append(city)

        where_sql = " AND ".join(where_clauses)

        query = f"""
            SELECT
                E.Descricao_produto,
                COUNT(*) AS Count
            FROM Logins L
            JOIN Contratos C ON L.ID_contrato = C.ID
            JOIN Equipamento E ON C.ID = TRIM(E.ID_contrato)
            WHERE {where_sql}
            GROUP BY E.Descricao_produto
            ORDER BY Count DESC
            LIMIT 30;
        """
        data = conn.execute(query, tuple(params)).fetchall()

        cities_query = """
            SELECT DISTINCT C.Cidade
            FROM Contratos C
            JOIN Logins L ON C.ID = L.ID_contrato
            WHERE C.Cidade IS NOT NULL AND TRIM(C.Cidade) != ''
            ORDER BY C.Cidade
        """
        cities_data = conn.execute(cities_query).fetchall()

        return jsonify({
            "data": [dict(row) for row in data],
            "cities": [row[0] for row in cities_data if row[0]]
        })

    except sqlite3.Error as e:
        if "no such table" in str(e).lower():
            return jsonify({"error": "As tabelas 'Logins', 'Contratos' e/ou 'Equipamento' não foram encontradas. Esta análise requer as três tabelas."}), 500
        print(f"Erro na base de dados na análise por OLT: {e}")
        return jsonify({"error": f"Erro interno ao processar a análise por OLT. Detalhe: {e}"}), 500
    finally:
        if conn: conn.close()

@tech_bp.route('/daily_evolution_by_city')
def api_daily_evolution_by_city():
    conn = get_db()
    try:
        start_date_str = request.args.get('start_date')
        end_date_str = request.args.get('end_date')

        params = []
        where_clauses = []

        if start_date_str:
            where_clauses.append("event_date >= ?")
            params.append(start_date_str)
        if end_date_str:
            where_clauses.append("event_date <= ?")
            params.append(end_date_str)

        where_sql = "WHERE " + " AND ".join(where_clauses) if where_clauses else ""

        base_query = """
            WITH all_events AS (
                SELECT Cidade, DATE(Data_ativa_o) as event_date, 'ativacao' as event_type FROM Contratos WHERE Data_ativa_o IS NOT NULL AND Cidade IS NOT NULL AND TRIM(Cidade) != ''
                UNION ALL
                SELECT Cidade, DATE(Data_ativa_o) as event_date, 'ativacao' as event_type FROM Contratos_Negativacao WHERE Data_ativa_o IS NOT NULL AND Cidade IS NOT NULL AND TRIM(Cidade) != ''
                UNION ALL
                SELECT Cidade, DATE(Data_cancelamento) as event_date, 'churn' as event_type FROM Contratos WHERE Data_cancelamento IS NOT NULL AND Status_contrato = 'Inativo' AND Cidade IS NOT NULL AND TRIM(Cidade) != ''
                UNION ALL
                SELECT Cidade, DATE(Data_negativa_o) as event_date, 'churn' as event_type FROM Contratos_Negativacao WHERE Data_negativa_o IS NOT NULL AND Cidade IS NOT NULL AND TRIM(Cidade) != ''
                UNION ALL
                SELECT Cidade, DATE(Data_cancelamento) as event_date, 'churn' as event_type FROM Contratos WHERE Data_cancelamento IS NOT NULL AND Status_contrato = 'Negativado' AND Cidade IS NOT NULL AND TRIM(Cidade) != ''
            )
        """

        query = f"""
            {base_query}
            SELECT
                Cidade,
                event_date,
                SUM(CASE WHEN event_type = 'ativacao' THEN 1 ELSE 0 END) AS ativacoes,
                SUM(CASE WHEN event_type = 'churn' THEN 1 ELSE 0 END) AS churn
            FROM all_events
            {where_sql}
            GROUP BY Cidade, event_date
            ORDER BY Cidade, event_date;
        """

        totals_query = f"""
            {base_query}
            SELECT
                Cidade,
                SUM(CASE WHEN event_type = 'ativacao' THEN 1 ELSE 0 END) AS total_ativacoes,
                SUM(CASE WHEN event_type = 'churn' THEN 1 ELSE 0 END) AS total_churn
            FROM all_events
            {where_sql}
            GROUP BY Cidade;
        """

        results = conn.execute(query, tuple(params)).fetchall()
        totals_results = conn.execute(totals_query, tuple(params)).fetchall()

        data_by_city = {}
        for row in results:
            city = row['Cidade']
            if city not in data_by_city:
                data_by_city[city] = {'daily_data': [], 'totals': {}}
            data_by_city[city]['daily_data'].append({
                'date': row['event_date'],
                'ativacoes': row['ativacoes'],
                'churn': row['churn']
            })

        for row in totals_results:
            city = row['Cidade']
            if city in data_by_city:
                data_by_city[city]['totals'] = {
                    'total_ativacoes': row['total_ativacoes'],
                    'total_churn': row['total_churn']
                }

        return jsonify({"data": data_by_city})

    except sqlite3.Error as e:
        if "no such table" in str(e).lower() and "contratos_negativacao" in str(e).lower():
             params = []
             where_clauses = []
             if start_date_str: where_clauses.append("event_date >= ?"); params.append(start_date_str)
             if end_date_str: where_clauses.append("event_date <= ?"); params.append(end_date_str)
             where_sql = "WHERE " + " AND ".join(where_clauses) if where_clauses else ""

             fallback_base_query = """
                WITH all_events AS (
                    SELECT Cidade, DATE(Data_ativa_o) as event_date, 'ativacao' as event_type FROM Contratos WHERE Data_ativa_o IS NOT NULL AND Cidade IS NOT NULL AND TRIM(Cidade) != ''
                    UNION ALL
                    SELECT Cidade, DATE(Data_cancelamento) as event_date, 'churn' as event_type FROM Contratos WHERE Data_cancelamento IS NOT NULL AND (Status_contrato = 'Inativo' OR Status_contrato = 'Negativado') AND Cidade IS NOT NULL AND TRIM(Cidade) != ''
                )
             """
             fallback_query = f"{fallback_base_query} SELECT Cidade, event_date, SUM(CASE WHEN event_type = 'ativacao' THEN 1 ELSE 0 END) AS ativacoes, SUM(CASE WHEN event_type = 'churn' THEN 1 ELSE 0 END) AS churn FROM all_events {where_sql} GROUP BY Cidade, event_date ORDER BY Cidade, event_date;"
             fallback_totals_query = f"{fallback_base_query} SELECT Cidade, SUM(CASE WHEN event_type = 'ativacao' THEN 1 ELSE 0 END) AS total_ativacoes, SUM(CASE WHEN event_type = 'churn' THEN 1 ELSE 0 END) AS total_churn FROM all_events {where_sql} GROUP BY Cidade;"

             results = conn.execute(fallback_query, tuple(params)).fetchall()
             totals_results = conn.execute(fallback_totals_query, tuple(params)).fetchall()

             data_by_city = {}
             for row in results:
                 city = row['Cidade']
                 if city not in data_by_city:
                     data_by_city[city] = {'daily_data': [], 'totals': {}}
                 data_by_city[city]['daily_data'].append({'date': row['event_date'], 'ativacoes': row['ativacoes'], 'churn': row['churn']})
             for row in totals_results:
                 city = row['Cidade']
                 if city in data_by_city:
                     data_by_city[city]['totals'] = {'total_ativacoes': row['total_ativacoes'], 'total_churn': row['total_churn']}
             return jsonify({"data": data_by_city})

        print(f"Erro na base de dados na análise de evolução diária: {e}")
        return jsonify({"error": f"Erro interno ao processar a análise. Detalhe: {e}"}), 500
    finally:
        if conn: conn.close()
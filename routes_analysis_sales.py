import pandas as pd
import sqlite3
import traceback
from flask import Blueprint, jsonify, request
from utils_api import get_db, add_date_range_filter

# Define o Blueprint para rotas de análise de vendas
sales_bp = Blueprint('sales_bp', __name__)

@sales_bp.route('/sellers')
def api_seller_analysis():
    conn = get_db()
    try:
        start_date = request.args.get('start_date', '')
        end_date = request.args.get('end_date', '')

        params_cancelados = []
        params_negativados_cn = []
        params_negativados_c = []

        where_cancelados_list = ["Status_contrato = 'Inativo'", "Status_acesso = 'Desativado'"]
        add_date_range_filter(where_cancelados_list, params_cancelados, "Data_cancelamento", start_date, end_date)
        where_cancelados = " AND ".join(where_cancelados_list)

        where_negativados_cn_list = ["Cidade NOT IN ('Caçapava', 'Jacareí', 'São José dos Campos')"]
        add_date_range_filter(where_negativados_cn_list, params_negativados_cn, "Data_negativa_o", start_date, end_date)
        where_negativados_cn = " AND ".join(where_negativados_cn_list)

        where_negativados_c_list = ["Status_contrato = 'Negativado'", "Cidade NOT IN ('Caçapava', 'Jacareí', 'São José dos Campos')"]
        add_date_range_filter(where_negativados_c_list, params_negativados_c, "Data_cancelamento", start_date, end_date)
        where_negativados_c = " AND ".join(where_negativados_c_list)

        df_cancelados = pd.read_sql_query(f"SELECT Vendedor AS Vendedor_ID, 'Cancelado' AS Status FROM Contratos WHERE {where_cancelados}", conn, params=tuple(params_cancelados))
        df_negativados_c = pd.read_sql_query(f"SELECT Vendedor AS Vendedor_ID, 'Negativado' AS Status FROM Contratos WHERE {where_negativados_c}", conn, params=tuple(params_negativados_c))
        df_negativados_cn = pd.DataFrame()
        try:
            df_negativados_cn = pd.read_sql_query(f"SELECT Vendedor AS Vendedor_ID, 'Negativado' AS Status FROM Contratos_Negativacao WHERE {where_negativados_cn}", conn, params=tuple(params_negativados_cn))
        except pd.io.sql.DatabaseError as e:
            if "no such table" not in str(e): raise e
            print("Aviso: Tabela Contratos_Negativacao não encontrada.")

        df_all = pd.concat([df_cancelados, df_negativados_c, df_negativados_cn], ignore_index=True)

        df_vendedores = pd.read_sql_query("SELECT ID, Vendedor FROM Vendedores", conn)
        df_merged = pd.merge(df_all, df_vendedores, left_on='Vendedor_ID', right_on='ID', how='left')

        df_grouped = df_merged.groupby(['Vendedor_ID', 'Vendedor']).agg(
            Cancelados_Count=('Status', lambda x: (x == 'Cancelado').sum()),
            Negativados_Count=('Status', lambda x: (x == 'Negativado').sum())
        ).reset_index()

        df_grouped['Total'] = df_grouped['Cancelados_Count'] + df_grouped['Negativados_Count']
        df_grouped = df_grouped.sort_values(by='Total', ascending=False)
        df_grouped.rename(columns={'Vendedor': 'Vendedor_Nome'}, inplace=True) 

        data_list = df_grouped.to_dict('records')

        years_query = "SELECT DISTINCT Year FROM ( SELECT STRFTIME('%Y', \"Data_cancelamento\") AS Year FROM Contratos WHERE \"Data_cancelamento\" IS NOT NULL UNION SELECT STRFTIME('%Y', \"Data_negativa_o\") AS Year FROM Contratos_Negativacao WHERE \"Data_negativa_o\" IS NOT NULL ) WHERE Year IS NOT NULL ORDER BY Year DESC"
        years_data = conn.execute(years_query).fetchall()

        total_cancelados = df_grouped['Cancelados_Count'].sum()
        total_negativados = df_grouped['Negativados_Count'].sum()

        return jsonify({
            "data": data_list,
            "total_rows": len(data_list),
            "years": [row[0] for row in years_data],
            "total_cancelados": int(total_cancelados), 
            "total_negativados": int(total_negativados),
            "grand_total": int(total_cancelados + total_negativados)
        })
    except sqlite3.Error as e:
        print(f"Erro na base de dados na análise de vendedores: {e}")
        return jsonify({"error": f"Erro interno ao processar a análise de vendedores. Detalhe: {e}"}), 500
    except Exception as e:
        print(f"Erro inesperado na análise de vendedores: {e}")
        return jsonify({"error": f"Erro interno inesperado ao processar a análise de vendedores. Detalhe: {e}"}), 500
    finally:
        if conn: conn.close()


@sales_bp.route('/activations_by_seller')
def api_activations_by_seller():
    conn = get_db()
    try:
        city = request.args.get('city', '')
        start_date = request.args.get('start_date', '')
        end_date = request.args.get('end_date', '')

        params_contracts = []
        where_contracts_list = ["Data_ativa_o IS NOT NULL", "Vendedor IS NOT NULL"]
        
        if city:
            where_contracts_list.append("Cidade = ?")
            params_contracts.append(city)
        
        add_date_range_filter(where_contracts_list, params_contracts, "Data_ativa_o", start_date, end_date)
        
        where_contracts_sql_union = " AND ".join(where_contracts_list).replace("C.", "")

        query_all_activations = f"""
            SELECT ID, Vendedor AS Vendedor_ID, Status_contrato, Data_cancelamento, 0 AS is_negativado_table, Cidade
            FROM Contratos C
            WHERE {" AND ".join(where_contracts_list)}
            
            UNION
            
            SELECT ID, Vendedor AS Vendedor_ID, 'Negativado' AS Status_contrato, Data_negativa_o AS Data_cancelamento, 1 AS is_negativado_table, Cidade
            FROM Contratos_Negativacao C
            WHERE {where_contracts_sql_union}
        """

        try:
            df_contracts_all = pd.read_sql_query(query_all_activations, conn, params=tuple(params_contracts * 2))

            df_contracts_all.sort_values(by='is_negativado_table', ascending=True, inplace=True)
            df_contracts = df_contracts_all.drop_duplicates(subset=['ID'], keep='first')
        
        except pd.io.sql.DatabaseError as e:
            if "no such table" in str(e).lower(): 
                query_fallback = f"""
                    SELECT ID, Vendedor AS Vendedor_ID, Status_contrato, Data_cancelamento, Cidade
                    FROM Contratos C
                    WHERE {" AND ".join(where_contracts_list)}
                """
                df_contracts = pd.read_sql_query(query_fallback, conn, params=tuple(params_contracts))
            else:
                raise e 

        cities = []
        try:
            cities_query = """
                SELECT DISTINCT Cidade FROM (
                    SELECT Cidade FROM Contratos WHERE Cidade IS NOT NULL AND TRIM(Cidade) != ''
                    UNION
                    SELECT Cidade FROM Contratos_Negativacao WHERE Cidade IS NOT NULL AND TRIM(Cidade) != ''
                ) WHERE Cidade IS NOT NULL ORDER BY Cidade
            """
            cities_data = conn.execute(cities_query).fetchall()
            cities = [row[0] for row in cities_data if row[0]]
        except sqlite3.Error:
            try:
                cities_query_fallback = "SELECT DISTINCT Cidade FROM Contratos WHERE Cidade IS NOT NULL AND TRIM(Cidade) != '' ORDER BY Cidade"
                cities_data = conn.execute(cities_query_fallback).fetchall()
                cities = [row[0] for row in cities_data if row[0]]
            except sqlite3.Error:
                pass
                
        years = []
        try:
            years_query = """
                SELECT DISTINCT STRFTIME('%Y', Data_ativa_o) AS Year FROM Contratos WHERE Data_ativa_o IS NOT NULL
                UNION
                SELECT DISTINCT STRFTIME('%Y', Data_ativa_o) AS Year FROM Contratos_Negativacao WHERE Data_ativa_o IS NOT NULL
                ORDER BY Year DESC
            """
            years_data = conn.execute(years_query).fetchall()
            years = [row[0] for row in years_data if row[0]]
        except sqlite3.Error:
            try:
                years_query_fallback = "SELECT DISTINCT STRFTIME('%Y', Data_ativa_o) AS Year FROM Contratos WHERE Data_ativa_o IS NOT NULL ORDER BY Year DESC"
                years_data = conn.execute(years_query_fallback).fetchall()
                years = [row[0] for row in years_data if row[0]]
            except sqlite3.Error:
                 pass

        if df_contracts.empty:
            return jsonify({"data": [], "totals": {}, "cities": cities, "years": years})

        df_contracts['ID'] = df_contracts['ID'].astype(str).str.strip()
        df_contracts['Vendedor_ID'] = df_contracts['Vendedor_ID'].astype(str)
        
        df_vendedores = pd.read_sql_query("SELECT ID, Vendedor FROM Vendedores", conn)
        df_vendedores['ID'] = df_vendedores['ID'].astype(str)

        df_contracts['is_active'] = (df_contracts['Status_contrato'] == 'Ativo')
        df_contracts['is_cancelado'] = (df_contracts['Status_contrato'] == 'Inativo')
        
        df_contracts['is_negativado'] = (
            (df_contracts['Status_contrato'] == 'Negativado') &
            (~df_contracts['Cidade'].isin(['Caçapava', 'Jacareí', 'São José dos Campos']))
        )

        df_merged = df_contracts

        df_grouped = df_merged.groupby('Vendedor_ID').agg(
            Total_Ativacoes=('ID', 'count'),
            Permanecem_Ativos=('is_active', 'sum'),
            Cancelados=('is_cancelado', 'sum'),
            Negativados=('is_negativado', 'sum')
        ).reset_index()

        df_final = pd.merge(df_grouped, df_vendedores, left_on='Vendedor_ID', right_on='ID', how='left')
        df_final.rename(columns={'Vendedor': 'Vendedor_Nome'}, inplace=True)
        df_final['Vendedor_Nome'] = df_final['Vendedor_Nome'].fillna('Não Identificado')
        
        df_final['Total_Churn'] = df_final['Cancelados'] + df_final['Negativados']

        df_final = df_final.sort_values(by='Total_Ativacoes', ascending=False)
        data_list = df_final.to_dict('records')

        totals = {
            'total_ativacoes': int(df_final['Total_Ativacoes'].sum()),
            'total_permanecem_ativos': int(df_final['Permanecem_Ativos'].sum()),
            'total_cancelados': int(df_final['Cancelados'].sum()),
            'total_negativados': int(df_final['Negativados'].sum()),
            'total_churn': int(df_final['Total_Churn'].sum())
        }

        return jsonify({
            "data": data_list,
            "totals": totals,
            "cities": cities,
            "years": years
        })

    except sqlite3.Error as e:
        print(f"Erro na base de dados na análise de ativação por vendedor: {e}")
        return jsonify({"error": f"Erro interno ao processar a análise. Detalhe: {e}"}), 500
    except Exception as e:
        print(f"Erro inesperado na análise de ativação por vendedor: {e}")
        traceback.print_exc()
        return jsonify({"error": f"Erro interno inesperado. Detalhe: {e}"}), 500
    finally:
        if conn: conn.close()
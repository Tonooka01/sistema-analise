import sqlite3
from flask import Blueprint, jsonify, request, abort
from utils_api import get_db

details_tech_bp = Blueprint('details_tech_bp', __name__)

@details_tech_bp.route('/complaints/<client_name>')
def api_complaints_details(client_name):
    conn = get_db()
    try:
        complaint_type = request.args.get('type')
        limit = request.args.get('limit', 15, type=int)
        offset = request.args.get('offset', 0, type=int)

        sql_params = (client_name, )

        if complaint_type == 'os':
            table = 'OS'
            columns = 'ID, Abertura, Assunto, Status'
            count_query = f"SELECT COUNT(*) FROM {table} WHERE UPPER(TRIM(Cliente)) = UPPER(TRIM(?))"
            data_query = f"SELECT {columns} FROM {table} WHERE UPPER(TRIM(Cliente)) = UPPER(TRIM(?)) ORDER BY Abertura DESC LIMIT ? OFFSET ?"
        elif complaint_type == 'atendimentos':
            table = 'Atendimentos'
            columns = 'ID, Criado_em, Assunto, Novo_status'
            count_query = f"SELECT COUNT(*) FROM {table} WHERE UPPER(TRIM(Cliente)) = UPPER(TRIM(?))"
            data_query = f"SELECT {columns} FROM {table} WHERE UPPER(TRIM(Cliente)) = UPPER(TRIM(?)) ORDER BY Criado_em DESC LIMIT ? OFFSET ?"
        else:
            abort(400, "Tipo de 'complaint' inválido.")

        total_rows = conn.execute(count_query, sql_params).fetchone()[0]
        data_params = sql_params + (limit, offset)
        data = conn.execute(data_query, data_params).fetchall()

        return jsonify({
            "data": [dict(row) for row in data],
            "total_rows": total_rows
        })
    except sqlite3.Error as e:
        print(f"Erro ao buscar detalhes de complaints: {e}")
        return jsonify({"error": "Erro interno ao processar a solicitação."}), 500
    finally:
        if conn: conn.close()

@details_tech_bp.route('/logins/<contract_id>')
def api_logins_details(contract_id):
    conn = get_db()
    try:
        limit = request.args.get('limit', 15, type=int)
        offset = request.args.get('offset', 0, type=int)

        count_query = "SELECT COUNT(*) FROM Logins L LEFT JOIN Clientes_Fibra CF ON L.Login = CF.Login WHERE L.ID_contrato = ?"
        total_rows = conn.execute(count_query, (contract_id,)).fetchone()[0]

        data_query = """
            SELECT
                L.Login,
                L.ltima_conex_o_final as ltima_conex_o_inicial,
                CF.Sinal_RX,
                L.Login AS ONU_tipo,
                L.IPV4,
                CF.Transmissor
            FROM Logins L
            LEFT JOIN Clientes_Fibra CF ON L.Login = CF.Login
            WHERE L.ID_contrato = ?
            ORDER BY L.ltima_conex_o_final DESC
            LIMIT ? OFFSET ?
        """
        data = conn.execute(data_query, (contract_id, limit, offset)).fetchall()
        return jsonify({"data": [dict(row) for row in data], "total_rows": total_rows})
    except sqlite3.Error as e:
        print(f"Erro ao buscar detalhes de logins: {e}")
        return jsonify({"error": "Erro interno ao processar a solicitação."}), 500
    finally:
        if conn: conn.close()

@details_tech_bp.route('/comodato/<contract_id>')
def api_comodato_details(contract_id):
    conn = get_db()
    try:
        query = "SELECT Descricao_produto, Status_comodato FROM Equipamento WHERE TRIM(ID_contrato) = ?"
        data = conn.execute(query, (contract_id,)).fetchall()
        return jsonify({"data": [dict(row) for row in data], "total_rows": len(data)})
    except sqlite3.Error as e:
        print(f"Erro ao buscar detalhes de comodato: {e}")
        return jsonify({"error": "Erro interno ao processar a solicitação."}), 500
    finally:
        if conn: conn.close()

@details_tech_bp.route('/active_equipment_clients')
def api_active_equipment_clients():
    conn = get_db()
    try:
        equipment_name = request.args.get('equipment_name')
        city = request.args.get('city', '')
        limit = request.args.get('limit', 25, type=int)
        offset = request.args.get('offset', 0, type=int)

        if not equipment_name:
            abort(400, "O nome do equipamento é obrigatório.")

        where_clauses = [
            "E.Status_comodato = 'Emprestado'",
            "L.Transmissor IS NOT NULL",
            "L.Transmissor != ''",
            "E.Descricao_produto = ?"
        ]
        params = [equipment_name]

        if city:
            where_clauses.append("C.Cidade = ?")
            params.append(city)

        where_sql = " AND ".join(where_clauses)

        base_query = f"""
            FROM Logins L
            JOIN Contratos C ON L.ID_contrato = C.ID
            JOIN Equipamento E ON C.ID = TRIM(E.ID_contrato)
            WHERE {where_sql}
        """

        count_query = f"SELECT COUNT(DISTINCT C.ID) {base_query}"
        total_rows = conn.execute(count_query, tuple(params)).fetchone()[0]

        data_query = f"""
            SELECT DISTINCT
                C.Cliente,
                C.ID AS Contrato_ID,
                C.Data_ativa_o,
                C.Cidade,
                C.Status_contrato
            {base_query}
            ORDER BY C.Cliente
            LIMIT ? OFFSET ?
        """
        params.extend([limit, offset])

        data = conn.execute(data_query, tuple(params)).fetchall()

        return jsonify({
            "data": [dict(row) for row in data],
            "total_rows": total_rows
        })
    except sqlite3.Error as e:
        print(f"Erro ao buscar detalhes de clientes por equipamento ativo: {e}")
        return jsonify({"error": "Erro interno ao processar a solicitação."}), 500
    finally:
        if conn: conn.close()

# Rota Corrigida para Evolução Diária (Tabela Detalhada)
@details_tech_bp.route('/daily_evolution_details')
def api_daily_evolution_details():
    """
    Rota para buscar detalhes da evolução diária (ativações e churn) com info de equipamento.
    """
    conn = get_db()
    try:
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        city = request.args.get('city', '') # Filtro opcional de cidade
        limit = request.args.get('limit', 50, type=int)
        offset = request.args.get('offset', 0, type=int)

        if not start_date or not end_date:
            return jsonify({"error": "Datas são obrigatórias."}), 400

        # Subquery para pegar o último equipamento 'Emprestado'
        # Usamos CAST(Main.Contrato_ID AS TEXT) para garantir compatibilidade
        # E ordenamos por Data para pegar o mais recente.
        equipamento_subquery = """
            (SELECT Descricao_produto 
             FROM Equipamento E 
             WHERE TRIM(E.ID_contrato) = TRIM(CAST(Main.Contrato_ID AS TEXT)) 
               AND Status_comodato = 'Emprestado'
             ORDER BY Data DESC LIMIT 1)
        """

        # Filtro de cidade na query externa
        city_clause = " AND Main.Cidade = ? " if city else ""

        # Query Base - Usa Alias 'Contrato_ID' para evitar ambiguidade com 'ID'
        query = f"""
            SELECT 
                Main.Cliente,
                Main.Contrato_ID,
                Main.Data_ativa_o,
                Main.Status_contrato,
                Main.Cidade,
                CASE 
                    WHEN Main.Status_contrato = 'Inativo' THEN Main.Data_cancelamento
                    WHEN Main.Status_contrato = 'Negativado' THEN Main.Data_negativa_o
                    ELSE 'N/A'
                END AS Data_Final,
                {equipamento_subquery} as Equipamento_Atual
            FROM (
                -- Contratos Normais
                SELECT 
                    ID AS Contrato_ID, 
                    Cliente, 
                    Data_ativa_o, 
                    Status_contrato, 
                    Data_cancelamento, 
                    NULL as Data_negativa_o, 
                    Cidade
                FROM Contratos
                WHERE (DATE(Data_ativa_o) BETWEEN ? AND ?) 
                   OR (Data_cancelamento IS NOT NULL AND DATE(Data_cancelamento) BETWEEN ? AND ?)

                UNION
                
                -- Negativados (fallback se a tabela existir, senão o try/except captura)
                SELECT 
                    ID AS Contrato_ID, 
                    Cliente, 
                    Data_ativa_o, 
                    'Negativado' as Status_contrato, 
                    NULL as Data_cancelamento, 
                    Data_negativa_o, 
                    Cidade
                FROM Contratos_Negativacao
                WHERE (DATE(Data_ativa_o) BETWEEN ? AND ?)
                   OR (Data_negativa_o IS NOT NULL AND DATE(Data_negativa_o) BETWEEN ? AND ?)
            ) AS Main
            WHERE 1=1 {city_clause}
            ORDER BY Main.Data_ativa_o DESC
            LIMIT ? OFFSET ?
        """

        # Parâmetros: 4 datas (Contratos) + 4 datas (Negativacao) + cidade (opcional) + limit + offset
        params = [start_date, end_date, start_date, end_date, start_date, end_date, start_date, end_date]
        if city: params.append(city)
        params.extend([limit, offset])
        
        # Query de Contagem (simplificada)
        count_query_base = """
            SELECT COUNT(*) FROM (
                SELECT ID, Cidade FROM Contratos WHERE (DATE(Data_ativa_o) BETWEEN ? AND ?) OR (DATE(Data_cancelamento) BETWEEN ? AND ?)
                UNION
                SELECT ID, Cidade FROM Contratos_Negativacao WHERE (DATE(Data_ativa_o) BETWEEN ? AND ?) OR (DATE(Data_negativa_o) BETWEEN ? AND ?)
            ) AS Main WHERE 1=1
        """
        if city: count_query_base += " AND Main.Cidade = ?"
        
        count_params = [start_date, end_date, start_date, end_date, start_date, end_date, start_date, end_date]
        if city: count_params.append(city)

        try:
            data = conn.execute(query, tuple(params)).fetchall()
            total_rows = conn.execute(count_query_base, tuple(count_params)).fetchone()[0]
        except sqlite3.Error as e:
            # Fallback se Contratos_Negativacao não existir
            if "no such table" in str(e).lower() and "contratos_negativacao" in str(e).lower():
                print("Aviso: Tabela Contratos_Negativacao não encontrada. Usando fallback.")
                
                query_fallback = f"""
                    SELECT 
                        Main.Cliente,
                        Main.Contrato_ID,
                        Main.Data_ativa_o,
                        Main.Status_contrato,
                        Main.Cidade,
                        CASE 
                            WHEN Main.Status_contrato = 'Inativo' THEN Main.Data_cancelamento
                            WHEN Main.Status_contrato = 'Negativado' THEN Main.Data_cancelamento
                            ELSE 'N/A'
                        END AS Data_Final,
                        {equipamento_subquery} as Equipamento_Atual
                    FROM (
                        SELECT ID AS Contrato_ID, Cliente, Data_ativa_o, Status_contrato, Data_cancelamento, Cidade
                        FROM Contratos
                        WHERE (DATE(Data_ativa_o) BETWEEN ? AND ?) 
                           OR (Data_cancelamento IS NOT NULL AND DATE(Data_cancelamento) BETWEEN ? AND ?)
                    ) AS Main
                    WHERE 1=1 {city_clause}
                    ORDER BY Main.Data_ativa_o DESC
                    LIMIT ? OFFSET ?
                """
                params_fallback = [start_date, end_date, start_date, end_date]
                if city: params_fallback.append(city)
                params_fallback.extend([limit, offset])
                
                count_query_fb = "SELECT COUNT(*) FROM Contratos WHERE ((DATE(Data_ativa_o) BETWEEN ? AND ?) OR (Data_cancelamento IS NOT NULL AND DATE(Data_cancelamento) BETWEEN ? AND ?))"
                if city: count_query_fb += " AND Cidade = ?"
                count_params_fb = [start_date, end_date, start_date, end_date]
                if city: count_params_fb.append(city)
                
                data = conn.execute(query_fallback, tuple(params_fallback)).fetchall()
                total_rows = conn.execute(count_query_fb, tuple(count_params_fb)).fetchone()[0]
            else:
                raise e

        # Processamento final
        result_list = []
        for row in data:
            row_dict = dict(row)
            
            permanencia = "N/A"
            if row_dict.get('Data_Final') != 'N/A' and row_dict.get('Data_ativa_o'):
                try:
                    from datetime import datetime
                    fmt = '%Y-%m-%d' # Padrão
                    dt_str = str(row_dict['Data_ativa_o'])[:10] # Pega YYYY-MM-DD
                    end_str = str(row_dict['Data_Final'])[:10]
                    
                    dt_start = datetime.strptime(dt_str, fmt)
                    dt_end = datetime.strptime(end_str, fmt)
                    months = round((dt_end - dt_start).days / 30.44)
                    permanencia = int(months)
                except:
                    pass
            
            row_dict['permanencia_meses'] = permanencia
            result_list.append(row_dict)

        return jsonify({
            "data": result_list,
            "total_rows": total_rows
        })

    except Exception as e:
        print(f"Erro em detalhes de evolução diária: {e}")
        return jsonify({"error": f"Erro interno: {str(e)}"}), 500
    finally:
        if conn: conn.close()
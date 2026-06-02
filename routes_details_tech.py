"""
routes_details_tech.py
Detalhes técnicos: logins, comodato, equipamentos.
"""

import sqlite3
import pandas as pd
from flask import Blueprint, jsonify, request, abort, current_app

details_tech_bp = Blueprint('details_tech_bp', __name__)

from logger import get_logger
logger = get_logger(__name__)


def get_db():
    return current_app.config['GET_DB_CONNECTION']()


def _parse_relevance(relevance_str):
    if not relevance_str:
        return None, None
    parts = relevance_str.split('-')
    try:
        if '+' in parts[0]:
            return int(parts[0].replace('+', '')), None
        return int(parts[0]), (int(parts[1]) if len(parts) > 1 else None)
    except ValueError:
        return None, None


@details_tech_bp.route('/logins/<contract_id>')
def api_logins_details(contract_id):
    conn = get_db()
    try:
        limit  = request.args.get('limit', 15, type=int)
        offset = request.args.get('offset', 0, type=int)

        total_rows = conn.execute(
            "SELECT COUNT(*) FROM Logins L LEFT JOIN Clientes_Fibra CF ON L.Login = CF.Login WHERE L.ID_contrato = ?",
            (contract_id,)
        ).fetchone()[0]

        data = conn.execute("""
            SELECT L.Login,
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
        """, (contract_id, limit, offset)).fetchall()

        return jsonify({"data": [dict(r) for r in data], "total_rows": total_rows})

    except sqlite3.Error as e:
        logger.error(f"Erro ao buscar detalhes de logins: {e}", exc_info=True)
        return jsonify({"error": "Erro interno ao processar a solicitação."}), 500
    finally:
        if conn: conn.close()


@details_tech_bp.route('/comodato/<contract_id>')
def api_comodato_details(contract_id):
    conn = get_db()
    try:
        data = conn.execute(
            "SELECT Descricao_produto, Status_comodato FROM Equipamento WHERE TRIM(ID_contrato) = ?",
            (contract_id,)
        ).fetchall()
        return jsonify({"data": [dict(r) for r in data], "total_rows": len(data)})
    except sqlite3.Error as e:
        logger.error(f"Erro ao buscar detalhes de comodato: {e}", exc_info=True)
        return jsonify({"error": "Erro interno ao processar a solicitação."}), 500
    finally:
        if conn: conn.close()


@details_tech_bp.route('/equipment_clients')
def api_equipment_clients():
    conn = get_db()
    try:
        equipment_name = request.args.get('equipment_name')
        year      = request.args.get('year', '')
        month     = request.args.get('month', '')
        city      = request.args.get('city', '')
        limit     = request.args.get('limit', 25, type=int)
        offset    = request.args.get('offset', 0, type=int)
        relevance = request.args.get('relevance', '')

        if not equipment_name:
            abort(400, "O nome do equipamento é obrigatório.")

        def _build_query(table, date_col, extra_where):
            clauses = list(extra_where)
            params = []
            if year:  clauses.append(f"STRFTIME('%Y', {date_col}) = ?"); params.append(year)
            if month: clauses.append(f"STRFTIME('%m', {date_col}) = ?"); params.append(f'{int(month):02d}')
            if city:  clauses.append("Cidade = ?"); params.append(city)
            where = " AND ".join(clauses)
            return f"SELECT ID, Cliente, {date_col} AS end_date, Cidade, Data_ativa_o FROM {table} WHERE {where}", params

        q_cancel, p_cancel = _build_query("Contratos", "Data_cancelamento",
                                          ["Status_contrato = 'Inativo'", "Status_acesso = 'Desativado'"])
        q_neg_c,  p_neg_c  = _build_query("Contratos", "Data_cancelamento",
                                          ["Status_contrato = 'Negativado'",
                                           "Cidade NOT IN ('Caçapava', 'Jacareí', 'São José dos Campos')"])

        df_cancel = pd.read_sql_query(q_cancel, conn, params=tuple(p_cancel))
        df_neg_c  = pd.read_sql_query(q_neg_c,  conn, params=tuple(p_neg_c))
        df_neg_cn = pd.DataFrame()
        try:
            q_neg_cn, p_neg_cn = _build_query("Contratos_Negativacao", "Data_negativa_o",
                                               ["Cidade NOT IN ('Caçapava', 'Jacareí', 'São José dos Campos')"])
            df_neg_cn = pd.read_sql_query(q_neg_cn, conn, params=tuple(p_neg_cn))
        except pd.io.sql.DatabaseError as e:
            if "no such table" not in str(e): raise

        df = pd.concat([df_cancel, df_neg_c, df_neg_cn], ignore_index=True).drop_duplicates(subset=['ID'])
        df['ID'] = df['ID'].astype(str).str.strip()

        if not df.empty:
            df['Data_ativa_o'] = pd.to_datetime(df['Data_ativa_o'], errors='coerce')
            df['end_date']     = pd.to_datetime(df['end_date'], errors='coerce')
            df['permanencia_dias']  = (df['end_date'] - df['Data_ativa_o']).dt.days
            df['permanencia_meses'] = (df['permanencia_dias'] / 30.44).round().astype('Int64')

            min_m, max_m = _parse_relevance(relevance)
            if min_m is not None: df = df[df['permanencia_meses'] >= min_m]
            if max_m is not None: df = df[df['permanencia_meses'] <= max_m]

        if df.empty:
            return jsonify({"data": [], "total_rows": 0})

        eq_like = equipment_name.replace(' (Agrupado)', '') + '%' if ' (Agrupado)' in equipment_name else equipment_name
        df_eq = pd.read_sql_query(
            "SELECT TRIM(ID_contrato) AS ID_contrato FROM Equipamento WHERE Descricao_produto LIKE ? AND Status_comodato = 'Baixa'",
            conn, params=(eq_like,)
        )
        df_eq['ID_contrato'] = df_eq['ID_contrato'].astype(str).str.strip()

        if df_eq.empty:
            return jsonify({"data": [], "total_rows": 0})

        df_merged = pd.merge(df, df_eq, left_on='ID', right_on='ID_contrato', how='inner')
        df_final  = df_merged.sort_values(by='end_date', ascending=False, na_position='last')
        total_rows = len(df_final)
        df_paged   = df_final.iloc[offset: offset + limit]

        data_list = []
        for _, row in df_paged.iterrows():
            data_list.append({
                "Cliente": row['Cliente'], "Contrato_ID": row['ID'], "Cidade": row['Cidade'],
                "Data_cancelamento": row['end_date'].strftime('%Y-%m-%d') if pd.notna(row['end_date']) else None,
                "Data_negativacao":  None,
                "permanencia_meses": int(row['permanencia_meses']) if pd.notna(row['permanencia_meses']) else None
            })

        return jsonify({"data": data_list, "total_rows": total_rows})

    except sqlite3.Error as e:
        logger.error(f"Erro SQLite ao buscar clientes por equipamento: {e}", exc_info=True)
        return jsonify({"error": "Erro interno no banco de dados."}), 500
    except Exception as e:
        logger.error(f"Erro inesperado ao buscar clientes por equipamento: {e}", exc_info=True)
        return jsonify({"error": "Erro interno inesperado."}), 500
    finally:
        if conn: conn.close()


@details_tech_bp.route('/active_equipment_clients')
def api_active_equipment_clients():
    conn = get_db()
    try:
        equipment_name = request.args.get('equipment_name')
        city   = request.args.get('city', '')
        limit  = request.args.get('limit', 25, type=int)
        offset = request.args.get('offset', 0, type=int)

        if not equipment_name:
            abort(400, "O nome do equipamento é obrigatório.")

        where = [
            "E.Status_comodato = 'Emprestado'",
            "L.Transmissor IS NOT NULL",
            "L.Transmissor != ''",
            "E.Descricao_produto = ?"
        ]
        params = [equipment_name]
        if city:
            where.append("C.Cidade = ?")
            params.append(city)

        where_sql = " AND ".join(where)
        base = f"FROM Logins L JOIN Contratos C ON L.ID_contrato = C.ID JOIN Equipamento E ON C.ID = TRIM(E.ID_contrato) WHERE {where_sql}"

        total_rows = conn.execute(f"SELECT COUNT(DISTINCT C.ID) {base}", tuple(params)).fetchone()[0]

        params.extend([limit, offset])
        data = conn.execute(f"""
            SELECT DISTINCT C.Cliente, C.ID AS Contrato_ID, C.Data_ativa_o, C.Cidade, C.Status_contrato
            {base}
            ORDER BY C.Cliente
            LIMIT ? OFFSET ?
        """, tuple(params)).fetchall()

        return jsonify({"data": [dict(r) for r in data], "total_rows": total_rows})

    except sqlite3.Error as e:
        logger.error(f"Erro ao buscar clientes por equipamento ativo: {e}", exc_info=True)
        return jsonify({"error": "Erro interno ao processar a solicitação."}), 500
    finally:
        if conn: conn.close()

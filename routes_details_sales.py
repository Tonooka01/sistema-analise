"""
routes_details_sales.py
Detalhes de vendas: clientes do vendedor, ativações por vendedor.
"""

import sqlite3
import pandas as pd
from flask import Blueprint, jsonify, request, abort, current_app

details_sales_bp = Blueprint('details_sales_bp', __name__)

from logger import get_logger
logger = get_logger(__name__)


def get_db():
    return current_app.config['GET_DB_CONNECTION']()


@details_sales_bp.route('/seller_clients')
def api_seller_clients():
    conn = get_db()
    try:
        seller_id   = request.args.get('seller_id', type=int)
        client_type = request.args.get('type')
        year        = request.args.get('year', '')
        month       = request.args.get('month', '')
        limit       = request.args.get('limit', 25, type=int)
        offset      = request.args.get('offset', 0, type=int)

        if not seller_id or not client_type:
            abort(400, "ID do vendedor e tipo de cliente são obrigatórios.")

        params = []

        if client_type == 'cancelado':
            where = "WHERE Vendedor = ? AND Status_contrato = 'Inativo' AND Status_acesso = 'Desativado'"
            params.append(seller_id)
            if year:  where += " AND STRFTIME('%Y', Data_cancelamento) = ?"; params.append(year)
            if month: where += " AND STRFTIME('%m', Data_cancelamento) = ?"; params.append(f'{int(month):02d}')
            base_query = f"SELECT Cliente, ID AS Contrato_ID, Data_ativa_o, Data_cancelamento as end_date FROM Contratos {where}"

        elif client_type == 'negativado':
            where_cn = "WHERE Vendedor = ? AND Cidade NOT IN ('Caçapava', 'Jacareí', 'São José dos Campos')"
            p_cn = [seller_id]
            if year:  where_cn += " AND STRFTIME('%Y', Data_negativa_o) = ?"; p_cn.append(year)
            if month: where_cn += " AND STRFTIME('%m', Data_negativa_o) = ?"; p_cn.append(f'{int(month):02d}')

            where_c = "WHERE Vendedor = ? AND Status_contrato = 'Negativado' AND Cidade NOT IN ('Caçapava', 'Jacareí', 'São José dos Campos')"
            p_c = [seller_id]
            if year:  where_c += " AND STRFTIME('%Y', Data_cancelamento) = ?"; p_c.append(year)
            if month: where_c += " AND STRFTIME('%m', Data_cancelamento) = ?"; p_c.append(f'{int(month):02d}')

            base_query = (
                f"SELECT Cliente, ID AS Contrato_ID, Data_ativa_o, Data_negativa_o as end_date FROM Contratos_Negativacao {where_cn} "
                f"UNION "
                f"SELECT Cliente, ID AS Contrato_ID, Data_ativa_o, Data_cancelamento as end_date FROM Contratos {where_c}"
            )
            params = p_cn + p_c
        else:
            abort(400, "Tipo de cliente inválido.")

        total_rows = conn.execute(f"SELECT COUNT(*) FROM ({base_query})", tuple(params)).fetchone()[0]

        paginated = f"""
            SELECT sub.Cliente, sub.Contrato_ID, sub.Data_ativa_o, sub.end_date,
                   CASE WHEN sub.Data_ativa_o IS NOT NULL AND sub.end_date IS NOT NULL
                        THEN JULIANDAY(sub.end_date) - JULIANDAY(sub.Data_ativa_o) ELSE NULL END AS permanencia_dias,
                   CASE WHEN sub.Data_ativa_o IS NOT NULL AND sub.end_date IS NOT NULL
                        THEN CAST(ROUND((JULIANDAY(sub.end_date) - JULIANDAY(sub.Data_ativa_o)) / 30.44) AS INTEGER) ELSE NULL END AS permanencia_meses
            FROM ({base_query}) AS sub ORDER BY sub.end_date DESC LIMIT ? OFFSET ?
        """
        params.extend([limit, offset])
        data = conn.execute(paginated, tuple(params)).fetchall()

        return jsonify({"data": [dict(r) for r in data], "total_rows": total_rows})

    except sqlite3.Error as e:
        logger.error(f"Erro ao buscar clientes do vendedor: {e}", exc_info=True)
        return jsonify({"error": "Erro interno ao processar a solicitação."}), 500
    finally:
        if conn: conn.close()


@details_sales_bp.route('/seller_activations')
def api_seller_activations():
    conn = get_db()
    try:
        seller_id   = request.args.get('seller_id', type=int)
        client_type = request.args.get('type')
        city        = request.args.get('city', '')
        year        = request.args.get('year', '')
        month       = request.args.get('month', '')
        limit       = request.args.get('limit', 25, type=int)
        offset      = request.args.get('offset', 0, type=int)

        if not seller_id or not client_type:
            abort(400, "ID do vendedor e tipo de cliente são obrigatórios.")

        where_c = ["C.Vendedor = ?"]
        p_c = [seller_id]
        if city:  where_c.append("C.Cidade = ?");                              p_c.append(city)
        if year:  where_c.append("STRFTIME('%Y', C.Data_ativa_o) = ?");        p_c.append(year)
        if month: where_c.append("STRFTIME('%m', C.Data_ativa_o) = ?");        p_c.append(f'{int(month):02d}')

        where_cn_sql = " AND ".join(where_c).replace("C.", "")

        query_base = f"""
            SELECT ID, Cliente, Data_ativa_o, Status_contrato, Data_cancelamento, 0 AS is_negativado_table, Cidade
            FROM Contratos C WHERE {" AND ".join(where_c)}
            UNION
            SELECT ID, Cliente, Data_ativa_o, 'Negativado' AS Status_contrato,
                   Data_negativa_o AS Data_cancelamento, 1 AS is_negativado_table, Cidade
            FROM Contratos_Negativacao C WHERE {where_cn_sql}
        """

        try:
            df_all = pd.read_sql_query(query_base, conn, params=tuple(p_c * 2))
            df_all.sort_values('is_negativado_table', inplace=True)
            df = df_all.drop_duplicates(subset=['ID'], keep='first')
        except pd.io.sql.DatabaseError as e:
            if "no such table" not in str(e).lower(): raise
            fallback = f"SELECT ID, Cliente, Data_ativa_o, Status_contrato, Data_cancelamento, Cidade FROM Contratos C WHERE {' AND '.join(where_c)}"
            df = pd.read_sql_query(fallback, conn, params=tuple(p_c))

        if df.empty:
            return jsonify({"data": [], "total_rows": 0})

        df['is_active']    = df['Status_contrato'] == 'Ativo'
        df['is_cancelado'] = df['Status_contrato'] == 'Inativo'
        df['is_negativado'] = (
            (df['Status_contrato'] == 'Negativado') &
            (~df['Cidade'].isin(['Caçapava', 'Jacareí', 'São José dos Campos']))
        )

        type_map = {
            'ativado':        df,
            'ativo_permanece': df[df['is_active']],
            'cancelado':      df[df['is_cancelado']],
            'negativado':     df[df['is_negativado']],
        }
        if client_type not in type_map:
            abort(400, "Tipo de cliente inválido.")

        df_filtered = type_map[client_type].copy()
        total_rows  = len(df_filtered)

        df_filtered['Data_ativa_o']    = pd.to_datetime(df_filtered['Data_ativa_o'], errors='coerce')
        df_filtered['end_date']        = pd.NaT
        df_filtered['permanencia_meses'] = pd.NA

        if client_type in ['cancelado', 'negativado']:
            df_filtered['end_date'] = pd.to_datetime(df_filtered.get('Data_cancelamento'), errors='coerce')
            diff = (df_filtered['end_date'] - df_filtered['Data_ativa_o']) / pd.to_timedelta(1, 'D')
            df_filtered['permanencia_meses'] = (pd.to_numeric(diff, errors='coerce') / 30.44).round().astype('Int64')

        df_paged = df_filtered.sort_values('Data_ativa_o', ascending=False).iloc[offset: offset + limit]

        data_list = []
        for _, row in df_paged.iterrows():
            data_list.append({
                "Cliente": row['Cliente'], "Contrato_ID": row['ID'], "Status_contrato": row['Status_contrato'],
                "Data_ativa_o":       row['Data_ativa_o'].strftime('%Y-%m-%d') if pd.notna(row['Data_ativa_o']) else None,
                "end_date":           row['end_date'].strftime('%Y-%m-%d') if pd.notna(row['end_date']) else None,
                "permanencia_meses":  int(row['permanencia_meses']) if pd.notna(row['permanencia_meses']) else None
            })

        return jsonify({"data": data_list, "total_rows": total_rows})

    except sqlite3.Error as e:
        logger.error(f"Erro SQLite ao buscar ativações do vendedor: {e}", exc_info=True)
        return jsonify({"error": "Erro interno ao processar a solicitação."}), 500
    except Exception as e:
        logger.error(f"Erro inesperado ao buscar ativações do vendedor: {e}", exc_info=True)
        return jsonify({"error": "Erro interno inesperado."}), 500
    finally:
        if conn: conn.close()

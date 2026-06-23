"""
routes_crescimento.py
Crescimento Analítico: projeção de crescimento + mapa de calor (heatmap por categoria).
"""

import sqlite3
import io
import zipfile
from datetime import date
from flask import Blueprint, jsonify, request, current_app, send_file
from flask_login import login_required
from logger import get_logger

crescimento_bp = Blueprint('crescimento_bp', __name__)
logger = get_logger(__name__)


def get_db():
    return current_app.config['GET_DB_CONNECTION']()


# ── Utilitários ────────────────────────────────────────────────────────────────

def _linreg(xs, ys):
    """Regressão linear mínimos quadrados. Retorna (a, b) onde y = a*x + b."""
    n = len(xs)
    if n < 2:
        return 0.0, float(ys[0]) if ys else 0.0
    sx  = sum(xs)
    sy  = sum(float(y) for y in ys)
    sxx = sum(x * x for x in xs)
    sxy = sum(x * float(y) for x, y in zip(xs, ys))
    denom = n * sxx - sx * sx
    if denom == 0:
        return 0.0, sy / n
    a = (n * sxy - sx * sy) / denom
    b = (sy - a * sx) / n
    return a, b


def _month_end(ym):
    """Último dia do mês 'YYYY-MM' como string 'YYYY-MM-DD'."""
    y, m = int(ym[:4]), int(ym[5:7])
    days = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    if m == 2 and ((y % 4 == 0 and y % 100 != 0) or y % 400 == 0):
        return f"{y:04d}-{m:02d}-29"
    return f"{y:04d}-{m:02d}-{days[m]:02d}"


def _add_months(ym, n):
    """Adiciona n meses a 'YYYY-MM'."""
    y, m = int(ym[:4]), int(ym[5:7])
    m += n
    while m > 12:
        m -= 12
        y += 1
    return f"{y:04d}-{m:02d}"


def _gen_months(start_ym, end_ym):
    result = []
    y, m = int(start_ym[:4]), int(start_ym[5:7])
    ey, em = int(end_ym[:4]), int(end_ym[5:7])
    while (y, m) <= (ey, em):
        result.append(f"{y:04d}-{m:02d}")
        m += 1
        if m > 12:
            m = 1
            y += 1
    return result


# ── Rotas ──────────────────────────────────────────────────────────────────────

@crescimento_bp.route('/dados')
@login_required
def api_crescimento_dados():
    """Retorna histórico (24 meses) + projeção linear (6 meses) de MRR, clientes, churn, neg."""
    try:
        conn = get_db()
        hoje     = date.today()
        cur_ym   = f"{hoje.year:04d}-{hoje.month:02d}"
        start_ym = f"{hoje.year - 2:04d}-{hoje.month:02d}"
        months   = _gen_months(start_ym, cur_ym)

        # Filtro de data opcional (para periodo_stats nos KPI cards)
        filter_start = request.args.get('start_date', '').strip()
        filter_end   = request.args.get('end_date',   '').strip()

        # Fator de extrapolação para o mês atual (compensar dias faltantes)
        days_in_cur = int(_month_end(cur_ym)[-2:])
        extrap_factor = days_in_cur / hoje.day  # e.g. 30/16 = 1.875

        # ── MRR + Clientes ativos (pagamentos recebidos por mês) ──────────────
        mrr_by_m     = {}
        active_by_m  = {}
        for r in conn.execute("""
            SELECT STRFTIME('%Y-%m', Data_pagamento) AS mes,
                   SUM(Valor_recebido)                AS mrr,
                   COUNT(DISTINCT ID_contrato_principal) AS clientes
            FROM Contas_a_Receber
            WHERE Status = 'Recebido'
              AND Data_pagamento IS NOT NULL AND Data_pagamento != ''
              AND ID_contrato_principal IS NOT NULL AND ID_contrato_principal > 0
            GROUP BY mes
        """):
            if r['mes']:
                mrr_by_m[r['mes']]    = float(r['mrr'] or 0)
                active_by_m[r['mes']] = int(r['clientes'] or 0)

        # ── Novos contratos por mês (data de ativação) ────────────────────────
        new_by_m = {}
        for r in conn.execute("""
            SELECT STRFTIME('%Y-%m', Data_ativa_o) AS mes, COUNT(*) AS n
            FROM Contratos
            WHERE Data_ativa_o IS NOT NULL AND Data_ativa_o != ''
              AND Status_contrato NOT IN ('Pendente')
            GROUP BY mes
        """):
            if r['mes']:
                new_by_m[r['mes']] = r['n']

        # ── Verifica se tabela Contratos_Negativacao existe ──────────────────
        has_neg = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='Contratos_Negativacao'"
        ).fetchone()

        # ── Churn por mês — UNION ambas as tabelas (mesma lógica de routes_dre.py) ──
        _churn_st = "(Status_contrato = 'Inativo' OR Status_contrato = 'Negativado' OR Status_contrato = 'Cancelado' OR Status_contrato = 'Desistente')"
        _churn_base = f"{_churn_st} AND Data_cancelamento IS NOT NULL AND Data_cancelamento != '' AND Data_cancelamento != '0000-00-00'"
        churn_sql = f"""
            SELECT STRFTIME('%Y-%m', Data_cancelamento) AS mes, COUNT(*) AS n
            FROM (
                SELECT Data_cancelamento FROM Contratos WHERE {_churn_base}
                UNION ALL
                SELECT Data_cancelamento FROM Contratos_Negativacao WHERE {_churn_base}
            ) t GROUP BY mes
        """ if has_neg else f"""
            SELECT STRFTIME('%Y-%m', Data_cancelamento) AS mes, COUNT(*) AS n
            FROM Contratos WHERE {_churn_base} GROUP BY mes
        """
        churn_by_m = {}
        for r in conn.execute(churn_sql):
            if r['mes']:
                churn_by_m[r['mes']] = r['n']

        # ── Negativações por mês (Data_negativa_o) — UNION ambas as tabelas ──
        neg_by_m = {}
        neg_sql = """
            SELECT STRFTIME('%Y-%m', Data_negativa_o) AS mes, COUNT(*) AS n
            FROM (
                SELECT Data_negativa_o FROM Contratos
                WHERE Status_contrato = 'Negativado'
                  AND Data_negativa_o IS NOT NULL AND Data_negativa_o != ''
                UNION ALL
                SELECT Data_negativa_o FROM Contratos_Negativacao
                WHERE Data_negativa_o IS NOT NULL AND Data_negativa_o != ''
            ) t GROUP BY mes
        """ if has_neg else """
            SELECT STRFTIME('%Y-%m', Data_negativa_o) AS mes, COUNT(*) AS n
            FROM Contratos
            WHERE Status_contrato = 'Negativado'
              AND Data_negativa_o IS NOT NULL AND Data_negativa_o != ''
            GROUP BY mes
        """
        for r in conn.execute(neg_sql):
            if r['mes']:
                neg_by_m[r['mes']] = r['n']

        conn.close()

        historico = []
        for ym in months:
            is_cur    = (ym == cur_ym)
            mrr_raw   = mrr_by_m.get(ym, 0)
            cli_raw   = active_by_m.get(ym, 0)
            novos_raw = new_by_m.get(ym, 0)
            churn_raw = churn_by_m.get(ym, 0)
            neg_raw   = neg_by_m.get(ym, 0)

            # Extrapola o mês atual para o valor esperado do mês completo
            if is_cur and hoje.day < days_in_cur:
                historico.append({
                    'periodo':     ym,
                    'mrr':         round(mrr_raw   * extrap_factor, 2),
                    'clientes':    round(cli_raw    * extrap_factor),
                    'novos':       round(novos_raw  * extrap_factor),
                    'churn':       round(churn_raw  * extrap_factor),
                    'neg':         round(neg_raw    * extrap_factor),
                    'extrapolado': True,
                    'dias_reais':  hoje.day,
                    'dias_mes':    days_in_cur,
                })
            else:
                historico.append({
                    'periodo':     ym,
                    'mrr':         mrr_raw,
                    'clientes':    cli_raw,
                    'novos':       novos_raw,
                    'churn':       churn_raw,
                    'neg':         neg_raw,
                    'extrapolado': False,
                })

        # ── Estatísticas do período filtrado (para os KPI cards) ──────────────
        periodo_stats = None
        if filter_start or filter_end:
            fs_ym = filter_start[:7] if filter_start else ''
            fe_ym = filter_end[:7]   if filter_end   else ''
            filt  = [
                ym for ym in months
                if (not fs_ym or ym >= fs_ym) and (not fe_ym or ym <= fe_ym)
            ]
            pm      = max(1, len(filt))
            t_churn = sum(churn_by_m.get(m, 0) for m in filt)
            t_neg   = sum(neg_by_m.get(m, 0)   for m in filt)
            periodo_stats = {
                'meses':       pm,
                'churn_total': t_churn,
                'churn_avg':   round(t_churn / pm, 1),
                'neg_total':   t_neg,
                'neg_avg':     round(t_neg   / pm, 1),
            }

        # ── Projeção linear (últimos 12 meses) ───────────────────────────────
        hist12 = historico[-12:] if len(historico) >= 12 else historico
        xs     = list(range(len(hist12)))
        regs   = {
            f: _linreg(xs, [h[f] for h in hist12])
            for f in ('mrr', 'clientes', 'novos', 'churn')
        }

        projecao = []
        for i in range(6):
            xi = len(hist12) + i
            ym = _add_months(cur_ym, i + 1)
            pt = {'periodo': ym, 'projetado': True}
            for f, (a, b) in regs.items():
                val = max(0, a * xi + b)
                pt[f] = round(val, 2) if f == 'mrr' else round(val)
            projecao.append(pt)

        return jsonify({'historico': historico, 'projecao': projecao,
                        'periodo_stats': periodo_stats})

    except sqlite3.Error as e:
        logger.error("crescimento/dados: %s", e, exc_info=True)
        return jsonify({'error': str(e)}), 500


@crescimento_bp.route('/mapa')
@login_required
def api_crescimento_mapa():
    """Retorna pontos lat/lon para heatmap. category: cancelamento|instalacao|manutencao|visita"""
    try:
        conn       = get_db()
        categoria  = request.args.get('category', 'cancelamento')
        start_date = request.args.get('start_date', '')
        end_date   = request.args.get('end_date', '')

        points = []
        total_in_period = 0

        def _collect_rows(rows):
            for r in rows:
                try:
                    lat = float(r['Latitude'])
                    lon = float(r['Longitude'])
                    if lat and lon and lat != 0 and lon != 0:
                        points.append({'lat': lat, 'lon': lon})
                except (ValueError, TypeError):
                    pass

        def _contratos_points(date_col, extra_conds=None):
            nonlocal total_in_period
            base_conds = [f"c.{date_col} IS NOT NULL", f"c.{date_col} != ''"]
            if extra_conds:
                base_conds.extend(extra_conds)
            date_params = []
            if start_date:
                base_conds.append(f"Date(c.{date_col}) >= ?"); date_params.append(start_date)
            if end_date:
                base_conds.append(f"Date(c.{date_col}) <= ?"); date_params.append(end_date)

            # Total no período (com ou sem coordenadas)
            total_in_period = conn.execute(
                f"SELECT COUNT(*) FROM Contratos c WHERE {' AND '.join(base_conds)}",
                date_params
            ).fetchone()[0] or 0

            # Pontos com coordenadas
            coord_conds = base_conds + [
                "cl.Latitude IS NOT NULL",  "cl.Latitude != ''",  "cl.Latitude != '0'",
                "cl.Longitude IS NOT NULL", "cl.Longitude != ''", "cl.Longitude != '0'",
            ]
            _collect_rows(conn.execute(f"""
                SELECT cl.Latitude, cl.Longitude
                FROM Contratos c
                JOIN Clientes cl ON c.Cliente = cl.Raz_o_social
                WHERE {' AND '.join(coord_conds)}
            """, date_params).fetchall())

        if categoria == 'cancelamento':
            _contratos_points('Data_cancelamento',
                              ["c.Status_contrato IN ('Inativo','Desistente','Negativado','Cancelado')"])
            # Contratos_Negativacao: alguns têm Data_cancelamento real (não '0000-00-00')
            try:
                cn_st = "Status_contrato IN ('Inativo','Negativado','Desistente','Cancelado')"
                cn_c  = [cn_st, "Data_cancelamento IS NOT NULL", "Data_cancelamento != ''",
                         "Data_cancelamento != '0000-00-00'"]
                cn_p  = []
                if start_date:
                    cn_c.append("Date(Data_cancelamento) >= ?"); cn_p.append(start_date)
                if end_date:
                    cn_c.append("Date(Data_cancelamento) <= ?"); cn_p.append(end_date)
                wn = ' AND '.join(cn_c)
                total_in_period += conn.execute(
                    f"SELECT COUNT(*) FROM Contratos_Negativacao WHERE {wn}", cn_p
                ).fetchone()[0] or 0
                coord_cn = cn_c + [
                    "cl.Latitude IS NOT NULL", "cl.Latitude != ''", "cl.Latitude != '0'",
                    "cl.Longitude IS NOT NULL", "cl.Longitude != ''", "cl.Longitude != '0'",
                ]
                _collect_rows(conn.execute(f"""
                    SELECT cl.Latitude, cl.Longitude
                    FROM Contratos_Negativacao c
                    JOIN Clientes_Negativacao cl ON c.Cliente = cl.Raz_o_social
                    WHERE {' AND '.join(coord_cn)}
                """, cn_p).fetchall())
            except Exception:
                pass

        elif categoria == 'instalacao':
            _contratos_points('Data_ativa_o',
                              ["c.Status_contrato NOT IN ('Pendente')"])

            # Breakdown de status dos instalados no período
            _bd_conds  = ["Data_ativa_o IS NOT NULL", "Data_ativa_o != ''",
                          "Status_contrato NOT IN ('Pendente')"]
            _bd_params = []
            if start_date:
                _bd_conds.append("Date(Data_ativa_o) >= ?"); _bd_params.append(start_date)
            if end_date:
                _bd_conds.append("Date(Data_ativa_o) <= ?"); _bd_params.append(end_date)

            _bd_where = " AND ".join(_bd_conds)
            _bd_rows  = conn.execute(
                f"SELECT Status_contrato AS st, COUNT(*) AS n FROM Contratos WHERE {_bd_where} GROUP BY Status_contrato",
                _bd_params
            ).fetchall()
            _status_map = {r['st']: r['n'] for r in _bd_rows}

            # Inclui registros de Contratos_Negativacao (já saíram de Contratos)
            _cn_conds  = ["Data_ativa_o IS NOT NULL", "Data_ativa_o != ''"]
            _cn_params = []
            if start_date:
                _cn_conds.append("Date(Data_ativa_o) >= ?"); _cn_params.append(start_date)
            if end_date:
                _cn_conds.append("Date(Data_ativa_o) <= ?"); _cn_params.append(end_date)
            try:
                _cn_cnt = conn.execute(
                    f"SELECT COUNT(*) FROM Contratos_Negativacao WHERE {' AND '.join(_cn_conds)}",
                    _cn_params
                ).fetchone()[0] or 0
                _status_map['Negativado'] = (_status_map.get('Negativado', 0) + _cn_cnt)
                total_in_period += _cn_cnt
            except Exception:
                _cn_cnt = 0

            breakdown = {
                'ativo':      _status_map.get('Ativo', 0),
                'cancelado':  _status_map.get('Inativo', 0) + _status_map.get('Desistente', 0),
                'negativado': _status_map.get('Negativado', 0),
            }

        elif categoria == 'negativacao':
            # Contratos (Filial 2): Status=Negativado + join com Clientes
            neg_c_base = ["c.Data_negativa_o IS NOT NULL", "c.Data_negativa_o != ''",
                          "c.Status_contrato = 'Negativado'"]
            neg_n_base = ["c.Data_negativa_o IS NOT NULL", "c.Data_negativa_o != ''"]
            neg_p_c, neg_p_n = [], []
            if start_date:
                neg_c_base.append("Date(c.Data_negativa_o) >= ?"); neg_p_c.append(start_date)
                neg_n_base.append("Date(c.Data_negativa_o) >= ?"); neg_p_n.append(start_date)
            if end_date:
                neg_c_base.append("Date(c.Data_negativa_o) <= ?"); neg_p_c.append(end_date)
                neg_n_base.append("Date(c.Data_negativa_o) <= ?"); neg_p_n.append(end_date)
            wc = ' AND '.join(neg_c_base)
            wn = ' AND '.join(neg_n_base)

            cnt_c = conn.execute(
                f"SELECT COUNT(*) FROM Contratos c WHERE {wc}", neg_p_c
            ).fetchone()[0] or 0
            cnt_n = 0
            try:
                cnt_n = conn.execute(
                    f"SELECT COUNT(*) FROM Contratos_Negativacao c WHERE {wn}", neg_p_n
                ).fetchone()[0] or 0
            except Exception:
                pass
            total_in_period = cnt_c + cnt_n

            # Pontos com coords: Contratos -> Clientes
            coord_c = neg_c_base + [
                "cl.Latitude IS NOT NULL", "cl.Latitude != ''", "cl.Latitude != '0'",
                "cl.Longitude IS NOT NULL", "cl.Longitude != ''", "cl.Longitude != '0'",
            ]
            _collect_rows(conn.execute(f"""
                SELECT cl.Latitude, cl.Longitude
                FROM Contratos c
                JOIN Clientes cl ON c.Cliente = cl.Raz_o_social
                WHERE {' AND '.join(coord_c)}
            """, neg_p_c).fetchall())

            # Pontos com coords: Contratos_Negativacao -> Clientes_Negativacao
            try:
                coord_n = neg_n_base + [
                    "cl.Latitude IS NOT NULL", "cl.Latitude != ''", "cl.Latitude != '0'",
                    "cl.Longitude IS NOT NULL", "cl.Longitude != ''", "cl.Longitude != '0'",
                ]
                _collect_rows(conn.execute(f"""
                    SELECT cl.Latitude, cl.Longitude
                    FROM Contratos_Negativacao c
                    JOIN Clientes_Negativacao cl ON c.Cliente = cl.Raz_o_social
                    WHERE {' AND '.join(coord_n)}
                """, neg_p_n).fetchall())
            except Exception:
                pass

        else:
            assunto_map = {
                'manutencao': ("MANUTENÇÃO DE FIBRA", "MANUTENÇÃO DE REDE",
                               "FALHA NA REDE", "SEM CONEXÃO", "OSCILAÇÃO"),
                'visita':     ("VISITA TECNICA",),
            }
            assuntos = assunto_map.get(categoria)
            if not assuntos:
                conn.close()
                return jsonify({'points': [], 'total': 0, 'total_in_period': 0})

            ph = ','.join(['?'] * len(assuntos))
            os_base = []
            os_params_base = list(assuntos)
            if start_date:
                os_base.append("Date(o.Abertura) >= ?"); os_params_base.append(start_date)
            if end_date:
                os_base.append("Date(o.Abertura) <= ?"); os_params_base.append(end_date)
            ec = (' AND ' + ' AND '.join(os_base)) if os_base else ''

            total_in_period = conn.execute(
                f"SELECT COUNT(*) FROM OS o WHERE o.Assunto IN ({ph}){ec}",
                os_params_base
            ).fetchone()[0] or 0

            # Fonte 1: join com Clientes pelo nome do cliente
            conds  = [f"o.Assunto IN ({ph})",
                      "cl.Latitude IS NOT NULL", "cl.Latitude != ''", "cl.Latitude != '0'"]
            params = list(assuntos)
            if start_date:
                conds.append("Date(o.Abertura) >= ?"); params.append(start_date)
            if end_date:
                conds.append("Date(o.Abertura) <= ?"); params.append(end_date)

            _collect_rows(conn.execute(f"""
                SELECT cl.Latitude, cl.Longitude
                FROM OS o
                JOIN Clientes cl ON o.Cliente = cl.Raz_o_social
                WHERE {' AND '.join(conds)}
            """, params).fetchall())

            # Fonte 2: join com Logins pelo login PPPoE (complementa cobertura)
            conds2  = [f"o.Assunto IN ({ph})",
                       "l.Latitude IS NOT NULL", "l.Latitude != ''", "l.Latitude != '0'",
                       "o.Login IS NOT NULL", "o.Login != ''"]
            params2 = list(assuntos)
            if start_date:
                conds2.append("Date(o.Abertura) >= ?"); params2.append(start_date)
            if end_date:
                conds2.append("Date(o.Abertura) <= ?"); params2.append(end_date)

            _collect_rows(conn.execute(f"""
                SELECT l.Latitude, l.Longitude
                FROM OS o
                JOIN Logins l ON o.Login = l.Login
                WHERE {' AND '.join(conds2)}
            """, params2).fetchall())

        conn.close()
        resp = {'points': points, 'total': len(points), 'total_in_period': total_in_period}
        if categoria == 'instalacao':
            resp['breakdown'] = breakdown
        return jsonify(resp)

    except sqlite3.Error as e:
        logger.error("crescimento/mapa: %s", e, exc_info=True)
        return jsonify({'error': str(e)}), 500


@crescimento_bp.route('/kmz')
@login_required
def api_crescimento_kmz():
    """Gera KMZ (KML + zip) com pontos geo de todas as categorias."""
    try:
        conn       = get_db()
        start_date = request.args.get('start_date', '')
        end_date   = request.args.get('end_date', '')

        def _date_cond(alias, field, params):
            conds = []
            if start_date:
                conds.append(f"Date({alias}.{field}) >= ?"); params.append(start_date)
            if end_date:
                conds.append(f"Date({alias}.{field}) <= ?"); params.append(end_date)
            return conds

        kml = ['<?xml version="1.0" encoding="UTF-8"?>',
               '<kml xmlns="http://www.opengis.net/kml/2.2">',
               '<Document><name>NetVale Analytics</name>']

        STYLE = {
            'Cancelamentos':  ('#FF0000', 'cancel'),
            'Instalações':    ('#00FF00', 'instal'),
            'Negativação':    ('#FF6600', 'negat'),
            'Manutenção':     ('#FF8800', 'manut'),
            'Visita Técnica': ('#8800FF', 'visita'),
        }
        for folder, (color, sid) in STYLE.items():
            aa, bb, cc = color[1:3], color[3:5], color[5:7]
            kml.append(f'<Style id="{sid}"><IconStyle><color>ff{cc}{bb}{aa}</color>'
                       f'<Icon><href>http://maps.google.com/mapfiles/kml/paddle/wht-blank.png</href>'
                       f'</Icon></IconStyle></Style>')

        # --- Cancelamentos ---
        params = []
        extra  = _date_cond('c', 'Data_cancelamento', params)
        ec     = (' AND ' + ' AND '.join(extra)) if extra else ''
        kml.append('<Folder><name>Cancelamentos</name>')
        for r in conn.execute(f"""
            SELECT c.Cliente, cl.Latitude, cl.Longitude, c.Data_cancelamento, c.Cidade
            FROM Contratos c
            JOIN Clientes cl ON c.Cliente = cl.Raz_o_social
            WHERE c.Status_contrato IN ('Inativo','Desistente','Negativado')
              AND cl.Latitude IS NOT NULL AND cl.Latitude != '' AND cl.Latitude != '0'{ec}
        """, params):
            try:
                lat, lon = float(r['Latitude']), float(r['Longitude'])
                nome = (r['Cliente'] or '').replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
                kml.append(f'<Placemark><styleUrl>#cancel</styleUrl>'
                           f'<name>{nome}</name>'
                           f'<description>{r["Data_cancelamento"] or ""} — {r["Cidade"] or ""}</description>'
                           f'<Point><coordinates>{lon},{lat},0</coordinates></Point></Placemark>')
            except (ValueError, TypeError):
                pass
        kml.append('</Folder>')

        # --- Instalações (Contratos por Data_ativa_o) ---
        params = []
        extra  = _date_cond('c', 'Data_ativa_o', params)
        ec     = (' AND ' + ' AND '.join(extra)) if extra else ''
        kml.append('<Folder><name>Instalações</name>')
        for r in conn.execute(f"""
            SELECT c.Cliente, cl.Latitude, cl.Longitude, c.Data_ativa_o, c.Cidade
            FROM Contratos c
            JOIN Clientes cl ON c.Cliente = cl.Raz_o_social
            WHERE c.Data_ativa_o IS NOT NULL AND c.Data_ativa_o != ''
              AND c.Status_contrato NOT IN ('Pendente')
              AND cl.Latitude IS NOT NULL AND cl.Latitude != '' AND cl.Latitude != '0'{ec}
        """, params):
            try:
                lat, lon = float(r['Latitude']), float(r['Longitude'])
                nome = (r['Cliente'] or '').replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
                kml.append(f'<Placemark><styleUrl>#instal</styleUrl>'
                           f'<name>{nome}</name>'
                           f'<description>{r["Data_ativa_o"] or ""} — {r["Cidade"] or ""}</description>'
                           f'<Point><coordinates>{lon},{lat},0</coordinates></Point></Placemark>')
            except (ValueError, TypeError):
                pass
        kml.append('</Folder>')

        # --- Negativação ---
        params = []
        extra  = _date_cond('c', 'Data_negativa_o', params)
        ec     = (' AND ' + ' AND '.join(extra)) if extra else ''
        kml.append('<Folder><name>Negativação</name>')
        for r in conn.execute(f"""
            SELECT c.Cliente, cl.Latitude, cl.Longitude, c.Data_negativa_o, c.Cidade
            FROM Contratos c
            JOIN Clientes cl ON c.Cliente = cl.Raz_o_social
            WHERE c.Data_negativa_o IS NOT NULL AND c.Data_negativa_o != ''
              AND cl.Latitude IS NOT NULL AND cl.Latitude != '' AND cl.Latitude != '0'{ec}
        """, params):
            try:
                lat, lon = float(r['Latitude']), float(r['Longitude'])
                nome = (r['Cliente'] or '').replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
                kml.append(f'<Placemark><styleUrl>#negat</styleUrl>'
                           f'<name>{nome}</name>'
                           f'<description>{r["Data_negativa_o"] or ""} — {r["Cidade"] or ""}</description>'
                           f'<Point><coordinates>{lon},{lat},0</coordinates></Point></Placemark>')
            except (ValueError, TypeError):
                pass
        kml.append('</Folder>')

        # --- OS categories (Manutenção, Visita) ---
        OS_CATS = [
            ('Manutenção',     ('MANUTENÇÃO DE FIBRA', 'MANUTENÇÃO DE REDE', 'FALHA NA REDE', 'OSCILAÇÃO'), 'manut'),
            ('Visita Técnica', ('VISITA TECNICA',), 'visita'),
        ]
        for folder_name, assuntos, sid in OS_CATS:
            ph = ','.join(['?'] * len(assuntos))
            params = list(assuntos)
            extra  = _date_cond('o', 'Abertura', params)
            ec     = (' AND ' + ' AND '.join(extra)) if extra else ''
            kml.append(f'<Folder><name>{folder_name}</name>')
            for r in conn.execute(f"""
                SELECT o.Cliente, cl.Latitude, cl.Longitude, o.Abertura, o.Cidade
                FROM OS o
                JOIN Clientes cl ON o.Cliente = cl.Raz_o_social
                WHERE o.Assunto IN ({ph})
                  AND cl.Latitude IS NOT NULL AND cl.Latitude != '' AND cl.Latitude != '0'{ec}
            """, params):
                try:
                    lat, lon = float(r['Latitude']), float(r['Longitude'])
                    nome = (r['Cliente'] or '').replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
                    kml.append(f'<Placemark><styleUrl>#{sid}</styleUrl>'
                               f'<name>{nome}</name>'
                               f'<description>{r["Abertura"] or ""}</description>'
                               f'<Point><coordinates>{lon},{lat},0</coordinates></Point></Placemark>')
                except (ValueError, TypeError):
                    pass
            kml.append('</Folder>')

        kml.extend(['</Document>', '</kml>'])
        conn.close()

        buf = io.BytesIO()
        with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
            zf.writestr('netvale_analytics.kml', '\n'.join(kml))
        buf.seek(0)

        return send_file(
            buf,
            mimetype='application/vnd.google-earth.kmz',
            as_attachment=True,
            download_name='netvale_analytics.kmz'
        )

    except sqlite3.Error as e:
        logger.error("crescimento/kmz: %s", e, exc_info=True)
        return jsonify({'error': str(e)}), 500

"""
routes_ixc_sync.py
Sincronização incremental e completa com a API do IXCsoft.
"""

import sqlite3
import threading
import base64
import time
import requests
import urllib3
from concurrent.futures import ThreadPoolExecutor, as_completed
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
from datetime import datetime, timedelta
from flask import Blueprint, jsonify, request, current_app, render_template_string
from flask_login import login_required, current_user

ixc_sync_bp = Blueprint('ixc_sync_bp', __name__)

from logger import get_logger
logger = get_logger(__name__)


# ── Telegram ────────────────────────────────────────────────────────────────────

def _tg_send(text: str, app=None):
    """Envia mensagem via Telegram Bot.
    Passa `app` quando chamado de thread; omite quando chamado dentro de request context."""
    try:
        from flask import current_app as _ca
        _app = app or _ca._get_current_object()

        def _do():
            conn = _app.config['GET_DB_CONNECTION']()
            def _get(k):
                r = conn.execute("SELECT value FROM Settings WHERE key=?", (k,)).fetchone()
                return r['value'] if r else None
            token   = _get('tg_token')
            chat_id = _get('tg_chat_id')
            conn.close()
            if not token or not chat_id:
                return
            requests.post(
                f'https://api.telegram.org/bot{token}/sendMessage',
                json={'chat_id': chat_id, 'text': text, 'parse_mode': 'HTML'},
                timeout=10,
                verify=False,
            )

        if app:
            with app.app_context():
                _do()
        else:
            _do()
    except Exception as e:
        logger.warning(f"[Telegram] Falha ao enviar mensagem: {e}")

IXC_BASE_URL  = 'https://sistema.netvaletelecom.com/webservice/v1'
ROWS_PER_PAGE = 500

# IDs das cidades atendidas
CIDADES_IDS = ['515', '599', '624', '656']  # Dom Pedro, Pres.Dutra, S.Domingos, Tuntum
CIDADE_NOMES = {'515': 'Dom Pedro', '599': 'Presidente Dutra', '624': 'São Domingos do Maranhão', '656': 'Tuntum'}

# IDs numéricos das OLTs permitidas
OLTS_IDS = ['6', '9', '10', '11']
OLTS_NOMES = {'6': 'OLT01-P. DUTRA', '9': 'OLT - D.PEDRO FIBERHOME', '10': 'OLT - TUNTUM FIBERHOME', '11': 'OLT-S.DOMINGOS FIBERHOME'}


def get_db():
    return current_app.config['GET_DB_CONNECTION']()


def _get_token(conn):
    row = conn.execute("SELECT value FROM Settings WHERE key = 'ixc_token'").fetchone()
    return row['value'] if row else None


def _get_last_sync(conn):
    row = conn.execute("SELECT value FROM Settings WHERE key = 'ixc_last_sync_dt'").fetchone()
    return row['value'] if row else None


def _ixc_headers(token, action='listar'):
    encoded = base64.b64encode(token.encode()).decode()
    return {'Authorization': f'Basic {encoded}', 'ixcsoft': action}


def _ixc_get(endpoint, params, token):
    headers = _ixc_headers(token, 'listar')
    all_records = []
    page = 1

    while True:
        params['page'] = str(page)
        params['rp']   = str(ROWS_PER_PAGE)

        for attempt in range(3):
            try:
                resp = requests.post(
                    f'{IXC_BASE_URL}/{endpoint}',
                    data=params,
                    headers=headers,
                    timeout=120,
                    verify=False
                )
                resp.raise_for_status()
                break
            except (requests.exceptions.Timeout, requests.exceptions.ConnectionError):
                if attempt == 2:
                    raise
                time.sleep(5)

        data = resp.json()
        records = data.get('registros', [])
        if not records:
            break

        all_records.extend(records)
        total = int(data.get('total', 0))
        logger.info(f"  [{endpoint}] página {page} — {len(all_records)}/{total}")
        if len(all_records) >= total:
            break
        page += 1

    return all_records


def _ixc_query_builder(sql, token):
    headers = _ixc_headers(token, 'listar')
    for attempt in range(3):
        try:
            resp = requests.post(
                f'{IXC_BASE_URL}/qb_query',
                data={'query': sql},
                headers=headers,
                timeout=120,
                verify=False
            )
            resp.raise_for_status()
            data = resp.json()
            return data.get('registros', []) if isinstance(data, dict) else data
        except (requests.exceptions.Timeout, requests.exceptions.ConnectionError):
            if attempt == 2:
                raise
            time.sleep(5)


def _update_progress(conn, current, total, msg):
    pct = int((current / total) * 100)
    conn.execute(
        "REPLACE INTO Settings (key, value) VALUES ('ixc_sync_progress', ?)",
        (f'{pct}|{msg}',)
    )
    conn.commit()
    logger.info(f"[IXC {pct:3d}%] {msg}")


# ── Mapeamentos ────────────────────────────────────────────────────────────────

def _map_status_contrato(s):
    return {'A': 'Ativo', 'I': 'Inativo', 'P': 'Pendente', 'N': 'Negativado', 'D': 'Desistente'}.get(s, s)

def _map_status_acesso(s):
    return {
        'A':  'Ativo',
        'D':  'Desativado',
        'CM': 'Bloqueio Manual',
        'CA': 'Bloqueio Automático',
        'FA': 'Financeiro em atraso',
        'AA': 'Aguardando Assinatura'
    }.get(s, s)

def _map_status_fatura(s):
    return {'A': 'A receber', 'R': 'Recebido', 'P': 'Parcial', 'C': 'Cancelado'}.get(s, s)

def _map_forma_recebimento(s):
    return {'M': 'Manual', 'R': 'Automático'}.get(s, s)

def _cidade_nome(id_cidade):
    return CIDADE_NOMES.get(str(id_cidade), str(id_cidade) if id_cidade else '')


# ── Funções de sync ────────────────────────────────────────────────────────────

def _sync_clientes(conn, token, log, since=None):
    modo = f"desde {since}" if since else "completo"
    log.append(f"→ Clientes ({modo})...")

    if not since:
        conn.execute("DELETE FROM Clientes")
        conn.execute("DELETE FROM Clientes_Negativacao")

    total_c = 0
    total_n = 0

    # Garante colunas de telefone extra nas duas tabelas
    for _tbl in ('Clientes', 'Clientes_Negativacao'):
        for _col in ('Telefone_celular TEXT', 'Telefone_comercial TEXT'):
            try:
                conn.execute(f"ALTER TABLE {_tbl} ADD COLUMN {_col}")
                conn.commit()
            except Exception:
                pass

    # Filial 1: clientes das nossas cidades que estão cadastrados na filial principal
    # Filial 2: clientes ativos → Clientes
    # Filial 4: clientes negativados → Clientes_Negativacao
    FILIAIS = [('1', 'Clientes'), ('2', 'Clientes'), ('4', 'Clientes_Negativacao')]

    for filial, table in FILIAIS:
        params = {
            'qtype':     'cliente.filial_id',
            'query':     filial,
            'oper':      '=',
            'sortname':  'cliente.ultima_atualizacao',
            'sortorder': 'asc'
        }
        if since:
            params['qtype2'] = 'cliente.ultima_atualizacao'
            params['query2'] = since
            params['oper2']  = '>='

        records = _ixc_get('cliente', params, token)

        # Filial 1 pode ter clientes de qualquer cidade do sistema;
        # filtramos apenas os das nossas cidades para não poluir o banco.
        if filial == '1':
            records = [r for r in records if str(r.get('cidade', '')) in CIDADES_IDS]

        logger.info(f"  [filial {filial}] {len(records)} clientes")

        for r in records:
            cidade_id = str(r.get('cidade', ''))
            cidade_nome = CIDADE_NOMES.get(cidade_id, cidade_id if cidade_id not in ('0', '') else None)

            conn.execute(f"""
                INSERT OR REPLACE INTO {table}
                (ID, Raz_o_social, Nome_Fantasia_Social, CNPJ_CPF, Cidade, Bairro,
                 Endere_o, N_mero, CEP, UF, Telefone, E_mail, Ativo, Data_cadastro,
                 Filial, Tipo_pessoa, WhatsApp, Latitude, Longitude,
                 Telefone_celular, Telefone_comercial)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """, (
                r.get('id'), r.get('razao'), r.get('fantasia'), r.get('cnpj_cpf'),
                cidade_nome, r.get('bairro'), r.get('endereco'),
                r.get('numero'), r.get('cep'), r.get('uf'), r.get('fone'),
                r.get('email'), r.get('ativo'), r.get('data_cadastro'),
                r.get('filial_id'), r.get('tipo_pessoa'), r.get('whatsapp'),
                r.get('latitude'), r.get('longitude'),
                r.get('telefone_celular'), r.get('telefone_comercial')
            ))
            if table == 'Clientes':
                total_c += 1
            else:
                total_n += 1

    conn.commit()
    log.append(f"  ✅ {total_c} clientes | {total_n} negativados")


def _sync_contratos(conn, token, log, since=None):
    modo = f"desde {since}" if since else "completo"
    log.append(f"→ Contratos ({modo})...")

    # Garante coluna ID_cliente para lookup preciso de contato
    try:
        conn.execute("ALTER TABLE Contratos ADD COLUMN ID_cliente INTEGER")
        conn.commit()
    except Exception:
        pass

    # Carrega cache de clientes para obter cidade
    cliente_cache = {}
    for table in ['Clientes', 'Clientes_Negativacao']:
        try:
            rows = conn.execute(f"SELECT ID, Raz_o_social, Cidade FROM {table}").fetchall()
            for r in rows:
                id_int = int(float(r[0])) if r[0] else None
                if id_int:
                    cliente_cache[str(id_int)] = (r[1], r[2])
        except Exception:
            pass

    if not since:
        conn.execute("DELETE FROM Contratos")
        conn.execute("DELETE FROM Contratos_Negativacao")

    total_c = 0
    total_n = 0
    filial_counts = {}  # diagnóstico: quantos por id_filial na resposta

    _CIDADES_NOMES = set(CIDADE_NOMES.values())

    # Busca TODOS os contratos sem filtro por filial.
    # Filial 4 → Contratos_Negativacao.
    # Filial 2 → Contratos (sem filtro de cidade, pois serve nossas cidades).
    # Demais (filial 1 ou outro valor) → Contratos se a cidade do cliente
    #   estiver entre as nossas 4 cidades.
    # Nota: filtrar por id_filial=1 na API retorna 0 registros (comportamento
    #   documentado do IXC), por isso buscamos tudo e separamos localmente.
    if since:
        params = {
            'qtype':     'cliente_contrato.ultima_atualizacao',
            'query':     since,
            'oper':      '>=',
            'sortname':  'cliente_contrato.ultima_atualizacao',
            'sortorder': 'asc'
        }
    else:
        params = {
            'qtype':     'cliente_contrato.id',
            'query':     '1',
            'oper':      '>=',
            'sortname':  'cliente_contrato.ultima_atualizacao',
            'sortorder': 'asc'
        }

    records = _ixc_get('cliente_contrato', params, token)
    logger.info(f"  [todos] {len(records)} contratos recebidos da API")

    for r in records:
        id_filial_val = str(r.get('id_filial') or '').strip()
        filial_counts[id_filial_val] = filial_counts.get(id_filial_val, 0) + 1

        id_cli = str(int(float(r.get('id_cliente', 0) or 0)))
        nome, cidade = cliente_cache.get(id_cli, (None, None))

        if not nome and id_cli and id_cli != '0':
            db_row = conn.execute(
                "SELECT Raz_o_social, Cidade FROM Clientes WHERE ID = ? "
                "UNION SELECT Raz_o_social, Cidade FROM Clientes_Negativacao WHERE ID = ? LIMIT 1",
                (id_cli, id_cli)
            ).fetchone()
            if db_row:
                nome, cidade = db_row[0], db_row[1]
                cliente_cache[id_cli] = (nome, cidade)

        # Filial 2: aceita tudo (serve nossas cidades, sem filtro de cidade).
        # Filial 4: vai para Contratos_Negativacao (sem filtro de cidade).
        # Demais (incl. Filial 1): só aceita se a cidade estiver nas nossas 4.
        if id_filial_val not in ('2', '4'):
            if cidade not in _CIDADES_NOMES:
                continue

        nome_final = nome or r.get('cliente_razao')

        row = (
            r.get('id'),
            r.get('id_filial'),
            _map_status_contrato(r.get('status')),
            _map_status_acesso(r.get('status_internet')),
            nome_final,
            r.get('data_assinatura'),
            r.get('data_ativacao'),
            r.get('data'),
            r.get('data_renovacao'),
            r.get('data_expiracao'),
            r.get('isentar_contrato'),
            r.get('pago_ate_data'),
            r.get('id_vd_contrato'),
            r.get('contrato'),
            r.get('endereco'),
            r.get('numero'),
            r.get('bairro'),
            r.get('tipo'),
            r.get('descricao_aux_plano_venda'),
            r.get('dia_fixo_vencimento'),
            r.get('id_carteira_cobranca'),
            r.get('status_velocidade'),
            r.get('id_vendedor'),
            r.get('nao_avisar_ate'),
            r.get('nao_bloquear_ate'),
            r.get('id_tipo_documento'),
            r.get('tipo_doc_opc'),
            r.get('tipo_doc_opc2'),
            r.get('tipo_doc_opc3'),
            r.get('tipo_doc_opc4'),
            r.get('desbloqueio_confianca'),
            r.get('data_negativacao'),
            r.get('data_acesso_desativado'),
            r.get('motivo_cancelamento'),
            r.get('data_cancelamento'),
            r.get('obs_cancelamento'),
            r.get('id_vendedor_ativ'),
            r.get('fidelidade'),
            r.get('desbloqueio_confianca_ativo'),
            r.get('dt_ult_bloq_auto'),
            r.get('dt_ult_bloq_manual'),
            r.get('dt_ult_des_bloq_conf'),
            r.get('dt_ult_finan_atraso'),
            r.get('dt_utl_negativacao'),
            r.get('data_cadastro_sistema'),
            r.get('ultima_atualizacao'),
            r.get('complemento'),
            r.get('cep'),
            cidade,
            r.get('taxa_instalacao'),
            r.get('motivo_inclusao'),
            r.get('dia_fixo_vencimento'),
        )

        if id_filial_val == '4':
            conn.execute("""
                INSERT OR REPLACE INTO Contratos_Negativacao
                (ID, Filial, Status_contrato, Status_acesso, Cliente,
                 Data_primeira_assinatura, Data_ativa_o, Data_base, Data_renova_o,
                 Data_de_expira_o, Isento, Pago_at, Plano_de_venda, Descri_o,
                 Endere_o, N_mero, Bairro, Tipo, Descri_o_aux_plano_venda,
                 Dia_fixo_do_vencimento, Cobran_a, Status_velocidade, Vendedor,
                 N_o_avisar_at, N_o_bloquear_at, Tipo_doc, Doc_opc, Doc_opc_2,
                 Doc_opc_3, Doc_opc_4, Desbloqueio_confian_a, Data_negativa_o,
                 Data_de_acesso_desativado, Motivo_cancelamento, Data_cancelamento,
                 Obs_cancelamento, Vendedor_ativa_o, Fidelidade,
                 Desbloqueio_confian_a_ativo, ltimo_bloqueio_autom_tico,
                 ltimo_bloqueio_manual, ltimo_desbloqueio_de_confian_a,
                 ltimo_financeiro_em_atraso, ltima_negativa_o,
                 Data_cadastro_sistema, ltima_atualiza_o, Complemento, Cep,
                 Cidade, Taxa_ativa_o, Motivo_de_inclus_o)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """, row[:-1])
            total_n += 1
        else:
            conn.execute("""
                INSERT OR REPLACE INTO Contratos
                (ID, Filial, Status_contrato, Status_acesso, Cliente,
                 Data_primeira_assinatura, Data_ativa_o, Data_base, Data_renova_o,
                 Data_de_expira_o, Isento, Pago_at, Plano_de_venda, Descri_o,
                 Endere_o, N_mero, Bairro, Tipo, Descri_o_aux_plano_venda,
                 Dia_fixo_do_vencimento, Cobran_a, Status_velocidade, Vendedor,
                 N_o_avisar_at, N_o_bloquear_at, Tipo_doc, Doc_opc, Doc_opc_2,
                 Doc_opc_3, Doc_opc_4, Desbloqueio_confian_a, Data_negativa_o,
                 Data_de_acesso_desativado, Motivo_cancelamento, Data_cancelamento,
                 Obs_cancelamento, Vendedor_ativa_o, Fidelidade,
                 Desbloqueio_confian_a_ativo, ltimo_bloqueio_autom_tico,
                 ltimo_bloqueio_manual, ltimo_desbloqueio_de_confian_a,
                 ltimo_financeiro_em_atraso, ltima_negativa_o,
                 Data_cadastro_sistema, ltima_atualiza_o, Complemento, Cep,
                 Cidade, Taxa_ativa_o, Motivo_de_inclus_o, ID_cliente)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """, row[:-1] + (id_cli if id_cli and id_cli != '0' else None,))
            total_c += 1

    conn.commit()
    logger.info(f"  Contratos por id_filial na API: {filial_counts}")
    log.append(f"  ✅ {total_c} contratos | {total_n} negativados (filiais: {filial_counts})")


def _insert_car_records(conn, records, cliente_cache):
    for r in records:
        try:
            id_cli = str(int(float(r.get('id_cliente', '') or 0)))
        except (ValueError, TypeError):
            id_cli = str(r.get('id_cliente', ''))
        nome, cidade = cliente_cache.get(id_cli, (id_cli, None))

        conn.execute("""
            INSERT OR REPLACE INTO Contas_a_Receber
            (ID, Filial, Status, Emissao, Vencimento, Valor, Valor_baixado,
             Valor_aberto, Cliente, Cidade, Valor_recebido, Data_pagamento,
             Carteira_de_cobran_a, Data_cr_dito, Data_baixa, Parcela_R,
             Documento, NN_Boleto, Valor_cancelado, Data_cancelamento,
             Motivo_cancelamento, ID_Renegocia_o, ID_Cob,
             Forma_recebimento, Parcela, ID_contrato_principal,
             ID_contrato_avulso, ID_contrato_recorrente, Linha_digit_vel)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """, (
            r.get('id'), r.get('filial_id'),
            _map_status_fatura(r.get('status')),
            r.get('data_emissao'), r.get('data_vencimento'),
            r.get('valor'), r.get('valor_baixado') or 0,
            r.get('valor_aberto') or 0,
            nome, cidade,
            r.get('pagamento_valor') or r.get('valor_recebido') or 0,
            r.get('pagamento_data'),
            r.get('id_carteira_cobranca'), r.get('credito_data'),
            r.get('baixa_data'), r.get('numero_parcela_recorrente'),
            r.get('documento'), r.get('nn_boleto'),
            r.get('valor_cancelado') or 0, r.get('data_cancelamento'),
            r.get('id_mot_cancelamento'), r.get('id_renegociacao'),
            r.get('id_cobranca'),
            _map_forma_recebimento(r.get('forma_recebimento')),
            r.get('nparcela'), r.get('id_contrato'),
            r.get('id_contrato_avulso'), r.get('id_contrato'),
            r.get('linha_digitavel')
        ))


def _sync_contas_receber(conn, token, log, full=True):
    log.append("→ Contas a Receber (Filiais 2 e 4, todos os anos)...")

    # Carrega cache de clientes em memória (banco local já filtrado por cidade)
    cliente_cache = {}
    for table in ['Clientes', 'Clientes_Negativacao']:
        try:
            rows = conn.execute(f"SELECT ID, Raz_o_social, Cidade FROM {table}").fetchall()
            for r in rows:
                # Salva tanto como int quanto string para garantir o match
                id_int = int(float(r[0])) if r[0] else None
                if id_int:
                    cliente_cache[str(id_int)] = (r[1], r[2])
        except Exception:
            pass
    logger.info(f"  Cache: {len(cliente_cache)} clientes carregados")

    if full:
        conn.execute("DELETE FROM Contas_a_Receber")

    total_inseridos = 0

    # Filial 1 — filtra na API por vencimento >= 2025-01-01 para evitar timeout
    log.append("  → Filial 1 (vencimento a partir de 2025)...")
    logger.info("  → Buscando filial 1...")
    try:
        records = _ixc_get('fn_areceber', {
            'qtype':     'fn_areceber.filial_id',
            'query':     '1',
            'oper':      '=',
            'qtype2':    'fn_areceber.data_vencimento',
            'query2':    '2025-01-01',
            'oper2':     '>=',
            'sortname':  'fn_areceber.id',
            'sortorder': 'asc'
        }, token)
        logger.info(f"    [filial 1] {len(records)} registros")
        # Limpa filial 1 antes de reinserir para evitar duplicatas
        if full:
            conn.execute("DELETE FROM Contas_a_Receber WHERE Filial = 1")
        _insert_car_records(conn, records, cliente_cache)
        total_inseridos += len(records)
        conn.commit()
        log.append(f"    ✅ {len(records)} registros filial 1")
    except Exception as e:
        log.append(f"    ⚠️ Erro filial 1: {e}")
        logger.warning(f"    Erro filial 1: {e}", exc_info=True)

    # Filiais 2 e 4 — completo
    for filial in ['2', '4']:
        log.append(f"  → Filial {filial}...")
        logger.info(f"  → Buscando filial {filial}...")
        try:
            records = _ixc_get('fn_areceber', {
                'qtype':     'fn_areceber.filial_id',
                'query':     filial,
                'oper':      '=',
                'sortname':  'fn_areceber.id',
                'sortorder': 'asc'
            }, token)
            logger.info(f"  → Inserindo {len(records)} registros da filial {filial}...")
            _insert_car_records(conn, records, cliente_cache)
            total_inseridos += len(records)
            conn.commit()
            log.append(f"    ✅ {len(records)} registros filial {filial}")
            logger.info(f"    {len(records)} registros filial {filial} inseridos")
        except Exception as e:
            log.append(f"    ⚠️ Erro filial {filial}: {e}")
            logger.warning(f"    Erro filial {filial}: {e}", exc_info=True)
            continue

    log.append(f"  ✅ {total_inseridos} contas a receber no total")


# Mapeamento de assuntos OS (ID -> Nome)
OS_ASSUNTOS = {
    '1': 'INSTALAÇÃO DE FIBRA', '2': 'MANUTENÇÃO DE FIBRA', '3': 'VISITA TECNICA',
    '4': 'MUDANÇA DE ENDEREÇO', '5': 'MUDANÇA DE PONTO', '6': 'RETIRADA DE EQUIPAMENTO',
    '7': 'INSTALAÇÃO NÃO REALIZADA', '8': 'O.S NÃO REALIZADO', '9': 'EQUIPAMENTO NÃO RETIRADO',
    '10': 'LIMPEZA DE REDE', '11': 'PENDÊNCIA FINANCEIRA', '13': 'CANCELAMENTO',
    '14': 'MUDANÇA DE TITULARIDADE', '15': 'MIGRAÇÃO DE PLANO UPGRADE', '16': 'FALHA NA REDE',
    '17': 'IMPLANTAÇÃO DE ESTRUTURA', '18': 'INFORMAÇÃO', '19': 'OSCILAÇÃO',
    '20': 'MIGRAÇÃO DE VENCIMENTO', '21': 'VISTORIA DE REDE', '22': 'COBRANÇA EFETIVA',
    '23': 'SEM CONEXÃO', '24': 'READEQUAÇÃO DE REDE', '25': 'LIBERAÇÃO DE SINAL',
    '26': 'MASSIVA', '27': 'CONFIRMAÇÃO CADASTRAL VENDAS', '28': 'RETENÇÃO CLIENTE',
    '29': 'COBRANÇA NÃO ATENDIDAS', '30': 'CANCELAMENTO INSATISFAÇÃO', '31': '2° VIA BOLETO',
    '32': 'MANUTENÇÃO DE REDE', '33': 'RECLAMAÇÃO DE ALCANCE', '34': 'TROCA DE SENHA',
    '35': 'ALCANCE DE SINAL', '36': 'OFERTA EFETIVA', '37': 'OFERTA NÃO EFETIVA',
    '38': 'INDICAÇÃO', '39': 'REATIVAÇÃO CLIENTE', '40': 'CANCELAMENTO POS MASSIVA',
    '41': 'EQUIPAMENTO RENEGOCIADO', '42': 'CONFIRMAÇÃO DE PAGAMENTO', '43': 'ACÃO DE COBRANÇA',
    '44': 'CLIENTE DIVIDA CADUCADA', '45': 'POS - VENDA CLIENTE', '46': 'APLICATIVOS',
    '47': 'ATENDIMENTO ENCERRADO POR FALTA DE CONTATO', '48': 'COBRANÇA RECADO',
    '49': 'MIGRAÇÃO DE PLANO DOWNGRADE', '50': 'COBRANÇA EFETIVA RECEPTIVA',
    '52': 'ACÃO DE COBRANÇA ACORDO REALIZADO', '53': 'CONFIRMAÇÃO CADASTRAL',
    '54': 'AGENDAMENTO', '55': 'VISTORIA INSTALAÇÃO', '56': 'COBRANÇA TELEIN',
    '57': 'DESCONEXÃO EFETIVA', '58': 'DESCONEXÃO NÃO EFETIVA', '59': 'ACÃO DESCONEXÃO',
    '60': 'CLIENTE CONECTADO', '61': 'URA REVERSA SEM IP', '62': 'URA REVERSA POS-ATENDIMENTO',
    '63': 'URA REVERSA UPGRADE', '64': 'COBRANÇA TELEIN ACORDO', '65': 'COBRANÇA TELEIN RECADO',
    '66': 'RETORNO CLIENTE INSTALAÇÃO', '67': 'ACÃO CANCELAMENTO', '68': 'RENOVAÇÃO',
    '69': 'PONTO ADICIONAL', '70': 'RETIRADA DE EQUIPAMENTO PONTO ADICIONAL',
    '71': 'CANCELAMENTO RETIRADA', '72': 'INADIMPLENCIA RETIRADA', '73': 'COBRANÇA TELEIN DESCONHECE',
    '74': 'CARNÊ IMPRESSO', '75': 'CONFIGURAÇÃO APP´S', '76': 'ENTREGA DE CARNÊ',
    '77': 'INSTALAÇÃO EVENTOS', '78': 'RETORNO MANUTENÇÃO'
}

OS_STATUS = {
    'A': 'Aberta', 'AN': 'Análise', 'EN': 'Encaminhada', 'AS': 'Assumida',
    'AG': 'Agendada', 'DS': 'Deslocamento', 'EX': 'Execução', 'F': 'Finalizada',
    'RAG': 'Aguardando agendamento'
}

CIDADE_IDS_MAP = {'515': 'Dom Pedro', '599': 'Presidente Dutra', '656': 'Tuntum', '624': 'São Domingos do Maranhão'}


def _sync_os(conn, token, log, since=None):
    if since:
        log.append("→ OS (últimos 30 dias)...")
        data_inicio = (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%d')
    else:
        log.append("→ OS (completo)...")
        data_inicio = '2020-01-01'

    # Cache de clientes para lookup
    cliente_cache = {}
    for table in ['Clientes', 'Clientes_Negativacao']:
        try:
            rows = conn.execute(f"SELECT ID, Raz_o_social FROM {table}").fetchall()
            for r in rows:
                id_int = int(float(r[0])) if r[0] else None
                if id_int:
                    cliente_cache[str(id_int)] = r[1]
        except Exception:
            pass

    records = _ixc_get('su_oss_chamado', {
        'qtype':     'su_oss_chamado.data_abertura',
        'query':     data_inicio,
        'oper':      '>=',
        'sortname':  'su_oss_chamado.id',
        'sortorder': 'asc'
    }, token)

    if not since:
        conn.execute("DELETE FROM OS")

    for r in records:
        try:
            assunto_id = str(r.get('id_assunto', '') or '')
            assunto    = OS_ASSUNTOS.get(assunto_id, assunto_id)
            status     = OS_STATUS.get(r.get('status', ''), r.get('status', ''))
            cidade_id  = str(r.get('id_cidade', '') or '')
            cidade     = CIDADE_IDS_MAP.get(cidade_id, cidade_id)

            id_cli = str(int(float(r.get('id_cliente') or 0))) if r.get('id_cliente') else ''
            nome_cliente = cliente_cache.get(id_cli)
            if not nome_cliente and id_cli:
                row = conn.execute(
                    "SELECT Raz_o_social FROM Clientes WHERE ID = ? "
                    "UNION SELECT Raz_o_social FROM Clientes_Negativacao WHERE ID = ? LIMIT 1",
                    (id_cli, id_cli)
                ).fetchone()
                nome_cliente = row[0] if row else id_cli
                if row:
                    cliente_cache[id_cli] = row[0]
            elif not nome_cliente:
                nome_cliente = id_cli

            conn.execute("""
                INSERT OR REPLACE INTO OS
                (ID, Tipo, Filial, SLA, Abertura, Melhor_hor_rio, Liberado,
                 Status, Cliente, Assunto, Setor, Cidade, Status_conex_o,
                 Prioridade, Mensagem, Protocolo, Endere_o, Complemento,
                 Condom_nio, Bloco, Apartamento, Bairro, Refer_ncia,
                 Impresso, In_cio, Agendamento, Final, Fechamento,
                 IDX, Diagn_stico, Login, Prazo_limite, Data_reservada,
                 Contrato, ID_Atendimento, Colaborador, Gerada_por,
                 Valor_comiss_o, Valor_faturamento, Estrutura)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """, (
                r.get('id'),
                r.get('tipo'),
                r.get('id_filial'),
                r.get('status_sla'),
                r.get('data_abertura'),
                r.get('melhor_horario_agenda'),
                r.get('liberado'),
                status,
                nome_cliente,
                assunto,
                r.get('setor'),
                cidade,
                r.get('status_conexao'),
                r.get('prioridade'),
                r.get('mensagem'),
                r.get('protocolo'),
                r.get('endereco'),
                r.get('complemento'),
                r.get('id_condominio'),
                r.get('bloco'),
                r.get('apartamento'),
                r.get('bairro'),
                r.get('referencia'),
                r.get('impresso'),
                r.get('data_inicio'),
                r.get('data_agenda'),
                r.get('data_final'),
                r.get('data_fechamento'),
                r.get('idx'),
                r.get('id_su_diagnostico'),
                r.get('id_login'),
                r.get('data_prazo_limite'),
                r.get('data_reservada'),
                r.get('id_contrato_kit'),
                r.get('id_atendente'),
                r.get('id_tecnico'),
                r.get('origem_cadastro'),
                r.get('valor_total_comissao'),
                r.get('valor_total'),
                r.get('id_estrutura'),
            ))
        except Exception as e:
            logger.warning(f"  Erro OS id={r.get('id')}: {e}", exc_info=True)

    log.append(f"  ✅ {len(records)} OS")


def _sync_atendimentos(conn, token, log, since=None):
    modo = f"desde {since}" if since else "completo"
    log.append(f"→ Atendimentos ({modo})...")

    params = {
        'qtype':     'su_ticket.id',
        'query':     '1',
        'oper':      '>=',
        'sortname':  'su_ticket.data_ultima_alteracao',
        'sortorder': 'asc'
    }
    if since:
        params['qtype2'] = 'su_ticket.data_ultima_alteracao'
        params['query2'] = since
        params['oper2']  = '>='

    records = _ixc_get('su_ticket', params, token)

    if not since:
        conn.execute("DELETE FROM Atendimentos")

    # Cache de clientes (mesmo padrão do sync de OS)
    cliente_cache = {}
    for table in ['Clientes', 'Clientes_Negativacao']:
        try:
            for row in conn.execute(f"SELECT ID, Raz_o_social FROM {table}").fetchall():
                id_int = int(float(row[0])) if row[0] else None
                if id_int:
                    cliente_cache[str(id_int)] = row[1]
        except Exception:
            pass

    for r in records:
        id_cli = str(int(float(r.get('id_cliente') or 0))) if r.get('id_cliente') else ''
        nome_cliente = cliente_cache.get(id_cli) or r.get('cliente_razao') or id_cli or None

        conn.execute("""
            INSERT OR REPLACE INTO Atendimentos
            (ID, Cliente, Criado_em, ltima_altera_o, Assunto, Novo_status, Descri_o, Filial)
            VALUES (?,?,?,?,?,?,?,?)
        """, (
            r.get('id'), nome_cliente,
            r.get('data_criacao'), r.get('data_ultima_alteracao'),
            r.get('titulo'), r.get('su_status'),
            r.get('menssagem'), r.get('id_filial')
        ))

    log.append(f"  ✅ {len(records)} atendimentos")


def _sync_logins(conn, token, log, since=None):
    modo = f"desde {since}" if since else "completo"
    log.append(f"→ Logins ({modo})...")

    params = {
        'qtype':     'radusuarios.ativo',
        'query':     'S',
        'oper':      '=',
        'sortname':  'radusuarios.ultima_atualizacao',
        'sortorder': 'asc'
    }
    if since:
        params['qtype2'] = 'radusuarios.ultima_atualizacao'
        params['query2'] = since
        params['oper2']  = '>='

    records = _ixc_get('radusuarios', params, token)

    if not since:
        conn.execute("DELETE FROM Logins")

    for r in records:
        conn.execute("""
            INSERT OR REPLACE INTO Logins
            (ID, Login, ID_contrato, Contrato, IPV4, Transmissor,
             ltima_conex_o_final, ltima_conex_o_inicial, Ativo, Cliente,
             Status_contrato, Status_acesso, MAC, Latitude, Longitude)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """, (
            r.get('id'), r.get('login'), r.get('id_contrato'),
            r.get('contrato_plano_venda_'), r.get('ip'),
            r.get('id_transmissor'), r.get('ultima_conexao_final'),
            r.get('ultima_conexao_inicial'), r.get('ativo'),
            r.get('cliente_razao'), r.get('contrato_status'),
            r.get('contrato_status_internet'), r.get('mac'),
            r.get('latitude'), r.get('longitude')
        ))

    log.append(f"  ✅ {len(records)} logins")


def _sync_clientes_fibra(conn, token, log):
    log.append("→ Clientes Fibra (OLTs selecionadas)...")
    conn.execute("DELETE FROM Clientes_Fibra")
    total = 0

    for olt_id in OLTS_IDS:
        olt_nome = OLTS_NOMES.get(olt_id, olt_id)
        try:
            records = _ixc_get('radpop_radio_cliente_fibra', {
                'qtype':     'radpop_radio_cliente_fibra.id_transmissor',
                'query':     olt_id,
                'oper':      '=',
                'sortname':  'radpop_radio_cliente_fibra.id',
                'sortorder': 'asc'
            }, token)

            for r in records:
                conn.execute("""
                    INSERT OR REPLACE INTO Clientes_Fibra
                    (ID, Transmissor, Nome, Sinal_RX, Sinal_TX, ONU_tipo,
                     MAC_Serial, Login, ltima_atualiza_o)
                    VALUES (?,?,?,?,?,?,?,?,?)
                """, (
                    r.get('id'), olt_nome, r.get('nome'),
                    r.get('sinal_rx'), r.get('sinal_tx'), r.get('onu_tipo'),
                    r.get('mac'), r.get('login'), r.get('ultima_atualizacao')
                ))
            total += len(records)
            logger.info(f"  [{olt_nome}] {len(records)} registros")
        except Exception as e:
            log.append(f"  ⚠️ Erro OLT {olt_nome}: {e}")
            logger.warning(f"  Erro OLT {olt_nome}: {e}", exc_info=True)

    log.append(f"  ✅ {total} clientes fibra")


def _sync_vendedores(conn, token, log):
    log.append("→ Vendedores...")
    records = _ixc_get('vendedor', {
        'qtype': 'vendedor.id', 'query': '1', 'oper': '>=',
        'sortname': 'vendedor.id', 'sortorder': 'asc'
    }, token)
    conn.execute("DELETE FROM Vendedores")
    for r in records:
        conn.execute("""
            INSERT OR REPLACE INTO Vendedores (ID, Vendedor, Status, Cor_no_mapa)
            VALUES (?,?,?,?)
        """, (r.get('id'), r.get('nome'), r.get('status'), r.get('cor_no_mapa')))
    log.append(f"  ✅ {len(records)} vendedores")


_MAP_STATUS_COMODATO = {'E': 'Emprestado', 'D': 'Devolvido', 'B': 'Baixa'}

def _sync_equipamentos(conn, token, log):
    log.append("→ Equipamentos (comodato)...")
    # Endpoint cliente_contrato_comodato funciona sem sortname/qtype.
    # Qualquer sortname causa "Ocorreu um erro ao processar" nesta instância.
    try:
        records = _ixc_get('cliente_contrato_comodato', {}, token)
    except Exception as e:
        log.append(f"  ⚠️  Erro ao buscar comodatos: {e}")
        return

    if not records:
        log.append("  ⚠️  Nenhum registro retornado.")
        return

    conn.execute("DELETE FROM Equipamento")

    rows = []
    for r in records:
        status_raw = str(r.get('status_comodato') or '').strip()
        status = _MAP_STATUS_COMODATO.get(status_raw, status_raw)
        rows.append((
            r.get('id_contrato'),
            '',                                   # Raz_o_social_nome (não retornado)
            '',                                   # Bloqueio_manual (não retornado)
            str(r.get('descricao') or '').strip(),
            status,
            r.get('data') or '',
            r.get('id_produto'),
            r.get('quantidade') or '',
        ))

    conn.executemany("""
        INSERT INTO Equipamento
            (ID_contrato, Raz_o_social_nome, Bloqueio_manual, Descricao_produto,
             Status_comodato, Data, ID_produto, Quantidade)
        VALUES (?,?,?,?,?,?,?,?)
    """, rows)
    conn.commit()
    log.append(f"  ✅ {len(rows)} registros de comodato sincronizados.")


def _sync_plano_venda(conn, token, log):
    log.append("→ Planos de Venda...")
    records = _ixc_get('vd_contratos', {
        'qtype': 'vd_contratos.id', 'query': '1', 'oper': '>=',
        'sortname': 'vd_contratos.id', 'sortorder': 'asc'
    }, token)
    conn.execute("DELETE FROM Plano_de_venda")
    for r in records:
        conn.execute("""
            INSERT OR REPLACE INTO Plano_de_venda
            (ID, Plano_de_venda, Valor_contrato, Status, Filial)
            VALUES (?,?,?,?,?)
        """, (r.get('id'), r.get('nome'), r.get('valor_contrato'), r.get('Ativo'), r.get('id_filial')))
    log.append(f"  ✅ {len(records)} planos de venda")


def _sync_radacct(conn, token, log):
    """Sincroniza histórico de sessões RADIUS (últimos 90 dias)."""
    log.append("→ Radius Acct (últimos 90 dias)...")

    conn.execute("""
        CREATE TABLE IF NOT EXISTS Radius_Acct (
            ID            INTEGER PRIMARY KEY,
            Login         TEXT,
            Inicio        TEXT,
            Fim           TEXT,
            Duracao_s     INTEGER,
            Download_bytes INTEGER,
            Upload_bytes  INTEGER,
            Concentrador  TEXT,
            IP            TEXT
        )
    """)
    conn.commit()

    since_dt = (datetime.now() - timedelta(days=90)).strftime('%Y-%m-%d')

    ENDPOINTS = ['radusuarios_radacct', 'radacct', 'radius_acct']
    records = []
    used_ep = None
    for ep in ENDPOINTS:
        try:
            records = _ixc_get(ep, {
                'qtype':     'acctstarttime',
                'query':     since_dt,
                'oper':      '>=',
                'sortname':  'acctstarttime',
                'sortorder': 'asc',
            }, token)
            used_ep = ep
            break
        except Exception:
            continue

    if not records:
        log.append(f"  ⚠ Nenhum dado RADIUS retornado (endpoints tentados: {', '.join(ENDPOINTS)})")
        return

    # Limpa registros antigos (> 90 dias)
    conn.execute("DELETE FROM Radius_Acct WHERE Inicio < ?", (since_dt,))

    count = 0
    for r in records:
        try:
            conn.execute("""
                INSERT OR REPLACE INTO Radius_Acct
                (ID, Login, Inicio, Fim, Duracao_s, Download_bytes, Upload_bytes, Concentrador, IP)
                VALUES (?,?,?,?,?,?,?,?,?)
            """, (
                r.get('id') or r.get('radacctid'),
                r.get('username'),
                r.get('acctstarttime'),
                r.get('acctstoptime'),
                r.get('acctsessiontime'),
                r.get('acctoutputoctets'),   # bytes NAS→cliente = download do cliente
                r.get('acctinputoctets'),    # bytes cliente→NAS = upload do cliente
                r.get('nasipaddress') or r.get('concentrador'),
                r.get('framedipaddress') or r.get('ip')
            ))
            count += 1
        except Exception:
            pass

    conn.commit()
    log.append(f"  ✅ {count} sessões RADIUS sincronizadas via '{used_ep}'")


# ── Sync principal ─────────────────────────────────────────────────────────────

def _run_sync(app, token, mode='incremental', tables=None):
    """mode: 'incremental' ou 'full' | tables: lista de tabelas ou None para todas"""
    with app.app_context():
        conn = app.config['GET_DB_CONNECTION']()
        log  = []
        start = datetime.now()

        since = None
        if mode == 'incremental':
            last = conn.execute(
                "SELECT value FROM Settings WHERE key = 'ixc_last_sync_dt'"
            ).fetchone()
            since = last['value'] if last else None

        ALL_TASKS = [
            ('clientes',       'Clientes',        lambda: _sync_clientes(conn, token, log, since)),
            ('contratos',      'Contratos',       lambda: _sync_contratos(conn, token, log, since)),
            ('contas_receber', 'Contas a Receber', lambda: _sync_contas_receber(conn, token, log, full=(mode=='full'))),
            ('os',             'OS',              lambda: _sync_os(conn, token, log, since)),
            ('atendimentos',   'Atendimentos',    lambda: _sync_atendimentos(conn, token, log, since)),
            ('logins',         'Logins',          lambda: _sync_logins(conn, token, log, since)),
            ('clientes_fibra', 'Clientes Fibra',  lambda: _sync_clientes_fibra(conn, token, log)),
            ('vendedores',     'Vendedores',      lambda: _sync_vendedores(conn, token, log)),
            ('equipamentos',   'Equipamentos',    lambda: _sync_equipamentos(conn, token, log)),
            ('plano_venda',    'Planos de Venda', lambda: _sync_plano_venda(conn, token, log)),
            ('radacct',        'Radius Acct',     lambda: _sync_radacct(conn, token, log)),
        ]

        # Filtra só as tabelas selecionadas
        if tables:
            TASKS = [(k, n, fn) for k, n, fn in ALL_TASKS if k in tables]
        else:
            TASKS = ALL_TASKS

        try:
            tipo = '🔄 Incremental' if mode == 'incremental' else '🔁 Completa'
            msg = f"{tipo} — iniciada em {start.strftime('%d/%m/%Y %H:%M:%S')}"
            log.append(msg)
            logger.info(f"\n{'='*50}\n{msg}")
            if since:
                msg2 = f"  Buscando mudanças desde: {since}"
                log.append(msg2)
                logger.info(msg2)

            for i, (key, name, fn) in enumerate(TASKS):
                # Verifica se foi cancelado
                cancel = conn.execute(
                    "SELECT value FROM Settings WHERE key='ixc_sync_cancel'"
                ).fetchone()
                if cancel and cancel['value'] == '1':
                    msg = "⏹ Sincronização cancelada pelo usuário."
                    log.append(msg)
                    logger.info(msg)
                    conn.execute("REPLACE INTO Settings (key, value) VALUES ('ixc_sync_cancel', '0')")
                    break

                _update_progress(conn, i, len(TASKS), f'Sincronizando {name}...')
                fn()
                logger.info(f"  {name} concluído")

            conn.commit()
            elapsed = (datetime.now() - start).seconds
            msg = f"✅ Concluída em {elapsed}s"
            log.append(msg)
            logger.info(f"\n{msg}\n{'='*50}")
            _update_progress(conn, len(TASKS), len(TASKS), 'Concluído!')

            now_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            conn.execute("REPLACE INTO Settings (key, value) VALUES ('ixc_last_sync', ?)",
                         (datetime.now().strftime('%d/%m/%Y %H:%M:%S'),))
            conn.execute("REPLACE INTO Settings (key, value) VALUES ('ixc_last_sync_dt', ?)", (now_str,))
            conn.execute("REPLACE INTO Settings (key, value) VALUES ('ixc_last_sync_log', ?)", ('\n'.join(log),))
            conn.execute("REPLACE INTO Settings (key, value) VALUES ('ixc_sync_status', 'success')")
            conn.commit()

        except Exception as e:
            logger.error(f"Erro na sincronização: {e}", exc_info=True)
            log.append(f"❌ Erro: {str(e)}")
            conn.execute("REPLACE INTO Settings (key, value) VALUES ('ixc_last_sync_log', ?)", ('\n'.join(log),))
            conn.execute("REPLACE INTO Settings (key, value) VALUES ('ixc_sync_status', 'error')")
            conn.commit()
        finally:
            conn.close()


def _start_sync_thread(app, token, mode, tables=None):
    def _run():
        try:
            _run_sync(app, token, mode, tables)
        finally:
            with app.app_context():
                c = app.config['GET_DB_CONNECTION']()
                c.execute("REPLACE INTO Settings (key, value) VALUES ('ixc_syncing', '0')")
                c.commit()
                c.close()

    threading.Thread(target=_run, daemon=True).start()


# ── Rotas ──────────────────────────────────────────────────────────────────────

@ixc_sync_bp.route('/status')
@login_required
def sync_status():
    conn = get_db()
    try:
        def _get(key):
            r = conn.execute("SELECT value FROM Settings WHERE key = ?", (key,)).fetchone()
            return r['value'] if r else None

        tg_tok  = _get('tg_token')   or ''
        tg_chat = _get('tg_chat_id') or ''
        return jsonify({
            "last_sync":   _get('ixc_last_sync'),
            "last_log":    _get('ixc_last_sync_log'),
            "status":      _get('ixc_sync_status'),
            "has_token":   bool(_get('ixc_token')),
            "is_syncing":  _get('ixc_syncing') == '1',
            "progress":    _get('ixc_sync_progress') or '0|Aguardando',
            "tg_token":    tg_tok[:8] + '…' if len(tg_tok) > 8 else tg_tok,
            "tg_chat_id":  tg_chat,
            "tg_enabled":  bool(tg_tok and tg_chat),
        })
    finally:
        conn.close()


@ixc_sync_bp.route('/save_token', methods=['POST'])
@login_required
def save_token():
    if current_user.username != 'admin':
        return jsonify({"error": "Acesso negado"}), 403
    token = request.json.get('token', '').strip()
    if not token:
        return jsonify({"error": "Token inválido"}), 400
    conn = get_db()
    try:
        conn.execute("REPLACE INTO Settings (key, value) VALUES ('ixc_token', ?)", (token,))
        conn.commit()
        return jsonify({"success": True})
    finally:
        conn.close()


@ixc_sync_bp.route('/save_telegram', methods=['POST'])
@login_required
def save_telegram():
    if current_user.username != 'admin':
        return jsonify({"error": "Acesso negado"}), 403
    data    = request.json or {}
    tg_tok  = data.get('tg_token',   '').strip()
    tg_chat = data.get('tg_chat_id', '').strip()
    conn = get_db()
    try:
        conn.execute("REPLACE INTO Settings (key, value) VALUES ('tg_token',   ?)", (tg_tok,))
        conn.execute("REPLACE INTO Settings (key, value) VALUES ('tg_chat_id', ?)", (tg_chat,))
        conn.commit()
        return jsonify({"success": True})
    finally:
        conn.close()


@ixc_sync_bp.route('/test_telegram', methods=['POST'])
@login_required
def test_telegram():
    if current_user.username != 'admin':
        return jsonify({"error": "Acesso negado"}), 403
    try:
        _tg_send(f"✅ <b>Teste NetVale</b>\nBot Telegram configurado corretamente! {datetime.now().strftime('%d/%m/%Y %H:%M')}")
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@ixc_sync_bp.route('/cancel', methods=['POST'])
@login_required
def cancel_sync():
    if current_user.username != 'admin':
        return jsonify({"error": "Acesso negado"}), 403
    conn = get_db()
    try:
        conn.execute("REPLACE INTO Settings (key, value) VALUES ('ixc_sync_cancel', '1')")
        conn.execute("REPLACE INTO Settings (key, value) VALUES ('ixc_syncing', '0')")
        conn.commit()
        return jsonify({"success": True})
    finally:
        conn.close()


_STATUS_RT_PAGE = """<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Status Contratos — Filial 2 · Tempo Real</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;900&display=swap">
<style>
:root{--bg:#f1f5f9;--sf:#fff;--bd:#e2e8f0;--fg:#0f172a;--mu:#64748b;
  --ok:#15803d;--ok-bg:#dcfce7;--wa:#b45309;--wa-bg:#fef3c7;
  --da:#dc2626;--da-bg:#fee2e2;--ac:#2563eb;--or:#c2410c;--or-bg:#ffedd5;--ne:#6b7280;}
@media(prefers-color-scheme:dark){:root{
  --bg:#0f172a;--sf:#1e293b;--bd:#334155;--fg:#f1f5f9;--mu:#94a3b8;
  --ok:#4ade80;--ok-bg:#14532d;--wa:#fbbf24;--wa-bg:#451a03;
  --da:#f87171;--da-bg:#450a0a;--ac:#60a5fa;--or:#fb923c;--or-bg:#431407;--ne:#9ca3af;
  color-scheme:dark;}}
*,*::before,*::after{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font-family:"Inter",sans-serif;font-size:14px;
  padding:24px 20px 48px;}
.hd{display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px;margin-bottom:20px}
h1{margin:0 0 3px;font-size:1.2rem;font-weight:700}
.sub{margin:0;font-size:.78rem;color:var(--mu)}
.btn{padding:8px 16px;border-radius:7px;font-size:.85rem;font-weight:600;cursor:pointer;
  border:none;background:var(--ac);color:#fff;font-family:inherit;display:inline-flex;align-items:center;gap:6px}
.btn:hover{opacity:.85}.btn:disabled{opacity:.5;cursor:default}
.spin{display:inline-block;width:14px;height:14px;border:2px solid rgba(255,255,255,.3);
  border-top-color:#fff;border-radius:50%;animation:sp .7s linear infinite}
@keyframes sp{to{transform:rotate(360deg)}}
.state{text-align:center;padding:40px;color:var(--mu)}
.err{color:var(--da)}
.ts{font-size:.75rem;color:var(--mu);margin-bottom:14px}
.ts strong{color:var(--ok)}
.tot{background:var(--sf);border:1px solid var(--bd);border-radius:10px;padding:14px 18px;
  margin-bottom:16px;display:flex;align-items:center;gap:16px}
.tot-v{font-size:2rem;font-weight:900;font-variant-numeric:tabular-nums;line-height:1}
.tot-l{font-size:.72rem;font-weight:600;text-transform:uppercase;letter-spacing:.07em;color:var(--mu)}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
@media(max-width:560px){.grid{grid-template-columns:1fr}}
.card{background:var(--sf);border:1px solid var(--bd);border-radius:10px;padding:16px}
.card h3{margin:0 0 12px;font-size:.7rem;font-weight:700;text-transform:uppercase;
  letter-spacing:.07em;color:var(--mu)}
.sl{display:flex;flex-direction:column;gap:9px}
.si{display:grid;grid-template-columns:11px 1fr auto auto;align-items:center;gap:7px}
.dot{width:11px;height:11px;border-radius:50%;flex-shrink:0}
.sn{font-size:.87rem}
.sc{font-size:1.05rem;font-weight:700;font-variant-numeric:tabular-nums;text-align:right}
.sp2{font-size:.73rem;color:var(--mu);text-align:right;min-width:36px}
.tr{grid-column:2/5;background:var(--bd);border-radius:3px;height:6px;overflow:hidden;margin-top:-3px}
.fi{height:100%;border-radius:3px;transition:width .6s}
/* ── FA análise ── */
.fa-section{margin-top:28px}
.fa-sep{display:flex;align-items:center;gap:12px;margin-bottom:16px}
.fa-sep-line{flex:1;height:1px;background:var(--bd)}
.fa-sep-label{font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--mu);white-space:nowrap}
.fa-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px}
@media(max-width:560px){.fa-grid{grid-template-columns:1fr}}
.bar-row{display:grid;grid-template-columns:1fr 140px 48px;align-items:center;gap:8px;margin-bottom:8px}
.bar-track{height:13px;background:var(--bd);border-radius:3px;overflow:hidden}
.bar-fill{height:100%;border-radius:3px;transition:width .6s}
.bar-lbl{font-size:.8rem;color:var(--fg);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bar-cnt{font-size:.8rem;font-weight:700;font-variant-numeric:tabular-nums;text-align:right}
.tl-row{display:grid;grid-template-columns:90px 1fr 44px;align-items:center;gap:8px;margin-bottom:9px}
.tl-label{font-size:.78rem;font-weight:600}
.tl-note{font-size:.68rem;color:var(--mu);grid-column:1/-1;padding-left:98px;margin-top:-5px;margin-bottom:4px}
.insight-box{background:var(--or-bg);border-left:3px solid var(--or);border-radius:6px;
  padding:10px 14px;font-size:.82rem;color:var(--fg);line-height:1.5;margin-bottom:14px}
.insight-box strong{color:var(--or)}
.trend-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:4px}
.trend-chip{background:var(--sf);border:1px solid var(--bd);border-radius:6px;
  padding:8px 10px;min-width:90px;flex:1}
.trend-mes{font-size:.68rem;font-weight:600;color:var(--mu)}
.trend-val{font-size:.95rem;font-weight:800;font-variant-numeric:tabular-nums;margin:2px 0 1px}
.trend-brl{font-size:.68rem;color:var(--mu)}
.trend-bar{height:3px;background:var(--bd);border-radius:2px;margin-top:4px;overflow:hidden}
.trend-bf{height:100%;border-radius:2px;background:var(--or)}
.fa-spin-wrap{text-align:center;padding:32px;color:var(--mu);font-size:.85rem}
.fa-spin{display:inline-block;width:18px;height:18px;border:2px solid var(--bd);
  border-top-color:var(--ac);border-radius:50%;animation:sp .7s linear infinite;vertical-align:middle;margin-right:8px}
.si-click{cursor:pointer;transition:opacity .15s;border-radius:5px;padding:3px 4px;margin:-3px -4px}
.si-click:hover{opacity:.75}
.si-active{outline:2px solid var(--ac);outline-offset:3px;border-radius:5px}
</style></head><body>
<div class="hd">
  <div><h1>Status dos Contratos — Filial 2 · Tempo Real</h1>
    <p class="sub">Dados direto da API IXC &nbsp;·&nbsp; Presidente Dutra · São Domingos · Tuntum · Dom Pedro</p></div>
  <button class="btn" id="btn" onclick="carregar()">↻ Buscar agora</button>
</div>
<div id="out-status"><div class="state">Clique em "Buscar agora" para consultar o IXC em tempo real.</div></div>
<div id="out-analise"></div>
<script>
const C={ok:'#15803d',wa:'#b45309',da:'#dc2626',ac:'#2563eb',or:'#c2410c',ne:'#6b7280'};
const CT=[
  {k:'Ativo',c:'ok'},{k:'Inativo',c:'ne'},
  {k:'Negativado',c:'da',tipo:'sc_N'},
  {k:'Desistente',c:'wa',tipo:'sc_D'},
  {k:'Pendente',c:'ac'},
];
const SA=[
  {k:'Ativo',c:'ok'},
  {k:'Bloqueio Automático',c:'da',tipo:'si_CA'},
  {k:'Bloqueio Manual',c:'wa',tipo:'si_CM'},
  {k:'Financeiro em atraso',c:'or',tipo:'si_FA'},
  {k:'Desativado',c:'ne',tipo:'si_D'},
  {k:'Aguardando Assinatura',c:'ac'},
];
function fN(n){return Number(n).toLocaleString('pt-BR')}
function fR(n){return 'R$ '+Number(n).toLocaleString('pt-BR',{minimumFractionDigits:0,maximumFractionDigits:0})}
function hex(v){return getComputedStyle(document.documentElement).getPropertyValue('--'+v).trim()||C[v]||'#888'}
function statusList(data,cfg,tot){
  return cfg.filter(x=>(data[x.k]||0)>0).sort((a,b)=>(data[b.k]||0)-(data[a.k]||0)).map(x=>{
    const n=data[x.k]||0,p=tot>0?(n/tot*100).toFixed(1):0,h=hex(x.c);
    const extra=x.tipo?`id="si-${x.tipo}" class="si si-click" onclick="loadAnalise('${x.tipo}','${x.k}')" title="Clique para analisar"`:`class="si"`;
    return `<div ${extra}><span class="dot" style="background:${h}"></span>
      <span class="sn">${x.k}</span>
      <span class="sc" style="color:${h}">${fN(n)}</span>
      <span class="sp2">${p}%</span>
      <div class="tr"><div class="fi" style="width:${p}%;background:${h}"></div></div></div>`;
  }).join('');
}
function barList(obj,maxVal,color){
  return Object.entries(obj).sort((a,b)=>b[1]-a[1]).map(([k,v])=>{
    const pct=maxVal>0?(v/maxVal*100).toFixed(1):0;
    return `<div class="bar-row">
      <div class="bar-lbl">${k}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${color}"></div></div>
      <div class="bar-cnt">${fN(v)}</div></div>`;
  }).join('');
}
const ORDEM_TEMPO=['< 3 meses','3-6 meses','6-12 meses','1-2 anos','> 2 anos'];
function tempoList(obj,maxVal){
  return ORDEM_TEMPO.filter(k=>obj[k]).map(k=>{
    const v=obj[k]||0,pct=maxVal>0?(v/maxVal*100).toFixed(1):0;
    const cor=k.startsWith('<')||k.startsWith('3')?hex('wa'):hex('ok');
    return `<div class="bar-row">
      <div class="bar-lbl">${k}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${cor}"></div></div>
      <div class="bar-cnt">${fN(v)}</div></div>`;
  }).join('');
}
function tlNote(dt){
  const d=new Date(dt+'T12:00:00');
  const dia=d.getDate();
  if(dia>=20&&dia<=22)return`Venc. dia ${dia} + 7 dias carência`;
  if(dia>=23&&dia<=24)return`Venc. dia 23 + 7 dias carência`;
  if(dia>=25&&dia<=27)return`Venc. dia 25 + 7 dias (sáb→dom→seg)`;
  return'';
}
function tlColor(cnt,max){return cnt===max?hex('da'):cnt>max*0.3?hex('or'):hex('wa')}
const TIPO_TL_LABEL={
  'si_FA':'Quando entraram em FA','si_CA':'Vencimento (pago até)',
  'si_CM':'Vencimento (pago até)','si_D':'Vencimento (pago até)',
  'sc_N':'Vencimento (pago até)','sc_D':'Vencimento (pago até)',
};
function insightText(d,label,tipo){
  const tot=d.total||0;
  const tempo=d.por_tempo||{};
  const antigos=((tempo['1-2 anos']||0)+(tempo['> 2 anos']||0));
  const pctA=tot>0?(antigos/tot*100).toFixed(0):0;
  const parteA=pctA>=30?` <strong>${pctA}% têm mais de 1 ano de contrato</strong> — clientes antigos em dificuldade.`:'';
  if(tipo==='si_FA')return`<strong>Por que ${fN(tot)} contratos estão em FA?</strong> É o efeito do ciclo de vencimentos — os dias <strong>23 e 25</strong> são os mais comuns e, após 7 dias de carência, geram o maior volume de FA em bloco.${parteA} Dados de ${d.gerado_em}.`;
  if(tipo==='si_CA')return`<strong>${fN(tot)} contratos em Bloqueio Automático</strong> — clientes que ultrapassaram a carência sem regularizar o pagamento.${parteA} Dados de ${d.gerado_em}.`;
  if(tipo==='si_CM')return`<strong>${fN(tot)} contratos com Bloqueio Manual</strong> — bloqueios aplicados diretamente pela equipe.${parteA} Dados de ${d.gerado_em}.`;
  if(tipo==='si_D')return`<strong>${fN(tot)} contratos com acesso Desativado</strong> — serviço suspenso por inadimplência ou solicitação.${parteA} Dados de ${d.gerado_em}.`;
  if(tipo==='sc_N')return`<strong>${fN(tot)} contratos Negativados</strong> — clientes com dívidas registradas em negativação.${parteA} Dados de ${d.gerado_em}.`;
  if(tipo==='sc_D')return`<strong>${fN(tot)} contratos Desistentes</strong> — clientes que solicitaram cancelamento do serviço.${parteA} Dados de ${d.gerado_em}.`;
  return`<strong>${fN(tot)} contratos em ${label}</strong>. Dados de ${d.gerado_em}.`;
}
function renderAnalise(d,label,tipo){
  if(!d||!d.total)return'';
  const tl=d.timeline||[];
  const maxTL=tl.reduce((m,r)=>Math.max(m,r.cnt),1);
  const tlLabel=TIPO_TL_LABEL[tipo]||'Entrada no status';
  const isFa=tipo==='si_FA';
  const tlRows=tl.slice(0,8).map(r=>{
    const note=isFa?tlNote(r.dt):'';
    const dt=r.dt.split('-').reverse().join('/').slice(0,5);
    const col=tlColor(r.cnt,maxTL);
    return `<div class="tl-row">
        <div class="tl-label">${dt}</div>
        <div class="bar-track" style="height:20px"><div class="bar-fill" style="width:${(r.cnt/maxTL*100).toFixed(0)}%;background:${col};height:20px"></div></div>
        <div class="bar-cnt">${fN(r.cnt)}</div></div>${note?`<div class="tl-note">${note}</div>`:''}`;
  }).join('');
  const cidades=d.por_cidade||{};
  const maxCid=Math.max(...Object.values(cidades),1);
  const tempo=d.por_tempo||{};
  const maxTempo=Math.max(...Object.values(tempo),1);
  const boletos=(d.boletos_abertos||[]).slice(0,8);
  const maxBol=Math.max(...boletos.map(b=>b.cnt),1);
  const chips=boletos.length?boletos.map(b=>{
    const pct=b.cnt/maxBol*100;
    const mes=b.mes.split('-').reverse().join('/').replace(/^\d+\//,'');
    return `<div class="trend-chip"><div class="trend-mes">${mes}</div>
      <div class="trend-val" style="color:${b.cnt>1000?hex('or'):b.cnt>500?hex('wa'):'var(--fg)'}">${fN(b.cnt)}</div>
      <div class="trend-brl">${fR(b.total)}</div>
      <div class="trend-bar"><div class="trend-bf" style="width:${pct.toFixed(0)}%"></div></div></div>`;
  }).join(''):`<span style="color:var(--mu);font-size:.8rem">Sem boletos em aberto encontrados.</span>`;
  return `<div class="fa-section">
    <div class="fa-sep"><div class="fa-sep-line"></div>
      <div class="fa-sep-label">📊 Análise — ${fN(d.total)} em ${label}</div>
      <div class="fa-sep-line"></div></div>
    <div class="insight-box">${insightText(d,label,tipo)}</div>
    <div class="fa-grid">
      <div class="card"><h3>${tlLabel}</h3>${tlRows||'<span style="color:var(--mu);font-size:.8rem">Sem dados de timeline.</span>'}</div>
      <div class="card"><h3>Por cidade</h3>${barList(cidades,maxCid,hex('ac'))}</div>
    </div>
    <div class="fa-grid">
      <div class="card"><h3>Por tempo de contrato</h3>${tempoList(tempo,maxTempo)}</div>
      <div class="card"><h3>Boletos em aberto (Filial 2)</h3><div class="trend-row">${chips}</div></div>
    </div>
  </div>`;
}
let _analiseAtiva=null;
async function loadAnalise(tipo,label){
  if(_analiseAtiva){const p=document.getElementById('si-'+_analiseAtiva);if(p)p.classList.remove('si-active');}
  _analiseAtiva=tipo;
  const cur=document.getElementById('si-'+tipo);if(cur)cur.classList.add('si-active');
  const el=document.getElementById('out-analise');if(!el)return;
  el.innerHTML=`<div class="fa-spin-wrap"><span class="fa-spin"></span>Carregando análise de ${label}...</div>`;
  try{
    const r=await fetch(`/api/ixc/status_analysis?tipo=${tipo}`);
    if(!r.ok)throw new Error(r.statusText);
    el.innerHTML=renderAnalise(await r.json(),label,tipo);
  }catch(e){
    el.innerHTML=`<div class="state err" style="font-size:.85rem">⚠ Erro ao carregar análise: ${e.message}</div>`;
  }
}
async function carregar(){
  const btn=document.getElementById('btn');
  btn.disabled=true;
  btn.innerHTML='<span class="spin"></span> Buscando...';
  document.getElementById('out-status').innerHTML='<div class="state">Consultando IXC...</div>';
  document.getElementById('out-analise').innerHTML='';
  try{
    const d=await fetch('/api/ixc/status_rt').then(r=>{if(!r.ok)throw new Error(r.statusText);return r.json();});
    const nAtivos=d.por_status['Ativo']||0;
    document.getElementById('out-status').innerHTML=`
      <div class="ts">Atualizado: <strong>${d.gerado_em}</strong> &nbsp;·&nbsp; Clique em um status para ver a análise detalhada</div>
      <div class="tot"><div>
        <div class="tot-l">Total de contratos</div>
        <div class="tot-v">${fN(d.total)}</div>
      </div></div>
      <div class="grid">
        <div class="card"><h3>Status do contrato</h3><div class="sl">${statusList(d.por_status,CT,d.total)}</div></div>
        <div class="card"><h3>Status de acesso — ativos (${fN(nAtivos)})</h3><div class="sl">${statusList(d.ativos_por_acesso,SA,nAtivos)}</div></div>
      </div>`;
    loadAnalise('si_FA','Financeiro em atraso');
  }catch(e){
    document.getElementById('out-status').innerHTML=`<div class="state err">❌ Erro: ${e.message}</div>`;
  }
  btn.disabled=false;btn.innerHTML='↻ Buscar agora';
}
</script></body></html>"""


@ixc_sync_bp.route('/fa_analysis', methods=['GET'])
@login_required
def fa_analysis():
    """Análise detalhada dos contratos FA: timeline, cidades, tempo de contrato, boletos em aberto."""
    from collections import Counter

    conn = get_db()
    try:
        token = _get_token(conn)
        if not token:
            return jsonify({"error": "Token IXC não configurado"}), 400
        boletos = conn.execute("""
            SELECT substr(Vencimento,1,7) AS mes, COUNT(*) AS cnt, SUM(Valor_aberto) AS total
            FROM Contas_a_Receber
            WHERE Status = 'A receber' AND Vencimento >= '2025-01-01'
            GROUP BY mes ORDER BY mes DESC LIMIT 12
        """).fetchall()
        boletos_abertos = [{'mes': r['mes'], 'cnt': r['cnt'], 'total': float(r['total'] or 0)}
                           for r in boletos]
    finally:
        conn.close()

    hdrs = _ixc_headers(token)
    hoje = datetime.now().date()

    all_fa = []
    page = 1
    fetched = 0
    while True:
        resp = requests.post(f'{IXC_BASE_URL}/cliente_contrato', data={
            'qtype': 'cliente_contrato.status_internet', 'query': 'FA', 'oper': '=',
            'sortname': 'cliente_contrato.id', 'sortorder': 'asc',
            'page': str(page), 'rp': '200',
            'fields': 'id,id_cliente,data_ativacao,pago_ate_data,dt_ult_finan_atraso,id_filial',
        }, headers=hdrs, timeout=60, verify=False)
        resp.raise_for_status()
        data = resp.json()
        recs = data.get('registros', [])
        if not recs:
            break
        # Filtra apenas Filial 2 mas pagina pelo total geral
        all_fa.extend(r for r in recs if str(r.get('id_filial', '')) == '2')
        fetched += len(recs)
        if fetched >= int(data.get('total', 0)):
            break
        page += 1

    conn2 = get_db()
    try:
        ids = [int(c['id_cliente']) for c in all_fa if c.get('id_cliente')]
        id_cidade = {}
        for i in range(0, len(ids), 500):
            batch = ids[i:i+500]
            ph = ','.join('?' * len(batch))
            for r in conn2.execute(f'SELECT ID, Cidade FROM Clientes WHERE ID IN ({ph})', batch).fetchall():
                id_cidade[int(r['ID'])] = r['Cidade']
    finally:
        conn2.close()

    timeline   = Counter()
    por_cidade = Counter()
    por_tempo  = Counter()
    FAIXAS = [('< 3 meses', 90), ('3-6 meses', 180), ('6-12 meses', 365),
              ('1-2 anos', 730), ('> 2 anos', 99999)]

    for c in all_fa:
        dt_fa = c.get('dt_ult_finan_atraso', '')
        if dt_fa and not dt_fa.startswith('0000'):
            timeline[dt_fa[:10]] += 1
        cidade = id_cidade.get(int(c.get('id_cliente', 0) or 0), 'Outras')
        por_cidade[cidade] += 1
        dt_atv = c.get('data_ativacao', '')
        if dt_atv and not dt_atv.startswith('0000'):
            try:
                dias = (hoje - datetime.strptime(dt_atv[:10], '%Y-%m-%d').date()).days
                faixa = next(f for f, lim in FAIXAS if dias < lim)
                por_tempo[faixa] += 1
            except Exception:
                pass

    top_tl = [{'dt': dt, 'cnt': cnt}
              for dt, cnt in sorted(timeline.items(), reverse=True)[:8]]

    return jsonify({
        'total_fa':       len(all_fa),
        'timeline':       top_tl,
        'por_cidade':     dict(por_cidade.most_common(8)),
        'por_tempo':      dict(por_tempo),
        'boletos_abertos': boletos_abertos,
        'gerado_em':      datetime.now().strftime('%d/%m/%Y %H:%M:%S'),
    })


@ixc_sync_bp.route('/status_analysis', methods=['GET'])
@login_required
def status_analysis():
    """Análise genérica para qualquer status de contrato/acesso da Filial 2."""
    from collections import Counter

    tipo = request.args.get('tipo', 'si_FA')

    # tipo → (campo IXC, valor, campo_data_timeline)
    TIPO_MAP = {
        'si_FA': ('status_internet', 'FA', 'dt_ult_finan_atraso'),
        'si_CA': ('status_internet', 'CA', 'pago_ate_data'),
        'si_CM': ('status_internet', 'CM', 'pago_ate_data'),
        'si_D':  ('status_internet', 'D',  'pago_ate_data'),
        'sc_N':  ('status',          'N',  'pago_ate_data'),
        'sc_D':  ('status',          'D',  'pago_ate_data'),
    }
    if tipo not in TIPO_MAP:
        return jsonify({'error': f'Tipo inválido: {tipo}'}), 400

    campo_ixc, valor_ixc, campo_data = TIPO_MAP[tipo]

    conn = get_db()
    try:
        token = _get_token(conn)
        if not token:
            return jsonify({"error": "Token IXC não configurado"}), 400
        boletos = conn.execute("""
            SELECT substr(Vencimento,1,7) AS mes, COUNT(*) AS cnt, SUM(Valor_aberto) AS total
            FROM Contas_a_Receber
            WHERE Status = 'A receber' AND Vencimento >= '2025-01-01'
            GROUP BY mes ORDER BY mes DESC LIMIT 12
        """).fetchall()
        boletos_abertos = [{'mes': r['mes'], 'cnt': r['cnt'], 'total': float(r['total'] or 0)}
                           for r in boletos]
    finally:
        conn.close()

    hdrs = _ixc_headers(token)
    hoje = datetime.now().date()

    all_recs = []
    page = 1
    fetched = 0
    while True:
        resp = requests.post(f'{IXC_BASE_URL}/cliente_contrato', data={
            'qtype': f'cliente_contrato.{campo_ixc}', 'query': valor_ixc, 'oper': '=',
            'sortname': 'cliente_contrato.id', 'sortorder': 'asc',
            'page': str(page), 'rp': '200',
            'fields': 'id,id_cliente,data_ativacao,pago_ate_data,dt_ult_finan_atraso,id_filial',
        }, headers=hdrs, timeout=60, verify=False)
        resp.raise_for_status()
        data = resp.json()
        recs = data.get('registros', [])
        if not recs:
            break
        all_recs.extend(r for r in recs if str(r.get('id_filial', '')) == '2')
        fetched += len(recs)
        if fetched >= int(data.get('total', 0)):
            break
        page += 1

    conn2 = get_db()
    try:
        ids = [int(c['id_cliente']) for c in all_recs if c.get('id_cliente')]
        id_cidade = {}
        for i in range(0, len(ids), 500):
            batch = ids[i:i+500]
            ph = ','.join('?' * len(batch))
            for r in conn2.execute(f'SELECT ID, Cidade FROM Clientes WHERE ID IN ({ph})', batch).fetchall():
                id_cidade[int(r['ID'])] = r['Cidade']
    finally:
        conn2.close()

    timeline   = Counter()
    por_cidade = Counter()
    por_tempo  = Counter()
    FAIXAS = [('< 3 meses', 90), ('3-6 meses', 180), ('6-12 meses', 365),
              ('1-2 anos', 730), ('> 2 anos', 99999)]

    for c in all_recs:
        dt = c.get(campo_data, '') or ''
        if dt and not dt.startswith('0000'):
            timeline[dt[:10]] += 1
        cidade = id_cidade.get(int(c.get('id_cliente', 0) or 0), 'Outras')
        por_cidade[cidade] += 1
        dt_atv = c.get('data_ativacao', '')
        if dt_atv and not dt_atv.startswith('0000'):
            try:
                dias = (hoje - datetime.strptime(dt_atv[:10], '%Y-%m-%d').date()).days
                faixa = next(f for f, lim in FAIXAS if dias < lim)
                por_tempo[faixa] += 1
            except Exception:
                pass

    top_tl = [{'dt': dt, 'cnt': cnt}
              for dt, cnt in sorted(timeline.items(), reverse=True)[:8]]

    return jsonify({
        'total':           len(all_recs),
        'tipo':            tipo,
        'timeline':        top_tl,
        'por_cidade':      dict(por_cidade.most_common(8)),
        'por_tempo':       dict(por_tempo),
        'boletos_abertos': boletos_abertos,
        'gerado_em':       datetime.now().strftime('%d/%m/%Y %H:%M:%S'),
    })


@ixc_sync_bp.route('/status_rt_page')
@login_required
def status_rt_page():
    return render_template_string(_STATUS_RT_PAGE)


@ixc_sync_bp.route('/status_rt', methods=['GET'])
@login_required
def status_rt():
    """Puxa status dos contratos da Filial 2 em tempo real via paginação paralela da API IXC."""
    import math as _math
    conn = get_db()
    try:
        token = _get_token(conn)
        if not token:
            return jsonify({"error": "Token IXC não configurado"}), 400
    finally:
        conn.close()

    hdrs = _ixc_headers(token)

    STATUS_MAP = {'A':'Ativo','I':'Inativo','P':'Pendente','N':'Negativado','D':'Desistente'}
    ACESSO_MAP = {'A':'Ativo','CA':'Bloqueio Automático','CM':'Bloqueio Manual',
                  'FA':'Financeiro em atraso','AA':'Aguardando Assinatura','D':'Desativado'}

    def _fetch_page(page):
        r = requests.post(
            f'{IXC_BASE_URL}/cliente_contrato',
            data={'qtype': 'cliente_contrato.id_filial', 'query': '2', 'oper': '=',
                  'page': str(page), 'rp': '1000',
                  'sortname': 'cliente_contrato.id', 'sortorder': 'asc'},
            headers=hdrs, timeout=60, verify=False,
        )
        r.raise_for_status()
        j = r.json()
        return j.get('registros', []), int(j.get('total', 0))

    try:
        first_records, total_f2 = _fetch_page(1)
        n_pages = _math.ceil(total_f2 / 1000)
        all_records = list(first_records)

        if n_pages > 1:
            with ThreadPoolExecutor(max_workers=min(n_pages - 1, 10)) as pool:
                futs = {pool.submit(_fetch_page, p): p for p in range(2, n_pages + 1)}
                for fut in as_completed(futs):
                    recs, _ = fut.result()
                    all_records.extend(recs)

        por_status = {}
        ativos_por_acesso = {}
        for rec in all_records:
            s  = rec.get('status', '')
            si = rec.get('status_internet', '')
            lbl_s = STATUS_MAP.get(s, s)
            if lbl_s:
                por_status[lbl_s] = por_status.get(lbl_s, 0) + 1
            lbl_si = ACESSO_MAP.get(si, si)
            if lbl_si:
                ativos_por_acesso[lbl_si] = ativos_por_acesso.get(lbl_si, 0) + 1

    except Exception as e:
        return jsonify({"error": f"Erro ao consultar IXC: {e}"}), 502

    total = sum(por_status.values())

    return jsonify({
        "total":             total,
        "por_status":        por_status,
        "ativos_por_acesso": ativos_por_acesso,
        "gerado_em":         datetime.now().strftime('%d/%m/%Y %H:%M:%S'),
    })


@ixc_sync_bp.route('/start', methods=['POST'])
@login_required
def start_sync():
    if current_user.username != 'admin':
        return jsonify({"error": "Acesso negado"}), 403

    mode   = request.json.get('mode', 'incremental')
    tables = request.json.get('tables', None)  # None = todas

    conn = get_db()
    try:
        if conn.execute("SELECT value FROM Settings WHERE key='ixc_syncing'").fetchone()and \
           conn.execute("SELECT value FROM Settings WHERE key='ixc_syncing'").fetchone()['value'] == '1':
            return jsonify({"error": "Sincronização já em andamento"}), 409

        token = _get_token(conn)
        if not token:
            return jsonify({"error": "Token IXC não configurado"}), 400

        conn.execute("REPLACE INTO Settings (key, value) VALUES ('ixc_syncing', '1')")
        conn.commit()
    finally:
        conn.close()

    _start_sync_thread(current_app._get_current_object(), token, mode, tables)
    return jsonify({"success": True, "message": f"Sync {mode} iniciada"})


# ── Agendamento diário ────────────────────────────────────────────────────────

def start_weekly_scheduler(app):
    """Mantém nome original para compatibilidade; agora executa todo dia às 23:59.
    Ao iniciar, se a última sync tiver mais de 24 h, dispara catch-up imediato."""
    def _scheduler():
        # ── Catch-up: sync atrasada? ──────────────────────────────────────────
        try:
            with app.app_context():
                _cc = app.config['GET_DB_CONNECTION']()
                _row = _cc.execute(
                    "SELECT value FROM Settings WHERE key='ixc_last_sync_dt'"
                ).fetchone()
                _cc.close()
            if _row and _row['value']:
                from datetime import datetime as _dt
                last = _dt.fromisoformat(_row['value'])
                hours_ago = (datetime.now() - last).total_seconds() / 3600
                if hours_ago > 24:
                    logger.info(f"[Scheduler] Catch-up: última sync há {hours_ago:.0f}h — iniciando agora...")
                    _tg_send(f"⏰ <b>Catch-up sync</b>: banco estava {hours_ago:.0f}h desatualizado.\nIniciando agora...", app=app)
                    with app.app_context():
                        _ct = app.config['GET_DB_CONNECTION']()
                        _tok = _get_token(_ct)
                        _ct.close()
                    if _tok:
                        _run_sync(app, _tok, 'full')
                        with app.app_context():
                            _cv = app.config['GET_DB_CONNECTION']()
                            _st = _cv.execute("SELECT value FROM Settings WHERE key='ixc_sync_status'").fetchone()
                            _cv.close()
                        _status = _st['value'] if _st else 'error'
                        _tg_send(f"{'✅' if _status=='success' else '❌'} Catch-up {'concluído' if _status=='success' else 'falhou'} ({_status})", app=app)
        except Exception as _e:
            logger.warning(f"[Scheduler] Catch-up erro: {_e}")

        while True:
            now    = datetime.now()
            target = now.replace(hour=23, minute=59, second=0, microsecond=0)
            if now >= target:
                target += timedelta(days=1)
            wait = (target - now).total_seconds()
            logger.info(f"[Scheduler] Próxima sync agendada para {target.strftime('%Y-%m-%d %H:%M')} ({wait/3600:.1f}h)")
            time.sleep(wait)

            with app.app_context():
                conn  = app.config['GET_DB_CONNECTION']()
                token = _get_token(conn)
                conn.close()
            if not token:
                logger.warning("[Scheduler] Token IXC não encontrado — sync ignorada.")
                time.sleep(120)
                continue

            MAX_TENTATIVAS = 3
            _tg_send(f"🔄 <b>Sync diária iniciada</b>\n{datetime.now().strftime('%d/%m/%Y %H:%M')}", app=app)
            for tentativa in range(1, MAX_TENTATIVAS + 1):
                logger.info(f"[{datetime.now()}] Sync diária completa — tentativa {tentativa}/{MAX_TENTATIVAS}...")
                _run_sync(app, token, 'full')

                with app.app_context():
                    _conn = app.config['GET_DB_CONNECTION']()
                    row   = _conn.execute(
                        "SELECT value FROM Settings WHERE key='ixc_sync_status'"
                    ).fetchone()
                    _conn.close()
                status = row['value'] if row else 'error'

                if status == 'success':
                    logger.info(f"[Scheduler] Sync concluída com sucesso na tentativa {tentativa}.")
                    _tg_send(f"✅ <b>Sync concluída</b> (tentativa {tentativa}/{MAX_TENTATIVAS})\n{datetime.now().strftime('%d/%m/%Y %H:%M')}", app=app)
                    break
                else:
                    logger.warning(f"[Scheduler] Tentativa {tentativa}/{MAX_TENTATIVAS} falhou (status={status}).")
                    if tentativa < MAX_TENTATIVAS:
                        logger.info("[Scheduler] Aguardando 5 min antes de nova tentativa...")
                        _tg_send(f"⚠️ Tentativa {tentativa}/{MAX_TENTATIVAS} falhou. Nova tentativa em 5 min...", app=app)
                        time.sleep(300)
                    else:
                        logger.error("[Scheduler] Todas as tentativas falharam. Sync tentada novamente amanhã.")
                        _tg_send(f"❌ <b>Sync falhou após {MAX_TENTATIVAS} tentativas!</b>\nDados podem estar desatualizados. Verifique o sistema.", app=app)

            # Aguarda 2 min para evitar duplo disparo no mesmo horário
            time.sleep(120)

    threading.Thread(target=_scheduler, daemon=True).start()

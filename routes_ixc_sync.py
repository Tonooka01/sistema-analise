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
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
from datetime import datetime, timedelta
from flask import Blueprint, jsonify, request, current_app
from flask_login import login_required, current_user

ixc_sync_bp = Blueprint('ixc_sync_bp', __name__)

from logger import get_logger
logger = get_logger(__name__)

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
            return resp.json().get('registros', [])
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

    for filial in ['2', '4']:
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
        logger.info(f"  [filial {filial}] {len(records)} clientes")

        table = 'Clientes' if filial == '2' else 'Clientes_Negativacao'
        for r in records:
            cidade_id = str(r.get('cidade', ''))
            cidade_nome = CIDADE_NOMES.get(cidade_id, cidade_id if cidade_id not in ('0', '') else None)

            conn.execute(f"""
                INSERT OR REPLACE INTO {table}
                (ID, Raz_o_social, Nome_Fantasia_Social, CNPJ_CPF, Cidade, Bairro,
                 Endere_o, N_mero, CEP, UF, Telefone, E_mail, Ativo, Data_cadastro,
                 Filial, Tipo_pessoa, WhatsApp, Latitude, Longitude)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """, (
                r.get('id'), r.get('razao'), r.get('fantasia'), r.get('cnpj_cpf'),
                cidade_nome, r.get('bairro'), r.get('endereco'),
                r.get('numero'), r.get('cep'), r.get('uf'), r.get('fone'),
                r.get('email'), r.get('ativo'), r.get('data_cadastro'),
                r.get('filial_id'), r.get('tipo_pessoa'), r.get('whatsapp'),
                r.get('latitude'), r.get('longitude')
            ))
            if filial == '2':
                total_c += 1
            else:
                total_n += 1

    conn.commit()
    log.append(f"  ✅ {total_c} clientes | {total_n} negativados")


def _sync_contratos(conn, token, log, since=None):
    modo = f"desde {since}" if since else "completo"
    log.append(f"→ Contratos ({modo})...")

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

    for filial in ['2', '4']:
        params = {
            'qtype':     'cliente_contrato.id_filial',
            'query':     filial,
            'oper':      '=',
            'sortname':  'cliente_contrato.ultima_atualizacao',
            'sortorder': 'asc'
        }
        if since:
            params['qtype2'] = 'cliente_contrato.ultima_atualizacao'
            params['query2'] = since
            params['oper2']  = '>='

        records = _ixc_get('cliente_contrato', params, token)
        logger.info(f"  [filial {filial}] {len(records)} contratos")

        for r in records:
            id_cli = str(int(float(r.get('id_cliente', 0) or 0)))
            nome, cidade = cliente_cache.get(id_cli, (None, None))

            row = (
                r.get('id'),
                r.get('id_filial'),
                _map_status_contrato(r.get('status')),
                _map_status_acesso(r.get('status_internet')),
                nome or r.get('cliente_razao'),
                r.get('data_assinatura'),        # Data_primeira_assinatura
                r.get('data_ativacao'),           # Data_ativa_o
                r.get('data'),                    # Data_base
                r.get('data_renovacao'),          # Data_renova_o
                r.get('data_expiracao'),          # Data_de_expira_o
                r.get('isentar_contrato'),        # Isento
                r.get('pago_ate_data'),           # Pago_at
                r.get('id_vd_contrato'),          # Plano_de_venda
                r.get('contrato'),                # Descri_o
                r.get('endereco'),                # Endere_o
                r.get('numero'),                  # N_mero
                r.get('bairro'),                  # Bairro
                r.get('tipo'),                    # Tipo
                r.get('descricao_aux_plano_venda'), # Descri_o_aux_plano_venda
                r.get('dia_fixo_vencimento'),     # Dia_fixo_do_vencimento
                r.get('id_carteira_cobranca'),    # Cobran_a / Carteira
                r.get('status_velocidade'),       # Status_velocidade
                r.get('id_vendedor'),             # Vendedor
                r.get('nao_avisar_ate'),          # N_o_avisar_at
                r.get('nao_bloquear_ate'),        # N_o_bloquear_at
                r.get('id_tipo_documento'),       # Tipo_doc
                r.get('tipo_doc_opc'),            # Doc_opc
                r.get('tipo_doc_opc2'),           # Doc_opc_2
                r.get('tipo_doc_opc3'),           # Doc_opc_3
                r.get('tipo_doc_opc4'),           # Doc_opc_4
                r.get('desbloqueio_confianca'),   # Desbloqueio_confian_a
                r.get('data_negativacao'),        # Data_negativa_o
                r.get('data_acesso_desativado'),  # Data_de_acesso_desativado
                r.get('motivo_cancelamento'),     # Motivo_cancelamento
                r.get('data_cancelamento'),       # Data_cancelamento
                r.get('obs_cancelamento'),        # Obs_cancelamento
                r.get('id_vendedor_ativ'),        # Vendedor_ativa_o
                r.get('fidelidade'),              # Fidelidade
                r.get('desbloqueio_confianca_ativo'), # Desbloqueio_confian_a_ativo
                r.get('dt_ult_bloq_auto'),        # ltimo_bloqueio_autom_tico
                r.get('dt_ult_bloq_manual'),      # ltimo_bloqueio_manual
                r.get('dt_ult_des_bloq_conf'),    # ltimo_desbloqueio_de_confian_a
                r.get('dt_ult_finan_atraso'),     # ltimo_financeiro_em_atraso
                r.get('dt_utl_negativacao'),      # ltima_negativa_o
                r.get('data_cadastro_sistema'),   # Data_cadastro_sistema
                r.get('ultima_atualizacao'),      # ltima_atualiza_o
                r.get('complemento'),             # Complemento
                r.get('cep'),                     # Cep
                cidade,                           # Cidade
                r.get('taxa_instalacao'),         # Taxa_ativa_o
                r.get('motivo_inclusao'),         # Motivo_de_inclus_o
                r.get('dia_fixo_vencimento'),     # Dia_fixo_do_vencimento (2nd ref)
            )

            if filial == '4':
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
                """, row[:-1])  # remove duplicate dia_fixo
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
                     Cidade, Taxa_ativa_o, Motivo_de_inclus_o)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                """, row[:-1])  # remove duplicate dia_fixo
                total_c += 1

    conn.commit()
    log.append(f"  ✅ {total_c} contratos | {total_n} negativados")


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

    # Filial 1 — a partir de 2025, busca única sem loop de ano
    log.append("  → Filial 1 (a partir de 2025)...")
    logger.info("  → Buscando filial 1...")
    try:
        records = _ixc_get('fn_areceber', {
            'qtype':     'fn_areceber.filial_id',
            'query':     '1',
            'oper':      '=',
            'sortname':  'fn_areceber.id',
            'sortorder': 'asc'
        }, token)
        # Filtra localmente por data de pagamento >= 2025
        records = [r for r in records if str(r.get('pagamento_data', '') or '')[:4] >= '2025']
        logger.info(f"    [filial 1] {len(records)} registros a partir de 2025")
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
            nome_cliente = cliente_cache.get(id_cli, id_cli)

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

    for r in records:
        conn.execute("""
            INSERT OR REPLACE INTO Atendimentos
            (ID, Cliente, Criado_em, ltima_altera_o, Assunto, Novo_status, Descri_o, Filial)
            VALUES (?,?,?,?,?,?,?,?)
        """, (
            r.get('id'), r.get('cliente_razao'),
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


def _sync_equipamentos(conn, token, log):
    log.append("→ Equipamentos...")
    sql = """
        SELECT
            cliente_contrato_comodato_cliente_contrato.id as id_contrato,
            cliente_contrato_cliente.razao as cliente,
            movimento_produtos.descricao as descricao_produto,
            movimento_produtos.status_comodato as status_comodato,
            DATE_FORMAT(movimento_produtos.data, '%d/%m/%Y') as data,
            cliente_contrato_comodato_produtos.id as id_produto
        FROM movimento_produtos
        LEFT JOIN cliente_contrato cliente_contrato_comodato_cliente_contrato
            ON movimento_produtos.id_contrato = cliente_contrato_comodato_cliente_contrato.id
        LEFT JOIN produtos cliente_contrato_comodato_produtos
            ON movimento_produtos.id_produto = cliente_contrato_comodato_produtos.id
        LEFT JOIN cliente cliente_contrato_cliente
            ON cliente_contrato_comodato_cliente_contrato.id_cliente = cliente_contrato_cliente.id
        WHERE cliente_contrato_comodato_cliente_contrato.id >= '1'
    """
    records = _ixc_query_builder(sql, token)
    conn.execute("DELETE FROM Equipamento")
    for r in records:
        conn.execute("""
            INSERT INTO Equipamento
            (ID_contrato, Raz_o_social_nome, Descricao_produto, Status_comodato, Data)
            VALUES (?,?,?,?,?)
        """, (
            r.get('id_contrato'), r.get('cliente'),
            r.get('descricao_produto'), r.get('status_comodato'), r.get('data')
        ))
    log.append(f"  ✅ {len(records)} equipamentos")


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

        return jsonify({
            "last_sync":  _get('ixc_last_sync'),
            "last_log":   _get('ixc_last_sync_log'),
            "status":     _get('ixc_sync_status'),
            "has_token":  bool(_get('ixc_token')),
            "is_syncing": _get('ixc_syncing') == '1',
            "progress":   _get('ixc_sync_progress') or '0|Aguardando'
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


# ── Agendamento semanal ────────────────────────────────────────────────────────

def start_weekly_scheduler(app):
    def _scheduler():
        while True:
            now = datetime.now()
            if now.weekday() == 6 and now.hour == 23 and now.minute == 59:
                with app.app_context():
                    conn = app.config['GET_DB_CONNECTION']()
                    token = _get_token(conn)
                    conn.close()
                if token:
                    logger.info(f"[{now}] Sync semanal completa iniciada...")
                    _run_sync(app, token, 'full')
                time.sleep(61)
            time.sleep(30)

    threading.Thread(target=_scheduler, daemon=True).start()

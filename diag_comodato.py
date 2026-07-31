"""
Diagnóstico: busca equipamentos de comodato via API IXC para 10 contratos aleatórios.
Rodar no servidor: python3 diag_comodato.py
"""
import sqlite3, base64, requests, json, os, sys

requests.packages.urllib3.disable_warnings()

DB = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'analise_dados.db')
BASE = 'https://sistema.netvaletelecom.com/webservice/v1'

conn = sqlite3.connect(DB)
conn.row_factory = sqlite3.Row

token = conn.execute("SELECT value FROM Settings WHERE key = 'ixc_token'").fetchone()
if not token:
    print("Token IXC não encontrado no banco."); sys.exit(1)
token = token['value']

contratos = conn.execute("""
    SELECT ID, Cliente FROM Contratos
    WHERE Status_contrato = 'Ativo'
    ORDER BY RANDOM() LIMIT 10
""").fetchall()
conn.close()

encoded = base64.b64encode(token.encode()).decode()
headers = {'Authorization': f'Basic {encoded}', 'ixcsoft': 'listar'}
id_list  = ','.join(str(c['ID']) for c in contratos)

print("=" * 60)
print("Contratos selecionados:")
for c in contratos:
    print(f"  {c['ID']:>6}  {c['Cliente']}")
print("=" * 60)

def test(endpoint, data, label=""):
    print(f"\n[{label or endpoint}]")
    try:
        r = requests.post(f'{BASE}/{endpoint}', data=data, headers=headers, timeout=30, verify=False)
        print(f"  HTTP {r.status_code}  content-type: {r.headers.get('content-type','?')[:60]}")
        body = r.text[:800]
        try:
            j = r.json()
            total = j.get('total', '?')
            regs  = j.get('registros') or []
            print(f"  total={total}  registros={len(regs)}")
            if regs:
                print(f"  campos: {list(regs[0].keys())}")
                print(f"  amostra: {json.dumps(regs[0], ensure_ascii=False)[:400]}")
            else:
                print(f"  body: {body}")
        except Exception:
            print(f"  body (não-JSON): {body}")
    except Exception as e:
        print(f"  ERRO: {e}")

# 1. cliente_contrato_comodato filtrado por id_contrato IN (lista)
test('cliente_contrato_comodato',
     {'qtype': 'cliente_contrato_comodato.id_contrato', 'query': id_list,
      'oper': 'IN', 'sortname': 'cliente_contrato_comodato.id_contrato',
      'sortorder': 'asc', 'rp': '100', 'page': '1'},
     'cliente_contrato_comodato (IN)')

# 2. cliente_contrato_comodato sem filtro
test('cliente_contrato_comodato',
     {'qtype': 'cliente_contrato_comodato.id', 'query': '1', 'oper': '>=',
      'sortname': 'cliente_contrato_comodato.id', 'sortorder': 'asc',
      'rp': '5', 'page': '1'},
     'cliente_contrato_comodato (id>=1)')

# 3. estoque_comodato
test('estoque_comodato',
     {'qtype': 'estoque_comodato.id', 'query': '1', 'oper': '>=',
      'sortname': 'estoque_comodato.id', 'sortorder': 'asc',
      'rp': '5', 'page': '1'})

# 4. Produto do contrato (vd_contratos_produtos)
first_id = contratos[0]['ID']
test('vd_contratos_produtos',
     {'qtype': 'vd_contratos_produtos.id_cliente_contrato', 'query': str(first_id),
      'oper': '=', 'sortname': 'vd_contratos_produtos.id', 'sortorder': 'asc',
      'rp': '10', 'page': '1'},
     f'vd_contratos_produtos (contrato {first_id})')

print("\n" + "=" * 60)

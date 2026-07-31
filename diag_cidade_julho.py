"""
Diagnóstico: valores de Contas_a_Receber por cidade — julho/2026
Rodar no servidor: python3 diag_cidade_julho.py
"""
import sqlite3, os

DB = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'analise_dados.db')
conn = sqlite3.connect(DB)
conn.row_factory = sqlite3.Row

START, END = '2026-07-01', '2026-07-31'

# ── Totais gerais do mês (sem filtro de cidade) ──────────────────────────────
print("\n=== TOTAIS GERAIS — JULHO/2026 ===")
row = conn.execute("""
    SELECT
        SUM(CASE WHEN Status='Recebido' AND Data_pagamento BETWEEN ? AND ? THEN Valor_recebido ELSE 0 END) AS recebido,
        SUM(CASE WHEN Status='Recebido' AND Data_cr_dito  BETWEEN ? AND ? THEN Valor_recebido ELSE 0 END) AS recebido_credito,
        SUM(CASE WHEN Status='A receber' AND Vencimento   BETWEEN ? AND ? THEN Valor          ELSE 0 END) AS a_receber,
        SUM(CASE WHEN Status='Cancelado' AND Vencimento   BETWEEN ? AND ? THEN Valor_cancelado ELSE 0 END) AS cancelado
    FROM Contas_a_Receber
""", [START, END, START, END, START, END, START, END]).fetchone()
print(f"  Recebido (Data_pagamento): R$ {row['recebido']:>12,.2f}")
print(f"  Recebido (Data_crédito):   R$ {row['recebido_credito']:>12,.2f}")
print(f"  A receber:                 R$ {row['a_receber']:>12,.2f}")
print(f"  Cancelado:                 R$ {row['cancelado']:>12,.2f}")

# ── Por cidade — Recebido (Data_pagamento) ────────────────────────────────────
print("\n=== RECEBIDO POR CIDADE (Data_pagamento) — JULHO/2026 ===")
rows = conn.execute("""
    SELECT
        COALESCE(NULLIF(TRIM(Cidade),''), '(sem cidade)') AS cidade,
        COUNT(*) AS qtd,
        SUM(Valor_recebido) AS total
    FROM Contas_a_Receber
    WHERE Status = 'Recebido'
      AND Data_pagamento BETWEEN ? AND ?
    GROUP BY cidade
    ORDER BY total DESC
""", [START, END]).fetchall()
print(f"  {'Cidade':<30} {'Qtd':>6}  {'Total':>14}")
print("  " + "-"*56)
grand = 0
for r in rows:
    grand += r['total']
    print(f"  {r['cidade']:<30} {r['qtd']:>6}  R$ {r['total']:>12,.2f}")
print("  " + "-"*56)
print(f"  {'TOTAL':<30} {'':>6}  R$ {grand:>12,.2f}")

# ── Por cidade — Recebido (Data_crédito) ─────────────────────────────────────
print("\n=== RECEBIDO POR CIDADE (Data_crédito) — JULHO/2026 ===")
rows = conn.execute("""
    SELECT
        COALESCE(NULLIF(TRIM(Cidade),''), '(sem cidade)') AS cidade,
        COUNT(*) AS qtd,
        SUM(Valor_recebido) AS total
    FROM Contas_a_Receber
    WHERE Status = 'Recebido'
      AND Data_cr_dito BETWEEN ? AND ?
    GROUP BY cidade
    ORDER BY total DESC
""", [START, END]).fetchall()
print(f"  {'Cidade':<30} {'Qtd':>6}  {'Total':>14}")
print("  " + "-"*56)
grand = 0
for r in rows:
    grand += r['total']
    print(f"  {r['cidade']:<30} {r['qtd']:>6}  R$ {r['total']:>12,.2f}")
print("  " + "-"*56)
print(f"  {'TOTAL':<30} {'':>6}  R$ {grand:>12,.2f}")

conn.close()

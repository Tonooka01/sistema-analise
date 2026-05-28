import sqlite3
 
c = sqlite3.connect('analise_dados.db')
 
db_rows = c.execute("""
    SELECT CAST(ID AS INTEGER), Filial, Cliente, Cidade, Valor_recebido,
           Data_pagamento, Data_cr_dito
    FROM Contas_a_Receber
    WHERE Data_pagamento LIKE '2026-03%' AND Status='Recebido'
    ORDER BY ID DESC
""").fetchall()
 
print(f"Total banco local: {len(db_rows)}")
print(f"\n{'ID':<12} {'Filial':<8} {'Cliente':<35} {'Recebido':>10} {'Dt Pagamento':<15} {'Dt Credito':<15}")
print("-"*100)
for r in db_rows[:30]:
    print(f"  {r[0]:<10} {str(r[1]):<8} {str(r[2])[:34]:<35} {float(r[4] or 0):>10.2f} {str(r[5]):<15} {str(r[6]):<15}")
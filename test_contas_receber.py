import sqlite3
c = sqlite3.connect('analise_dados.db')

print("=== FORMATOS DE DATA_PAGAMENTO ===")
rows = c.execute("""
    SELECT DISTINCT substr(Data_pagamento, 1, 7), COUNT(*)
    FROM Contas_a_Receber
    WHERE Status = 'Recebido'
    AND Data_pagamento != ''
    AND Data_pagamento IS NOT NULL
    GROUP BY substr(Data_pagamento, 1, 7)
    ORDER BY substr(Data_pagamento, 1, 7) DESC
    LIMIT 10
""").fetchall()
for r in rows:
    print(r)

print("\n=== AMOSTRA DATA PAGAMENTO MARÇO ===")
rows2 = c.execute("""
    SELECT Data_pagamento, Valor_recebido
    FROM Contas_a_Receber
    WHERE Data_pagamento LIKE '2026-03%'
    AND Status = 'Recebido'
    LIMIT 5
""").fetchall()
for r in rows2:
    print(r)
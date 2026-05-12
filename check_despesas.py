import sqlite3
c = sqlite3.connect('analise_dados.db')
rows = c.execute("""
    SELECT 
        SUBSTR(Data_de_confirma_o,7,4)||'-'||SUBSTR(Data_de_confirma_o,4,2) AS mes,
        COUNT(*),
        SUM(CAST(REPLACE(REPLACE(REPLACE(REPLACE(Valor_total,'R$',''),' ',''),'.',''),',','.') AS REAL))
    FROM Despesas 
    WHERE LENGTH(Data_de_confirma_o)>=10 
    GROUP BY mes ORDER BY mes LIMIT 6
""").fetchall()
for r in rows:
    print(r)

    rows2 = c.execute("""
    SELECT 
        STRFTIME('%Y-%m', Data_pagamento) AS mes,
        COUNT(*),
        SUM(COALESCE(Valor_recebido, 0))
    FROM Contas_a_Receber 
    WHERE Data_pagamento IS NOT NULL AND Status = 'Recebido'
    GROUP BY mes ORDER BY mes LIMIT 6
""").fetchall()
print("--- ENTRADAS ---")
for r in rows2:
    print(r)

    rows4 = c.execute("""
    SELECT Status, COUNT(*), SUM(Valor_recebido)
    FROM Contas_a_Receber 
    WHERE Data_pagamento IS NOT NULL
    GROUP BY Status
    ORDER BY COUNT(*) DESC
""").fetchall()
print("--- STATUS ---")
for r in rows4:
    print(r)

import sqlite3
c = sqlite3.connect('analise_dados.db')
for col, tipo in [('Colaborador','TEXT'),('Gerada_por','TEXT'),('Valor_comiss_o','REAL'),('Valor_faturamento','REAL'),('Estrutura','TEXT')]:
    try:
        c.execute(f'ALTER TABLE OS ADD COLUMN {col} {tipo}')
        print(f'Adicionada: {col}')
    except Exception as e:
        print(f'Já existe ou erro: {col} - {e}')
c.commit()

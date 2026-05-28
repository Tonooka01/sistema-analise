import sqlite3
c = sqlite3.connect('analise_dados.db')

r = c.execute("SELECT ID, Cliente, Assunto FROM OS WHERE Cliente = 'ABMAEL DA SILVA SOUSA' LIMIT 3").fetchall()
print('Por nome:', r)

r2 = c.execute("SELECT ID, Cliente, Assunto FROM OS LIMIT 3").fetchall()
print('Amostra:', r2)
import sqlite3
c = sqlite3.connect('analise_dados.db')
r = c.execute("SELECT ID, Cliente, Assunto FROM OS LIMIT 5").fetchall()
for x in r: print(x)
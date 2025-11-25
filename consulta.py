import sqlite3

SQLITE_DB_PATH = "analise_dados.db" # Ou o caminho completo para o seu DB

def query_data():
    conn = None
    try:
        conn = sqlite3.connect(SQLITE_DB_PATH)
        cursor = conn.cursor()

        # Substitua 'Clientes' pelo nome real da sua tabela, se for diferente
        cursor.execute("SELECT * FROM Clientes LIMIT 5;") 
        rows = cursor.fetchall()

        # Imprime o cabeçalho das colunas
        column_names = [description[0] for description in cursor.description]
        print("Colunas:", column_names)

        # Imprime as linhas
        for row in rows:
            print(row)

    except sqlite3.Error as e:
        print(f"Erro ao consultar o banco de dados: {e}")
    finally:
        if conn:
            conn.close()

query_data()
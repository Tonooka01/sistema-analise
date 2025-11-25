import sqlite3
import os

DATABASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'analise_dados.db')

def check_date_formats_in_db():
    conn = None
    try:
        conn = sqlite3.connect(DATABASE)
        cursor = conn.cursor()

        # Verifica a tabela Contratos
        print("\n--- Verificando 'Contratos' ---")
        try:
            cursor.execute("SELECT Data_cadastro_sistema FROM Contratos LIMIT 5;")
            rows = cursor.fetchall()
            if rows:
                print("Primeiros 5 valores de 'Data_cadastro_sistema' em Contratos:")
                for row in rows:
                    print(row[0])
            else:
                print("Tabela 'Contratos' vazia ou 'Data_cadastro_sistema' não encontrada.")
        except sqlite3.OperationalError as e:
            print(f"Erro ao acessar a tabela 'Contratos' ou coluna 'Data_cadastro_sistema': {e}")

        # Verifica a tabela Contas_a_Receber
        print("\n--- Verificando 'Contas_a_Receber' ---")
        try:
            cursor.execute("SELECT Emissao FROM Contas_a_Receber LIMIT 5;")
            rows = cursor.fetchall()
            if rows:
                print("Primeiros 5 valores de 'Emissao' em Contas_a_Receber:")
                for row in rows:
                    print(row[0])
            else:
                print("Tabela 'Contas_a_Receber' vazia ou 'Emissao' não encontrada.")
        except sqlite3.OperationalError as e:
            print(f"Erro ao acessar a tabela 'Contas_a_Receber' ou coluna 'Emissao': {e}")
        
        # Verifica a tabela Atendimentos
        print("\n--- Verificando 'Atendimentos' ---")
        try:
            cursor.execute("SELECT Criado_em FROM Atendimentos LIMIT 5;")
            rows = cursor.fetchall()
            if rows:
                print("Primeiros 5 valores de 'Criado_em' em Atendimentos:")
                for row in rows:
                    print(row[0])
            else:
                print("Tabela 'Atendimentos' vazia ou 'Criado_em' não encontrada.")
        except sqlite3.OperationalError as e:
            print(f"Erro ao acessar a tabela 'Atendimentos' ou coluna 'Criado_em': {e}")

        # Verifica a tabela OS
        print("\n--- Verificando 'OS' ---")
        try:
            cursor.execute("SELECT Abertura FROM OS LIMIT 5;")
            rows = cursor.fetchall()
            if rows:
                print("Primeiros 5 valores de 'Abertura' em OS:")
                for row in rows:
                    print(row[0])
            else:
                print("Tabela 'OS' vazia ou 'Abertura' não encontrada.")
        except sqlite3.OperationalError as e:
            print(f"Erro ao acessar a tabela 'OS' ou coluna 'Abertura': {e}")

    except sqlite3.Error as e:
        print(f"Erro no banco de dados: {e}")
    finally:
        if conn:
            conn.close()

if __name__ == '__main__':
    check_date_formats_in_db()

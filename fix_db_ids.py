import sqlite3
import os

DATABASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'analise_dados.db')

def fix_ids():
    print(f"Conectando ao banco: {DATABASE}")
    conn = sqlite3.connect(DATABASE)
    cursor = conn.cursor()
    
    try:
        # 1. Limpar IDs na tabela Contratos
        print("Limpando tabela Contratos...")
        # Remove .0 de IDs que foram salvos como texto "12345.0"
        cursor.execute("UPDATE Contratos SET ID = REPLACE(ID, '.0', '') WHERE ID LIKE '%.0'")
        # Garante que não há espaços em branco
        cursor.execute("UPDATE Contratos SET ID = TRIM(ID)")
        print("Contratos limpos.")

        # 2. Limpar IDs na tabela Contas_a_Receber
        print("Limpando tabela Contas_a_Receber...")
        # Remove .0
        cursor.execute("UPDATE Contas_a_Receber SET ID_Contrato_Recorrente = REPLACE(ID_Contrato_Recorrente, '.0', '') WHERE ID_Contrato_Recorrente LIKE '%.0'")
        # Remove espaços
        cursor.execute("UPDATE Contas_a_Receber SET ID_Contrato_Recorrente = TRIM(ID_Contrato_Recorrente)")
        print("Contas_a_Receber limpas.")

        conn.commit()
        print("Banco de dados atualizado com sucesso! Os IDs agora devem bater corretamente.")
        
    except Exception as e:
        print(f"Erro durante a limpeza: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    fix_ids()
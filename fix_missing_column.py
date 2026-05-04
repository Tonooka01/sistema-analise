import sqlite3
import os

def fix_missing_columns():
    print("--- Iniciando Correção de Colunas Faltantes ---")
    
    # Identificar banco de dados
    db_files = [f for f in os.listdir('.') if f.endswith('.db') or f.endswith('.sqlite')]
    if not db_files:
        print("❌ ERRO: Nenhum arquivo .db encontrado.")
        return
    
    db_file = db_files[0]
    print(f"📂 Banco alvo: {db_file}")

    conn = sqlite3.connect(db_file)
    cursor = conn.cursor()

    try:
        # --- CORREÇÃO DA TABELA CLIENTES ---
        print("\n🔧 Verificando tabela 'Clientes'...")
        cursor.execute("PRAGMA table_info(Clientes)")
        columns = [col[1] for col in cursor.fetchall()]

        if 'Cliente' in columns:
            print("   ✅ A coluna 'Cliente' já existe na tabela Clientes.")
        else:
            print("   ⚠️  Coluna 'Cliente' NÃO existe. Criando...")
            
            # Verifica qual coluna usar como fonte (Raz_o_social ou Nome)
            source_col = None
            if 'Raz_o_social' in columns:
                source_col = 'Raz_o_social'
            elif 'Nome' in columns:
                source_col = 'Nome'
            
            if source_col:
                try:
                    # 1. Cria a coluna vazia
                    cursor.execute("ALTER TABLE Clientes ADD COLUMN Cliente TEXT")
                    print("      -> Coluna criada.")
                    
                    # 2. Copia os dados da fonte para a nova coluna
                    print(f"      -> Copiando dados de '{source_col}' para 'Cliente'...")
                    cursor.execute(f"UPDATE Clientes SET Cliente = {source_col}")
                    
                    conn.commit()
                    print("   ✅ Sucesso! Coluna 'Cliente' restaurada e preenchida.")
                except Exception as e:
                    print(f"   ❌ Erro ao tentar criar coluna: {e}")
            else:
                print("   ❌ Não foi possível corrigir: Não encontrei 'Raz_o_social' nem 'Nome' para copiar.")

        # --- CORREÇÃO DA TABELA USERS (Opcional, mas comum dar erro) ---
        # Às vezes Users precisa de 'name' e só tem 'username'
        
    except Exception as e:
        print(f"❌ Erro geral: {e}")
    finally:
        conn.close()
        print("\n🏁 Processo finalizado.")

if __name__ == "__main__":
    fix_missing_columns()
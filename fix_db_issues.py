import sqlite3
import os

def fix_database():
    print("--- Iniciando Diagnóstico do Banco de Dados ---")
    
    # Tentar identificar o banco de dados na pasta atual
    db_files = [f for f in os.listdir('.') if f.endswith('.db') or f.endswith('.sqlite')]
    
    if not db_files:
        print("❌ ERRO: Nenhum arquivo .db ou .sqlite encontrado nesta pasta.")
        print("Certifique-se de salvar este script na mesma pasta do banco de dados (ex: analise.db).")
        return

    # Assume o primeiro banco encontrado (geralmente é o correto em projetos flask simples)
    db_file = db_files[0]
    print(f"📂 Banco de dados encontrado: {db_file}")

    try:
        conn = sqlite3.connect(db_file)
        cursor = conn.cursor()
        
        # Listar todas as tabelas do banco
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
        tables = cursor.fetchall()
        
        changes_made = False

        for table in tables:
            table_name = table[0]
            
            # Pula tabelas internas do SQLite
            if table_name.startswith('sqlite_'):
                continue

            # Obter informações das colunas
            # PRAGMA table_info retorna tuplas com metadados da coluna
            cursor.execute(f"PRAGMA table_info('{table_name}')")
            columns = cursor.fetchall()
            
            # Extrai apenas os nomes das colunas
            col_names = [col[1] for col in columns]
            
            print(f"\n📋 Verificando tabela: '{table_name}'")
            
            # Verifica se a coluna 'Cliente' existe (exatamente)
            if 'Cliente' in col_names:
                print("   ✅ Coluna 'Cliente' encontrada corretamente.")
                
                # Verifica se existem duplicatas confusas (ex: 'Cliente' e 'cliente')
                duplicates = [c for c in col_names if c.lower() == 'cliente' and c != 'Cliente']
                if duplicates:
                    print(f"   ⚠️  ALERTA: Existem colunas duplicadas/similares que podem confundir: {duplicates}")
            else:
                print("   ❌ Coluna 'Cliente' NÃO encontrada exata.")
                
                # Procura por variações com espaços ou case diferente
                found_variation = False
                for col_name in col_names:
                    # Limpa espaços e compara
                    if col_name.strip().lower() == 'cliente':
                        found_variation = True
                        print(f"   ⚠️  Problema encontrado: A coluna existe como '{col_name}' (aspas indicam o valor real).")
                        print(f"       -> O erro ocorre porque o Python busca 'Cliente' mas o banco tem '{col_name}'.")
                        
                        try:
                            print(f"       🔨 Tentando renomear '{col_name}' para 'Cliente'...")
                            # Comando para renomear a coluna
                            cursor.execute(f'ALTER TABLE "{table_name}" RENAME COLUMN "{col_name}" TO "Cliente"')
                            print("       ✅ Sucesso! Coluna corrigida.")
                            changes_made = True
                        except Exception as e:
                            print(f"       ❌ Falha ao tentar corrigir automaticamente: {e}")
                            print("          Tente recriar a tabela ou renomear manualmente via DB Browser.")
                
                if not found_variation:
                    print("       ℹ️  Nenhuma variação de 'Cliente' foi encontrada nesta tabela.")
                    # Debug: Mostra colunas existentes para ajudar a identificar
                    if len(col_names) > 0:
                        print(f"       Colunas existentes: {col_names}")

        if changes_made:
            conn.commit()
            print("\n✨ Alterações salvas com sucesso! Tente rodar o sistema novamente.")
        else:
            print("\n🏁 Diagnóstico finalizado. Nenhuma alteração automática foi necessária ou possível.")
            
    except Exception as e:
        print(f"\n❌ Erro crítico ao acessar o banco: {e}")
    finally:
        if 'conn' in locals():
            conn.close()

if __name__ == "__main__":
    fix_database()
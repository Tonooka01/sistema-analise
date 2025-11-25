import pandas as pd
import sqlite3
import os
import re

# AJUSTE AQUI: Aponta para a subpasta 'Tabelas' dentro do diretório do script
UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'Tabelas') 
DATABASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'analise_dados.db')


def get_db_connection():
    """Conecta ao banco de dados SQLite."""
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row # Permite acesso às colunas por nome
    return conn

def sanitize_column_name(col_name):
    """Sanitiza nomes de colunas para serem compatíveis com SQLite."""
    # Remove caracteres especiais e espaços, substituindo por underscores
    sanitized = re.sub(r'[^a-zA-Z0-9_]', '_', col_name)
    sanitized = sanitized.replace('__', '_').strip('_') # Remove underscores duplos e no início/fim
    return sanitized

def upload_data_to_sqlite(file_path):
    """
    Processa um arquivo CSV/TXT e insere seus dados em uma tabela SQLite.
    Realiza saneamento e conversão de tipos para colunas específicas.
    """
    file_name = os.path.basename(file_path)
    if file_name.endswith('.csv'):
        delimiter = ';' 
    elif file_name.endswith('.txt'):
        delimiter = '\t' 
    else:
        print(f"Formato de arquivo não suportado: {file_name}. Use .csv ou .txt")
        return

    try:
        df = pd.read_csv(file_path, delimiter=delimiter, encoding='utf-8', on_bad_lines='skip', low_memory=False)
    except UnicodeDecodeError:
        df = pd.read_csv(file_path, delimiter=delimiter, encoding='latin1', on_bad_lines='skip', low_memory=False)
    except Exception as e:
        print(f"Erro ao ler o arquivo {file_name}: {e}")
        return

    original_columns = list(df.columns) # Salva os nomes originais
    df.columns = [sanitize_column_name(col) for col in original_columns]
    sanitized_columns = list(df.columns) # Salva os nomes sanitizados
    
    table_name = os.path.splitext(file_name)[0]
    table_name = sanitize_column_name(table_name)
    
    conn = get_db_connection()
    try:
        print(f"Processando dados da tabela '{table_name}'...")
        
        # Super Diagnóstico para os nomes das colunas
        if table_name in ['Contratos', 'Contratos_Negativacao', 'Contas_a_Receber']: # Adicionado Contas_a_Receber
            print(f"--- DIAGNÓSTICO PARA '{file_name}' ---")
            print(f"Colunas ORIGINAIS encontradas: {list(original_columns)}")
            print(f"Colunas SANITIZADAS (como o script as vê): {list(df.columns)}")
            print("-------------------------------------------")

        # Adiciona uma verificação específica para renomear a coluna após a sanitização
        if table_name == 'Contas_a_Receber' and 'Emiss_o' in df.columns:
            df.rename(columns={'Emiss_o': 'Emissao'}, inplace=True)
            print("Coluna 'Emiss_o' renomeada para 'Emissao'.")
            # Atualiza a lista de colunas sanitizadas se a renomeação ocorrer
            sanitized_columns = list(df.columns)

        # --- INÍCIO DA CORREÇÃO (LÓGICA MAIS ROBUSTA) ---
        
        # Mapeamento de chaves "limpas" (sem espaços, sem underscores, minúsculas)
        DATE_COLUMNS_MAP_CLEANED = {
            'Contas_a_Receber': ['vencimento', 'emissao', 'datapagamento', 'datacredito', 'databaixa', 'datacancelamento', 'validadedescontocondicional'],
            'Atendimentos': ['criadoem', 'ultimaalteracao'],
            'OS': ['abertura', 'fechamento'],
            
            # --- CORREÇÃO AQUI ---
            # As chaves agora correspondem ao resultado da sanitização:
            # "Data ativação" -> Data_ativa_o -> "dataativao"
            # "Data negativação" -> Data_negativa_o -> "datanegativao"
            'Contratos': ['datacadastrosistema', 'datacancelamento', 'dataativao'], 
            'Logins': ['dataehoradologin', 'ultimaconexãofinal'], # (ultimaconexãofinal não tem 'ç' ou 'ã')
            'Clientes': ['datacadastro'],
            'Contratos_Negativacao': ['datainclusao', 'datanegativao', 'dataativao'],
            # --- FIM DA CORREÇÃO ---

            'Clientes_Negativacao': ['datainclusao', 'dataexclusao'],
            'Equipamento': ['data'],
        }
        
        VALUE_COLUMNS_MAP_CLEANED = {
            'Contas_a_Receber': ['valor', 'valorbaixado', 'valoraberto', 'valorrecebido', 'valorcancelado', 'descontocondicionalvalor'],
            'Contratos_Negativacao': ['valordadívida'], # (valordadívida não tem 'í')
        }

        date_cols_to_convert = DATE_COLUMNS_MAP_CLEANED.get(table_name, [])
        value_cols_to_convert = VALUE_COLUMNS_MAP_CLEANED.get(table_name, [])

        # Itera sobre as colunas sanitizadas (ex: "Valor_recebido")
        for col_name_sanitized in sanitized_columns:
            # Cria a chave de busca (ex: "valorrecebido")
            col_key = col_name_sanitized.lower().replace('_', '').replace(' ', '')

            # Verifica se é uma coluna de data
            if col_key in date_cols_to_convert:
                print(f"Convertendo coluna de data: '{col_name_sanitized}' (chave: '{col_key}')")
                temp_series = df[col_name_sanitized].astype(str).str.strip().replace({'': pd.NA, 'None': pd.NA, 'NaT': pd.NA, 'nan': pd.NA, 'null': pd.NA}).fillna(pd.NA)
                
                parsed_dates = pd.to_datetime(temp_series, format='%d/%m/%Y %H:%M:%S', errors='coerce')
                
                mask_na = parsed_dates.isna()
                if mask_na.any():
                    parsed_dates[mask_na] = pd.to_datetime(temp_series[mask_na], format='%d/%m/%Y', errors='coerce')
                
                mask_na = parsed_dates.isna()
                if mask_na.any():
                    parsed_dates[mask_na] = pd.to_datetime(temp_series[mask_na], format='%Y-%m-%d %H:%M:%S', errors='coerce')

                mask_na = parsed_dates.isna()
                if mask_na.any():
                    parsed_dates[mask_na] = pd.to_datetime(temp_series[mask_na], format='%Y-%m-%d', errors='coerce')

                formatted_dates = parsed_dates.dt.strftime('%Y-%m-%d %H:%M:%S') 
                
                df[col_name_sanitized] = formatted_dates.where(formatted_dates.notna(), None)
                
                total_rows = len(df)
                parsed_count = df[col_name_sanitized].notna().sum()
                null_count = total_rows - parsed_count
                
                print(f"Coluna '{col_name_sanitized}': {parsed_count} de {total_rows} datas foram parseadas com sucesso. ({null_count} nulas)")
                if null_count == total_rows and total_rows > 0:
                    print(f"!!! AVISO: Nenhuma data foi reconhecida na coluna '{col_key}' do arquivo '{file_name}'. Verifique o formato das datas no arquivo original. !!!")

            # Verifica se é uma coluna de valor
            elif col_key in value_cols_to_convert:
                print(f"Convertendo coluna de valor: '{col_name_sanitized}' (chave: '{col_key}')")
                
                # --- INÍCIO DA CORREÇÃO ROBUSTA ---
                # Clona a série original (como string) para aplicar lógicas diferentes
                temp_series_str = df[col_name_sanitized].astype(str).str.replace('R$', '', regex=False).str.strip()
                
                series_brl = temp_series_str.copy()
                series_us_numeric = temp_series_str.copy()

                # Lógica BRL: ("1.234,56") -> Remove pontos, troca vírgula
                series_brl = series_brl.str.replace('.', '', regex=False)
                series_brl = series_brl.str.replace(',', '.', regex=False)
                
                # Lógica US/Numérica: ("1234.56") -> Não faz nada
                
                # Decide qual usar: se o original tinha vírgula, usa a lógica BRL.
                # Se não tinha vírgula, usa a lógica US/Numérica.
                original_has_comma = temp_series_str.str.contains(',', regex=False)
                
                final_series = series_brl.where(original_has_comma, series_us_numeric)
                
                # Trata strings vazias ou "None" como 0.0
                final_series = final_series.replace({'': '0.0', 'None': '0.0', 'nan': '0.0', 'null': '0.0', 'NaT': '0.0'}, regex=False)

                df[col_name_sanitized] = pd.to_numeric(final_series, errors='coerce').fillna(0.0)
                # --- FIM DA CORREÇÃO ROBUSTA ---

        # --- FIM DA CORREÇÃO ROBUSTA ---

        # --- Limpeza específica para colunas de status na tabela 'Contratos' ---
        if table_name == 'Contratos':
            status_columns_to_clean = ['Status_contrato', 'Status_acesso']
            for col in status_columns_to_clean:
                if col in df.columns:
                    df[col] = df[col].astype(str).str.strip().str.title().fillna('Não Definido')
                    df[col] = df[col].replace({'Nan': 'Não Definido', 'None': 'Não Definido'})


        df.to_sql(table_name, conn, if_exists='replace', index=False)
        print(f"Dados do arquivo '{file_name}' inseridos/atualizados na tabela '{table_name}' com sucesso.")

    except sqlite3.Error as e:
        print(f"Erro no banco de dados SQLite para '{file_name}': {e}")
    except Exception as e:
        print(f"Erro inesperado ao processar '{file_name}': {e}")
    finally:
        if conn:
            conn.close()

if __name__ == '__main__':
    all_files_in_folder = os.listdir(UPLOAD_FOLDER)
    files_to_upload = []

    for item in all_files_in_folder:
        if os.path.isfile(os.path.join(UPLOAD_FOLDER, item)) and (item.endswith('.csv') or item.endswith('.txt')):
            files_to_upload.append(os.path.join(UPLOAD_FOLDER, item))

    if not files_to_upload:
        print(f"Nenhum arquivo .csv ou .txt encontrado na pasta: {UPLOAD_FOLDER}")
    else:
        for f_path in files_to_upload:
            print(f"Iniciando upload para: {os.path.basename(f_path)}")
            upload_data_to_sqlite(f_path)

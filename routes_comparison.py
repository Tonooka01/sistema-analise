import sqlite3
import os
import re
from datetime import datetime, timedelta, date
from flask import Blueprint, jsonify, request, current_app
import pandas as pd
import pdfplumber # Biblioteca para ler PDF real

comparison_bp = Blueprint('comparison_bp', __name__)

def get_db():
    return current_app.config['GET_DB_CONNECTION']()

# Lista simplificada de feriados nacionais (pode ser expandida)
HOLIDAYS = ['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '12-25']

def is_holiday(date_obj):
    return date_obj.strftime('%m-%d') in HOLIDAYS

def is_weekend(date_obj):
    return date_obj.weekday() >= 5 # 5 = Sábado, 6 = Domingo

def parse_currency(value_str):
    """
    Converte string '15.662,16' para float 15662.16.
    Trata casos onde o PDF pode ter formatação mista.
    """
    if not value_str: return 0.0
    # Remove pontos de milhar e substitui vírgula decimal por ponto
    clean_str = value_str.replace('.', '').replace(',', '.')
    try:
        return float(clean_str)
    except ValueError:
        return 0.0

@comparison_bp.route('/daily', methods=['GET'])
def api_daily_comparison():
    conn = get_db()
    try:
        # Data de referência (Hoje) - Padrão para o dia atual do sistema se não informado
        ref_date_str = request.args.get('date', datetime.now().strftime('%Y-%m-%d'))
        ref_date = datetime.strptime(ref_date_str, '%Y-%m-%d').date()
        
        curr_month = ref_date.month
        curr_year = ref_date.year
        
        # Mês Anterior (Data base para cálculo: último dia do mês anterior para pegar mês/ano corretos)
        prev_month_date = ref_date.replace(day=1) - timedelta(days=1)
        prev_month = prev_month_date.month
        prev_year = prev_month_date.year

        # Estrutura de resposta
        result = {
            "liquido": [],
            "baixa": [],
            "info": {
                "curr_label": ref_date.strftime('%b/%Y'),
                "prev_label": prev_month_date.strftime('%b/%Y'),
                "today_day": ref_date.day
            }
        }

        # Busca dados reais do banco para os dois meses em questão
        try:
            query = """
                SELECT Data, Tipo, Valor 
                FROM Recebimentos_Diarios 
                WHERE (STRFTIME('%m', Data) = ? AND STRFTIME('%Y', Data) = ?)
                   OR (STRFTIME('%m', Data) = ? AND STRFTIME('%Y', Data) = ?)
            """
            # Parâmetros: Mês Atual, Ano Atual, Mês Anterior, Ano Anterior
            params = (f'{curr_month:02d}', str(curr_year), f'{prev_month:02d}', str(prev_year))
            rows = conn.execute(query, params).fetchall()
            df = pd.DataFrame([dict(row) for row in rows])
        except sqlite3.Error:
            # Se a tabela ainda não existir (antes do primeiro upload), cria DF vazio
            df = pd.DataFrame(columns=['Data', 'Tipo', 'Valor'])

        # Processamento Dia a Dia (1 a 31)
        for day in range(1, 32):
            day_data = {
                "day": day,
                "is_weekend": False,
                "is_holiday": False,
                "is_today": (day == ref_date.day),
                # Valores
                "liq_prev": 0.0, "liq_curr": 0.0, "liq_diff": 0.0,
                "bai_prev": 0.0, "bai_curr": 0.0, "bai_diff": 0.0
            }

            try:
                # 1. Tenta construir a data do Mês ATUAL (para saber se é FDS/Feriado)
                try:
                    curr_dt = date(curr_year, curr_month, day)
                    day_data["is_weekend"] = is_weekend(curr_dt)
                    day_data["is_holiday"] = is_holiday(curr_dt)
                    curr_date_str = curr_dt.strftime('%Y-%m-%d')
                except ValueError:
                    curr_date_str = None # Dia inválido (ex: 31 de Nov)

                # 2. Tenta construir a data do Mês ANTERIOR
                try:
                    prev_dt = date(prev_year, prev_month, day)
                    prev_date_str = prev_dt.strftime('%Y-%m-%d')
                except ValueError:
                    prev_date_str = None

                # 3. Busca valores no DataFrame se a tabela não estiver vazia
                if not df.empty:
                    # Valores Mês Atual
                    if curr_date_str:
                        curr_liq_rows = df[(df['Data'] == curr_date_str) & (df['Tipo'] == 'Liquido')]
                        curr_bai_rows = df[(df['Data'] == curr_date_str) & (df['Tipo'] == 'Baixa')]
                        if not curr_liq_rows.empty: day_data["liq_curr"] = curr_liq_rows['Valor'].sum()
                        if not curr_bai_rows.empty: day_data["bai_curr"] = curr_bai_rows['Valor'].sum()

                    # Valores Mês Anterior
                    if prev_date_str:
                        prev_liq_rows = df[(df['Data'] == prev_date_str) & (df['Tipo'] == 'Liquido')]
                        prev_bai_rows = df[(df['Data'] == prev_date_str) & (df['Tipo'] == 'Baixa')]
                        if not prev_liq_rows.empty: day_data["liq_prev"] = prev_liq_rows['Valor'].sum()
                        if not prev_bai_rows.empty: day_data["bai_prev"] = prev_bai_rows['Valor'].sum()

                # 4. Calcula Diferenças
                day_data["liq_diff"] = day_data["liq_curr"] - day_data["liq_prev"]
                day_data["bai_diff"] = day_data["bai_curr"] - day_data["bai_prev"]

            except Exception as e:
                # Em caso de erro num dia específico, segue para o próximo mas loga (opcional)
                pass

            result["liquido"].append(day_data)
            # Nota: O frontend usa o array 'liquido' para renderizar ambas as tabelas, 
            # pois o objeto 'day_data' contém tanto chaves 'liq_' quanto 'bai_'.

        return jsonify(result)

    except Exception as e:
        print(f"Erro no comparativo diário: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        if conn: conn.close()

@comparison_bp.route('/upload_pdf', methods=['POST'])
def api_upload_pdf():
    if 'file' not in request.files:
        return jsonify({"error": "Nenhum arquivo enviado"}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "Nome de arquivo vazio"}), 400

    conn = get_db()
    
    # Salva temporariamente para o pdfplumber ler
    temp_path = os.path.join('/tmp', file.filename) 
    if os.name == 'nt': # Windows
        temp_path = file.filename 
    
    try:
        file.save(temp_path)
    except Exception as e:
        return jsonify({"error": f"Erro ao salvar arquivo temporário: {e}"}), 500

    try:
        # Garante que a tabela existe
        conn.execute("""
            CREATE TABLE IF NOT EXISTS Recebimentos_Diarios (
                Data DATE,
                Tipo TEXT,
                Valor REAL
            )
        """)

        extracted_data = []
        months_found = set()

        # --- LÓGICA DE EXTRAÇÃO DO PDF ---
        with pdfplumber.open(temp_path) as pdf:
            for page in pdf.pages:
                text = page.extract_text()
                if not text: continue

                # Separa por linhas
                lines = text.split('\n')
                
                for line in lines:
                    # Remove aspas e espaços extras comuns em CSVs/Relatórios
                    clean_line = line.replace('"', '').replace("'", "").strip()
                    
                    # Regex para encontrar a Data no início da linha (DD/MM/YYYY)
                    match_date = re.search(r'^(\d{2}/\d{2}/\d{4})', clean_line)
                    
                    if match_date:
                        date_str = match_date.group(1)
                        
                        # Regex para encontrar valores monetários (1.234,56 ou 123,45)
                        # Ignora a data já capturada para não confundir
                        rest_of_line = clean_line[len(date_str):]
                        
                        # Busca todas as ocorrências de números formatados
                        values = re.findall(r'(\d{1,3}(?:\.\d{3})*,\d{2})', rest_of_line)
                        
                        # O layout do relatório parece ser:
                        # Data | Baixa | Acréscimo | Desconto | Desc. Add | Valor Liquido
                        # Portanto:
                        # values[0] -> Baixa
                        # values[-1] -> Valor Liquido (último da linha)
                        
                        if len(values) >= 2:
                            val_baixa_str = values[0]
                            val_liquido_str = values[-1] 
                            
                            try:
                                dt_obj = datetime.strptime(date_str, '%d/%m/%Y').date()
                                db_date_str = dt_obj.strftime('%Y-%m-%d')
                                
                                val_baixa = parse_currency(val_baixa_str)
                                val_liquido = parse_currency(val_liquido_str)
                                
                                # Adiciona à lista para inserção em lote
                                extracted_data.append((db_date_str, 'Baixa', val_baixa))
                                extracted_data.append((db_date_str, 'Liquido', val_liquido))
                                
                                # Registra o mês/ano encontrado para limpeza posterior
                                months_found.add((dt_obj.month, dt_obj.year))
                                
                            except ValueError:
                                continue

        if not extracted_data:
            return jsonify({"error": "Nenhum dado compatível encontrado no PDF. Verifique se é o relatório correto."}), 400

        # --- ATUALIZAÇÃO DO BANCO ---
        
        # 1. Limpa dados APENAS dos meses encontrados no PDF para evitar duplicidade
        # (Isso permite fazer upload de Outubro e depois de Novembro sem apagar um ao outro, se forem arquivos separados)
        for m, y in months_found:
            print(f"Limpando dados existentes para {m:02d}/{y}...")
            conn.execute("DELETE FROM Recebimentos_Diarios WHERE STRFTIME('%m', Data) = ? AND STRFTIME('%Y', Data) = ?", 
                         (f'{m:02d}', str(y)))

        # 2. Insere os novos dados extraídos
        conn.executemany("INSERT INTO Recebimentos_Diarios (Data, Tipo, Valor) VALUES (?, ?, ?)", extracted_data)
        conn.commit()

        # Remove arquivo temporário
        try:
            os.remove(temp_path)
        except: pass

        return jsonify({
            "success": True, 
            "message": f"Importação concluída! {len(extracted_data)//2} dias importados referentes a {len(months_found)} meses ({', '.join([f'{m}/{y}' for m,y in months_found])})."
        })
        
    except Exception as e:
        print(f"Erro no upload: {e}")
        return jsonify({"error": f"Erro ao processar PDF: {e}"}), 500
    finally:
        if conn: conn.close()
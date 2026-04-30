# utils_api.py
from flask import current_app

def get_db():
    """Função auxiliar para obter a conexão do banco de dados a partir do app_context."""
    return current_app.config['GET_DB_CONNECTION']()

def parse_relevance_filter(relevance_str):
    """Converte string '0-6' em min e max."""
    if not relevance_str:
        return (None, None)
    
    parts = relevance_str.split('-')
    try:
        if '+' in parts[0]:
            min_months = int(parts[0].replace('+', ''))
            max_months = None
            return (min_months, max_months)
        
        min_months = int(parts[0])
        # Suporta ranges como '25-36' corretamente
        max_months = int(parts[1]) if len(parts) > 1 else None
        return (min_months, max_months)
    except ValueError:
        return (None, None)

def add_date_range_filter(where_list, params, date_col, start_date, end_date):
    """Adiciona filtros de data SQL à lista."""
    if start_date:
        where_list.append(f"DATE({date_col}) >= ?")
        params.append(start_date)
    if end_date:
        where_list.append(f"DATE({date_col}) <= ?")
        params.append(end_date)
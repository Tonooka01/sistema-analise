txt = open('routes_analysis_churn.py', encoding='utf-8').read()

old = '''WHERE " + " AND ".join(contract_where)) if contract_where else ""

        col_v'''

if old not in txt:
    print("TRECHO NAO ENCONTRADO - arquivo ja pode estar correto ou diferente")
    import sys; sys.exit(1)

# Adiciona neg_where separado após where_contracts_sql
patch = '''WHERE " + " AND ".join(contract_where)) if contract_where else ""

        neg_where, neg_params = [], []
        if search_term:
            neg_where.append("(Cliente LIKE ? OR Cidade LIKE ?)")
            neg_params += [f"%{search_term}%", f"%{search_term}%"]
        if start_date:
            neg_where.append("DATE(Data_ativa_o) >= ?")
            neg_params.append(start_date)
        if end_date:
            neg_where.append("DATE(Data_ativa_o) <= ?")
            neg_params.append(end_date)
        neg_where.append(f"Cidade NOT IN {_EX}")
        if status_acesso and "Desativado" not in status_acesso:
            neg_where.append("1=0")
        if status_contrato and "Negativado" not in status_contrato:
            neg_where.append("1=0")
        where_neg_sql = ("WHERE " + " AND ".join(neg_where)) if neg_where else ""

        col_v'''

txt = txt.replace(old, patch)

# Troca where_contracts_sql no UNION por where_neg_sql
txt = txt.replace(
    "FROM Contratos_Negativacao {where_contracts_sql}",
    "FROM Contratos_Negativacao {where_neg_sql}"
)

# Troca params nos executes
txt = txt.replace("tuple(contract_params),", "tuple(contract_params + neg_params),")
txt = txt.replace("tuple(contract_params + final_params)", "tuple(contract_params + neg_params + final_params)")
txt = txt.replace("tuple(contract_params + final_params + [limit, offset])", "tuple(contract_params + neg_params + final_params + [limit, offset])")

open('routes_analysis_churn.py', 'w', encoding='utf-8').write(txt)
print("OK - arquivo patcheado")
print("neg_params count:", txt.count("neg_params"))
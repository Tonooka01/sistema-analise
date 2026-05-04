"""
queries/
Construtores de SQL centralizados.

Importar assim nos blueprints:
    from queries.churn_queries   import build_all_cancellations_cte
    from queries.finance_queries import build_first_late_payment_cte
    from queries.sales_queries   import build_seller_churn_queries
"""
import sys
import os

# Garante que a raiz do projeto esta no path para que utils_api seja encontrado
_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _root not in sys.path:
    sys.path.insert(0, _root)
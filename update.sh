#!/bin/bash
# update.sh — roda sempre que enviar arquivos novos para a VM
# Uso: bash update.sh

APP_DIR="/home/$USER/Analise"
SERVICE_NAME="analise"

echo "=== Reiniciando serviço ==="
sudo systemctl restart $SERVICE_NAME
sudo systemctl status $SERVICE_NAME --no-pager

echo ""
echo "✅ Atualizado! Logs em tempo real:"
echo "   sudo journalctl -u $SERVICE_NAME -f"

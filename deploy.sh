#!/bin/bash
# deploy.sh — roda uma vez na VM para configurar tudo
# Uso: bash deploy.sh

set -e

APP_DIR="/home/$USER/Analise"
SERVICE_NAME="analise"

echo "=== 1. Instalando dependências do sistema ==="
sudo apt-get update -qq
sudo apt-get install -y python3-pip python3-venv nginx

echo "=== 2. Criando ambiente virtual ==="
cd "$APP_DIR"
python3 -m venv venv
source venv/bin/activate
pip install --quiet -r requirements.txt

echo "=== 3. Gerando chave secreta (se .env não existir) ==="
if [ ! -f "$APP_DIR/.env" ]; then
    KEY=$(python3 -c "import secrets; print(secrets.token_hex(32))")
    echo "FLASK_SECRET_KEY=$KEY" > "$APP_DIR/.env"
    chmod 600 "$APP_DIR/.env"
    echo "   .env criado com chave gerada automaticamente"
else
    echo "   .env já existe, mantendo"
fi

echo "=== 4. Protegendo o banco ==="
chmod 600 "$APP_DIR/analise_dados.db" 2>/dev/null || true

echo "=== 5. Criando serviço systemd ==="
sudo tee /etc/systemd/system/$SERVICE_NAME.service > /dev/null <<EOF
[Unit]
Description=NetVale Dashboard
After=network.target

[Service]
User=$USER
WorkingDirectory=$APP_DIR
Environment="PATH=$APP_DIR/venv/bin"
EnvironmentFile=$APP_DIR/.env
ExecStart=$APP_DIR/venv/bin/gunicorn -w 4 -b 127.0.0.1:5000 --timeout 120 api_server:app
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

echo "=== 6. Configurando Nginx ==="
sudo tee /etc/nginx/sites-available/$SERVICE_NAME > /dev/null <<EOF
server {
    listen 80;
    server_name _;

    client_max_body_size 50M;

    location /static {
        alias $APP_DIR/static;
        expires 7d;
        add_header Cache-Control "public";
    }

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_read_timeout 120s;
        proxy_connect_timeout 10s;
    }
}
EOF

sudo ln -sf /etc/nginx/sites-available/$SERVICE_NAME /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl restart nginx

echo "=== 7. Iniciando serviço ==="
sudo systemctl daemon-reload
sudo systemctl enable $SERVICE_NAME
sudo systemctl restart $SERVICE_NAME

echo ""
echo "✅ Deploy concluído!"
echo "   Status: sudo systemctl status $SERVICE_NAME"
echo "   Logs:   sudo journalctl -u $SERVICE_NAME -f"
echo "   Nginx:  sudo tail -f /var/log/nginx/error.log"

#!/bin/bash
# scripts/deploy.sh — atualização da aplicação Analise (NetVale)
# Uso: ./scripts/deploy.sh
#
# Fluxo:
#   1. Lê versão atual de version.txt
#   2. Cria backup .tar.gz em versions/  (mantém 3 versões antigas)
#   3. Incrementa version.txt
#   4. git pull
#   5. pip install -r requirements.txt
#   6. sudo systemctl restart analise
#   7. Mostra topo do CHANGELOG

set -e  # para imediatamente se qualquer passo falhar

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SERVICE_NAME="analise"
VERSIONS_DIR="$APP_DIR/versions"
VERSION_FILE="$APP_DIR/version.txt"
MAX_OLD=3

# ── cores ────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✔ $*${NC}"; }
warn() { echo -e "${YELLOW}⚠ $*${NC}"; }
fail() { echo -e "${RED}✖ $*${NC}"; exit 1; }

echo ""
echo "════════════════════════════════════════════"
echo "   Deploy — NetVale Analise"
echo "════════════════════════════════════════════"

# ── 1. Versão atual ───────────────────────────────────────────────
CURRENT_VER="1.000"
if [ -f "$VERSION_FILE" ]; then
    CURRENT_VER=$(cat "$VERSION_FILE" | tr -d '[:space:]')
fi
echo ""
echo "→ Versão atual: $CURRENT_VER"

# ── 2. Backup tar.gz ─────────────────────────────────────────────
echo ""
echo "=== 1. Backup da versão $CURRENT_VER ==="
mkdir -p "$VERSIONS_DIR"
TAR_PATH="$VERSIONS_DIR/v${CURRENT_VER}.tar.gz"

cd "$APP_DIR"
tar -czf "$TAR_PATH" \
    --exclude="./.git" \
    --exclude="./__pycache__" \
    --exclude="./versions" \
    --exclude="./venv" \
    --exclude="./.venv" \
    --exclude="*.db" \
    --exclude="*.db-wal" \
    --exclude="*.db-shm" \
    --exclude="*.pyc" \
    --exclude="*.log" \
    .

ok "Backup salvo: versions/v${CURRENT_VER}.tar.gz ($(du -sh "$TAR_PATH" | cut -f1))"

# Remove versões mais antigas além do limite
cd "$VERSIONS_DIR"
OLD=$(ls -t v*.tar.gz 2>/dev/null | tail -n +$((MAX_OLD + 1)))
if [ -n "$OLD" ]; then
    echo "$OLD" | xargs rm -f
    warn "Versões antigas removidas: $(echo "$OLD" | tr '\n' ' ')"
fi
cd "$APP_DIR"

# ── 3. Incrementa versão ──────────────────────────────────────────
MAJOR=$(echo "$CURRENT_VER" | cut -d. -f1)
MINOR=$(echo "$CURRENT_VER" | cut -d. -f2)
NEXT_MINOR=$(printf "%03d" $((10#$MINOR + 1)))
NEXT_VER="${MAJOR}.${NEXT_MINOR}"
echo "$NEXT_VER" > "$VERSION_FILE"
ok "Versão incrementada: $CURRENT_VER → $NEXT_VER"

# ── 4. git pull ──────────────────────────────────────────────────
echo ""
echo "=== 2. Atualizando código (git pull) ==="
git pull || fail "git pull falhou — backup disponível em versions/v${CURRENT_VER}.tar.gz"
ok "Código atualizado"

# ── 5. Dependências ──────────────────────────────────────────────
echo ""
echo "=== 3. Instalando dependências ==="
if [ -f "$APP_DIR/venv/bin/pip" ]; then
    "$APP_DIR/venv/bin/pip" install -q -r requirements.txt
    ok "Dependências OK (venv)"
elif command -v pip3 &>/dev/null; then
    pip3 install -q -r requirements.txt
    ok "Dependências OK (pip3)"
else
    warn "pip não encontrado — pulando"
fi

# ── 6. Reinicia serviço ──────────────────────────────────────────
echo ""
echo "=== 4. Reiniciando serviço ==="
sudo systemctl restart "$SERVICE_NAME"
sleep 1
if systemctl is-active --quiet "$SERVICE_NAME"; then
    ok "Serviço '$SERVICE_NAME' rodando"
else
    fail "Serviço '$SERVICE_NAME' falhou ao iniciar — verifique: sudo journalctl -u $SERVICE_NAME -n 50"
fi

# ── 7. Resultado ─────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════"
ok "Deploy concluído! Versão: $NEXT_VER"
echo "════════════════════════════════════════════"

if [ -f "$APP_DIR/CHANGELOG.md" ]; then
    echo ""
    echo "--- CHANGELOG (últimas entradas) ---"
    head -40 "$APP_DIR/CHANGELOG.md"
    echo "---"
fi

echo ""
echo "  Logs em tempo real:"
echo "  sudo journalctl -u $SERVICE_NAME -f"
echo ""

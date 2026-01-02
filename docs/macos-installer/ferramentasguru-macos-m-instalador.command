#!/bin/bash
# ============================================
# Instalador/Atualizador Ferramentas Guru - macOS
# ============================================

# Cores azuis
BLUE='\033[0;34m'
LIGHT_BLUE='\033[1;34m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
NC='\033[0m'

# Configurações
SERVER_URL="https://membros.ferramentasguru.com/updates"
APP_NAME="Ferramentas Guru.app"
INSTALLED_APP="/Applications/$APP_NAME"

# Função de animação
loading_animation() {
    local message=$1
    local duration=$2
    local chars="⣾⣽⣻⢿⡿⣟⣯⣷"
    local end=$((SECONDS + duration))
    
    while [ $SECONDS -lt $end ]; do
        for (( i=0; i<${#chars}; i++ )); do
            printf "\r  ${CYAN}${chars:$i:1}${NC} ${WHITE}${message}${NC}"
            sleep 0.1
        done
    done
    printf "\r  ${CYAN}✓${NC} ${WHITE}${message}${NC}\n"
}

# Função para comparar versões
version_gt() {
    test "$(printf '%s\n' "$@" | sort -V | head -n 1)" != "$1"
}

clear

# Banner
echo ""
echo -e "${LIGHT_BLUE}    ╔═══════════════════════════════════════════════════════╗${NC}"
echo -e "${LIGHT_BLUE}    ║${NC}                                                       ${LIGHT_BLUE}║${NC}"
echo -e "${LIGHT_BLUE}    ║${NC}        ${WHITE}🔧  F E R R A M E N T A S   G U R U${NC}             ${LIGHT_BLUE}║${NC}"
echo -e "${LIGHT_BLUE}    ║${NC}                                                       ${LIGHT_BLUE}║${NC}"
echo -e "${LIGHT_BLUE}    ║${NC}        ${CYAN}Browser Anti-Detecção Multilogin${NC}               ${LIGHT_BLUE}║${NC}"
echo -e "${LIGHT_BLUE}    ║${NC}                                                       ${LIGHT_BLUE}║${NC}"
echo -e "${LIGHT_BLUE}    ╚═══════════════════════════════════════════════════════╝${NC}"
echo ""

sleep 1

# Verificar versão instalada
INSTALLED_VERSION="0.0.0"
if [ -d "$INSTALLED_APP" ]; then
    PLIST_FILE="$INSTALLED_APP/Contents/Info.plist"
    if [ -f "$PLIST_FILE" ]; then
        INSTALLED_VERSION=$(/usr/libexec/PlistBuddy -c "Print CFBundleShortVersionString" "$PLIST_FILE" 2>/dev/null || echo "0.0.0")
    fi
    echo -e "  ${CYAN}▸${NC} Versão instalada: ${WHITE}$INSTALLED_VERSION${NC}"
else
    echo -e "  ${CYAN}▸${NC} Nenhuma instalação encontrada"
fi

sleep 0.5

# Buscar versão mais recente do servidor
echo -e "  ${CYAN}▸${NC} Verificando atualizações..."

LATEST_JSON=$(curl -s "$SERVER_URL/latest.json" 2>/dev/null)
SERVER_VERSION=$(echo "$LATEST_JSON" | grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)

if [ -z "$SERVER_VERSION" ]; then
    echo -e "  ${CYAN}!${NC} Não foi possível verificar atualizações"
    SERVER_VERSION="1.0.4"
fi

echo -e "  ${CYAN}▸${NC} Versão disponível: ${WHITE}$SERVER_VERSION${NC}"
echo ""

sleep 0.5

# Comparar versões
if [ "$INSTALLED_VERSION" = "$SERVER_VERSION" ]; then
    echo -e "${CYAN}    ╔═══════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}    ║${NC}                                                       ${CYAN}║${NC}"
    echo -e "${CYAN}    ║${NC}         ${WHITE}✅  VOCÊ JÁ TEM A VERSÃO MAIS RECENTE!${NC}         ${CYAN}║${NC}"
    echo -e "${CYAN}    ║${NC}                                                       ${CYAN}║${NC}"
    echo -e "${CYAN}    ╚═══════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "  ${CYAN}🚀${NC} Abrindo Ferramentas Guru..."
    open "$INSTALLED_APP"
    echo ""
    echo -e "  ${CYAN}Você pode fechar esta janela.${NC}"
    exit 0
fi

if version_gt "$INSTALLED_VERSION" "$SERVER_VERSION"; then
    echo -e "  ${CYAN}!${NC} Sua versão é mais recente que a do servidor"
    echo -e "  ${CYAN}🚀${NC} Abrindo Ferramentas Guru..."
    open "$INSTALLED_APP"
    exit 0
fi

# Precisa atualizar ou instalar
if [ "$INSTALLED_VERSION" = "0.0.0" ]; then
    echo -e "  ${WHITE}Iniciando instalação...${NC}"
else
    echo -e "  ${WHITE}Atualizando de $INSTALLED_VERSION para $SERVER_VERSION...${NC}"
fi
echo ""

# Detectar arquitetura
ARCH=$(uname -m)
if [ "$ARCH" = "arm64" ]; then
    DOWNLOAD_URL="$SERVER_URL/Ferramentas-Guru-$SERVER_VERSION-mac.zip"
else
    DOWNLOAD_URL="$SERVER_URL/Ferramentas-Guru-$SERVER_VERSION-mac-intel.zip"
fi

TEMP_DIR="$HOME/Downloads/FerramentasGuru_temp"
ZIP_FILE="$TEMP_DIR/ferramentas-guru.zip"

mkdir -p "$TEMP_DIR" 2>/dev/null

# Download
echo -e "  ${CYAN}▸${NC} ${WHITE}Baixando Ferramentas Guru $SERVER_VERSION...${NC}"
echo ""
curl -L -o "$ZIP_FILE" "$DOWNLOAD_URL" --progress-bar 2>&1

if [ ! -f "$ZIP_FILE" ]; then
    echo ""
    echo -e "  ${CYAN}✗${NC} Erro ao baixar. Verifique sua conexão."
    read -p "  Pressione Enter para fechar..."
    exit 1
fi

echo ""
sleep 0.5

# Descompactando
loading_animation "Preparando arquivos..." 2
cd "$TEMP_DIR"
unzip -q -o "$ZIP_FILE" 2>/dev/null

APP_PATH=$(find "$TEMP_DIR" -name "*.app" -type d | head -1)

if [ -z "$APP_PATH" ]; then
    echo -e "  ${CYAN}✗${NC} Erro na instalação."
    read -p "  Pressione Enter para fechar..."
    exit 1
fi

# Remover quarentena
xattr -cr "$APP_PATH" 2>/dev/null

sleep 0.5

# Instalando
loading_animation "Instalando..." 2

# Fechar app se estiver rodando
pkill -f "Ferramentas Guru" 2>/dev/null
sleep 1

# Remover versão anterior
if [ -d "$INSTALLED_APP" ]; then
    rm -rf "$INSTALLED_APP" 2>/dev/null
fi

mv "$APP_PATH" "/Applications/" 2>/dev/null

sleep 0.5

# Limpando
loading_animation "Finalizando..." 1
rm -rf "$TEMP_DIR" 2>/dev/null

echo ""

# Sucesso
if [ "$INSTALLED_VERSION" = "0.0.0" ]; then
    MSG="INSTALAÇÃO CONCLUÍDA!"
else
    MSG="ATUALIZAÇÃO CONCLUÍDA!"
fi

echo -e "${CYAN}    ╔═══════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}    ║${NC}                                                       ${CYAN}║${NC}"
echo -e "${CYAN}    ║${NC}         ${WHITE}✅  $MSG${NC}                     ${CYAN}║${NC}"
echo -e "${CYAN}    ║${NC}                                                       ${CYAN}║${NC}"
echo -e "${CYAN}    ║${NC}         Versão: ${WHITE}$SERVER_VERSION${NC}                               ${CYAN}║${NC}"
echo -e "${CYAN}    ║${NC}                                                       ${CYAN}║${NC}"
echo -e "${CYAN}    ╚═══════════════════════════════════════════════════════╝${NC}"
echo ""

sleep 1

echo -e "  ${CYAN}🚀${NC} Abrindo Ferramentas Guru..."
open "/Applications/$APP_NAME"

echo ""
echo -e "  ${CYAN}Você pode fechar esta janela.${NC}"
echo ""

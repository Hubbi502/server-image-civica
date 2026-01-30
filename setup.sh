#!/bin/bash

# ============================================================================
# CIVICA Storage Server - Setup Script
# ============================================================================
# Jalankan script ini di server Ubuntu 20.04+
# Usage: chmod +x setup.sh && sudo ./setup.sh
# ============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DOMAIN="storage.sangkaraprasetya.site"
APP_DIR="/var/www/storage-api"
NODE_VERSION="18"

echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}   CIVICA Storage Server Setup Script${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Error: Please run as root (sudo ./setup.sh)${NC}"
    exit 1
fi

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# ============================================================================
# STEP 1: Update System
# ============================================================================
echo -e "${YELLOW}[1/8] Updating system...${NC}"
apt update && apt upgrade -y
echo -e "${GREEN}✓ System updated${NC}"

# ============================================================================
# STEP 2: Install Node.js
# ============================================================================
echo -e "${YELLOW}[2/8] Installing Node.js ${NODE_VERSION}...${NC}"
if command_exists node; then
    echo "Node.js already installed: $(node -v)"
else
    curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
    apt install -y nodejs
fi
echo -e "${GREEN}✓ Node.js installed: $(node -v)${NC}"

# ============================================================================
# STEP 3: Install Nginx
# ============================================================================
echo -e "${YELLOW}[3/8] Installing Nginx...${NC}"
if command_exists nginx; then
    echo "Nginx already installed"
else
    apt install -y nginx
fi
systemctl enable nginx
systemctl start nginx
echo -e "${GREEN}✓ Nginx installed and running${NC}"

# ============================================================================
# STEP 4: Install Certbot
# ============================================================================
echo -e "${YELLOW}[4/8] Installing Certbot...${NC}"
if command_exists certbot; then
    echo "Certbot already installed"
else
    apt install -y certbot python3-certbot-nginx
fi
echo -e "${GREEN}✓ Certbot installed${NC}"

# ============================================================================
# STEP 5: Install PM2
# ============================================================================
echo -e "${YELLOW}[5/8] Installing PM2...${NC}"
if command_exists pm2; then
    echo "PM2 already installed"
else
    npm install -g pm2
fi
echo -e "${GREEN}✓ PM2 installed${NC}"

# ============================================================================
# STEP 6: Create Application Directory
# ============================================================================
echo -e "${YELLOW}[6/8] Setting up application directory...${NC}"

# Create directory
mkdir -p ${APP_DIR}
mkdir -p ${APP_DIR}/uploads/posts
mkdir -p ${APP_DIR}/uploads/avatars
mkdir -p ${APP_DIR}/uploads/reports

# Set permissions
chown -R www-data:www-data ${APP_DIR}
chmod -R 755 ${APP_DIR}

echo -e "${GREEN}✓ Application directory created: ${APP_DIR}${NC}"

# ============================================================================
# STEP 7: Generate API Key
# ============================================================================
echo -e "${YELLOW}[7/8] Generating secure API key...${NC}"
API_KEY=$(openssl rand -hex 32)
echo -e "${GREEN}✓ API Key generated${NC}"
echo ""
echo -e "${YELLOW}============================================${NC}"
echo -e "${YELLOW}  IMPORTANT: Save this API Key!${NC}"
echo -e "${YELLOW}============================================${NC}"
echo -e "${GREEN}API_KEY=${API_KEY}${NC}"
echo -e "${YELLOW}============================================${NC}"
echo ""

# ============================================================================
# STEP 8: Create .env file
# ============================================================================
echo -e "${YELLOW}[8/8] Creating .env file...${NC}"

cat > ${APP_DIR}/.env << EOF
PORT=3001
DOMAIN=https://${DOMAIN}
API_KEY=${API_KEY}
NODE_ENV=production
EOF

chmod 600 ${APP_DIR}/.env
echo -e "${GREEN}✓ .env file created${NC}"

# ============================================================================
# FINAL INSTRUCTIONS
# ============================================================================
echo ""
echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}   Setup Complete!${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo ""
echo "1. Copy server files to ${APP_DIR}:"
echo "   - server.js"
echo "   - package.json"
echo ""
echo "2. Install dependencies:"
echo "   cd ${APP_DIR}"
echo "   npm install"
echo ""
echo "3. Setup Nginx config:"
echo "   # Create minimal config first for certbot"
echo "   cat > /etc/nginx/sites-available/${DOMAIN} << 'NGINX'"
echo "   server {"
echo "       listen 80;"
echo "       server_name ${DOMAIN};"
echo "       location / {"
echo "           proxy_pass http://127.0.0.1:3001;"
echo "       }"
echo "   }"
echo "   NGINX"
echo ""
echo "   ln -s /etc/nginx/sites-available/${DOMAIN} /etc/nginx/sites-enabled/"
echo "   nginx -t && systemctl reload nginx"
echo ""
echo "4. Setup DNS: Add A record for 'storage' pointing to this server's IP"
echo ""
echo "5. Get SSL certificate (after DNS propagates):"
echo "   certbot --nginx -d ${DOMAIN}"
echo ""
echo "6. Update Nginx with full config (nginx.conf from docs/server/)"
echo ""
echo "7. Start the application:"
echo "   cd ${APP_DIR}"
echo "   pm2 start server.js --name civica-storage"
echo "   pm2 save"
echo "   pm2 startup"
echo ""
echo "8. Test:"
echo "   curl https://${DOMAIN}/health"
echo ""
echo -e "${BLUE}============================================${NC}"
echo -e "${GREEN}Your API Key: ${API_KEY}${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""
echo "Save this API key! You'll need it for the CIVICA app configuration."
echo ""

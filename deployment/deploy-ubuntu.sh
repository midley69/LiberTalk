#!/bin/bash

###############################################################################
# Script de Déploiement LiberTalk - Ubuntu Server
#
# Ce script automatise le déploiement complet de l'application sur Ubuntu
# Inclut: Node.js, PostgreSQL, Nginx, SSL, PM2, et configuration complète
#
# Usage: sudo bash deploy-ubuntu.sh
###############################################################################

set -e

# Couleurs pour l'affichage
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}"
echo "╔════════════════════════════════════════════════════════════╗"
echo "║       LIBERT ALK - Script de Déploiement Ubuntu          ║"
echo "║                 Version 1.0 - 2025                        ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Vérification root
if [ "$EUID" -ne 0 ]; then
   echo -e "${RED}Ce script doit être exécuté en tant que root (sudo)${NC}"
   exit 1
fi

# Variables de configuration
read -p "Nom de domaine (ex: libekoo.com): " DOMAIN_NAME
read -p "Email pour SSL (Let's Encrypt): " SSL_EMAIL
read -p "Port de l'application (défaut: 5173): " APP_PORT
APP_PORT=${APP_PORT:-5173}
read -p "Nom de la base de données (défaut: libekoo_db): " DB_NAME
DB_NAME=${DB_NAME:-libekoo_db}
read -sp "Mot de passe PostgreSQL: " DB_PASSWORD
echo ""

APP_DIR="/var/www/libekoo"
DB_USER="libekoo_user"

echo -e "${YELLOW}══════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}Configuration:${NC}"
echo "  Domaine: $DOMAIN_NAME"
echo "  Port: $APP_PORT"
echo "  Base de données: $DB_NAME"
echo "  Utilisateur DB: $DB_USER"
echo "  Répertoire: $APP_DIR"
echo -e "${YELLOW}══════════════════════════════════════════════════════════${NC}"
read -p "Continuer? (y/n): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
fi

echo -e "${GREEN}[1/10] Mise à jour du système...${NC}"
apt update && apt upgrade -y

echo -e "${GREEN}[2/10] Installation des dépendances système...${NC}"
apt install -y curl wget git build-essential software-properties-common ufw

echo -e "${GREEN}[3/10] Installation de Node.js 20.x...${NC}"
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
echo "Node version: $(node -v)"
echo "NPM version: $(npm -v)"

echo -e "${GREEN}[4/10] Installation de PostgreSQL 15...${NC}"
sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | apt-key add -
apt update
apt install -y postgresql-15 postgresql-contrib-15

echo -e "${GREEN}[5/10] Configuration de PostgreSQL...${NC}"
systemctl start postgresql
systemctl enable postgresql

# Créer l'utilisateur et la base de données
sudo -u postgres psql <<EOF
CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASSWORD}';
CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};
GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};
\c ${DB_NAME}
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
EOF

echo -e "${GREEN}[6/10] Configuration du pare-feu (UFW)...${NC}"
ufw --force enable
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow ${APP_PORT}/tcp
ufw status

echo -e "${GREEN}[7/10] Installation de Nginx...${NC}"
apt install -y nginx
systemctl start nginx
systemctl enable nginx

echo -e "${GREEN}[8/10] Installation de PM2...${NC}"
npm install -g pm2
pm2 startup systemd -u root --hp /root
systemctl enable pm2-root

echo -e "${GREEN}[9/10] Installation de Certbot pour SSL...${NC}"
apt install -y certbot python3-certbot-nginx

echo -e "${GREEN}[10/10] Configuration de l'environnement de production...${NC}"

# Créer le répertoire de l'application
mkdir -p ${APP_DIR}
cd ${APP_DIR}

# Fichier .env de production
cat > ${APP_DIR}/.env <<EOF
# Configuration PostgreSQL
VITE_SUPABASE_URL=http://localhost:${APP_PORT}
VITE_SUPABASE_ANON_KEY=your-anon-key-here

# Base de données PostgreSQL locale
DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@localhost:5432/${DB_NAME}
DB_HOST=localhost
DB_PORT=5432
DB_NAME=${DB_NAME}
DB_USER=${DB_USER}
DB_PASSWORD=${DB_PASSWORD}

# Configuration de l'application
NODE_ENV=production
PORT=${APP_PORT}
DOMAIN=${DOMAIN_NAME}

# Sécurité
SESSION_SECRET=$(openssl rand -hex 32)
JWT_SECRET=$(openssl rand -hex 32)
ENCRYPTION_KEY=$(openssl rand -hex 32)

# Rate Limiting
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW=900000

# CORS
CORS_ORIGIN=https://${DOMAIN_NAME}

# Logs
LOG_LEVEL=info
EOF

echo -e "${GREEN}Fichier .env créé avec succès${NC}"

# Configuration Nginx
cat > /etc/nginx/sites-available/${DOMAIN_NAME} <<'NGINX_EOF'
server {
    listen 80;
    server_name DOMAIN_PLACEHOLDER;

    location / {
        proxy_pass http://localhost:APP_PORT_PLACEHOLDER;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket support
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
    }

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;

    # Compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/x-javascript application/xml+rss application/json;
}
NGINX_EOF

sed -i "s/DOMAIN_PLACEHOLDER/${DOMAIN_NAME}/g" /etc/nginx/sites-available/${DOMAIN_NAME}
sed -i "s/APP_PORT_PLACEHOLDER/${APP_PORT}/g" /etc/nginx/sites-available/${DOMAIN_NAME}

ln -sf /etc/nginx/sites-available/${DOMAIN_NAME} /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

echo -e "${GREEN}Configuration Nginx créée${NC}"

echo -e "${YELLOW}══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}Installation terminée avec succès!${NC}"
echo -e "${YELLOW}══════════════════════════════════════════════════════════${NC}"
echo ""
echo "Prochaines étapes:"
echo ""
echo "1. Copiez votre code source dans: ${APP_DIR}"
echo "   scp -r ./dist root@your-server:${APP_DIR}/"
echo ""
echo "2. Installez les dépendances:"
echo "   cd ${APP_DIR} && npm install --production"
echo ""
echo "3. Lancez l'application avec PM2:"
echo "   pm2 start npm --name libekoo -- start"
echo "   pm2 save"
echo ""
echo "4. Générez le certificat SSL:"
echo "   certbot --nginx -d ${DOMAIN_NAME} --email ${SSL_EMAIL} --agree-tos --non-interactive"
echo ""
echo "5. Vérifiez le statut:"
echo "   pm2 status"
echo "   pm2 logs libekoo"
echo ""
echo -e "${YELLOW}Fichiers de configuration:${NC}"
echo "  - App: ${APP_DIR}"
echo "  - Env: ${APP_DIR}/.env"
echo "  - Nginx: /etc/nginx/sites-available/${DOMAIN_NAME}"
echo "  - Logs PM2: ~/.pm2/logs/"
echo ""
echo -e "${GREEN}Déploiement initial terminé!${NC}"

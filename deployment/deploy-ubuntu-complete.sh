#!/bin/bash

#############################################
# LibeKoo - Complete Ubuntu Deployment Script
# For PostgreSQL + Node.js + React Application
#############################################

set -e

echo "================================================"
echo "  LibeKoo Complete Deployment Script"
echo "  Ubuntu 20.04+ / Debian 11+"
echo "================================================"
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
APP_NAME="libekoo"
APP_USER="libekoo"
APP_DIR="/var/www/${APP_NAME}"
POSTGRES_VERSION="15"
NODE_VERSION="20"

# Helper functions
error_exit() {
    echo -e "${RED}ERROR: $1${NC}" 1>&2
    exit 1
}

success_message() {
    echo -e "${GREEN}✓ $1${NC}"
}

info_message() {
    echo -e "${YELLOW}→ $1${NC}"
}

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   error_exit "This script must be run as root (use sudo)"
fi

info_message "Starting deployment process..."

#############################################
# 1. SYSTEM UPDATE
#############################################
info_message "Step 1: Updating system packages..."
apt-get update
apt-get upgrade -y
success_message "System updated"

#############################################
# 2. INSTALL DEPENDENCIES
#############################################
info_message "Step 2: Installing dependencies..."
apt-get install -y \
    curl \
    wget \
    git \
    build-essential \
    nginx \
    ufw \
    certbot \
    python3-certbot-nginx \
    fail2ban \
    htop
success_message "Dependencies installed"

#############################################
# 3. INSTALL POSTGRESQL
#############################################
info_message "Step 3: Installing PostgreSQL ${POSTGRES_VERSION}..."

# Add PostgreSQL repository
sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | apt-key add -
apt-get update
apt-get install -y postgresql-${POSTGRES_VERSION} postgresql-contrib-${POSTGRES_VERSION}

success_message "PostgreSQL installed"

# Configure PostgreSQL
info_message "Configuring PostgreSQL..."

# Generate random password
DB_PASSWORD=$(openssl rand -base64 32)

# Create database and user
sudo -u postgres psql << EOF
CREATE DATABASE ${APP_NAME}_db;
CREATE USER ${APP_USER} WITH ENCRYPTED PASSWORD '${DB_PASSWORD}';
GRANT ALL PRIVILEGES ON DATABASE ${APP_NAME}_db TO ${APP_USER};
ALTER DATABASE ${APP_NAME}_db OWNER TO ${APP_USER};
EOF

# Save credentials
cat > /root/${APP_NAME}_db_credentials.txt << EOF
Database Name: ${APP_NAME}_db
Database User: ${APP_USER}
Database Password: ${DB_PASSWORD}
Database Host: localhost
Database Port: 5432

Connection String:
postgresql://${APP_USER}:${DB_PASSWORD}@localhost:5432/${APP_NAME}_db

IMPORTANT: Save these credentials securely and delete this file!
EOF

chmod 600 /root/${APP_NAME}_db_credentials.txt

success_message "PostgreSQL configured"
echo -e "${YELLOW}Database credentials saved to: /root/${APP_NAME}_db_credentials.txt${NC}"

#############################################
# 4. INSTALL NODE.JS
#############################################
info_message "Step 4: Installing Node.js ${NODE_VERSION}..."

# Install Node.js via NodeSource
curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
apt-get install -y nodejs

# Verify installation
node --version
npm --version

success_message "Node.js installed"

#############################################
# 5. CREATE APP USER
#############################################
info_message "Step 5: Creating application user..."

if ! id "${APP_USER}" &>/dev/null; then
    useradd -r -s /bin/bash -d ${APP_DIR} -m ${APP_USER}
    success_message "User ${APP_USER} created"
else
    info_message "User ${APP_USER} already exists"
fi

#############################################
# 6. SETUP APPLICATION DIRECTORY
#############################################
info_message "Step 6: Setting up application directory..."

mkdir -p ${APP_DIR}
chown -R ${APP_USER}:${APP_USER} ${APP_DIR}

success_message "Application directory created"

#############################################
# 7. CLONE/COPY APPLICATION CODE
#############################################
info_message "Step 7: Please copy your application code to ${APP_DIR}"
echo "   You can use: scp -r ./project/* root@your-server:${APP_DIR}/"
echo ""
read -p "Press Enter when code is copied..."

# Install dependencies
if [ -f "${APP_DIR}/package.json" ]; then
    info_message "Installing Node.js dependencies..."
    cd ${APP_DIR}
    sudo -u ${APP_USER} npm install
    success_message "Dependencies installed"
fi

#############################################
# 8. SETUP ENVIRONMENT VARIABLES
#############################################
info_message "Step 8: Setting up environment variables..."

read -p "Enter your Supabase URL: " SUPABASE_URL
read -p "Enter your Supabase Anon Key: " SUPABASE_ANON_KEY

cat > ${APP_DIR}/.env << EOF
# Database Configuration
DATABASE_URL=postgresql://${APP_USER}:${DB_PASSWORD}@localhost:5432/${APP_NAME}_db

# Supabase Configuration
VITE_SUPABASE_URL=${SUPABASE_URL}
VITE_SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}

# Application Configuration
NODE_ENV=production
PORT=3000

# Security
SESSION_SECRET=$(openssl rand -hex 32)
JWT_SECRET=$(openssl rand -hex 32)
EOF

chown ${APP_USER}:${APP_USER} ${APP_DIR}/.env
chmod 600 ${APP_DIR}/.env

success_message "Environment variables configured"

#############################################
# 9. BUILD APPLICATION
#############################################
info_message "Step 9: Building application..."

cd ${APP_DIR}
sudo -u ${APP_USER} npm run build

success_message "Application built"

#############################################
# 10. SETUP NGINX
#############################################
info_message "Step 10: Configuring Nginx..."

read -p "Enter your domain name (e.g., libekoo.com): " DOMAIN_NAME

cat > /etc/nginx/sites-available/${APP_NAME} << 'NGINX_CONFIG'
server {
    listen 80;
    listen [::]:80;
    server_name DOMAIN_NAME;

    root /var/www/APP_NAME/dist;
    index index.html;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_types text/plain text/css text/xml text/javascript application/x-javascript application/xml+rss application/json;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Content-Security-Policy "default-src 'self' https: wss:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline';" always;

    # Static files with caching
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # SPA routing
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=app_limit:10m rate=10r/s;
    limit_req zone=app_limit burst=20 nodelay;

    # WebSocket support for Supabase Realtime
    location /socket {
        proxy_pass https://SUPABASE_PROJECT_ID.supabase.co;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Security: Disable access to hidden files
    location ~ /\. {
        deny all;
    }
}
NGINX_CONFIG

# Replace placeholders
sed -i "s|DOMAIN_NAME|${DOMAIN_NAME}|g" /etc/nginx/sites-available/${APP_NAME}
sed -i "s|APP_NAME|${APP_NAME}|g" /etc/nginx/sites-available/${APP_NAME}

# Extract Supabase Project ID from URL
SUPABASE_PROJECT_ID=$(echo ${SUPABASE_URL} | sed 's|https://||' | cut -d'.' -f1)
sed -i "s|SUPABASE_PROJECT_ID|${SUPABASE_PROJECT_ID}|g" /etc/nginx/sites-available/${APP_NAME}

# Enable site
ln -sf /etc/nginx/sites-available/${APP_NAME} /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Test Nginx configuration
nginx -t || error_exit "Nginx configuration test failed"

# Restart Nginx
systemctl restart nginx

success_message "Nginx configured"

#############################################
# 11. SETUP SSL WITH LET'S ENCRYPT
#############################################
info_message "Step 11: Setting up SSL certificate..."

read -p "Enter your email for SSL certificate: " EMAIL

certbot --nginx -d ${DOMAIN_NAME} --non-interactive --agree-tos --email ${EMAIL} --redirect

success_message "SSL certificate installed"

#############################################
# 12. CONFIGURE FIREWALL
#############################################
info_message "Step 12: Configuring firewall..."

ufw --force enable
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 'Nginx Full'
ufw allow 5432/tcp  # PostgreSQL (only if remote access needed)

success_message "Firewall configured"

#############################################
# 13. SETUP FAIL2BAN
#############################################
info_message "Step 13: Configuring Fail2Ban..."

cat > /etc/fail2ban/jail.local << EOF
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5

[sshd]
enabled = true
port = ssh
logpath = /var/log/auth.log

[nginx-http-auth]
enabled = true
logpath = /var/log/nginx/error.log

[nginx-limit-req]
enabled = true
logpath = /var/log/nginx/error.log
EOF

systemctl restart fail2ban

success_message "Fail2Ban configured"

#############################################
# 14. SETUP AUTOMATIC BACKUPS
#############################################
info_message "Step 14: Setting up automatic database backups..."

mkdir -p /var/backups/${APP_NAME}
chown ${APP_USER}:${APP_USER} /var/backups/${APP_NAME}

cat > /usr/local/bin/${APP_NAME}_backup.sh << EOF
#!/bin/bash
BACKUP_DIR="/var/backups/${APP_NAME}"
DATE=\$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="\${BACKUP_DIR}/${APP_NAME}_\${DATE}.sql.gz"

# Create backup
sudo -u postgres pg_dump ${APP_NAME}_db | gzip > \${BACKUP_FILE}

# Keep only last 7 days of backups
find \${BACKUP_DIR} -name "${APP_NAME}_*.sql.gz" -mtime +7 -delete

echo "Backup completed: \${BACKUP_FILE}"
EOF

chmod +x /usr/local/bin/${APP_NAME}_backup.sh

# Add daily cron job
(crontab -l 2>/dev/null; echo "0 2 * * * /usr/local/bin/${APP_NAME}_backup.sh") | crontab -

success_message "Automatic backups configured (runs daily at 2 AM)"

#############################################
# 15. SETUP SYSTEM MONITORING
#############################################
info_message "Step 15: Creating monitoring script..."

cat > /usr/local/bin/${APP_NAME}_monitor.sh << EOF
#!/bin/bash

echo "=== LibeKoo System Status ==="
echo ""
echo "Nginx Status:"
systemctl status nginx --no-pager | grep "Active:"
echo ""
echo "PostgreSQL Status:"
systemctl status postgresql --no-pager | grep "Active:"
echo ""
echo "Disk Usage:"
df -h | grep -E "Filesystem|/dev/.*"
echo ""
echo "Memory Usage:"
free -h
echo ""
echo "Active Connections:"
netstat -an | grep ESTABLISHED | wc -l
echo ""
echo "Database Connections:"
sudo -u postgres psql -c "SELECT count(*) as active_connections FROM pg_stat_activity WHERE datname='${APP_NAME}_db';"
EOF

chmod +x /usr/local/bin/${APP_NAME}_monitor.sh

success_message "Monitoring script created (run with: ${APP_NAME}_monitor.sh)"

#############################################
# 16. FINAL CHECKS
#############################################
info_message "Step 16: Running final checks..."

# Check services
systemctl is-active --quiet nginx && success_message "Nginx is running" || error_exit "Nginx is not running"
systemctl is-active --quiet postgresql && success_message "PostgreSQL is running" || error_exit "PostgreSQL is not running"
systemctl is-active --quiet fail2ban && success_message "Fail2Ban is running" || error_exit "Fail2Ban is not running"

#############################################
# 17. DISPLAY SUMMARY
#############################################
echo ""
echo "================================================"
echo -e "${GREEN}  Deployment Completed Successfully!${NC}"
echo "================================================"
echo ""
echo "📋 DEPLOYMENT SUMMARY"
echo "--------------------"
echo "Application: ${APP_NAME}"
echo "Domain: ${DOMAIN_NAME}"
echo "App Directory: ${APP_DIR}"
echo "Database: ${APP_NAME}_db"
echo "Database User: ${APP_USER}"
echo ""
echo "📁 IMPORTANT FILES"
echo "------------------"
echo "Database Credentials: /root/${APP_NAME}_db_credentials.txt"
echo "Environment File: ${APP_DIR}/.env"
echo "Nginx Config: /etc/nginx/sites-available/${APP_NAME}"
echo "Backup Script: /usr/local/bin/${APP_NAME}_backup.sh"
echo "Monitor Script: /usr/local/bin/${APP_NAME}_monitor.sh"
echo ""
echo "🔒 SECURITY"
echo "-----------"
echo "✓ SSL/HTTPS enabled"
echo "✓ Firewall configured"
echo "✓ Fail2Ban active"
echo "✓ Security headers set"
echo ""
echo "💾 BACKUPS"
echo "----------"
echo "Automatic daily backups enabled"
echo "Backup location: /var/backups/${APP_NAME}"
echo ""
echo "🌐 ACCESS YOUR APPLICATION"
echo "-------------------------"
echo "Visit: https://${DOMAIN_NAME}"
echo ""
echo "📊 USEFUL COMMANDS"
echo "------------------"
echo "View logs:          journalctl -u nginx -f"
echo "Restart Nginx:      systemctl restart nginx"
echo "Check status:       ${APP_NAME}_monitor.sh"
echo "Manual backup:      ${APP_NAME}_backup.sh"
echo "PostgreSQL console: sudo -u postgres psql ${APP_NAME}_db"
echo ""
echo -e "${YELLOW}⚠️  NEXT STEPS:${NC}"
echo "1. Save database credentials from /root/${APP_NAME}_db_credentials.txt"
echo "2. Delete the credentials file after saving"
echo "3. Test your application at https://${DOMAIN_NAME}"
echo "4. Run database migrations if needed"
echo ""
echo "================================================"

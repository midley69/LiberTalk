# 📘 LibeKoo - Instructions de Déploiement Complètes

## 🎯 OBJECTIF

Déployer une application de chat aléatoire anonyme complète avec:
- ✅ Chat texte aléatoire (matching instantané < 1s)
- ✅ Appels vidéo WebRTC peer-to-peer
- ✅ Chats de groupe en temps réel
- ✅ Inscription optionnelle + système d'amis
- ✅ Matching par proximité IP (anonyme)
- ✅ Modération avec archives (30 jours)
- ✅ Déploiement Ubuntu + PostgreSQL

---

## 📋 ÉTAPE 1: PRÉREQUIS

### **A. Serveur**
```bash
OS: Ubuntu 20.04+ ou Debian 11+
RAM: Minimum 2GB (Recommandé 4GB+)
CPU: 2 cores minimum
Stockage: 20GB minimum
Nom de domaine: Configuré avec DNS
```

### **B. Compte Supabase**
1. Créer un compte sur https://supabase.com
2. Créer un nouveau projet
3. Noter:
   - URL du projet (ex: https://xxxxx.supabase.co)
   - Clé anon/public
   - Clé service_role (pour migrations)

### **C. Logiciels Locaux**
```bash
Node.js 18+ : https://nodejs.org/
Git : https://git-scm.com/
```

---

## 🗄️ ÉTAPE 2: CONFIGURATION BASE DE DONNÉES

### **A. Connexion à Supabase**

1. **Via Interface Web:**
   - Ouvrir https://supabase.com/dashboard
   - Sélectionner votre projet
   - Aller dans "SQL Editor"

2. **Via CLI (Alternative):**
```bash
npm install -g supabase
supabase login
supabase link --project-ref <votre-project-ref>
```

### **B. Exécuter les Migrations**

**Ordre d'exécution obligatoire:**

```sql
-- 1. Tables principales (DÉJÀ CRÉÉES via Supabase MCP)
-- Si besoin, vérifier dans SQL Editor:
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public';

-- 2. Fonction de matching avec proximité
-- Copier depuis: supabase/migrations/add_ip_proximity_matching_fixed.sql
-- Coller dans SQL Editor et exécuter

-- 3. Système WebRTC + Auth + Amis
-- Copier depuis: supabase/migrations/create_webrtc_and_auth_system.sql
-- Coller dans SQL Editor et exécuter

-- 4. Fonctions de groupes
-- Copier depuis: supabase/migrations/add_group_chat_functions.sql
-- Coller dans SQL Editor et exécuter
```

### **C. Vérification**

```sql
-- Vérifier toutes les tables
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- Devrait retourner:
-- deleted_messages_archive
-- friend_requests
-- friendships
-- group_members
-- group_messages
-- groups
-- moderation_actions
-- moderators
-- online_users
-- presence_events
-- random_chat_messages
-- random_chat_sessions
-- random_chat_users
-- registered_users
-- user_reports
-- video_sessions
-- webrtc_signals

-- Vérifier les fonctions
SELECT routine_name FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_type = 'FUNCTION'
ORDER BY routine_name;
```

---

## 🔧 ÉTAPE 3: CONFIGURATION LOCALE

### **A. Cloner le Projet**
```bash
git clone <votre-repo> libekoo
cd libekoo
```

### **B. Configuration Environnement**
```bash
# Créer fichier .env
cat > .env << EOF
# Supabase Configuration
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=votre_cle_anon_ici

# Application
NODE_ENV=development
EOF
```

**⚠️ IMPORTANT:** Remplacer les valeurs par vos vraies clés Supabase

### **C. Installation Dépendances**
```bash
npm install
```

### **D. Test en Local**
```bash
npm run dev
```

Ouvrir http://localhost:5173 et vérifier:
- ✅ Page d'accueil charge
- ✅ Navigation fonctionne
- ✅ Console sans erreurs critiques

---

## 🚀 ÉTAPE 4: DÉPLOIEMENT PRODUCTION

### **OPTION A: Déploiement Automatique (Recommandé)**

```bash
# 1. Copier le script sur le serveur
scp deployment/deploy-ubuntu-complete.sh root@votre-serveur:/root/

# 2. Se connecter au serveur
ssh root@votre-serveur

# 3. Rendre le script exécutable
chmod +x /root/deploy-ubuntu-complete.sh

# 4. Lancer le déploiement
sudo ./deploy-ubuntu-complete.sh

# 5. Suivre les instructions interactives:
#    - Copier le code quand demandé
#    - Entrer URL Supabase
#    - Entrer clé Supabase anon
#    - Entrer nom de domaine
#    - Entrer email pour SSL

# 6. Attendre 15-20 minutes
```

**Le script fait automatiquement:**
- ✅ Installation PostgreSQL 15
- ✅ Installation Node.js 20
- ✅ Configuration Nginx
- ✅ Installation SSL (Let's Encrypt)
- ✅ Configuration Firewall (UFW)
- ✅ Configuration Fail2Ban
- ✅ Backups automatiques
- ✅ Scripts de monitoring

### **OPTION B: Déploiement Manuel**

<details>
<summary>Cliquer pour voir les étapes manuelles</summary>

#### **1. Mise à jour système**
```bash
apt-get update && apt-get upgrade -y
apt-get install -y curl wget git build-essential nginx ufw certbot python3-certbot-nginx fail2ban
```

#### **2. Installation Node.js**
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
node --version  # Vérifier version 20+
npm --version
```

#### **3. Création utilisateur application**
```bash
useradd -r -s /bin/bash -d /var/www/libekoo -m libekoo
```

#### **4. Copie du code**
```bash
# Depuis votre machine locale
scp -r ./project/* root@votre-serveur:/var/www/libekoo/

# Sur le serveur
chown -R libekoo:libekoo /var/www/libekoo
```

#### **5. Configuration environnement**
```bash
cd /var/www/libekoo

cat > .env << EOF
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=votre_cle_anon
NODE_ENV=production
EOF

chmod 600 .env
chown libekoo:libekoo .env
```

#### **6. Build application**
```bash
cd /var/www/libekoo
sudo -u libekoo npm install
sudo -u libekoo npm run build
```

#### **7. Configuration Nginx**
```bash
cat > /etc/nginx/sites-available/libekoo << 'EOF'
server {
    listen 80;
    listen [::]:80;
    server_name votre-domaine.com;

    root /var/www/libekoo/dist;
    index index.html;

    # Gzip
    gzip on;
    gzip_vary on;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/json;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;

    # Static files
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
}
EOF

# Activer site
ln -sf /etc/nginx/sites-available/libekoo /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl restart nginx
```

#### **8. SSL avec Let's Encrypt**
```bash
certbot --nginx -d votre-domaine.com --non-interactive --agree-tos --email votre@email.com --redirect
```

#### **9. Firewall**
```bash
ufw --force enable
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 'Nginx Full'
```

#### **10. Fail2Ban**
```bash
cat > /etc/fail2ban/jail.local << EOF
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5

[sshd]
enabled = true
port = ssh
logpath = /var/log/auth.log

[nginx-limit-req]
enabled = true
logpath = /var/log/nginx/error.log
EOF

systemctl restart fail2ban
```

</details>

---

## ✅ ÉTAPE 5: VÉRIFICATION POST-DÉPLOIEMENT

### **A. Tests de Base**
```bash
# 1. Vérifier services
systemctl status nginx
systemctl status fail2ban

# 2. Tester l'application
curl https://votre-domaine.com
# Devrait retourner du HTML

# 3. Vérifier SSL
curl -I https://votre-domaine.com
# Devrait montrer HTTPS et certificat valide

# 4. Vérifier logs
journalctl -u nginx -f
# Pas d'erreurs critiques
```

### **B. Tests Fonctionnels**

**1. Chat Aléatoire**
```
✓ Ouvrir 2 fenêtres (navigation privée)
✓ User1: Entrer pseudo → Démarrer
✓ User2: Entrer pseudo → Démarrer
✓ Vérifier: Connexion en < 2 secondes
✓ User1: Envoyer message
✓ Vérifier: User2 reçoit instantanément
✓ User1: Cliquer "Suivant"
✓ Vérifier: Session terminée, nouveau matching démarre
```

**2. Appels Vidéo**
```
✓ Cliquer sur "Vidéo"
✓ Autoriser caméra/micro
✓ Vérifier: Aperçu local visible
✓ Attendre partenaire
✓ Vérifier: Vidéo distante s'affiche
✓ Toggle caméra → Vérifier désactivation
✓ Toggle micro → Vérifier mute
✓ Cliquer "Suivant" → Nouveau partenaire
```

**3. Groupes**
```
✓ Aller dans "Groupes"
✓ Créer un groupe
✓ Envoyer message
✓ Ouvrir 2ème fenêtre
✓ Rejoindre le même groupe
✓ Vérifier: Messages synchronisés temps réel
✓ Quitter groupe → Vérifier message système
```

### **C. Monitoring**
```bash
# Script de monitoring (créé par deploy script)
/usr/local/bin/libekoo_monitor.sh

# Affiche:
# - Status Nginx
# - Status PostgreSQL (si local)
# - Usage disque
# - Usage mémoire
# - Connexions actives
```

---

## 🔐 ÉTAPE 6: SÉCURITÉ SUPPLÉMENTAIRE

### **A. Changer Port SSH (Optionnel)**
```bash
# Éditer config SSH
nano /etc/ssh/sshd_config

# Changer:
Port 22
# En:
Port 2222  # Ou autre port

# Redémarrer SSH
systemctl restart sshd

# Mettre à jour firewall
ufw allow 2222/tcp
ufw delete allow 22/tcp
```

### **B. Créer Compte Modérateur**
```sql
-- Dans Supabase SQL Editor
INSERT INTO moderators (
    user_id,
    username,
    email,
    permission_level,
    created_by
) VALUES (
    'mod_' || gen_random_uuid()::text,
    'admin',
    'admin@votre-domaine.com',
    'admin',
    'system'
);
```

### **C. Configurer Backups Externes (Optionnel)**
```bash
# Sauvegarder sur serveur distant via rsync
cat > /usr/local/bin/remote_backup.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/var/backups/libekoo"
REMOTE_USER="backup"
REMOTE_HOST="backup-server.com"
REMOTE_PATH="/backups/libekoo"

rsync -avz --delete ${BACKUP_DIR}/ ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_PATH}/
EOF

chmod +x /usr/local/bin/remote_backup.sh

# Ajouter au cron (après backup local)
(crontab -l; echo "0 3 * * * /usr/local/bin/remote_backup.sh") | crontab -
```

---

## 🐛 ÉTAPE 7: DÉPANNAGE

### **Problème: Application ne charge pas**
```bash
# Vérifier Nginx
systemctl status nginx
nginx -t

# Vérifier logs
tail -f /var/log/nginx/error.log

# Vérifier fichiers dist
ls -la /var/www/libekoo/dist/
```

### **Problème: Erreurs 502 Bad Gateway**
```bash
# Vérifier permissions
chown -R libekoo:libekoo /var/www/libekoo

# Rebuild
cd /var/www/libekoo
sudo -u libekoo npm run build
```

### **Problème: WebRTC ne fonctionne pas**
```bash
# Vérifier HTTPS
curl -I https://votre-domaine.com
# WebRTC nécessite HTTPS!

# Vérifier console navigateur
# Ouvrir DevTools (F12) → Console
# Chercher erreurs "Permission denied" ou "getUserMedia"
```

### **Problème: Base de données lente**
```sql
-- Vérifier indexes (dans Supabase SQL Editor)
SELECT
    schemaname,
    tablename,
    indexname
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename;

-- Analyser requêtes lentes
SELECT
    query,
    calls,
    mean_exec_time,
    total_exec_time
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;
```

### **Problème: Messages non synchronisés**
```bash
# Vérifier Supabase Realtime
# Dans Supabase Dashboard → Settings → API
# Vérifier que Realtime est activé

# Tester connexion WebSocket
wscat -c "wss://xxxxx.supabase.co/realtime/v1/websocket"
```

---

## 📊 ÉTAPE 8: MAINTENANCE

### **A. Commandes Utiles**

```bash
# Voir logs Nginx
journalctl -u nginx -f

# Redémarrer Nginx
systemctl restart nginx

# Backup manuel base de données (si PostgreSQL local)
/usr/local/bin/libekoo_backup.sh

# Monitoring système
/usr/local/bin/libekoo_monitor.sh

# Mettre à jour application
cd /var/www/libekoo
git pull origin main
sudo -u libekoo npm install
sudo -u libekoo npm run build
systemctl restart nginx
```

### **B. Mises à Jour Régulières**

```bash
# Système (mensuel)
apt-get update
apt-get upgrade -y

# Node.js (vérifier nouvelles versions)
npm install -g npm@latest

# Certificat SSL (auto-renouvelé par certbot)
certbot renew --dry-run
```

### **C. Nettoyage Base de Données**

```sql
-- Nettoyer anciens signaux WebRTC (automatique normalement)
DELETE FROM webrtc_signals
WHERE created_at < NOW() - INTERVAL '1 hour';

-- Nettoyer anciennes présences
DELETE FROM presence_events
WHERE created_at < NOW() - INTERVAL '7 days';

-- Nettoyer anciennes archives (après 30 jours)
DELETE FROM deleted_messages_archive
WHERE deleted_at < NOW() - INTERVAL '30 days';
```

---

## 🎓 ÉTAPE 9: FORMATION ÉQUIPE

### **A. Documentation Utilisateur**
Créer guide utilisateur simple avec:
- Comment créer un compte (optionnel)
- Comment démarrer un chat aléatoire
- Comment utiliser la vidéo
- Comment rejoindre/créer un groupe
- Règles de conduite

### **B. Documentation Modérateur**
Créer guide modération avec:
- Accès au panel de modération
- Consultation des archives
- Bannissement d'utilisateurs
- Résolution de reports
- Procédures d'escalade

### **C. Procédures d'Urgence**
```bash
# Arrêt d'urgence
systemctl stop nginx

# Blocage IP malveillant
ufw deny from XXX.XXX.XXX.XXX

# Restauration backup
# 1. Identifier backup à restaurer
ls -lh /var/backups/libekoo/

# 2. Restaurer (si PostgreSQL local)
gunzip < /var/backups/libekoo/backup_DATE.sql.gz | psql libekoo_db
```

---

## 📞 SUPPORT

### **Ressources**
- Documentation Supabase: https://supabase.com/docs
- Documentation WebRTC: https://webrtc.org/
- Documentation React: https://react.dev/
- PostgreSQL: https://www.postgresql.org/docs/

### **Logs Importants**
```bash
Nginx:        /var/log/nginx/error.log
Application:  Supabase Dashboard → Logs
Système:      journalctl -xe
Fail2Ban:     /var/log/fail2ban.log
```

---

## ✨ FÉLICITATIONS !

Votre application LibeKoo est maintenant **COMPLÈTE ET EN PRODUCTION** ! 🎉

**Fonctionnalités actives:**
✅ Chat aléatoire instantané (< 1s)
✅ Appels vidéo WebRTC
✅ Chats de groupe temps réel
✅ Matching proximité IP
✅ Système d'amis optionnel
✅ Modération avec archives
✅ Sécurité renforcée
✅ Backups automatiques

**Prochaines étapes suggérées:**
- Ajouter analytics (Google Analytics, Plausible, etc.)
- Implémenter notifications push
- Ajouter support mobile (PWA)
- Créer API publique pour intégrations
- Ajouter tests automatisés (Jest, Cypress)

**Bon succès avec votre projet !** 🚀

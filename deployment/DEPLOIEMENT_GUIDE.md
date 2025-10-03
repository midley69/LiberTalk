# 📘 Guide de Déploiement LiberTalk

## Vue d'ensemble

Ce guide vous permet de déployer LiberTalk sur votre propre serveur Ubuntu avec PostgreSQL en remplacement de Supabase.

---

## 🎯 Prérequis

### Serveur
- Ubuntu Server 20.04 LTS ou supérieur
- Minimum 2 GB RAM
- 20 GB d'espace disque
- Accès root/sudo
- Domaine pointant vers le serveur

### Local
- Git installé
- Accès SSH au serveur
- Les fichiers du projet LiberTalk

---

## 📋 Étapes de Déploiement

### Étape 1: Préparer le Serveur

```bash
# Connectez-vous à votre serveur
ssh root@votre-serveur.com

# Clonez les scripts de déploiement
mkdir -p /root/deployment
cd /root/deployment
```

Copiez les fichiers du dossier `deployment/` vers votre serveur:

```bash
# Depuis votre machine locale
scp deployment/*.sh root@votre-serveur.com:/root/deployment/
```

### Étape 2: Lancer le Script d'Installation

Sur le serveur:

```bash
cd /root/deployment
chmod +x deploy-ubuntu.sh
sudo bash deploy-ubuntu.sh
```

Le script vous demandera:
- ✅ Nom de domaine (ex: libekoo.com)
- ✅ Email pour le certificat SSL
- ✅ Port de l'application (défaut: 5173)
- ✅ Nom de la base de données
- ✅ Mot de passe PostgreSQL

**Le script installe automatiquement:**
- Node.js 20.x
- PostgreSQL 15
- Nginx
- PM2 (gestionnaire de processus)
- Certbot (SSL gratuit)
- Configuration du pare-feu UFW

⏱️ Durée: 10-15 minutes

### Étape 3: Migrer depuis Supabase (Optionnel)

Si vous utilisez actuellement Supabase:

```bash
chmod +x migrate-to-local-postgres.sh
bash migrate-to-local-postgres.sh
```

Le script migrera automatiquement:
- Le schéma de la base de données
- Toutes les tables
- Les fonctions SQL
- Les index

### Étape 4: Déployer l'Application

#### 4.1 Compiler l'application en local

Sur votre machine locale:

```bash
# Installer les dépendances
npm install

# Build pour production
npm run build
```

Ceci crée un dossier `dist/` avec les fichiers optimisés.

#### 4.2 Envoyer les fichiers au serveur

```bash
# Copier le build vers le serveur
scp -r dist/* root@votre-serveur.com:/var/www/libekoo/

# Copier aussi package.json et package-lock.json
scp package*.json root@votre-serveur.com:/var/www/libekoo/
```

#### 4.3 Configurer l'environnement de production

Sur le serveur, éditez `/var/www/libekoo/.env`:

```bash
nano /var/www/libekoo/.env
```

Vérifiez/modifiez ces variables:

```env
# Base de données PostgreSQL
DATABASE_URL=postgresql://libekoo_user:VOTRE_MOT_DE_PASSE@localhost:5432/libekoo_db
DB_HOST=localhost
DB_PORT=5432
DB_NAME=libekoo_db
DB_USER=libekoo_user
DB_PASSWORD=VOTRE_MOT_DE_PASSE

# Application
NODE_ENV=production
PORT=5173
DOMAIN=votre-domaine.com

# Sécurité (déjà générés automatiquement)
SESSION_SECRET=...
JWT_SECRET=...
ENCRYPTION_KEY=...
```

#### 4.4 Installer les dépendances et démarrer

```bash
cd /var/www/libekoo

# Installer les dépendances en production
npm install --production

# Démarrer avec PM2
pm2 start npm --name libekoo -- start

# Sauvegarder la configuration PM2
pm2 save

# Activer le démarrage automatique
pm2 startup
```

### Étape 5: Configurer SSL (HTTPS)

```bash
# Générer automatiquement le certificat SSL gratuit
certbot --nginx -d votre-domaine.com --email votre@email.com --agree-tos --non-interactive

# Renouvellement automatique (testé)
certbot renew --dry-run
```

✅ Votre site est maintenant accessible en HTTPS!

---

## 🔧 Gestion de l'Application

### Commandes PM2 Essentielles

```bash
# Voir le statut
pm2 status

# Voir les logs en temps réel
pm2 logs libekoo

# Redémarrer l'application
pm2 restart libekoo

# Arrêter l'application
pm2 stop libekoo

# Voir les métriques
pm2 monit
```

### Mise à Jour de l'Application

```bash
# Sur votre machine locale
npm run build
scp -r dist/* root@votre-serveur.com:/var/www/libekoo/

# Sur le serveur
cd /var/www/libekoo
npm install --production
pm2 restart libekoo
```

### Vérifier les Logs

```bash
# Logs de l'application
pm2 logs libekoo --lines 100

# Logs Nginx
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log

# Logs PostgreSQL
tail -f /var/log/postgresql/postgresql-15-main.log
```

---

## 🗄️ Gestion de la Base de Données

### Connexion à PostgreSQL

```bash
# Se connecter
sudo -u postgres psql -d libekoo_db

# Ou avec l'utilisateur de l'app
psql -h localhost -U libekoo_user -d libekoo_db
```

### Commandes SQL Utiles

```sql
-- Voir les tables
\dt

-- Voir les fonctions
\df

-- Compter les utilisateurs actifs
SELECT COUNT(*) FROM random_chat_users WHERE status = 'en_attente';

-- Sessions actives
SELECT COUNT(*) FROM random_chat_sessions WHERE status = 'active';

-- Messages du dernier jour
SELECT COUNT(*) FROM random_chat_messages WHERE sent_at > NOW() - INTERVAL '1 day';
```

### Sauvegardes

```bash
# Créer une sauvegarde
pg_dump -h localhost -U libekoo_user libekoo_db > backup_$(date +%Y%m%d).sql

# Restaurer une sauvegarde
psql -h localhost -U libekoo_user -d libekoo_db < backup_20250101.sql

# Automatiser les sauvegardes quotidiennes
cat > /root/backup-db.sh <<'EOF'
#!/bin/bash
BACKUP_DIR="/root/backups"
mkdir -p $BACKUP_DIR
pg_dump -h localhost -U libekoo_user libekoo_db | gzip > $BACKUP_DIR/backup_$(date +%Y%m%d_%H%M%S).sql.gz
# Garder seulement les 7 dernières sauvegardes
ls -t $BACKUP_DIR/backup_*.sql.gz | tail -n +8 | xargs rm -f
EOF

chmod +x /root/backup-db.sh

# Ajouter au cron (tous les jours à 3h du matin)
(crontab -l 2>/dev/null; echo "0 3 * * * /root/backup-db.sh") | crontab -
```

---

## 🔒 Sécurité

### Pare-feu (UFW)

```bash
# Vérifier le statut
sudo ufw status

# Règles de base (déjà configurées par le script)
sudo ufw allow 22/tcp   # SSH
sudo ufw allow 80/tcp   # HTTP
sudo ufw allow 443/tcp  # HTTPS
sudo ufw enable
```

### PostgreSQL

```bash
# Modifier postgresql.conf pour plus de sécurité
sudo nano /etc/postgresql/15/main/postgresql.conf

# Assurez-vous que:
listen_addresses = 'localhost'  # N'écoute que localement
max_connections = 100
```

### Nginx

Le fichier de configuration inclut déjà les headers de sécurité:
- X-Frame-Options
- X-Content-Type-Options
- X-XSS-Protection
- Referrer-Policy

### Rate Limiting

L'application inclut un rate limiting automatique configuré dans `.env`:

```env
RATE_LIMIT_MAX=100           # 100 requêtes
RATE_LIMIT_WINDOW=900000     # par 15 minutes
```

---

## 📊 Monitoring & Maintenance

### Monitorer les Ressources

```bash
# CPU et mémoire
htop

# Espace disque
df -h

# Utilisation PostgreSQL
sudo -u postgres psql -c "SELECT pg_size_pretty(pg_database_size('libekoo_db'));"

# Connexions actives
sudo -u postgres psql -c "SELECT count(*) FROM pg_stat_activity WHERE datname = 'libekoo_db';"
```

### Nettoyage Automatique

Le système inclut des fonctions de nettoyage automatique:

```sql
-- Nettoyer les anciennes sessions (30 jours)
SELECT cleanup_old_sessions();

-- Nettoyer les données de modération (30 jours messages, 90 jours actions)
SELECT auto_cleanup_moderation_data();
```

Automatiser avec cron:

```bash
# Créer un script de nettoyage
cat > /root/cleanup-db.sh <<'EOF'
#!/bin/bash
psql -h localhost -U libekoo_user -d libekoo_db -c "SELECT cleanup_old_sessions();"
psql -h localhost -U libekoo_user -d libekoo_db -c "SELECT auto_cleanup_moderation_data();"
EOF

chmod +x /root/cleanup-db.sh

# Exécuter tous les jours à 4h du matin
(crontab -l 2>/dev/null; echo "0 4 * * * /root/cleanup-db.sh") | crontab -
```

---

## 🐛 Dépannage

### L'application ne démarre pas

```bash
# Vérifier les logs
pm2 logs libekoo

# Vérifier la configuration
cat /var/www/libekoo/.env

# Tester la connexion PostgreSQL
psql -h localhost -U libekoo_user -d libekoo_db -c "SELECT 1;"

# Redémarrer proprement
pm2 delete libekoo
pm2 start npm --name libekoo -- start
```

### Erreurs 502 Bad Gateway

```bash
# Vérifier que l'app tourne
pm2 status

# Vérifier Nginx
sudo nginx -t
sudo systemctl restart nginx

# Vérifier les logs Nginx
tail -f /var/log/nginx/error.log
```

### Base de données lente

```bash
# Analyser les requêtes lentes
sudo -u postgres psql -d libekoo_db <<EOF
SELECT pid, now() - pg_stat_activity.query_start AS duration, query, state
FROM pg_stat_activity
WHERE (now() - pg_stat_activity.query_start) > interval '5 minutes'
AND state = 'active';
EOF

# Reconstruire les index
sudo -u postgres psql -d libekoo_db -c "REINDEX DATABASE libekoo_db;"

# Vacuum
sudo -u postgres psql -d libekoo_db -c "VACUUM ANALYZE;"
```

---

## 📈 Performance

### Optimisation PostgreSQL

Éditez `/etc/postgresql/15/main/postgresql.conf`:

```ini
# Pour un serveur avec 2GB RAM
shared_buffers = 512MB
effective_cache_size = 1536MB
maintenance_work_mem = 128MB
checkpoint_completion_target = 0.9
wal_buffers = 16MB
default_statistics_target = 100
random_page_cost = 1.1
effective_io_concurrency = 200
work_mem = 2621kB
min_wal_size = 1GB
max_wal_size = 4GB
```

Redémarrer:

```bash
sudo systemctl restart postgresql
```

### Cache Nginx

Ajouter dans la configuration Nginx:

```nginx
location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
}
```

---

## 🎉 Support

### Fichiers de Configuration

- **Application**: `/var/www/libekoo/`
- **Environnement**: `/var/www/libekoo/.env`
- **Nginx**: `/etc/nginx/sites-available/votre-domaine.com`
- **PostgreSQL**: `/etc/postgresql/15/main/postgresql.conf`
- **PM2 Logs**: `~/.pm2/logs/`

### Vérifier l'Installation

```bash
# Version Node.js
node -v

# Version PostgreSQL
psql --version

# Status de tous les services
systemctl status nginx
systemctl status postgresql
pm2 status
```

### Commandes Rapides

```bash
# Redémarrer tout
pm2 restart libekoo && sudo systemctl restart nginx

# Voir toutes les connexions
pm2 logs --lines 50

# Tester la BD
psql -h localhost -U libekoo_user -d libekoo_db -c "SELECT version();"
```

---

## ✅ Checklist Post-Déploiement

- [ ] L'application est accessible via HTTPS
- [ ] Le certificat SSL est valide
- [ ] PM2 démarre automatiquement au boot
- [ ] Les sauvegardes automatiques sont configurées
- [ ] Le nettoyage automatique est configuré
- [ ] Le monitoring est en place
- [ ] Les logs sont consultables
- [ ] Le firewall est actif
- [ ] PostgreSQL écoute uniquement en local
- [ ] Rate limiting est configuré

---

🎊 **Félicitations! Votre application LiberTalk est déployée et prête à l'emploi!**

Pour toute question ou problème, consultez les logs et n'hésitez pas à vérifier la configuration.

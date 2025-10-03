# 🚀 Scripts de Déploiement LiberTalk

## 📁 Contenu du Dossier

Ce dossier contient tous les scripts nécessaires pour déployer LiberTalk sur votre propre serveur Ubuntu avec PostgreSQL.

```
deployment/
├── deploy-ubuntu.sh                 # Installation complète Ubuntu
├── migrate-to-local-postgres.sh     # Migration Supabase → PostgreSQL
├── DEPLOIEMENT_GUIDE.md             # Documentation complète
└── README.md                        # Ce fichier
```

---

## 🎯 Scénarios de Déploiement

### Scénario 1: Nouveau Serveur (Recommandé)

Vous avez un serveur Ubuntu vierge et voulez tout installer from scratch.

```bash
# 1. Copier les scripts sur le serveur
scp deployment/*.sh root@votre-serveur.com:/root/

# 2. Se connecter au serveur
ssh root@votre-serveur.com

# 3. Exécuter l'installation
cd /root
chmod +x deploy-ubuntu.sh
sudo bash deploy-ubuntu.sh

# 4. Suivre les instructions à l'écran
# Le script vous demandera:
# - Nom de domaine
# - Email SSL
# - Port application
# - Mot de passe DB
```

**Durée**: 15-20 minutes

**Ce que fait le script**:
- ✅ Installe Node.js 20.x
- ✅ Installe PostgreSQL 15
- ✅ Installe Nginx
- ✅ Configure PM2
- ✅ Configure pare-feu UFW
- ✅ Prépare Certbot pour SSL
- ✅ Crée structure dossiers
- ✅ Génère fichier .env

---

### Scénario 2: Migration depuis Supabase

Vous utilisez actuellement Supabase et voulez migrer vers PostgreSQL local.

```bash
# 1. Sur votre machine locale
cd deployment
chmod +x migrate-to-local-postgres.sh
bash migrate-to-local-postgres.sh

# Le script vous demandera:
# - URL Supabase
# - Clé Service Role
# - Informations PostgreSQL local

# 2. Le script va:
# - Exporter le schéma complet
# - Créer toutes les tables
# - Importer toutes les fonctions
# - Créer les index
# - Générer .env.local
```

**Durée**: 5-10 minutes

**Résultat**:
- ✅ Base de données locale identique à Supabase
- ✅ Toutes les fonctions migrées
- ✅ Fichier .env.local prêt
- ✅ Backup dans `supabase_backup_YYYYMMDD_HHMMSS/`

---

## 📖 Documentation Détaillée

Consultez `DEPLOIEMENT_GUIDE.md` pour:
- Guide pas-à-pas complet
- Configuration avancée
- Monitoring
- Dépannage
- Optimisation performances
- Sauvegardes automatiques
- Commandes utiles

---

## ⚡ Quick Start (Résumé)

### Installation Serveur Ubuntu

```bash
# 1. Copier scripts
scp deployment/*.sh root@server:/root/

# 2. Installer
ssh root@server
sudo bash deploy-ubuntu.sh

# 3. Déployer app
cd /var/www/libekoo
# Copier votre code ici
npm install --production
pm2 start npm --name libekoo -- start
pm2 save

# 4. SSL
certbot --nginx -d votre-domaine.com --email votre@email.com --agree-tos
```

### Déployer une Mise à Jour

```bash
# Sur votre machine locale
npm run build

# Copier vers serveur
scp -r dist/* root@server:/var/www/libekoo/

# Sur le serveur
ssh root@server
cd /var/www/libekoo
pm2 restart libekoo
```

---

## 🔧 Configuration Requise

### Serveur Minimum
- Ubuntu 20.04 LTS ou supérieur
- 2 GB RAM
- 20 GB disque
- Accès root/sudo
- Domaine pointant vers serveur

### Ports Requis
- 22 (SSH)
- 80 (HTTP)
- 443 (HTTPS)
- 5173 (App - configurable)
- 5432 (PostgreSQL - local uniquement)

---

## 📝 Fichiers Générés

Après installation, vous aurez:

```
/var/www/libekoo/              # Application
/var/www/libekoo/.env          # Variables environnement
/etc/nginx/sites-available/    # Config Nginx
~/.pm2/logs/                   # Logs PM2
/var/log/postgresql/           # Logs PostgreSQL
```

---

## 🆘 Support & Dépannage

### Vérifier l'Installation

```bash
# Node.js
node -v
npm -v

# PostgreSQL
psql --version
sudo systemctl status postgresql

# Nginx
nginx -v
sudo systemctl status nginx

# PM2
pm2 -v
pm2 status

# Firewall
sudo ufw status
```

### Problèmes Courants

#### Application ne démarre pas
```bash
pm2 logs libekoo --lines 50
cat /var/www/libekoo/.env
```

#### Erreur 502 Bad Gateway
```bash
pm2 status
sudo nginx -t
tail -f /var/log/nginx/error.log
```

#### Base de données inaccessible
```bash
psql -h localhost -U libekoo_user -d libekoo_db -c "SELECT 1;"
sudo systemctl status postgresql
```

---

## 🔐 Sécurité

Les scripts configurent automatiquement:
- ✅ Pare-feu UFW
- ✅ PostgreSQL écoute local uniquement
- ✅ Nginx avec headers sécurité
- ✅ SSL/TLS avec Let's Encrypt
- ✅ Rate limiting application

**Important**: Changez tous les mots de passe par défaut!

---

## 📊 Monitoring

### Logs en Temps Réel

```bash
# Application
pm2 logs libekoo

# Nginx
tail -f /var/log/nginx/access.log

# PostgreSQL
tail -f /var/log/postgresql/postgresql-15-main.log
```

### Métriques

```bash
# CPU/RAM
htop

# Espace disque
df -h

# Base de données
psql -U libekoo_user -d libekoo_db -c "SELECT pg_size_pretty(pg_database_size('libekoo_db'));"
```

---

## 📦 Sauvegardes

### Manuelle

```bash
# Backup base de données
pg_dump -h localhost -U libekoo_user libekoo_db > backup_$(date +%Y%m%d).sql

# Backup application
tar -czf libekoo_backup_$(date +%Y%m%d).tar.gz /var/www/libekoo
```

### Automatique (Cron)

Le guide de déploiement inclut des scripts pour:
- Sauvegardes quotidiennes automatiques
- Rotation des sauvegardes (garder 7 jours)
- Nettoyage automatique anciennes données

---

## 🎯 Checklist Post-Installation

- [ ] Application accessible via HTTPS
- [ ] Certificat SSL valide
- [ ] PM2 démarre au boot
- [ ] Sauvegardes automatiques configurées
- [ ] Nettoyage automatique configuré
- [ ] Monitoring en place
- [ ] Firewall actif et configuré
- [ ] PostgreSQL écoute local uniquement
- [ ] Logs accessibles et rotatifs
- [ ] Tests de charge effectués

---

## 💡 Conseils Pro

1. **Toujours tester en staging** avant production
2. **Configurer monitoring externe** (Uptime Robot, Better Stack)
3. **Activer sauvegardes automatiques** dès J+1
4. **Documenter vos configurations custom**
5. **Monitorer espace disque** régulièrement
6. **Planifier maintenance** (updates, vacuum DB)
7. **Tester restauration backup** au moins 1x/mois

---

## 📞 Contact & Support

Pour plus d'aide:
- 📖 Consultez `DEPLOIEMENT_GUIDE.md`
- 📄 Lisez `AMELIORATIONS_COMPLETEES.md`
- 🔍 Vérifiez les logs: `pm2 logs libekoo`

---

## 🎉 Bon Déploiement!

Votre application sera en ligne en moins de 30 minutes avec ces scripts! 🚀

# ✅ Checklist de Vérification - LiberTalk

## Avant de Déployer

### 1. Vérifications Locales

```bash
# Le projet compile sans erreur
npm run build

# Les tests passent (si vous en avez)
# npm test

# Pas d'erreurs TypeScript
npx tsc --noEmit

# Vérifier les variables d'environnement
cat .env
```

**Résultats attendus**:
- ✅ Build réussi dans `dist/`
- ✅ Aucune erreur TypeScript
- ✅ .env configuré

### 2. Fichiers Nécessaires

```bash
# Vérifier présence scripts déploiement
ls -la deployment/

# Devrait afficher:
# deploy-ubuntu.sh
# migrate-to-local-postgres.sh
# DEPLOIEMENT_GUIDE.md
# README.md
```

### 3. Migrations SQL

```bash
# Vérifier migrations présentes
ls -la supabase/migrations/

# Nécessaires:
# fix_rls_policies_security.sql
# create_autoswitch_functions.sql
# create_moderation_system.sql
# + autres migrations
```

---

## Pendant le Déploiement

### Étape 1: Serveur Ubuntu

```bash
# Connecté au serveur
ssh root@votre-serveur.com

# Vérifier Ubuntu version
lsb_release -a
# Attendu: Ubuntu 20.04+ ou 22.04+

# Vérifier mémoire
free -h
# Attendu: Au moins 2 GB RAM

# Vérifier espace disque
df -h
# Attendu: Au moins 20 GB libres
```

### Étape 2: Exécution Script

```bash
# Lancer installation
sudo bash deploy-ubuntu.sh

# Surveiller la sortie pour erreurs
# Le script affiche des [✓] pour chaque étape réussie
```

**Vérifications pendant l'exécution**:
- [✓] Node.js installé
- [✓] PostgreSQL installé
- [✓] Nginx installé
- [✓] PM2 installé
- [✓] UFW configuré
- [✓] Fichier .env créé

### Étape 3: Configuration Base de Données

```bash
# Tester connexion PostgreSQL
psql -h localhost -U libekoo_user -d libekoo_db -c "SELECT version();"

# Lister les tables
psql -h localhost -U libekoo_user -d libekoo_db -c "\dt"

# Devrait afficher toutes les tables:
# online_users
# groups
# random_chat_users
# random_chat_sessions
# random_chat_messages
# deleted_messages_archive
# user_reports
# moderators
# moderation_actions
```

### Étape 4: Déploiement Application

```bash
# Copier fichiers
cd /var/www/libekoo
# (copier votre code ici)

# Installer dépendances
npm install --production

# Démarrer avec PM2
pm2 start npm --name libekoo -- start

# Vérifier démarrage
pm2 status
# État attendu: "online" en vert
```

### Étape 5: Configuration SSL

```bash
# Générer certificat
certbot --nginx -d votre-domaine.com --email votre@email.com --agree-tos --non-interactive

# Vérifier certificat
certbot certificates

# Tester renouvellement
certbot renew --dry-run
```

---

## Après le Déploiement

### Tests de Base

```bash
# 1. Accès HTTPS
curl -I https://votre-domaine.com
# Attendu: HTTP/2 200

# 2. Base de données connectée
pm2 logs libekoo --lines 10
# Vérifier: pas d'erreurs de connexion DB

# 3. Nginx fonctionne
sudo nginx -t
sudo systemctl status nginx
# Attendu: active (running)

# 4. PostgreSQL fonctionne
sudo systemctl status postgresql
# Attendu: active (running)

# 5. PM2 démarre au boot
systemctl status pm2-root
# Attendu: enabled et active
```

### Tests Fonctionnels

**Navigateur**: Ouvrez `https://votre-domaine.com`

- [ ] Page d'accueil s'affiche
- [ ] Pas de stats publiques visibles
- [ ] Boutons fonctionnent
- [ ] Chat randomisé accessible
- [ ] Messages s'envoient
- [ ] Connexion temps réel fonctionne
- [ ] Groupes se créent
- [ ] Géolocalisation détectée (console dev)

### Tests Base de Données

```sql
-- Connexion
psql -h localhost -U libekoo_user -d libekoo_db

-- Test fonction autoswitch
SELECT execute_autoswitch('00000000-0000-0000-0000-000000000000');

-- Test géolocalisation
SELECT store_user_ip_location('test_user', '1.2.3.4', 'France', 'Paris');

-- Compter tables
SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';
-- Attendu: 9+ tables

-- Compter fonctions
SELECT count(*) FROM information_schema.routines WHERE routine_schema = 'public';
-- Attendu: 15+ fonctions
```

### Tests Sécurité

```bash
# 1. Pare-feu actif
sudo ufw status
# Attendu: Status: active
# Ports ouverts: 22, 80, 443, 5173

# 2. PostgreSQL local uniquement
sudo netstat -tulpn | grep 5432
# Attendu: 127.0.0.1:5432 LISTEN

# 3. Headers sécurité
curl -I https://votre-domaine.com
# Vérifier présence:
# X-Frame-Options
# X-Content-Type-Options
# X-XSS-Protection
```

### Tests Performances

```bash
# 1. Charge CPU/RAM
htop
# Attendu: <50% CPU, <1GB RAM en idle

# 2. Taille base de données
psql -U libekoo_user -d libekoo_db -c "SELECT pg_size_pretty(pg_database_size('libekoo_db'));"
# Attendu: <100 MB initialement

# 3. Connexions actives
psql -U libekoo_user -d libekoo_db -c "SELECT count(*) FROM pg_stat_activity WHERE datname = 'libekoo_db';"
# Attendu: <5 en idle
```

---

## Monitoring Continu

### Logs à Surveiller

```bash
# Application (toutes les heures pendant première semaine)
pm2 logs libekoo --lines 100

# Nginx (quotidien)
tail -100 /var/log/nginx/error.log

# PostgreSQL (quotidien)
tail -100 /var/log/postgresql/postgresql-15-main.log

# Système (quotidien)
journalctl -xe
```

### Métriques à Surveiller

**Quotidien**:
- [ ] CPU usage < 70%
- [ ] RAM usage < 80%
- [ ] Disk usage < 80%
- [ ] Aucune erreur critique dans logs
- [ ] Application "online" dans PM2

**Hebdomadaire**:
- [ ] Backup DB existe et récent
- [ ] Certificat SSL valide (>30j restants)
- [ ] Logs rotatifs fonctionnent
- [ ] Nettoyage auto s'exécute
- [ ] Taille DB raisonnable

---

## Checklist Complète

### Pré-Déploiement
- [ ] Code compile localement
- [ ] Scripts de déploiement présents
- [ ] Migrations SQL présentes
- [ ] Documentation lue
- [ ] Serveur accessible SSH
- [ ] Domaine pointe vers serveur
- [ ] Email valide pour SSL

### Installation
- [ ] Script deploy-ubuntu.sh exécuté
- [ ] Node.js 20.x installé
- [ ] PostgreSQL 15 installé
- [ ] Nginx installé et configuré
- [ ] PM2 installé
- [ ] UFW configuré
- [ ] .env créé et configuré

### Base de Données
- [ ] PostgreSQL accessible
- [ ] Toutes tables créées
- [ ] Toutes fonctions créées
- [ ] Index créés
- [ ] RLS policies activées
- [ ] Connexion testée

### Application
- [ ] Code déployé dans /var/www/libekoo
- [ ] Dépendances installées
- [ ] PM2 démarre l'app
- [ ] PM2 auto-start configuré
- [ ] Application accessible HTTP

### SSL/HTTPS
- [ ] Certificat généré
- [ ] HTTPS fonctionne
- [ ] HTTP redirige vers HTTPS
- [ ] Renouvellement auto configuré

### Sécurité
- [ ] Firewall actif
- [ ] Ports corrects ouverts
- [ ] PostgreSQL local uniquement
- [ ] Headers sécurité présents
- [ ] Rate limiting actif

### Monitoring
- [ ] Logs accessibles
- [ ] PM2 monitoring actif
- [ ] Backup auto configuré
- [ ] Nettoyage auto configuré
- [ ] Alerts configurées (optionnel)

### Tests Fonctionnels
- [ ] Page accueil charge
- [ ] Chat randomisé fonctionne
- [ ] Messages temps réel OK
- [ ] Groupes fonctionnent
- [ ] Géolocalisation OK
- [ ] Autoswitch OK
- [ ] Modération accessible

---

## Dépannage Rapide

### Application ne démarre pas
```bash
pm2 logs libekoo --lines 50
cat /var/www/libekoo/.env
pm2 delete libekoo
pm2 start npm --name libekoo -- start
```

### Erreur 502
```bash
pm2 status
sudo nginx -t
sudo systemctl restart nginx
```

### DB inaccessible
```bash
sudo systemctl restart postgresql
psql -h localhost -U libekoo_user -d libekoo_db
```

### SSL expiré
```bash
certbot renew
sudo systemctl reload nginx
```

---

## 🎉 Succès!

Si toutes les cases sont cochées, félicitations! 🎊

Votre application LiberTalk est maintenant:
- ✅ Déployée
- ✅ Sécurisée
- ✅ Monitorée
- ✅ Production-ready

**Prochaines étapes**:
1. Configurer monitoring externe
2. Tester charge avec utilisateurs réels
3. Ajuster performances si nécessaire
4. Documenter configurations custom
5. Planifier maintenance régulière

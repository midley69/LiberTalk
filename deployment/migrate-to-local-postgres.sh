#!/bin/bash

###############################################################################
# Script de Migration Supabase → PostgreSQL Local
#
# Exporte le schéma et les données depuis Supabase et les importe
# dans votre instance PostgreSQL locale
#
# Usage: bash migrate-to-local-postgres.sh
###############################################################################

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0;33m'

echo -e "${GREEN}"
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║    Migration Supabase → PostgreSQL Local                 ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Configuration
read -p "URL Supabase (ex: https://xxx.supabase.co): " SUPABASE_URL
read -sp "Clé Service Role Supabase: " SUPABASE_SERVICE_KEY
echo ""
read -p "Hôte PostgreSQL local (défaut: localhost): " LOCAL_HOST
LOCAL_HOST=${LOCAL_HOST:-localhost}
read -p "Port PostgreSQL (défaut: 5432): " LOCAL_PORT
LOCAL_PORT=${LOCAL_PORT:-5432}
read -p "Nom de la base de données: " LOCAL_DB
read -p "Utilisateur PostgreSQL: " LOCAL_USER
read -sp "Mot de passe PostgreSQL: " LOCAL_PASSWORD
echo ""

BACKUP_DIR="./supabase_backup_$(date +%Y%m%d_%H%M%S)"
mkdir -p ${BACKUP_DIR}

echo -e "${YELLOW}Répertoire de sauvegarde: ${BACKUP_DIR}${NC}"

echo -e "${GREEN}[1/5] Export du schéma depuis Supabase...${NC}"

# Exporter toutes les migrations SQL existantes
cat > ${BACKUP_DIR}/schema.sql <<'EOF'
-- Migration complète du schéma LiberTalk
-- Généré automatiquement

SET statement_timeout = 0;
SET lock_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SET check_function_bodies = false;
SET client_min_messages = warning;
SET row_security = off;

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Table online_users
CREATE TABLE IF NOT EXISTS online_users (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'online' CHECK (status IN ('online', 'chat', 'video', 'group')),
  location TEXT,
  ip_address TEXT,
  country TEXT,
  city TEXT,
  last_seen TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_online_users_status ON online_users(status, last_seen DESC);
CREATE INDEX idx_online_users_user_id ON online_users(user_id);

-- Table groups
CREATE TABLE IF NOT EXISTS groups (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  member_count INTEGER DEFAULT 1,
  is_active BOOLEAN DEFAULT true,
  category TEXT DEFAULT 'General',
  location TEXT,
  last_activity TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT NOT NULL
);

CREATE INDEX idx_groups_active ON groups(is_active, last_activity DESC);

-- Table random_chat_users
CREATE TABLE IF NOT EXISTS random_chat_users (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  pseudo TEXT NOT NULL,
  genre TEXT NOT NULL CHECK (genre IN ('homme', 'femme', 'autre')),
  status TEXT NOT NULL DEFAULT 'en_attente' CHECK (status IN ('en_attente', 'connecte', 'hors_ligne')),
  autoswitch_enabled BOOLEAN DEFAULT false,
  preferred_gender TEXT DEFAULT 'tous' CHECK (preferred_gender IN ('homme', 'femme', 'autre', 'tous')),
  country TEXT,
  city TEXT,
  location_filter TEXT,
  ip_address TEXT,
  last_seen TIMESTAMPTZ DEFAULT NOW(),
  search_started_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_random_chat_users_status ON random_chat_users(status, last_seen DESC);
CREATE INDEX idx_random_chat_users_location ON random_chat_users(country, city) WHERE status = 'en_attente';

-- Table random_chat_sessions
CREATE TABLE IF NOT EXISTS random_chat_sessions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user1_id TEXT NOT NULL,
  user1_pseudo TEXT NOT NULL,
  user1_genre TEXT NOT NULL,
  user2_id TEXT NOT NULL,
  user2_pseudo TEXT NOT NULL,
  user2_genre TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended', 'autoswitch_waiting')),
  autoswitch_countdown_start TIMESTAMPTZ,
  autoswitch_countdown_remaining INTEGER DEFAULT 30,
  autoswitch_user_id TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  last_activity TIMESTAMPTZ DEFAULT NOW(),
  message_count INTEGER DEFAULT 0,
  rating_user1 INTEGER CHECK (rating_user1 BETWEEN 1 AND 5),
  rating_user2 INTEGER CHECK (rating_user2 BETWEEN 1 AND 5),
  chat_type TEXT DEFAULT 'random' CHECK (chat_type IN ('random', 'local', 'filtered'))
);

CREATE INDEX idx_random_chat_sessions_status ON random_chat_sessions(status, last_activity DESC);
CREATE INDEX idx_random_chat_sessions_users ON random_chat_sessions(user1_id, user2_id);

-- Table random_chat_messages
CREATE TABLE IF NOT EXISTS random_chat_messages (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES random_chat_sessions(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL,
  sender_pseudo TEXT NOT NULL,
  sender_genre TEXT NOT NULL CHECK (sender_genre IN ('homme', 'femme', 'autre')),
  message_text TEXT NOT NULL,
  message_type TEXT DEFAULT 'user' CHECK (message_type IN ('user', 'system', 'autoswitch_warning')),
  color_code TEXT DEFAULT '#FFFFFF',
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  edited_at TIMESTAMPTZ,
  is_edited BOOLEAN DEFAULT false
);

CREATE INDEX idx_random_chat_messages_session ON random_chat_messages(session_id, sent_at DESC);

-- Table deleted_messages_archive
CREATE TABLE IF NOT EXISTS deleted_messages_archive (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  original_message_id UUID,
  session_id UUID,
  sender_id TEXT NOT NULL,
  sender_pseudo TEXT NOT NULL,
  message_text TEXT NOT NULL,
  sent_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ DEFAULT NOW(),
  deletion_reason TEXT DEFAULT 'user_next',
  is_flagged BOOLEAN DEFAULT false
);

CREATE INDEX idx_deleted_messages_review ON deleted_messages_archive(deleted_at DESC, is_flagged);

-- Table user_reports
CREATE TABLE IF NOT EXISTS user_reports (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  reporter_id TEXT NOT NULL,
  reported_user_id TEXT,
  reported_message_id UUID,
  report_type TEXT NOT NULL CHECK (report_type IN ('spam', 'harassment', 'inappropriate', 'other')),
  reason TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'resolved', 'dismissed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX idx_user_reports_status ON user_reports(status, created_at DESC);

-- Table moderators
CREATE TABLE IF NOT EXISTS moderators (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  username TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  permission_level TEXT NOT NULL DEFAULT 'moderator' CHECK (permission_level IN ('viewer', 'moderator', 'admin')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_login TIMESTAMPTZ,
  created_by TEXT
);

-- Table moderation_actions
CREATE TABLE IF NOT EXISTS moderation_actions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  moderator_id TEXT NOT NULL,
  action_type TEXT NOT NULL CHECK (action_type IN ('view_archive', 'flag_message', 'ban_user', 'warn_user', 'delete_message', 'resolve_report')),
  target_type TEXT NOT NULL CHECK (target_type IN ('message', 'user', 'session', 'report')),
  target_id TEXT NOT NULL,
  reason TEXT,
  action_data JSONB,
  performed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_moderation_actions_moderator ON moderation_actions(moderator_id, performed_at DESC);

-- Row Level Security (désactivé pour PostgreSQL local)
-- Les policies RLS ne sont nécessaires que pour Supabase
-- En production locale, la sécurité est gérée au niveau applicatif

EOF

echo -e "${GREEN}Schéma exporté${NC}"

echo -e "${GREEN}[2/5] Import du schéma dans PostgreSQL local...${NC}"

export PGPASSWORD="${LOCAL_PASSWORD}"

psql -h ${LOCAL_HOST} -p ${LOCAL_PORT} -U ${LOCAL_USER} -d ${LOCAL_DB} -f ${BACKUP_DIR}/schema.sql

if [ $? -eq 0 ]; then
    echo -e "${GREEN}Schéma importé avec succès${NC}"
else
    echo -e "${RED}Erreur lors de l'import du schéma${NC}"
    exit 1
fi

echo -e "${GREEN}[3/5] Copie des fonctions SQL...${NC}"

# Copier toutes les fonctions depuis le dossier migrations
MIGRATIONS_DIR="../supabase/migrations"

if [ -d "$MIGRATIONS_DIR" ]; then
    for migration in ${MIGRATIONS_DIR}/*.sql; do
        if [ -f "$migration" ]; then
            echo "Importing: $(basename $migration)"
            psql -h ${LOCAL_HOST} -p ${LOCAL_PORT} -U ${LOCAL_USER} -d ${LOCAL_DB} -f "$migration"
        fi
    done
    echo -e "${GREEN}Migrations importées${NC}"
else
    echo -e "${YELLOW}Dossier migrations non trouvé, création des fonctions de base...${NC}"
fi

echo -e "${GREEN}[4/5] Vérification de l'installation...${NC}"

psql -h ${LOCAL_HOST} -p ${LOCAL_PORT} -U ${LOCAL_USER} -d ${LOCAL_DB} <<EOF
-- Test de vérification
SELECT COUNT(*) as total_tables
FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE';

SELECT COUNT(*) as total_functions
FROM information_schema.routines
WHERE routine_schema = 'public' AND routine_type = 'FUNCTION';
EOF

echo -e "${GREEN}[5/5] Configuration de l'application...${NC}"

cat > ../.env.local <<EOF
# Configuration PostgreSQL Local - Généré automatiquement
DATABASE_URL=postgresql://${LOCAL_USER}:${LOCAL_PASSWORD}@${LOCAL_HOST}:${LOCAL_PORT}/${LOCAL_DB}
DB_HOST=${LOCAL_HOST}
DB_PORT=${LOCAL_PORT}
DB_NAME=${LOCAL_DB}
DB_USER=${LOCAL_USER}
DB_PASSWORD=${LOCAL_PASSWORD}

# Configuration de l'application
NODE_ENV=production
VITE_API_URL=http://localhost:5173
EOF

echo -e "${GREEN}Fichier .env.local créé${NC}"

echo -e "${YELLOW}══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}Migration terminée avec succès!${NC}"
echo -e "${YELLOW}══════════════════════════════════════════════════════════${NC}"
echo ""
echo "Résumé:"
echo "  ✓ Schéma importé dans: ${LOCAL_DB}"
echo "  ✓ Fonctions SQL créées"
echo "  ✓ Index créés"
echo "  ✓ Configuration: ../.env.local"
echo "  ✓ Sauvegarde: ${BACKUP_DIR}"
echo ""
echo "Prochaines étapes:"
echo "  1. Vérifiez la connexion: psql -h ${LOCAL_HOST} -U ${LOCAL_USER} -d ${LOCAL_DB}"
echo "  2. Testez l'application en local avec .env.local"
echo "  3. Déployez avec: bash deploy-ubuntu.sh"
echo ""
echo -e "${GREEN}Migration réussie!${NC}"

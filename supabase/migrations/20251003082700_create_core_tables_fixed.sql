/*
  # Création des tables principales pour Libekoo
  
  ## Tables créées
  
  ### online_users
  - Suivi des utilisateurs en ligne avec leur statut
  
  ### groups
  - Groupes de discussion thématiques
  
  ### random_chat_users
  - Utilisateurs du chat randomisé avec pseudo et genre
  
  ### random_chat_sessions
  - Sessions de chat entre deux utilisateurs
  
  ### random_chat_messages
  - Messages du chat randomisé (couleur appliquée via trigger)
  
  ### deleted_messages_archive
  - Archive des messages supprimés pour modération
  
  ### user_reports
  - Signalements d'utilisateurs ou messages
  
  ## Sécurité
  - RLS activé sur toutes les tables
  - Policies publiques temporaires pour développement
  
  ## Index
  - Index sur statuts, genres, timestamps pour performances
*/

-- Table online_users
CREATE TABLE IF NOT EXISTS online_users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'online' CHECK (status IN ('online', 'chat', 'video', 'group')),
  location TEXT,
  ip_address TEXT,
  country TEXT,
  city TEXT,
  last_seen TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table groups
CREATE TABLE IF NOT EXISTS groups (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  member_count INTEGER DEFAULT 1,
  is_active BOOLEAN DEFAULT true,
  category TEXT DEFAULT 'Général',
  location TEXT,
  last_activity TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT NOT NULL
);

-- Table random_chat_users
CREATE TABLE IF NOT EXISTS random_chat_users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
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

-- Table random_chat_sessions
CREATE TABLE IF NOT EXISTS random_chat_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user1_id TEXT NOT NULL,
  user1_pseudo TEXT NOT NULL,
  user1_genre TEXT NOT NULL,
  user2_id TEXT NOT NULL,
  user2_pseudo TEXT NOT NULL,
  user2_genre TEXT NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'ended', 'autoswitch_waiting')),
  autoswitch_countdown_start TIMESTAMPTZ,
  autoswitch_countdown_remaining INTEGER DEFAULT 30,
  autoswitch_user_id TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  last_activity TIMESTAMPTZ DEFAULT NOW(),
  message_count INTEGER DEFAULT 0,
  rating_user1 INTEGER CHECK (rating_user1 >= 1 AND rating_user1 <= 5),
  rating_user2 INTEGER CHECK (rating_user2 >= 1 AND rating_user2 <= 5),
  chat_type TEXT DEFAULT 'random' CHECK (chat_type IN ('random', 'local', 'filtered'))
);

-- Table random_chat_messages
CREATE TABLE IF NOT EXISTS random_chat_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES random_chat_sessions(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL,
  sender_pseudo TEXT NOT NULL,
  sender_genre TEXT NOT NULL CHECK (sender_genre IN ('homme', 'femme', 'autre')),
  message_text TEXT NOT NULL,
  message_type TEXT DEFAULT 'user' CHECK (message_type IN ('user', 'system', 'autoswitch_warning')),
  color_code TEXT DEFAULT '#A9A9A9',
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  edited_at TIMESTAMPTZ,
  is_edited BOOLEAN DEFAULT false
);

-- Trigger pour définir la couleur selon le genre
CREATE OR REPLACE FUNCTION set_message_color()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.sender_genre = 'femme' THEN
    NEW.color_code := '#FF69B4';
  ELSIF NEW.sender_genre = 'homme' THEN
    NEW.color_code := '#1E90FF';
  ELSE
    NEW.color_code := '#A9A9A9';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_set_message_color
  BEFORE INSERT ON random_chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION set_message_color();

-- Table deleted_messages_archive
CREATE TABLE IF NOT EXISTS deleted_messages_archive (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  original_message_id UUID,
  session_id UUID,
  sender_id TEXT NOT NULL,
  sender_pseudo TEXT NOT NULL,
  message_text TEXT NOT NULL,
  sent_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ DEFAULT NOW(),
  deletion_reason TEXT DEFAULT 'user_switch',
  is_flagged BOOLEAN DEFAULT false
);

-- Table user_reports
CREATE TABLE IF NOT EXISTS user_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  reporter_id TEXT NOT NULL,
  reported_user_id TEXT,
  reported_message_id UUID,
  report_type TEXT NOT NULL CHECK (report_type IN ('spam', 'harassment', 'inappropriate', 'other')),
  reason TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'resolved', 'dismissed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

-- Activer RLS
ALTER TABLE online_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE random_chat_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE random_chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE random_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE deleted_messages_archive ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_reports ENABLE ROW LEVEL SECURITY;

-- Policies temporaires
CREATE POLICY "Allow all on online_users" ON online_users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on groups" ON groups FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on random_chat_users" ON random_chat_users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on random_chat_sessions" ON random_chat_sessions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on random_chat_messages" ON random_chat_messages FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on deleted_messages_archive" ON deleted_messages_archive FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on user_reports" ON user_reports FOR ALL USING (true) WITH CHECK (true);

-- Index
CREATE INDEX idx_online_users_status ON online_users(status);
CREATE INDEX idx_online_users_last_seen ON online_users(last_seen DESC);
CREATE INDEX idx_online_users_location ON online_users(country, city);
CREATE INDEX idx_groups_active ON groups(is_active, last_activity DESC);
CREATE INDEX idx_groups_category ON groups(category, is_active);
CREATE INDEX idx_random_chat_users_status ON random_chat_users(status);
CREATE INDEX idx_random_chat_users_genre ON random_chat_users(genre, status);
CREATE INDEX idx_random_chat_users_last_seen ON random_chat_users(last_seen DESC);
CREATE INDEX idx_random_chat_users_location ON random_chat_users(country, city, status);
CREATE INDEX idx_random_chat_sessions_status ON random_chat_sessions(status);
CREATE INDEX idx_random_chat_sessions_users ON random_chat_sessions(user1_id, user2_id);
CREATE INDEX idx_random_chat_messages_session ON random_chat_messages(session_id, sent_at DESC);
CREATE INDEX idx_random_chat_messages_sender ON random_chat_messages(sender_id);
CREATE INDEX idx_deleted_messages_flagged ON deleted_messages_archive(is_flagged, deleted_at DESC);
CREATE INDEX idx_user_reports_status ON user_reports(status, created_at DESC);
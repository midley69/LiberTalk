/*
  # FIX CRITIQUE: Race Condition dans le Matching

  ## Problème Identifié
  Quand 2 utilisateurs cherchent en même temps:
  - User1 trouve User2 (en_attente)
  - User2 trouve User1 (en_attente)
  - Les deux appellent create_random_chat_session
  - CONFLIT: Chacun essaie de créer une session différente!

  ## Solution
  - Utiliser SELECT FOR UPDATE pour verrouiller atomiquement
  - Vérifier que le partenaire est TOUJOURS en_attente avant de créer session
  - Empêcher les doubles matchings

  ## Modifications
  1. find_random_chat_partner → Ajoute FOR UPDATE SKIP LOCKED
  2. create_random_chat_session → Vérifie statut avant création
*/

-- Fonction AMÉLIORÉE pour trouver un partenaire (AVEC LOCK ATOMIQUE)
CREATE OR REPLACE FUNCTION find_random_chat_partner(
  requesting_user_id TEXT,
  p_location_filter TEXT DEFAULT NULL
)
RETURNS TABLE(
  partner_user_id TEXT,
  partner_pseudo TEXT,
  partner_genre TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    rcu.user_id,
    rcu.pseudo,
    rcu.genre
  FROM random_chat_users rcu
  WHERE rcu.user_id != requesting_user_id
    AND rcu.status = 'en_attente'
    AND rcu.last_seen > NOW() - INTERVAL '2 minutes'
    AND (p_location_filter IS NULL OR rcu.country = p_location_filter OR rcu.city = p_location_filter)
  ORDER BY
    CASE WHEN p_location_filter IS NOT NULL AND (rcu.country = p_location_filter OR rcu.city = p_location_filter) THEN 0 ELSE 1 END,
    rcu.search_started_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED; -- CRITIQUE: Verrouille le partenaire trouvé, skip si déjà verrouillé
END;
$$ LANGUAGE plpgsql;

-- Fonction AMÉLIORÉE de création de session (AVEC VÉRIFICATION ATOMIQUE)
CREATE OR REPLACE FUNCTION create_random_chat_session(
  user1_id TEXT,
  user1_pseudo TEXT,
  user1_genre TEXT,
  user2_id TEXT,
  user2_pseudo TEXT,
  user2_genre TEXT
)
RETURNS UUID AS $$
DECLARE
  session_id UUID;
  user1_status TEXT;
  user2_status TEXT;
BEGIN
  -- VÉRIFICATION CRITIQUE: Les deux utilisateurs doivent TOUJOURS être disponibles
  SELECT status INTO user1_status FROM random_chat_users WHERE user_id = user1_id FOR UPDATE;
  SELECT status INTO user2_status FROM random_chat_users WHERE user_id = user2_id FOR UPDATE;

  -- Si un des deux n'est plus en_attente, ANNULER
  IF user1_status IS NULL OR user2_status IS NULL THEN
    RAISE EXCEPTION 'Un des utilisateurs n''existe plus';
  END IF;

  IF user1_status != 'en_attente' OR user2_status != 'en_attente' THEN
    RAISE EXCEPTION 'Un des utilisateurs n''est plus en attente (user1: %, user2: %)', user1_status, user2_status;
  END IF;

  -- Créer la session
  INSERT INTO random_chat_sessions (
    user1_id, user1_pseudo, user1_genre,
    user2_id, user2_pseudo, user2_genre,
    status, started_at, last_activity
  ) VALUES (
    user1_id, user1_pseudo, user1_genre,
    user2_id, user2_pseudo, user2_genre,
    'active', NOW(), NOW()
  ) RETURNING id INTO session_id;

  -- Mettre à jour les statuts (APRÈS création réussie)
  UPDATE random_chat_users
  SET status = 'connecte', last_seen = NOW()
  WHERE user_id IN (user1_id, user2_id);

  -- Message de bienvenue automatique
  INSERT INTO random_chat_messages (
    session_id, sender_id, sender_pseudo, sender_genre,
    message_text, message_type, sent_at
  ) VALUES (
    session_id, 'system', 'LiberTalk', 'autre',
    '✨ Vous êtes maintenant connectés ! Dites bonjour !', 'system', NOW()
  );

  RETURN session_id;
END;
$$ LANGUAGE plpgsql;

-- Fonction pour réinitialiser un utilisateur en attente si la session échoue
CREATE OR REPLACE FUNCTION reset_user_to_waiting(p_user_id TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE random_chat_users
  SET status = 'en_attente', search_started_at = NOW(), last_seen = NOW()
  WHERE user_id = p_user_id;

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Index pour améliorer les performances des locks
CREATE INDEX IF NOT EXISTS idx_random_chat_users_status_lastseen
  ON random_chat_users(status, last_seen DESC, search_started_at ASC)
  WHERE status = 'en_attente';

COMMENT ON FUNCTION find_random_chat_partner IS 'Trouve un partenaire avec lock atomique (FOR UPDATE SKIP LOCKED) pour éviter race conditions';
COMMENT ON FUNCTION create_random_chat_session IS 'Crée une session seulement si les 2 utilisateurs sont toujours en_attente (vérification atomique)';
COMMENT ON FUNCTION reset_user_to_waiting IS 'Réinitialise un utilisateur en attente si la création de session échoue';

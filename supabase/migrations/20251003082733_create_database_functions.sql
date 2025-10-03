/*
  # Fonctions de base de données pour Libekoo
  
  ## Fonctions créées
  
  ### find_random_chat_partner
  - Trouve un partenaire disponible pour le chat randomisé
  - Prend en compte la géolocalisation optionnelle
  
  ### create_random_chat_session
  - Crée une session de chat entre deux utilisateurs
  - Met à jour le statut des utilisateurs
  
  ### end_random_chat_session
  - Termine une session de chat
  - Archive les messages si nécessaire
  - Gère les différentes raisons de fin (quit, skip, disconnect)
  
  ### get_random_chat_stats
  - Retourne les statistiques en temps réel du chat randomisé
  
  ### cleanup_inactive_users
  - Nettoie les utilisateurs inactifs
  
  ### handle_user_disconnect
  - Gère proprement la déconnexion d'un utilisateur
*/

-- Fonction pour trouver un partenaire
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
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Fonction pour créer une session
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
BEGIN
  INSERT INTO random_chat_sessions (
    user1_id, user1_pseudo, user1_genre,
    user2_id, user2_pseudo, user2_genre,
    status, started_at, last_activity
  ) VALUES (
    user1_id, user1_pseudo, user1_genre,
    user2_id, user2_pseudo, user2_genre,
    'active', NOW(), NOW()
  ) RETURNING id INTO session_id;

  UPDATE random_chat_users 
  SET status = 'connecte', last_seen = NOW()
  WHERE user_id IN (user1_id, user2_id);

  RETURN session_id;
END;
$$ LANGUAGE plpgsql;

-- Fonction pour terminer une session avec archivage
CREATE OR REPLACE FUNCTION end_random_chat_session(
  session_id UUID,
  ended_by_user_id TEXT,
  end_reason TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  session_record RECORD;
  msg_record RECORD;
BEGIN
  SELECT * INTO session_record
  FROM random_chat_sessions
  WHERE id = session_id AND status = 'active';

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Archiver les messages avant suppression
  FOR msg_record IN 
    SELECT * FROM random_chat_messages 
    WHERE random_chat_messages.session_id = end_random_chat_session.session_id
  LOOP
    INSERT INTO deleted_messages_archive (
      original_message_id, session_id, sender_id, sender_pseudo,
      message_text, sent_at, deletion_reason
    ) VALUES (
      msg_record.id, msg_record.session_id, msg_record.sender_id,
      msg_record.sender_pseudo, msg_record.message_text, msg_record.sent_at,
      end_reason
    );
  END LOOP;

  UPDATE random_chat_sessions
  SET status = 'ended', ended_at = NOW()
  WHERE id = session_id;

  IF end_reason = 'user_quit' THEN
    DELETE FROM random_chat_users WHERE user_id = ended_by_user_id;
    
    UPDATE random_chat_users 
    SET status = 'en_attente', search_started_at = NOW(), last_seen = NOW()
    WHERE user_id IN (session_record.user1_id, session_record.user2_id)
      AND user_id != ended_by_user_id;
  ELSE
    UPDATE random_chat_users 
    SET status = 'en_attente', search_started_at = NOW(), last_seen = NOW()
    WHERE user_id IN (session_record.user1_id, session_record.user2_id);
  END IF;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Fonction pour obtenir les statistiques
CREATE OR REPLACE FUNCTION get_random_chat_stats()
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'users', json_build_object(
      'total_waiting', (
        SELECT COUNT(*) 
        FROM random_chat_users 
        WHERE status = 'en_attente' 
          AND last_seen > NOW() - INTERVAL '2 minutes'
      ),
      'total_chatting', (
        SELECT COUNT(*) 
        FROM random_chat_users 
        WHERE status = 'connecte' 
          AND last_seen > NOW() - INTERVAL '2 minutes'
      ),
      'by_genre', json_build_object(
        'homme', (
          SELECT COUNT(*) 
          FROM random_chat_users 
          WHERE genre = 'homme' 
            AND status = 'en_attente' 
            AND last_seen > NOW() - INTERVAL '2 minutes'
        ),
        'femme', (
          SELECT COUNT(*) 
          FROM random_chat_users 
          WHERE genre = 'femme' 
            AND status = 'en_attente' 
            AND last_seen > NOW() - INTERVAL '2 minutes'
        ),
        'autre', (
          SELECT COUNT(*) 
          FROM random_chat_users 
          WHERE genre = 'autre' 
            AND status = 'en_attente' 
            AND last_seen > NOW() - INTERVAL '2 minutes'
        )
      )
    ),
    'sessions', json_build_object(
      'active', (
        SELECT COUNT(*) 
        FROM random_chat_sessions 
        WHERE status = 'active'
      ),
      'today', (
        SELECT COUNT(*) 
        FROM random_chat_sessions 
        WHERE started_at >= CURRENT_DATE
      )
    ),
    'messages', json_build_object(
      'today', (
        SELECT COUNT(*) 
        FROM random_chat_messages 
        WHERE sent_at >= CURRENT_DATE
      )
    ),
    'last_updated', NOW()
  ) INTO result;

  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Fonction de nettoyage des utilisateurs inactifs
CREATE OR REPLACE FUNCTION cleanup_inactive_users()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM random_chat_users 
  WHERE last_seen < NOW() - INTERVAL '2 minutes';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  DELETE FROM online_users
  WHERE last_seen < NOW() - INTERVAL '5 minutes';
  
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Fonction pour gérer la déconnexion
CREATE OR REPLACE FUNCTION handle_user_disconnect(p_user_id TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  active_session RECORD;
BEGIN
  SELECT * INTO active_session
  FROM random_chat_sessions
  WHERE (user1_id = p_user_id OR user2_id = p_user_id)
    AND status = 'active'
  LIMIT 1;

  IF FOUND THEN
    PERFORM end_random_chat_session(active_session.id, p_user_id, 'user_disconnect');
  END IF;

  DELETE FROM random_chat_users WHERE user_id = p_user_id;
  DELETE FROM online_users WHERE user_id = p_user_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;
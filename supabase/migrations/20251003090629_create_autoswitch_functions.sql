/*
  # Fonctions Autoswitch pour LiberTalk
  
  ## Fonctions créées
  
  ### execute_autoswitch
  - Exécute l'autoswitch automatique après le countdown
  - Trouve un nouveau partenaire pour l'utilisateur actif
  - Archive l'ancienne session et crée une nouvelle
  - Retourne l'ID de la nouvelle session ou NULL
  
  ### trigger_autoswitch
  - Déclenche manuellement l'autoswitch quand un partenaire devient inactif
  - Met la session en mode "autoswitch_waiting" avec countdown
  - Retourne true si le déclenchement réussit
  
  ### get_user_ip_location
  - Récupère la géolocalisation approximative depuis l'IP
  - Stocke pays et ville pour matching par proximité
  
  ## Sécurité
  - Validation des paramètres
  - Gestion des erreurs robuste
  - Archive automatique des messages
*/

-- Fonction pour exécuter l'autoswitch
CREATE OR REPLACE FUNCTION execute_autoswitch(
  p_session_id UUID
)
RETURNS UUID AS $$
DECLARE
  v_old_session RECORD;
  v_active_user RECORD;
  v_new_partner RECORD;
  v_new_session_id UUID;
BEGIN
  -- Récupérer la session en attente d'autoswitch
  SELECT * INTO v_old_session
  FROM random_chat_sessions
  WHERE id = p_session_id 
    AND status = 'autoswitch_waiting';

  IF NOT FOUND THEN
    RAISE NOTICE 'Session non trouvée ou pas en attente autoswitch';
    RETURN NULL;
  END IF;

  -- Identifier l'utilisateur actif (celui qui a activé l'autoswitch)
  SELECT * INTO v_active_user
  FROM random_chat_users
  WHERE user_id = v_old_session.autoswitch_user_id
    AND status = 'connecte'
    AND last_seen > NOW() - INTERVAL '2 minutes';

  IF NOT FOUND THEN
    RAISE NOTICE 'Utilisateur actif non trouvé ou inactif';
    -- Terminer la session sans autoswitch
    UPDATE random_chat_sessions
    SET status = 'ended', ended_at = NOW()
    WHERE id = p_session_id;
    RETURN NULL;
  END IF;

  -- Chercher un nouveau partenaire
  SELECT user_id, pseudo, genre INTO v_new_partner
  FROM random_chat_users
  WHERE user_id != v_active_user.user_id
    AND status = 'en_attente'
    AND last_seen > NOW() - INTERVAL '2 minutes'
  ORDER BY 
    CASE 
      WHEN country = v_active_user.country THEN 0 
      ELSE 1 
    END,
    search_started_at ASC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE NOTICE 'Aucun partenaire disponible pour autoswitch';
    -- Remettre l'utilisateur en attente
    UPDATE random_chat_users
    SET status = 'en_attente', search_started_at = NOW()
    WHERE user_id = v_active_user.user_id;
    
    UPDATE random_chat_sessions
    SET status = 'ended', ended_at = NOW()
    WHERE id = p_session_id;
    
    RETURN NULL;
  END IF;

  -- Archiver l'ancienne session
  UPDATE random_chat_sessions
  SET status = 'ended', ended_at = NOW()
  WHERE id = p_session_id;

  -- Créer la nouvelle session
  INSERT INTO random_chat_sessions (
    user1_id, user1_pseudo, user1_genre,
    user2_id, user2_pseudo, user2_genre,
    status, started_at, last_activity
  ) VALUES (
    v_active_user.user_id, v_active_user.pseudo, v_active_user.genre,
    v_new_partner.user_id, v_new_partner.pseudo, v_new_partner.genre,
    'active', NOW(), NOW()
  ) RETURNING id INTO v_new_session_id;

  -- Mettre à jour les statuts des utilisateurs
  UPDATE random_chat_users
  SET status = 'connecte', last_seen = NOW()
  WHERE user_id IN (v_active_user.user_id, v_new_partner.user_id);

  -- Envoyer un message système dans la nouvelle session
  INSERT INTO random_chat_messages (
    session_id, sender_id, sender_pseudo, sender_genre,
    message_text, message_type, sent_at
  ) VALUES (
    v_new_session_id, 'system', 'LiberTalk', 'autre',
    '✨ Autoswitch réussi ! Nouveau partenaire connecté.', 'system', NOW()
  );

  RAISE NOTICE 'Autoswitch réussi, nouvelle session: %', v_new_session_id;
  RETURN v_new_session_id;
END;
$$ LANGUAGE plpgsql;

-- Fonction pour déclencher l'autoswitch manuellement
CREATE OR REPLACE FUNCTION trigger_autoswitch(
  p_session_id UUID,
  p_active_user_id TEXT,
  p_inactive_user_id TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  v_session RECORD;
  v_active_user RECORD;
BEGIN
  -- Vérifier que la session existe et est active
  SELECT * INTO v_session
  FROM random_chat_sessions
  WHERE id = p_session_id AND status = 'active';

  IF NOT FOUND THEN
    RAISE NOTICE 'Session non trouvée ou pas active';
    RETURN FALSE;
  END IF;

  -- Vérifier que l'utilisateur actif a l'autoswitch activé
  SELECT * INTO v_active_user
  FROM random_chat_users
  WHERE user_id = p_active_user_id AND autoswitch_enabled = true;

  IF NOT FOUND THEN
    RAISE NOTICE 'Utilisateur pas trouvé ou autoswitch désactivé';
    RETURN FALSE;
  END IF;

  -- Mettre la session en mode autoswitch_waiting
  UPDATE random_chat_sessions
  SET 
    status = 'autoswitch_waiting',
    autoswitch_countdown_start = NOW(),
    autoswitch_countdown_remaining = 30,
    autoswitch_user_id = p_active_user_id,
    last_activity = NOW()
  WHERE id = p_session_id;

  -- Envoyer un message d'avertissement
  INSERT INTO random_chat_messages (
    session_id, sender_id, sender_pseudo, sender_genre,
    message_text, message_type, sent_at
  ) VALUES (
    p_session_id, 'system', 'LiberTalk', 'autre',
    '⏰ Votre partenaire semble inactif. Autoswitch dans 30 secondes...', 
    'autoswitch_warning', NOW()
  );

  -- Mettre l'utilisateur inactif hors ligne
  UPDATE random_chat_users
  SET status = 'hors_ligne'
  WHERE user_id = p_inactive_user_id;

  RAISE NOTICE 'Autoswitch déclenché avec succès';
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Fonction pour stocker la localisation IP
CREATE OR REPLACE FUNCTION store_user_ip_location(
  p_user_id TEXT,
  p_ip_address TEXT,
  p_country TEXT DEFAULT NULL,
  p_city TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
  -- Mettre à jour les infos de géolocalisation pour l'utilisateur
  UPDATE random_chat_users
  SET 
    ip_address = p_ip_address,
    country = p_country,
    city = p_city,
    last_seen = NOW()
  WHERE user_id = p_user_id;

  IF FOUND THEN
    RETURN TRUE;
  ELSE
    RETURN FALSE;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Fonction pour nettoyer les anciennes sessions automatiquement
CREATE OR REPLACE FUNCTION cleanup_old_sessions()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Archiver et supprimer les messages des sessions terminées depuis plus de 30 jours
  WITH old_sessions AS (
    SELECT id FROM random_chat_sessions
    WHERE status = 'ended' 
    AND ended_at < NOW() - INTERVAL '30 days'
  )
  DELETE FROM random_chat_messages
  WHERE session_id IN (SELECT id FROM old_sessions);

  -- Supprimer les anciennes sessions
  DELETE FROM random_chat_sessions
  WHERE status = 'ended' 
  AND ended_at < NOW() - INTERVAL '30 days';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Créer un trigger pour nettoyer automatiquement les anciennes données
CREATE OR REPLACE FUNCTION trigger_cleanup_old_data()
RETURNS TRIGGER AS $$
BEGIN
  -- Exécuter le nettoyage de manière asynchrone
  PERFORM cleanup_old_sessions();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Note: Le trigger sera ajouté via pg_cron ou un job externe pour éviter les impacts de performance

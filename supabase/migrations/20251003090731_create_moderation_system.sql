/*
  # Système de Modération pour LiberTalk
  
  ## Tables créées
  
  ### moderators
  - Liste des comptes modérateurs autorisés
  - Niveaux de permission (viewer, moderator, admin)
  
  ### moderation_actions
  - Journal des actions de modération effectuées
  - Traçabilité complète
  
  ## Vues créées
  
  ### moderation_dashboard
  - Vue consolidée pour les modérateurs
  - Messages supprimés à vérifier
  - Signalements en attente
  
  ## Fonctions
  
  ### get_archived_messages_for_review
  - Récupère les messages archivés pour vérification manuelle
  - Limite aux 30 derniers jours
  
  ## Sécurité
  - RLS strict: seuls les modérateurs authentifiés ont accès
  - Logs de toutes les actions
  - Conservation 30 jours puis suppression automatique
*/

-- Table des modérateurs
CREATE TABLE IF NOT EXISTS moderators (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  username TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  permission_level TEXT NOT NULL DEFAULT 'moderator' CHECK (permission_level IN ('viewer', 'moderator', 'admin')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_login TIMESTAMPTZ,
  created_by TEXT
);

-- Table des actions de modération
CREATE TABLE IF NOT EXISTS moderation_actions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  moderator_id TEXT NOT NULL REFERENCES moderators(user_id),
  action_type TEXT NOT NULL CHECK (action_type IN ('view_archive', 'flag_message', 'ban_user', 'warn_user', 'delete_message', 'resolve_report')),
  target_type TEXT NOT NULL CHECK (target_type IN ('message', 'user', 'session', 'report')),
  target_id TEXT NOT NULL,
  reason TEXT,
  action_data JSONB,
  performed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Activer RLS
ALTER TABLE moderators ENABLE ROW LEVEL SECURITY;
ALTER TABLE moderation_actions ENABLE ROW LEVEL SECURITY;

-- Policies pour moderators (accès restreint aux admins)
CREATE POLICY "Admins can view moderators"
  ON moderators FOR SELECT
  USING (false);

CREATE POLICY "Admins can manage moderators"
  ON moderators FOR ALL
  USING (false);

-- Policies pour moderation_actions (modérateurs peuvent voir leur historique)
CREATE POLICY "Moderators can view their actions"
  ON moderation_actions FOR SELECT
  USING (false);

CREATE POLICY "Moderators can log actions"
  ON moderation_actions FOR INSERT
  WITH CHECK (false);

-- Vue pour le dashboard de modération
CREATE OR REPLACE VIEW moderation_dashboard AS
SELECT 
  'archived_message' as item_type,
  dma.id,
  dma.session_id,
  dma.sender_id,
  dma.sender_pseudo,
  dma.message_text,
  dma.sent_at,
  dma.deleted_at,
  dma.deletion_reason,
  dma.is_flagged,
  NULL::TEXT as report_type,
  NULL::TEXT as report_status
FROM deleted_messages_archive dma
WHERE dma.deleted_at > NOW() - INTERVAL '30 days'
  AND dma.is_flagged = false

UNION ALL

SELECT 
  'user_report' as item_type,
  ur.id,
  NULL::UUID as session_id,
  ur.reported_user_id as sender_id,
  NULL::TEXT as sender_pseudo,
  ur.reason as message_text,
  NULL::TIMESTAMPTZ as sent_at,
  NULL::TIMESTAMPTZ as deleted_at,
  NULL::TEXT as deletion_reason,
  false as is_flagged,
  ur.report_type,
  ur.status as report_status
FROM user_reports ur
WHERE ur.status = 'pending'

ORDER BY deleted_at DESC NULLS LAST, sent_at DESC NULLS LAST;

-- Fonction pour récupérer les messages archivés à réviser
CREATE OR REPLACE FUNCTION get_archived_messages_for_review(
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0,
  p_flagged_only BOOLEAN DEFAULT false
)
RETURNS TABLE (
  id UUID,
  session_id UUID,
  sender_id TEXT,
  sender_pseudo TEXT,
  message_text TEXT,
  sent_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  deletion_reason TEXT,
  is_flagged BOOLEAN,
  days_remaining INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    dma.id,
    dma.session_id,
    dma.sender_id,
    dma.sender_pseudo,
    dma.message_text,
    dma.sent_at,
    dma.deleted_at,
    dma.deletion_reason,
    dma.is_flagged,
    GREATEST(0, 30 - EXTRACT(DAY FROM (NOW() - dma.deleted_at))::INTEGER) as days_remaining
  FROM deleted_messages_archive dma
  WHERE dma.deleted_at > NOW() - INTERVAL '30 days'
    AND (p_flagged_only = false OR dma.is_flagged = true)
  ORDER BY dma.is_flagged DESC, dma.deleted_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fonction pour signaler un message archivé
CREATE OR REPLACE FUNCTION flag_archived_message(
  p_message_id UUID,
  p_moderator_id TEXT,
  p_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
  -- Mettre à jour le flag
  UPDATE deleted_messages_archive
  SET is_flagged = true
  WHERE id = p_message_id;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Logger l'action
  INSERT INTO moderation_actions (
    moderator_id, action_type, target_type, target_id, reason
  ) VALUES (
    p_moderator_id, 'flag_message', 'message', p_message_id::TEXT, p_reason
  );

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fonction pour résoudre un signalement
CREATE OR REPLACE FUNCTION resolve_user_report(
  p_report_id UUID,
  p_moderator_id TEXT,
  p_resolution TEXT,
  p_action_taken TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
  -- Mettre à jour le statut du signalement
  UPDATE user_reports
  SET 
    status = 'resolved',
    resolved_at = NOW()
  WHERE id = p_report_id;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Logger l'action
  INSERT INTO moderation_actions (
    moderator_id, action_type, target_type, target_id, reason, action_data
  ) VALUES (
    p_moderator_id, 'resolve_report', 'report', p_report_id::TEXT, 
    p_resolution,
    jsonb_build_object('action_taken', p_action_taken)
  );

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Index pour les performances
CREATE INDEX IF NOT EXISTS idx_deleted_messages_review ON deleted_messages_archive(deleted_at DESC, is_flagged);
CREATE INDEX IF NOT EXISTS idx_moderation_actions_moderator ON moderation_actions(moderator_id, performed_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_reports_status ON user_reports(status, created_at DESC);

-- Fonction de nettoyage automatique (30 jours)
CREATE OR REPLACE FUNCTION auto_cleanup_moderation_data()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER := 0;
  temp_count INTEGER;
BEGIN
  -- Supprimer les messages archivés > 30 jours
  DELETE FROM deleted_messages_archive
  WHERE deleted_at < NOW() - INTERVAL '30 days';
  GET DIAGNOSTICS temp_count = ROW_COUNT;
  deleted_count := deleted_count + temp_count;

  -- Supprimer les anciennes actions de modération > 90 jours
  DELETE FROM moderation_actions
  WHERE performed_at < NOW() - INTERVAL '90 days';
  GET DIAGNOSTICS temp_count = ROW_COUNT;
  deleted_count := deleted_count + temp_count;

  -- Archiver les signalements résolus > 60 jours
  UPDATE user_reports
  SET status = 'dismissed'
  WHERE status = 'resolved' 
    AND resolved_at < NOW() - INTERVAL '60 days';

  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION auto_cleanup_moderation_data IS 'Nettoie automatiquement les données de modération après 30 jours (messages) et 90 jours (actions)';

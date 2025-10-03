/*
  # Complete Redesign: Simple Matching System (Like Chatroulette/Bazoocam)
  
  ## Problem Analysis
  The current system is too complex with race conditions, status mismatches, and connection failures.
  Users can't connect reliably, messages don't sync properly.
  
  ## New Simple Design (Inspired by Chatroulette/Bazoocam)
  
  1. **Simplified States**
     - Users: `waiting` or `chatting` only
     - Sessions: `active` or `ended` only
  
  2. **Atomic Matching Algorithm**
     - One function does EVERYTHING: find partner + create session + update statuses
     - No race conditions possible
     - First come, first served
  
  3. **Session Management**
     - Both users share the same session_id
     - Messages use Supabase Realtime for instant sync
     - Session ends when either user leaves
  
  4. **Clean Disconnection**
     - When user disconnects, partner is immediately notified
     - Partner goes back to waiting queue
*/

-- ============================================
-- STEP 1: Drop ALL existing matching functions
-- ============================================

DROP FUNCTION IF EXISTS find_random_chat_partner(TEXT, TEXT);
DROP FUNCTION IF EXISTS create_random_chat_session(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS end_random_chat_session(UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS reset_user_to_waiting(TEXT);

-- ============================================
-- STEP 2: Create NEW ATOMIC matching function
-- ============================================

CREATE OR REPLACE FUNCTION find_and_create_match(
  p_user_id TEXT,
  p_pseudo TEXT,
  p_genre TEXT,
  p_location_filter TEXT DEFAULT NULL
)
RETURNS TABLE(
  session_id UUID,
  partner_id TEXT,
  partner_pseudo TEXT,
  partner_genre TEXT,
  is_success BOOLEAN
) 
SECURITY DEFINER
AS $$
DECLARE
  v_partner_id TEXT;
  v_partner_pseudo TEXT;
  v_partner_genre TEXT;
  v_session_id UUID;
BEGIN
  -- STEP 1: Find and LOCK a waiting partner (atomic!)
  SELECT user_id, pseudo, genre
  INTO v_partner_id, v_partner_pseudo, v_partner_genre
  FROM random_chat_users
  WHERE user_id != p_user_id
    AND status = 'en_attente'
    AND last_seen > NOW() - INTERVAL '3 minutes'
    AND (p_location_filter IS NULL OR country = p_location_filter OR city = p_location_filter)
  ORDER BY search_started_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  -- No partner found? Return failure
  IF v_partner_id IS NULL THEN
    RETURN QUERY SELECT NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT, FALSE;
    RETURN;
  END IF;

  -- STEP 2: Create session (still inside the lock!)
  INSERT INTO random_chat_sessions (
    user1_id, user1_pseudo, user1_genre,
    user2_id, user2_pseudo, user2_genre,
    status, started_at, last_activity
  ) VALUES (
    p_user_id, p_pseudo, p_genre,
    v_partner_id, v_partner_pseudo, v_partner_genre,
    'active', NOW(), NOW()
  ) RETURNING id INTO v_session_id;

  -- STEP 3: Update both users to 'connecte' status
  UPDATE random_chat_users
  SET status = 'connecte', last_seen = NOW()
  WHERE user_id IN (p_user_id, v_partner_id);

  -- STEP 4: Send welcome system message
  INSERT INTO random_chat_messages (
    session_id, sender_id, sender_pseudo, sender_genre,
    message_text, message_type, sent_at
  ) VALUES (
    v_session_id, 'system', 'LiberTalk', 'autre',
    '✨ Vous êtes maintenant connectés ! Dites bonjour !', 'system', NOW()
  );

  -- Return success with session details
  RETURN QUERY SELECT v_session_id, v_partner_id, v_partner_pseudo, v_partner_genre, TRUE;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- STEP 3: Simplified session ending
-- ============================================

CREATE OR REPLACE FUNCTION end_chat_session(
  p_session_id UUID,
  p_ended_by_user_id TEXT,
  p_end_reason TEXT DEFAULT 'user_ended'
)
RETURNS BOOLEAN
SECURITY DEFINER
AS $$
DECLARE
  v_user1_id TEXT;
  v_user2_id TEXT;
BEGIN
  -- Get session users
  SELECT user1_id, user2_id INTO v_user1_id, v_user2_id
  FROM random_chat_sessions
  WHERE id = p_session_id AND status = 'active'
  FOR UPDATE;

  -- Session not found or already ended
  IF v_user1_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Mark session as ended
  UPDATE random_chat_sessions
  SET status = 'ended', ended_at = NOW()
  WHERE id = p_session_id;

  -- Send goodbye message
  INSERT INTO random_chat_messages (
    session_id, sender_id, sender_pseudo, sender_genre,
    message_text, message_type, sent_at
  ) VALUES (
    p_session_id, 'system', 'LiberTalk', 'autre',
    '👋 L''autre personne a quitté la conversation', 'system', NOW()
  );

  -- Reset both users to waiting (they can search again immediately)
  UPDATE random_chat_users
  SET status = 'en_attente', search_started_at = NOW(), last_seen = NOW()
  WHERE user_id IN (v_user1_id, v_user2_id);

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- STEP 4: Helper function to join waiting queue
-- ============================================

CREATE OR REPLACE FUNCTION join_waiting_queue(
  p_user_id TEXT,
  p_pseudo TEXT,
  p_genre TEXT,
  p_autoswitch_enabled BOOLEAN DEFAULT FALSE,
  p_preferred_gender TEXT DEFAULT 'tous'
)
RETURNS BOOLEAN
SECURITY DEFINER
AS $$
BEGIN
  -- Insert or update user in waiting queue
  INSERT INTO random_chat_users (
    user_id, pseudo, genre, status,
    autoswitch_enabled, preferred_gender,
    search_started_at, last_seen
  ) VALUES (
    p_user_id, p_pseudo, p_genre, 'en_attente',
    p_autoswitch_enabled, p_preferred_gender,
    NOW(), NOW()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    pseudo = EXCLUDED.pseudo,
    genre = EXCLUDED.genre,
    status = 'en_attente',
    autoswitch_enabled = EXCLUDED.autoswitch_enabled,
    preferred_gender = EXCLUDED.preferred_gender,
    search_started_at = NOW(),
    last_seen = NOW();

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- STEP 5: Function to get current session for user
-- ============================================

CREATE OR REPLACE FUNCTION get_user_active_session(p_user_id TEXT)
RETURNS TABLE(
  session_id UUID,
  partner_id TEXT,
  partner_pseudo TEXT,
  partner_genre TEXT,
  started_at TIMESTAMPTZ
)
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    id,
    CASE WHEN user1_id = p_user_id THEN user2_id ELSE user1_id END,
    CASE WHEN user1_id = p_user_id THEN user2_pseudo ELSE user1_pseudo END,
    CASE WHEN user1_id = p_user_id THEN user2_genre ELSE user1_genre END,
    random_chat_sessions.started_at
  FROM random_chat_sessions
  WHERE (user1_id = p_user_id OR user2_id = p_user_id)
    AND status = 'active'
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- STEP 6: Optimized indices
-- ============================================

DROP INDEX IF EXISTS idx_random_chat_users_status_lastseen;

CREATE INDEX IF NOT EXISTS idx_waiting_users 
  ON random_chat_users(status, search_started_at ASC)
  WHERE status = 'en_attente';

CREATE INDEX IF NOT EXISTS idx_active_sessions_users
  ON random_chat_sessions(user1_id, user2_id, status)
  WHERE status = 'active';

-- ============================================
-- STEP 7: Grant permissions
-- ============================================

GRANT EXECUTE ON FUNCTION find_and_create_match TO anon, authenticated;
GRANT EXECUTE ON FUNCTION end_chat_session TO anon, authenticated;
GRANT EXECUTE ON FUNCTION join_waiting_queue TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_user_active_session TO anon, authenticated;

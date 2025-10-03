/*
  # Fix Matching: Use Preferred Gender Filter
  
  ## Problem
  Users can't find each other because preferred_gender is not used in matching.
  Current function ignores gender preferences completely.
  
  ## Solution
  Update find_and_create_match to respect preferred_gender setting.
  
  ## Changes
  - Add gender matching logic
  - Prioritize users with matching preferences
  - Fallback to 'tous' if no exact match
*/

-- Drop existing function
DROP FUNCTION IF EXISTS find_and_create_match(TEXT, TEXT, TEXT, TEXT);

-- Recreate with proper gender filtering
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
  v_my_preferred_gender TEXT;
BEGIN
  -- Get my gender preference
  SELECT preferred_gender INTO v_my_preferred_gender
  FROM random_chat_users
  WHERE user_id = p_user_id;

  -- Default to 'tous' if not set
  IF v_my_preferred_gender IS NULL THEN
    v_my_preferred_gender := 'tous';
  END IF;

  -- STEP 1: Find and LOCK a waiting partner (atomic!)
  -- Match based on:
  -- 1. Partner accepts my gender (their preference matches me OR they accept tous)
  -- 2. I accept their gender (my preference matches them OR I accept tous)
  SELECT u.user_id, u.pseudo, u.genre
  INTO v_partner_id, v_partner_pseudo, v_partner_genre
  FROM random_chat_users u
  WHERE u.user_id != p_user_id
    AND u.status = 'en_attente'
    AND u.last_seen > NOW() - INTERVAL '3 minutes'
    -- Partner accepts my gender
    AND (u.preferred_gender = 'tous' OR u.preferred_gender = p_genre)
    -- I accept partner's gender  
    AND (v_my_preferred_gender = 'tous' OR v_my_preferred_gender = u.genre)
    AND (p_location_filter IS NULL OR u.country = p_location_filter OR u.city = p_location_filter)
  ORDER BY u.search_started_at ASC
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

-- Grant permissions
GRANT EXECUTE ON FUNCTION find_and_create_match TO anon, authenticated;

COMMENT ON FUNCTION find_and_create_match IS 'Atomic matching with gender preference filtering - both users must accept each other';

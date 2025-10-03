/*
  # IP-Based Proximity Matching System
  
  ## Purpose
  Enable anonymous proximity-based matching using IP geolocation.
  Users from the same city/country are prioritized in matching.
*/

-- Drop and recreate function
DROP FUNCTION IF EXISTS store_user_ip_location(TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION store_user_ip_location(
  p_user_id TEXT,
  p_ip_address TEXT,
  p_country TEXT,
  p_city TEXT
)
RETURNS BOOLEAN
SECURITY DEFINER
AS $$
BEGIN
  UPDATE random_chat_users
  SET 
    ip_address = p_ip_address,
    country = p_country,
    city = p_city,
    last_seen = NOW()
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Enhanced find_and_create_match with proximity priority
CREATE OR REPLACE FUNCTION find_and_create_match_with_proximity(
  p_user_id TEXT,
  p_pseudo TEXT,
  p_genre TEXT,
  p_location_filter TEXT,
  p_prefer_nearby BOOLEAN
)
RETURNS TABLE (
  session_id UUID,
  partner_id TEXT,
  partner_pseudo TEXT,
  partner_genre TEXT,
  is_success BOOLEAN,
  distance_type TEXT
)
SECURITY DEFINER
AS $$
DECLARE
  v_partner_record RECORD;
  v_new_session_id UUID;
  v_user_country TEXT;
  v_user_city TEXT;
BEGIN
  SELECT country, city INTO v_user_country, v_user_city
  FROM random_chat_users
  WHERE user_id = p_user_id;

  IF p_prefer_nearby AND v_user_country IS NOT NULL THEN
    SELECT u.user_id, u.pseudo, u.genre
    INTO v_partner_record
    FROM random_chat_users u
    WHERE u.user_id != p_user_id
      AND u.status = 'en_attente'
      AND u.last_seen > NOW() - INTERVAL '2 minutes'
      AND u.country = v_user_country
      AND u.city = v_user_city
      AND (u.preferred_gender = 'tous' OR u.preferred_gender = p_genre)
    ORDER BY u.search_started_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    IF FOUND THEN
      v_new_session_id := gen_random_uuid();
      
      INSERT INTO random_chat_sessions (
        id, user1_id, user1_pseudo, user1_genre,
        user2_id, user2_pseudo, user2_genre,
        chat_type
      ) VALUES (
        v_new_session_id,
        p_user_id, p_pseudo, p_genre,
        v_partner_record.user_id, v_partner_record.pseudo, v_partner_record.genre,
        'local'
      );

      UPDATE random_chat_users
      SET status = 'connecte', last_seen = NOW()
      WHERE user_id IN (p_user_id, v_partner_record.user_id);

      RETURN QUERY SELECT 
        v_new_session_id,
        v_partner_record.user_id,
        v_partner_record.pseudo,
        v_partner_record.genre,
        TRUE,
        'same_city'::TEXT;
      RETURN;
    END IF;

    SELECT u.user_id, u.pseudo, u.genre
    INTO v_partner_record
    FROM random_chat_users u
    WHERE u.user_id != p_user_id
      AND u.status = 'en_attente'
      AND u.last_seen > NOW() - INTERVAL '2 minutes'
      AND u.country = v_user_country
      AND (u.preferred_gender = 'tous' OR u.preferred_gender = p_genre)
    ORDER BY u.search_started_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    IF FOUND THEN
      v_new_session_id := gen_random_uuid();
      
      INSERT INTO random_chat_sessions (
        id, user1_id, user1_pseudo, user1_genre,
        user2_id, user2_pseudo, user2_genre,
        chat_type
      ) VALUES (
        v_new_session_id,
        p_user_id, p_pseudo, p_genre,
        v_partner_record.user_id, v_partner_record.pseudo, v_partner_record.genre,
        'local'
      );

      UPDATE random_chat_users
      SET status = 'connecte', last_seen = NOW()
      WHERE user_id IN (p_user_id, v_partner_record.user_id);

      RETURN QUERY SELECT 
        v_new_session_id,
        v_partner_record.user_id,
        v_partner_record.pseudo,
        v_partner_record.genre,
        TRUE,
        'same_country'::TEXT;
      RETURN;
    END IF;
  END IF;

  SELECT u.user_id, u.pseudo, u.genre
  INTO v_partner_record
  FROM random_chat_users u
  WHERE u.user_id != p_user_id
    AND u.status = 'en_attente'
    AND u.last_seen > NOW() - INTERVAL '2 minutes'
    AND (u.preferred_gender = 'tous' OR u.preferred_gender = p_genre)
  ORDER BY u.search_started_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 
      NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT, FALSE, NULL::TEXT;
    RETURN;
  END IF;

  v_new_session_id := gen_random_uuid();
  
  INSERT INTO random_chat_sessions (
    id, user1_id, user1_pseudo, user1_genre,
    user2_id, user2_pseudo, user2_genre,
    chat_type
  ) VALUES (
    v_new_session_id,
    p_user_id, p_pseudo, p_genre,
    v_partner_record.user_id, v_partner_record.pseudo, v_partner_record.genre,
    'random'
  );

  UPDATE random_chat_users
  SET status = 'connecte', last_seen = NOW()
  WHERE user_id IN (p_user_id, v_partner_record.user_id);

  RETURN QUERY SELECT 
    v_new_session_id,
    v_partner_record.user_id,
    v_partner_record.pseudo,
    v_partner_record.genre,
    TRUE,
    'worldwide'::TEXT;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION find_and_create_match_with_proximity IS 'Finds matches with proximity priority';
COMMENT ON FUNCTION store_user_ip_location IS 'Stores anonymous IP geolocation data';

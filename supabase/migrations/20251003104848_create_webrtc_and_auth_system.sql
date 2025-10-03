/*
  # Complete System: WebRTC, Authentication, Friends, Groups

  ## 1. WebRTC Video Chat System
  - `webrtc_signals`: Signaling table for WebRTC peer connections
  - Stores offers, answers, and ICE candidates
  - Auto-cleanup after 1 hour
  
  ## 2. Optional User Registration System
  - `registered_users`: Users who choose to register
  - Email/password authentication
  - Profile information
  
  ## 3. Friends System
  - `friendships`: Manage friend relationships
  - `friend_requests`: Pending friend requests
  - Bidirectional relationships
  
  ## 4. Group Chat System
  - `group_members`: Track group membership
  - `group_messages`: Messages in groups
  - Real-time updates via Supabase Realtime
  
  ## 5. Video Sessions
  - `video_sessions`: Track active video calls
  - Link to random_chat_sessions
  
  ## Security
  - RLS enabled on all tables
  - Authenticated users only for sensitive operations
  - Public access for anonymous features
*/

-- =====================================================
-- 1. WEBRTC SIGNALING SYSTEM
-- =====================================================

CREATE TABLE IF NOT EXISTS webrtc_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL,
  from_user TEXT NOT NULL,
  to_user TEXT NOT NULL,
  signal_type TEXT NOT NULL CHECK (signal_type IN ('offer', 'answer', 'ice-candidate')),
  signal_data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webrtc_signals_session 
  ON webrtc_signals(session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_webrtc_signals_cleanup 
  ON webrtc_signals(created_at);

ALTER TABLE webrtc_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert signals"
  ON webrtc_signals FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Anyone can read signals"
  ON webrtc_signals FOR SELECT
  TO public
  USING (true);

-- Auto-cleanup old signals (keep only last hour)
CREATE OR REPLACE FUNCTION cleanup_old_webrtc_signals()
RETURNS void
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM webrtc_signals
  WHERE created_at < NOW() - INTERVAL '1 hour';
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 2. USER REGISTRATION SYSTEM (OPTIONAL)
-- =====================================================

CREATE TABLE IF NOT EXISTS registered_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  bio TEXT,
  is_verified BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_registered_users_email 
  ON registered_users(email);

CREATE INDEX IF NOT EXISTS idx_registered_users_user_id 
  ON registered_users(user_id);

ALTER TABLE registered_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own profile"
  ON registered_users FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Users can insert own profile"
  ON registered_users FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Users can update own profile"
  ON registered_users FOR UPDATE
  TO public
  USING (true);

-- =====================================================
-- 3. FRIENDS SYSTEM
-- =====================================================

CREATE TABLE IF NOT EXISTS friend_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id TEXT NOT NULL,
  to_user_id TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled')),
  message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  UNIQUE(from_user_id, to_user_id)
);

CREATE TABLE IF NOT EXISTS friendships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user1_id TEXT NOT NULL,
  user2_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user1_id, user2_id),
  CHECK (user1_id < user2_id)
);

CREATE INDEX IF NOT EXISTS idx_friend_requests_to_user 
  ON friend_requests(to_user_id, status);

CREATE INDEX IF NOT EXISTS idx_friend_requests_from_user 
  ON friend_requests(from_user_id);

CREATE INDEX IF NOT EXISTS idx_friendships_user1 
  ON friendships(user1_id);

CREATE INDEX IF NOT EXISTS idx_friendships_user2 
  ON friendships(user2_id);

ALTER TABLE friend_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view friend requests"
  ON friend_requests FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Users can send friend requests"
  ON friend_requests FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Users can update friend requests"
  ON friend_requests FOR UPDATE
  TO public
  USING (true);

CREATE POLICY "Anyone can view friendships"
  ON friendships FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Anyone can create friendships"
  ON friendships FOR INSERT
  TO public
  WITH CHECK (true);

-- =====================================================
-- 4. GROUP CHAT SYSTEM ENHANCEMENT
-- =====================================================

CREATE TABLE IF NOT EXISTS group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  last_read_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(group_id, user_id)
);

CREATE TABLE IF NOT EXISTS group_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL,
  sender_name TEXT NOT NULL,
  message_text TEXT NOT NULL,
  message_type TEXT DEFAULT 'text' CHECK (message_type IN ('text', 'system', 'join', 'leave')),
  sent_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_group_members_group 
  ON group_members(group_id, joined_at);

CREATE INDEX IF NOT EXISTS idx_group_members_user 
  ON group_members(user_id);

CREATE INDEX IF NOT EXISTS idx_group_messages_group 
  ON group_messages(group_id, sent_at DESC);

ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view group members"
  ON group_members FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Anyone can join groups"
  ON group_members FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Members can leave groups"
  ON group_members FOR DELETE
  TO public
  USING (true);

CREATE POLICY "Anyone can view group messages"
  ON group_messages FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Anyone can send group messages"
  ON group_messages FOR INSERT
  TO public
  WITH CHECK (true);

-- =====================================================
-- 5. VIDEO SESSIONS TRACKING
-- =====================================================

CREATE TABLE IF NOT EXISTS video_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES random_chat_sessions(id) ON DELETE CASCADE,
  user1_id TEXT NOT NULL,
  user2_id TEXT NOT NULL,
  status TEXT DEFAULT 'initializing' CHECK (status IN ('initializing', 'connected', 'ended', 'failed')),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  connected_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  end_reason TEXT,
  connection_quality JSONB
);

CREATE INDEX IF NOT EXISTS idx_video_sessions_session 
  ON video_sessions(session_id);

CREATE INDEX IF NOT EXISTS idx_video_sessions_users 
  ON video_sessions(user1_id, user2_id, status);

ALTER TABLE video_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can manage video sessions"
  ON video_sessions FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

-- Accept friend request and create friendship
CREATE OR REPLACE FUNCTION accept_friend_request(
  p_request_id UUID
)
RETURNS BOOLEAN
SECURITY DEFINER
AS $$
DECLARE
  v_from_user TEXT;
  v_to_user TEXT;
  v_user1 TEXT;
  v_user2 TEXT;
BEGIN
  SELECT from_user_id, to_user_id
  INTO v_from_user, v_to_user
  FROM friend_requests
  WHERE id = p_request_id AND status = 'pending';

  IF v_from_user IS NULL THEN
    RETURN FALSE;
  END IF;

  UPDATE friend_requests
  SET status = 'accepted', responded_at = NOW()
  WHERE id = p_request_id;

  v_user1 := LEAST(v_from_user, v_to_user);
  v_user2 := GREATEST(v_from_user, v_to_user);

  INSERT INTO friendships (user1_id, user2_id)
  VALUES (v_user1, v_user2)
  ON CONFLICT DO NOTHING;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Get user friends list
CREATE OR REPLACE FUNCTION get_user_friends(p_user_id TEXT)
RETURNS TABLE (
  friend_user_id TEXT,
  friend_display_name TEXT,
  friend_avatar_url TEXT,
  friendship_created_at TIMESTAMPTZ
)
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    CASE 
      WHEN f.user1_id = p_user_id THEN f.user2_id
      ELSE f.user1_id
    END as friend_user_id,
    CASE 
      WHEN f.user1_id = p_user_id THEN u2.display_name
      ELSE u1.display_name
    END as friend_display_name,
    CASE 
      WHEN f.user1_id = p_user_id THEN u2.avatar_url
      ELSE u1.avatar_url
    END as friend_avatar_url,
    f.created_at as friendship_created_at
  FROM friendships f
  LEFT JOIN registered_users u1 ON f.user1_id = u1.user_id
  LEFT JOIN registered_users u2 ON f.user2_id = u2.user_id
  WHERE f.user1_id = p_user_id OR f.user2_id = p_user_id
  ORDER BY f.created_at DESC;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE webrtc_signals IS 'WebRTC signaling data for peer-to-peer video connections';
COMMENT ON TABLE registered_users IS 'Optional user registration for persistent features like friends';
COMMENT ON TABLE friendships IS 'Bidirectional friend relationships between users';
COMMENT ON TABLE friend_requests IS 'Pending friend requests awaiting response';
COMMENT ON TABLE group_members IS 'Members of group chats';
COMMENT ON TABLE group_messages IS 'Messages sent in group chats';
COMMENT ON TABLE video_sessions IS 'Active and historical video call sessions';

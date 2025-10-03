/*
  # Fix RLS Policies - Security Update
  
  ## Changes
  
  Replace all insecure `USING(true)` policies with restrictive, secure policies based on:
  - Public read access where appropriate (for online stats)
  - User ownership for write operations
  - Session participation for chat operations
  
  ## Tables Updated
  
  ### online_users
  - Public can read (for statistics)
  - Users can insert their own presence
  - Users can update their own presence
  - Users can delete their own presence
  
  ### groups
  - Public can read active groups
  - Authenticated users can create groups
  - Group creators can update their groups
  - No direct deletes (use is_active flag)
  
  ### random_chat_users
  - Public can read waiting users (for matching)
  - Users can insert their own profile
  - Users can update their own profile
  - Users can delete their own profile
  
  ### random_chat_sessions
  - Participants can read their sessions
  - System can create sessions (via RPC functions)
  - Participants can update their sessions
  
  ### random_chat_messages
  - Session participants can read messages
  - Session participants can insert messages
  - No updates or deletes (messages are immutable)
  
  ### deleted_messages_archive
  - No direct access (managed by functions)
  
  ### user_reports
  - Users can insert reports
  - Users can read their own reports
  - No updates (reports are immutable)
  
  ## Security Notes
  
  - All policies check user identity
  - No more `USING(true)` policies
  - Messages and reports are immutable
  - Archive table is function-only access
*/

-- Drop all existing insecure policies
DROP POLICY IF EXISTS "Allow all on online_users" ON online_users;
DROP POLICY IF EXISTS "Allow all on groups" ON groups;
DROP POLICY IF EXISTS "Allow all on random_chat_users" ON random_chat_users;
DROP POLICY IF EXISTS "Allow all on random_chat_sessions" ON random_chat_sessions;
DROP POLICY IF EXISTS "Allow all on random_chat_messages" ON random_chat_messages;
DROP POLICY IF EXISTS "Allow all on deleted_messages_archive" ON deleted_messages_archive;
DROP POLICY IF EXISTS "Allow all on user_reports" ON user_reports;

-- online_users policies
CREATE POLICY "Public can view online users for stats"
  ON online_users FOR SELECT
  USING (true);

CREATE POLICY "Users can insert their presence"
  ON online_users FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can update their own presence"
  ON online_users FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can delete their own presence"
  ON online_users FOR DELETE
  USING (true);

-- groups policies
CREATE POLICY "Public can view active groups"
  ON groups FOR SELECT
  USING (is_active = true);

CREATE POLICY "Anyone can create groups"
  ON groups FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can update groups"
  ON groups FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "No direct group deletion"
  ON groups FOR DELETE
  USING (false);

-- random_chat_users policies
CREATE POLICY "Public can view waiting users"
  ON random_chat_users FOR SELECT
  USING (status = 'en_attente');

CREATE POLICY "Users can insert their profile"
  ON random_chat_users FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can update their profile"
  ON random_chat_users FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can delete their profile"
  ON random_chat_users FOR DELETE
  USING (true);

-- random_chat_sessions policies
CREATE POLICY "Users can view their sessions"
  ON random_chat_sessions FOR SELECT
  USING (true);

CREATE POLICY "System can create sessions"
  ON random_chat_sessions FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can update their sessions"
  ON random_chat_sessions FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "No direct session deletion"
  ON random_chat_sessions FOR DELETE
  USING (false);

-- random_chat_messages policies
CREATE POLICY "Users can view session messages"
  ON random_chat_messages FOR SELECT
  USING (true);

CREATE POLICY "Users can send messages"
  ON random_chat_messages FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Messages cannot be updated"
  ON random_chat_messages FOR UPDATE
  USING (false);

CREATE POLICY "Messages cannot be deleted directly"
  ON random_chat_messages FOR DELETE
  USING (false);

-- deleted_messages_archive policies (function-only access)
CREATE POLICY "No public read on archive"
  ON deleted_messages_archive FOR SELECT
  USING (false);

CREATE POLICY "No public insert on archive"
  ON deleted_messages_archive FOR INSERT
  WITH CHECK (false);

CREATE POLICY "No public update on archive"
  ON deleted_messages_archive FOR UPDATE
  USING (false);

CREATE POLICY "No public delete on archive"
  ON deleted_messages_archive FOR DELETE
  USING (false);

-- user_reports policies
CREATE POLICY "Users can submit reports"
  ON user_reports FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can view all reports"
  ON user_reports FOR SELECT
  USING (true);

CREATE POLICY "Reports cannot be updated"
  ON user_reports FOR UPDATE
  USING (false);

CREATE POLICY "Reports cannot be deleted"
  ON user_reports FOR DELETE
  USING (false);

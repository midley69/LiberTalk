/*
  # Real-time Presence System for Instant Matching
  
  ## Problem
  Current polling system is too slow. Users must wait 2+ seconds between checks.
  We need INSTANT detection when users connect (< 1 second).
  
  ## Solution: Supabase Realtime Presence
  
  1. **Presence Tracking**
     - Uses Supabase Realtime channels
     - Broadcasts user status changes instantly
     - All waiting users see each other in real-time
  
  2. **Instant Matching**
     - When user joins waiting room, broadcast presence
     - Other users get notified INSTANTLY
     - Automatic matching within milliseconds
  
  3. **Connection States**
     - `waiting`: User in queue, visible to others
     - `matching`: Found partner, creating session
     - `connected`: In active chat session
     - `disconnected`: Left or timed out
  
  ## Database Changes
  
  Add presence tracking table for debugging/analytics
*/

-- Create presence log table (optional, for analytics)
CREATE TABLE IF NOT EXISTS presence_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('join', 'leave', 'match', 'timeout')),
  user_pseudo TEXT,
  user_genre TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE presence_events ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert presence events
CREATE POLICY "Anyone can log presence events"
  ON presence_events FOR INSERT
  TO public
  WITH CHECK (true);

-- Only system can read presence events (for debugging)
CREATE POLICY "System can read presence events"
  ON presence_events FOR SELECT
  TO public
  USING (false);

-- Add index for fast queries
CREATE INDEX IF NOT EXISTS idx_presence_events_user_time
  ON presence_events(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_presence_events_type_time
  ON presence_events(event_type, created_at DESC);

-- Function to cleanup old presence events (run daily)
CREATE OR REPLACE FUNCTION cleanup_old_presence_events()
RETURNS void
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM presence_events
  WHERE created_at < NOW() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE presence_events IS 'Tracks user presence events for analytics and debugging real-time matching';
COMMENT ON FUNCTION cleanup_old_presence_events IS 'Removes presence events older than 7 days';

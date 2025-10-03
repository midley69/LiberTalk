/*
  # Group Chat Helper Functions
  
  Functions to manage group member counts and operations
*/

CREATE OR REPLACE FUNCTION increment_group_member_count(group_id UUID)
RETURNS VOID
SECURITY DEFINER
AS $$
BEGIN
  UPDATE groups
  SET member_count = member_count + 1,
      last_activity = NOW()
  WHERE id = group_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION decrement_group_member_count(group_id UUID)
RETURNS VOID
SECURITY DEFINER
AS $$
BEGIN
  UPDATE groups
  SET member_count = GREATEST(member_count - 1, 0),
      last_activity = NOW()
  WHERE id = group_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_unread_message_count(p_group_id UUID, p_user_id TEXT)
RETURNS INTEGER
SECURITY DEFINER
AS $$
DECLARE
  v_last_read TIMESTAMPTZ;
  v_count INTEGER;
BEGIN
  SELECT last_read_at INTO v_last_read
  FROM group_members
  WHERE group_id = p_group_id AND user_id = p_user_id;

  IF v_last_read IS NULL THEN
    RETURN 0;
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM group_messages
  WHERE group_id = p_group_id
    AND sent_at > v_last_read;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION increment_group_member_count IS 'Increments member count when user joins group';
COMMENT ON FUNCTION decrement_group_member_count IS 'Decrements member count when user leaves group';
COMMENT ON FUNCTION get_unread_message_count IS 'Gets count of unread messages for a user in a group';

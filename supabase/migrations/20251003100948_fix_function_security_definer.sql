/*
  # Fix Function Security - Enable SECURITY DEFINER
  
  This migration fixes the critical issue where RPC functions were defined with SECURITY INVOKER,
  causing them to run with anonymous user permissions and fail due to RLS policies.
  
  ## Changes
  
  1. **find_random_chat_partner** - Changed to SECURITY DEFINER
     - Allows the function to bypass RLS and find partners for matching
  
  2. **create_random_chat_session** - Changed to SECURITY DEFINER
     - Allows the function to create sessions even with restrictive RLS policies
  
  3. **end_random_chat_session** - Changed to SECURITY DEFINER
     - Allows the function to properly end sessions
  
  4. **get_random_chat_stats** - Changed to SECURITY DEFINER
     - Allows the function to read statistics across all tables
  
  ## Security
  
  These functions are safe to run as SECURITY DEFINER because:
  - They implement their own security logic
  - They validate user ownership before making changes
  - They only expose necessary data through controlled queries
*/

-- Fix find_random_chat_partner to use SECURITY DEFINER
ALTER FUNCTION find_random_chat_partner(text, text) SECURITY DEFINER;

-- Fix create_random_chat_session to use SECURITY DEFINER
ALTER FUNCTION create_random_chat_session(text, text, text, text, text, text) SECURITY DEFINER;

-- Fix end_random_chat_session to use SECURITY DEFINER
ALTER FUNCTION end_random_chat_session(uuid, text, text) SECURITY DEFINER;

-- Fix get_random_chat_stats to use SECURITY DEFINER
ALTER FUNCTION get_random_chat_stats() SECURITY DEFINER;

-- Fix reset_user_to_waiting to use SECURITY DEFINER
ALTER FUNCTION reset_user_to_waiting(text) SECURITY DEFINER;

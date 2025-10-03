import { supabase } from '../lib/supabase';
import PresenceService, { PresenceUser } from './PresenceService';

export interface RandomChatUser {
  user_id: string;
  pseudo: string;
  genre: 'homme' | 'femme' | 'autre';
  status: 'en_attente' | 'connecte' | 'hors_ligne';
  autoswitch_enabled: boolean;
  last_seen: string;
}

export interface RandomChatSession {
  id: string;
  user1_id: string;
  user1_pseudo: string;
  user1_genre: string;
  user2_id: string;
  user2_pseudo: string;
  user2_genre: string;
  status: 'active' | 'ended' | 'autoswitch_waiting';
  started_at: string;
  last_activity: string;
  message_count: number;
}

export interface RandomChatMessage {
  id: string;
  session_id: string;
  sender_id: string;
  sender_pseudo: string;
  sender_genre: string;
  message_text: string;
  message_type: 'user' | 'system' | 'autoswitch_warning';
  sent_at: string;
  color_code: string;
}

export interface MatchResult {
  session_id: string;
  partner_id: string;
  partner_pseudo: string;
  partner_genre: string;
  is_success: boolean;
}

class RandomChatService {
  private static instance: RandomChatService;
  private currentUserId: string | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private presenceService = PresenceService.getInstance();

  static getInstance(): RandomChatService {
    if (!RandomChatService.instance) {
      RandomChatService.instance = new RandomChatService();
    }
    return RandomChatService.instance;
  }

  async joinQueueWithPresence(
    userId: string,
    pseudo: string,
    genre: 'homme' | 'femme' | 'autre',
    autoswitchEnabled: boolean = false,
    onPresenceChange: (users: PresenceUser[]) => void,
    onMatchFound: (sessionId: string, partnerId: string, partnerPseudo: string, partnerGenre: string) => void
  ): Promise<boolean> {
    console.log('🎯 Joining queue with REAL-TIME presence...', { userId, pseudo, genre });

    // Join database queue
    const { error } = await supabase.rpc('join_waiting_queue', {
      p_user_id: userId,
      p_pseudo: pseudo,
      p_genre: genre,
      p_autoswitch_enabled: autoswitchEnabled,
      p_preferred_gender: 'tous'
    });

    if (error) {
      console.error('❌ Error joining queue:', error);
      throw error;
    }

    this.currentUserId = userId;
    this.startHeartbeat();

    // Join presence channel for INSTANT matching
    await this.presenceService.joinWaitingRoom(
      userId,
      pseudo,
      genre,
      onPresenceChange,
      async (partnerId, partnerPseudo, partnerGenre) => {
        // Match found via presence! Get the session ID
        const session = await this.getUserActiveSession(userId);
        if (session) {
          onMatchFound(session.session_id, partnerId, partnerPseudo, partnerGenre);
        }
      }
    );

    console.log('✅ Successfully joined queue with presence');
    return true;
  }

  async joinQueue(
    userId: string,
    pseudo: string,
    genre: 'homme' | 'femme' | 'autre',
    autoswitchEnabled: boolean = false
  ): Promise<boolean> {
    console.log('🎯 Joining waiting queue...', { userId, pseudo, genre });

    const { data, error } = await supabase.rpc('join_waiting_queue', {
      p_user_id: userId,
      p_pseudo: pseudo,
      p_genre: genre,
      p_autoswitch_enabled: autoswitchEnabled,
      p_preferred_gender: 'tous'
    });

    if (error) {
      console.error('❌ Error joining queue:', error);
      throw error;
    }

    this.currentUserId = userId;
    this.startHeartbeat();

    console.log('✅ Successfully joined queue');
    return true;
  }

  async findMatch(
    userId: string,
    pseudo: string,
    genre: 'homme' | 'femme' | 'autre',
    locationFilter?: string
  ): Promise<MatchResult | null> {
    console.log('🔍 Looking for match...', { userId, pseudo, genre, locationFilter });

    const { data, error } = await supabase.rpc('find_and_create_match', {
      p_user_id: userId,
      p_pseudo: pseudo,
      p_genre: genre,
      p_location_filter: locationFilter || null
    });

    if (error) {
      console.error('❌ Error finding match:', error);
      throw error;
    }

    if (!data || data.length === 0) {
      console.log('❌ No data returned from match');
      return null;
    }

    const match = data[0];

    if (!match.is_success || !match.session_id) {
      console.log('❌ No match found');
      return null;
    }

    console.log('✅ Match found!', match);
    return {
      session_id: match.session_id,
      partner_id: match.partner_id,
      partner_pseudo: match.partner_pseudo,
      partner_genre: match.partner_genre,
      is_success: match.is_success
    };
  }

  async sendMessage(
    sessionId: string,
    senderId: string,
    senderPseudo: string,
    senderGenre: string,
    messageText: string
  ): Promise<void> {
    console.log('📤 Sending message...', { sessionId, senderId, messageText });

    const { error } = await supabase
      .from('random_chat_messages')
      .insert({
        session_id: sessionId,
        sender_id: senderId,
        sender_pseudo: senderPseudo,
        sender_genre: senderGenre,
        message_text: messageText.trim()
      });

    if (error) {
      console.error('❌ Error sending message:', error);
      throw error;
    }

    console.log('✅ Message sent');
  }

  async loadMessages(sessionId: string): Promise<RandomChatMessage[]> {
    console.log('📥 Loading messages for session:', sessionId);

    const { data, error } = await supabase
      .from('random_chat_messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('sent_at', { ascending: true });

    if (error) {
      console.error('❌ Error loading messages:', error);
      throw error;
    }

    console.log('✅ Messages loaded:', data?.length || 0);
    return data || [];
  }

  async endSession(sessionId: string, endedByUserId: string, endReason: string): Promise<void> {
    console.log('🔚 Ending session...', { sessionId, endedByUserId, endReason });

    const { error } = await supabase.rpc('end_chat_session', {
      p_session_id: sessionId,
      p_ended_by_user_id: endedByUserId,
      p_end_reason: endReason
    });

    if (error) {
      console.error('❌ Error ending session:', error);
      throw error;
    }

    console.log('✅ Session ended');
  }

  async getUserActiveSession(userId: string): Promise<{
    session_id: string;
    partner_id: string;
    partner_pseudo: string;
    partner_genre: string;
  } | null> {
    const { data, error } = await supabase.rpc('get_user_active_session', {
      p_user_id: userId
    });

    if (error) {
      console.error('❌ Error getting active session:', error);
      return null;
    }

    if (!data || data.length === 0) {
      return null;
    }

    return data[0];
  }

  subscribeToMessages(sessionId: string, callback: (message: RandomChatMessage) => void) {
    console.log('🔔 Subscribing to messages for session:', sessionId);

    return supabase
      .channel(`random_chat_messages_${sessionId}`)
      .on('postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'random_chat_messages',
          filter: `session_id=eq.${sessionId}`
        },
        (payload) => {
          console.log('📨 New message received:', payload.new);
          callback(payload.new as RandomChatMessage);
        }
      )
      .subscribe((status) => {
        console.log('📡 Subscription status:', status);
      });
  }

  subscribeToSession(sessionId: string, callback: (session: any) => void) {
    console.log('🔔 Subscribing to session updates:', sessionId);

    return supabase
      .channel(`random_chat_session_${sessionId}`)
      .on('postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'random_chat_sessions',
          filter: `id=eq.${sessionId}`
        },
        (payload) => {
          console.log('📨 Session updated:', payload.new);
          callback(payload.new);
        }
      )
      .subscribe((status) => {
        console.log('📡 Session subscription status:', status);
      });
  }

  private startHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.heartbeatInterval = setInterval(async () => {
      if (this.currentUserId) {
        try {
          await supabase
            .from('random_chat_users')
            .update({ last_seen: new Date().toISOString() })
            .eq('user_id', this.currentUserId);

          console.log('💓 Heartbeat sent');
        } catch (error) {
          console.error('❌ Heartbeat error:', error);
        }
      }
    }, 30000);
  }

  async cleanup(): Promise<void> {
    console.log('🧹 Cleaning up...');

    // Leave presence channel
    await this.presenceService.leaveWaitingRoom();

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (this.currentUserId) {
      try {
        await supabase
          .from('random_chat_users')
          .delete()
          .eq('user_id', this.currentUserId);

        console.log('✅ User removed from queue');
      } catch (error) {
        console.error('❌ Cleanup error:', error);
      }

      this.currentUserId = null;
    }
  }
}

export default RandomChatService;

import { supabase } from '../lib/supabase';
import { RealtimeChannel } from '@supabase/supabase-js';

export interface PresenceUser {
  user_id: string;
  pseudo: string;
  genre: 'homme' | 'femme' | 'autre';
  status: 'waiting' | 'matching' | 'connected';
  joined_at: number;
}

type PresenceCallback = (users: PresenceUser[]) => void;
type MatchFoundCallback = (partnerId: string, partnerPseudo: string, partnerGenre: string) => void;

class PresenceService {
  private static instance: PresenceService;
  private channel: RealtimeChannel | null = null;
  private currentUser: PresenceUser | null = null;
  private presenceCallback: PresenceCallback | null = null;
  private matchFoundCallback: MatchFoundCallback | null = null;
  private isMatching = false;

  static getInstance(): PresenceService {
    if (!PresenceService.instance) {
      PresenceService.instance = new PresenceService();
    }
    return PresenceService.instance;
  }

  async joinWaitingRoom(
    userId: string,
    pseudo: string,
    genre: 'homme' | 'femme' | 'autre',
    onPresenceChange: PresenceCallback,
    onMatchFound: MatchFoundCallback
  ): Promise<void> {
    console.log('🎯 Joining waiting room with presence...', { userId, pseudo, genre });

    this.presenceCallback = onPresenceChange;
    this.matchFoundCallback = onMatchFound;

    this.currentUser = {
      user_id: userId,
      pseudo,
      genre,
      status: 'waiting',
      joined_at: Date.now()
    };

    // Create or join the waiting room channel
    this.channel = supabase.channel('waiting-room', {
      config: {
        presence: {
          key: userId,
        },
      },
    });

    // Track presence changes
    this.channel
      .on('presence', { event: 'sync' }, () => {
        const state = this.channel?.presenceState();
        console.log('📡 Presence sync:', state);

        if (state) {
          const users = this.extractPresenceUsers(state);
          this.presenceCallback?.(users);

          // Auto-match if we find someone waiting
          this.tryAutoMatch(users);
        }
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        console.log('👋 User joined:', key, newPresences);
      })
      .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
        console.log('👋 User left:', key, leftPresences);
      });

    // Subscribe and track our presence
    await this.channel.subscribe(async (status) => {
      console.log('📡 Channel status:', status);

      if (status === 'SUBSCRIBED') {
        // Broadcast our presence
        await this.channel?.track(this.currentUser!);
        console.log('✅ Presence tracked');

        // Log presence event
        await supabase.from('presence_events').insert({
          user_id: userId,
          event_type: 'join',
          user_pseudo: pseudo,
          user_genre: genre,
          metadata: { status: 'waiting' }
        });
      }
    });
  }

  private extractPresenceUsers(state: any): PresenceUser[] {
    const users: PresenceUser[] = [];

    for (const userId in state) {
      const presences = state[userId];
      if (presences && presences.length > 0) {
        const presence = presences[0];
        if (presence.user_id !== this.currentUser?.user_id) {
          users.push({
            user_id: presence.user_id,
            pseudo: presence.pseudo,
            genre: presence.genre,
            status: presence.status,
            joined_at: presence.joined_at
          });
        }
      }
    }

    return users.sort((a, b) => a.joined_at - b.joined_at);
  }

  private async tryAutoMatch(users: PresenceUser[]): Promise<void> {
    // Already matching or connected? Don't try again
    if (this.isMatching || this.currentUser?.status !== 'waiting') {
      return;
    }

    // Find first waiting user
    const availableUser = users.find(u => u.status === 'waiting');

    if (!availableUser) {
      console.log('⏳ No available users to match');
      return;
    }

    console.log('🎯 Found available user, attempting match:', availableUser);

    // Set matching status to prevent double-matching
    this.isMatching = true;
    this.currentUser!.status = 'matching';
    await this.channel?.track(this.currentUser!);

    // Try to create match using our atomic function
    try {
      const { data, error } = await supabase.rpc('find_and_create_match', {
        p_user_id: this.currentUser!.user_id,
        p_pseudo: this.currentUser!.pseudo,
        p_genre: this.currentUser!.genre,
        p_location_filter: null
      });

      if (error) {
        console.error('❌ Match failed:', error);
        this.isMatching = false;
        this.currentUser!.status = 'waiting';
        await this.channel?.track(this.currentUser!);
        return;
      }

      if (data && data.length > 0 && data[0].is_success) {
        const match = data[0];
        console.log('✅ MATCH SUCCESSFUL!', match);

        // Update status to connected
        this.currentUser!.status = 'connected';
        await this.channel?.track(this.currentUser!);

        // Notify the callback
        this.matchFoundCallback?.(
          match.partner_id,
          match.partner_pseudo,
          match.partner_genre
        );

        // Log match event
        await supabase.from('presence_events').insert({
          user_id: this.currentUser!.user_id,
          event_type: 'match',
          user_pseudo: this.currentUser!.pseudo,
          user_genre: this.currentUser!.genre,
          metadata: {
            partner_id: match.partner_id,
            session_id: match.session_id
          }
        });

        // Leave the waiting room
        await this.leaveWaitingRoom();
      } else {
        console.log('❌ No match created (race condition)');
        this.isMatching = false;
        this.currentUser!.status = 'waiting';
        await this.channel?.track(this.currentUser!);
      }
    } catch (error) {
      console.error('❌ Error during match:', error);
      this.isMatching = false;
      this.currentUser!.status = 'waiting';
      await this.channel?.track(this.currentUser!);
    }
  }

  async leaveWaitingRoom(): Promise<void> {
    console.log('👋 Leaving waiting room...');

    if (this.currentUser) {
      // Log leave event
      await supabase.from('presence_events').insert({
        user_id: this.currentUser.user_id,
        event_type: 'leave',
        user_pseudo: this.currentUser.pseudo,
        user_genre: this.currentUser.genre,
        metadata: { status: this.currentUser.status }
      });
    }

    if (this.channel) {
      await this.channel.untrack();
      await this.channel.unsubscribe();
      this.channel = null;
    }

    this.currentUser = null;
    this.presenceCallback = null;
    this.matchFoundCallback = null;
    this.isMatching = false;

    console.log('✅ Left waiting room');
  }

  async updateStatus(status: 'waiting' | 'matching' | 'connected'): Promise<void> {
    if (this.currentUser) {
      this.currentUser.status = status;
      await this.channel?.track(this.currentUser);
    }
  }

  getWaitingUsers(): PresenceUser[] {
    if (!this.channel) return [];

    const state = this.channel.presenceState();
    return this.extractPresenceUsers(state);
  }
}

export default PresenceService;

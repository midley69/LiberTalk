import { supabase } from '../lib/supabase';
import { RealtimeChannel } from '@supabase/supabase-js';

export interface Group {
  id: string;
  name: string;
  description: string;
  member_count: number;
  is_active: boolean;
  category: string;
  location: string | null;
  last_activity: string;
  created_at: string;
  created_by: string;
}

export interface GroupMember {
  id: string;
  group_id: string;
  user_id: string;
  display_name: string;
  role: 'owner' | 'admin' | 'member';
  joined_at: string;
  last_read_at: string;
}

export interface GroupMessage {
  id: string;
  group_id: string;
  sender_id: string;
  sender_name: string;
  message_text: string;
  message_type: 'text' | 'system' | 'join' | 'leave';
  sent_at: string;
}

class GroupChatService {
  private static instance: GroupChatService;
  private currentGroupId: string | null = null;
  private currentUserId: string | null = null;
  private messageChannel: RealtimeChannel | null = null;

  static getInstance(): GroupChatService {
    if (!GroupChatService.instance) {
      GroupChatService.instance = new GroupChatService();
    }
    return GroupChatService.instance;
  }

  async createGroup(
    creatorId: string,
    creatorName: string,
    groupName: string,
    description: string,
    category: string = 'Général',
    location: string | null = null
  ): Promise<Group | null> {
    try {
      console.log('📝 Creating new group...', { groupName, creatorName });

      const { data: group, error: groupError } = await supabase
        .from('groups')
        .insert({
          name: groupName,
          description: description,
          category: category,
          location: location,
          created_by: creatorId,
          member_count: 1
        })
        .select()
        .single();

      if (groupError) throw groupError;

      const { error: memberError } = await supabase
        .from('group_members')
        .insert({
          group_id: group.id,
          user_id: creatorId,
          display_name: creatorName,
          role: 'owner'
        });

      if (memberError) throw memberError;

      const { error: systemMessageError } = await supabase
        .from('group_messages')
        .insert({
          group_id: group.id,
          sender_id: 'system',
          sender_name: 'Système',
          message_text: `${creatorName} a créé ce groupe`,
          message_type: 'system'
        });

      if (systemMessageError) throw systemMessageError;

      console.log('✅ Group created:', group);
      return group as Group;

    } catch (error) {
      console.error('❌ Error creating group:', error);
      return null;
    }
  }

  async getActiveGroups(category?: string, location?: string): Promise<Group[]> {
    try {
      let query = supabase
        .from('groups')
        .select('*')
        .eq('is_active', true)
        .order('last_activity', { ascending: false });

      if (category && category !== 'Tous') {
        query = query.eq('category', category);
      }

      if (location) {
        query = query.eq('location', location);
      }

      const { data, error } = await query;

      if (error) throw error;

      return data as Group[];

    } catch (error) {
      console.error('❌ Error fetching groups:', error);
      return [];
    }
  }

  async joinGroup(groupId: string, userId: string, displayName: string): Promise<boolean> {
    try {
      console.log('👥 Joining group...', { groupId, userId, displayName });

      const { data: existingMember } = await supabase
        .from('group_members')
        .select('id')
        .eq('group_id', groupId)
        .eq('user_id', userId)
        .maybeSingle();

      if (existingMember) {
        console.log('✅ Already a member');
        this.currentGroupId = groupId;
        this.currentUserId = userId;
        return true;
      }

      const { error: memberError } = await supabase
        .from('group_members')
        .insert({
          group_id: groupId,
          user_id: userId,
          display_name: displayName,
          role: 'member'
        });

      if (memberError) throw memberError;

      await supabase.rpc('increment_group_member_count', { group_id: groupId });

      const { error: messageError } = await supabase
        .from('group_messages')
        .insert({
          group_id: groupId,
          sender_id: userId,
          sender_name: displayName,
          message_text: `${displayName} a rejoint le groupe`,
          message_type: 'join'
        });

      if (messageError) console.error('Error sending join message:', messageError);

      await supabase
        .from('groups')
        .update({ last_activity: new Date().toISOString() })
        .eq('id', groupId);

      this.currentGroupId = groupId;
      this.currentUserId = userId;

      console.log('✅ Joined group successfully');
      return true;

    } catch (error) {
      console.error('❌ Error joining group:', error);
      return false;
    }
  }

  async leaveGroup(groupId: string, userId: string, displayName: string): Promise<boolean> {
    try {
      console.log('👋 Leaving group...', { groupId, userId });

      const { error: memberError } = await supabase
        .from('group_members')
        .delete()
        .eq('group_id', groupId)
        .eq('user_id', userId);

      if (memberError) throw memberError;

      await supabase.rpc('decrement_group_member_count', { group_id: groupId });

      const { error: messageError } = await supabase
        .from('group_messages')
        .insert({
          group_id: groupId,
          sender_id: userId,
          sender_name: displayName,
          message_text: `${displayName} a quitté le groupe`,
          message_type: 'leave'
        });

      if (messageError) console.error('Error sending leave message:', messageError);

      this.currentGroupId = null;
      this.currentUserId = null;

      console.log('✅ Left group successfully');
      return true;

    } catch (error) {
      console.error('❌ Error leaving group:', error);
      return false;
    }
  }

  async sendMessage(
    groupId: string,
    senderId: string,
    senderName: string,
    messageText: string
  ): Promise<GroupMessage | null> {
    try {
      if (!messageText || messageText.trim().length === 0) {
        return null;
      }

      if (messageText.length > 1000) {
        throw new Error('Message trop long (max 1000 caractères)');
      }

      const { data, error } = await supabase
        .from('group_messages')
        .insert({
          group_id: groupId,
          sender_id: senderId,
          sender_name: senderName,
          message_text: messageText.trim(),
          message_type: 'text'
        })
        .select()
        .single();

      if (error) throw error;

      await supabase
        .from('groups')
        .update({ last_activity: new Date().toISOString() })
        .eq('id', groupId);

      console.log('✅ Message sent');
      return data as GroupMessage;

    } catch (error) {
      console.error('❌ Error sending message:', error);
      throw error;
    }
  }

  async getGroupMessages(groupId: string, limit: number = 50): Promise<GroupMessage[]> {
    try {
      const { data, error } = await supabase
        .from('group_messages')
        .select('*')
        .eq('group_id', groupId)
        .order('sent_at', { ascending: true })
        .limit(limit);

      if (error) throw error;

      return data as GroupMessage[];

    } catch (error) {
      console.error('❌ Error fetching messages:', error);
      return [];
    }
  }

  async getGroupMembers(groupId: string): Promise<GroupMember[]> {
    try {
      const { data, error } = await supabase
        .from('group_members')
        .select('*')
        .eq('group_id', groupId)
        .order('joined_at', { ascending: true });

      if (error) throw error;

      return data as GroupMember[];

    } catch (error) {
      console.error('❌ Error fetching members:', error);
      return [];
    }
  }

  subscribeToMessages(groupId: string, callback: (message: GroupMessage) => void): RealtimeChannel {
    console.log('📡 Subscribing to group messages:', groupId);

    this.messageChannel = supabase
      .channel(`group-messages-${groupId}`)
      .on('postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'group_messages',
          filter: `group_id=eq.${groupId}`
        },
        (payload) => {
          console.log('📨 New group message:', payload.new);
          callback(payload.new as GroupMessage);
        }
      )
      .subscribe((status) => {
        console.log('📡 Subscription status:', status);
      });

    return this.messageChannel;
  }

  async updateLastRead(groupId: string, userId: string): Promise<void> {
    try {
      await supabase
        .from('group_members')
        .update({ last_read_at: new Date().toISOString() })
        .eq('group_id', groupId)
        .eq('user_id', userId);

    } catch (error) {
      console.error('❌ Error updating last read:', error);
    }
  }

  async cleanup(): Promise<void> {
    console.log('🧹 Cleaning up group chat...');

    if (this.messageChannel) {
      await this.messageChannel.unsubscribe();
      this.messageChannel = null;
    }

    if (this.currentGroupId && this.currentUserId) {
      const { data: member } = await supabase
        .from('group_members')
        .select('display_name')
        .eq('group_id', this.currentGroupId)
        .eq('user_id', this.currentUserId)
        .maybeSingle();

      if (member) {
        await this.leaveGroup(this.currentGroupId, this.currentUserId, member.display_name);
      }
    }

    this.currentGroupId = null;
    this.currentUserId = null;

    console.log('✅ Cleanup complete');
  }
}

export default GroupChatService;

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Types pour la base de données - mis à jour selon le schéma réel
export interface Database {
  public: {
    Tables: {
      online_users: {
        Row: {
          id: string
          user_id: string
          status: 'online' | 'chat' | 'video' | 'group'
          location?: string
          ip_address?: string
          country?: string
          city?: string
          last_seen: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          status?: 'online' | 'chat' | 'video' | 'group'
          location?: string
          ip_address?: string
          country?: string
          city?: string
          last_seen?: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          status?: 'online' | 'chat' | 'video' | 'group'
          location?: string
          ip_address?: string
          country?: string
          city?: string
          last_seen?: string
          created_at?: string
        }
      }
      groups: {
        Row: {
          id: string
          name: string
          description: string
          member_count: number
          is_active: boolean
          category: string
          location?: string
          last_activity: string
          created_at: string
          created_by: string
        }
        Insert: {
          id?: string
          name: string
          description: string
          member_count?: number
          is_active?: boolean
          category?: string
          location?: string
          last_activity?: string
          created_at?: string
          created_by: string
        }
        Update: {
          id?: string
          name?: string
          description?: string
          member_count?: number
          is_active?: boolean
          category?: string
          location?: string
          last_activity?: string
          created_at?: string
          created_by?: string
        }
      }
      random_chat_users: {
        Row: {
          id: string
          user_id: string
          pseudo: string
          genre: 'homme' | 'femme' | 'autre'
          status: 'en_attente' | 'connecte' | 'hors_ligne'
          autoswitch_enabled: boolean
          preferred_gender: 'homme' | 'femme' | 'autre' | 'tous'
          country?: string
          city?: string
          location_filter?: string
          ip_address?: string
          last_seen: string
          search_started_at: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          pseudo: string
          genre: 'homme' | 'femme' | 'autre'
          status?: 'en_attente' | 'connecte' | 'hors_ligne'
          autoswitch_enabled?: boolean
          preferred_gender?: 'homme' | 'femme' | 'autre' | 'tous'
          country?: string
          city?: string
          location_filter?: string
          ip_address?: string
          last_seen?: string
          search_started_at?: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          pseudo?: string
          genre?: 'homme' | 'femme' | 'autre'
          status?: 'en_attente' | 'connecte' | 'hors_ligne'
          autoswitch_enabled?: boolean
          preferred_gender?: 'homme' | 'femme' | 'autre' | 'tous'
          country?: string
          city?: string
          location_filter?: string
          ip_address?: string
          last_seen?: string
          search_started_at?: string
          created_at?: string
        }
      }
      random_chat_sessions: {
        Row: {
          id: string
          user1_id: string
          user1_pseudo: string
          user1_genre: string
          user2_id: string
          user2_pseudo: string
          user2_genre: string
          status: 'active' | 'ended' | 'autoswitch_waiting'
          autoswitch_countdown_start?: string
          autoswitch_countdown_remaining?: number
          autoswitch_user_id?: string
          started_at: string
          ended_at?: string
          last_activity: string
          message_count: number
          rating_user1?: number
          rating_user2?: number
          chat_type: 'random' | 'local' | 'filtered'
        }
        Insert: {
          id?: string
          user1_id: string
          user1_pseudo: string
          user1_genre: string
          user2_id: string
          user2_pseudo: string
          user2_genre: string
          status?: 'active' | 'ended' | 'autoswitch_waiting'
          autoswitch_countdown_start?: string
          autoswitch_countdown_remaining?: number
          autoswitch_user_id?: string
          started_at?: string
          ended_at?: string
          last_activity?: string
          message_count?: number
          rating_user1?: number
          rating_user2?: number
          chat_type?: 'random' | 'local' | 'filtered'
        }
        Update: {
          id?: string
          user1_id?: string
          user1_pseudo?: string
          user1_genre?: string
          user2_id?: string
          user2_pseudo?: string
          user2_genre?: string
          status?: 'active' | 'ended' | 'autoswitch_waiting'
          autoswitch_countdown_start?: string
          autoswitch_countdown_remaining?: number
          autoswitch_user_id?: string
          started_at?: string
          ended_at?: string
          last_activity?: string
          message_count?: number
          rating_user1?: number
          rating_user2?: number
          chat_type?: 'random' | 'local' | 'filtered'
        }
      }
      random_chat_messages: {
        Row: {
          id: string
          session_id: string
          sender_id: string
          sender_pseudo: string
          sender_genre: 'homme' | 'femme' | 'autre'
          message_text: string
          message_type: 'user' | 'system' | 'autoswitch_warning'
          color_code: string
          sent_at: string
          edited_at?: string
          is_edited: boolean
        }
        Insert: {
          id?: string
          session_id: string
          sender_id: string
          sender_pseudo: string
          sender_genre: 'homme' | 'femme' | 'autre'
          message_text: string
          message_type?: 'user' | 'system' | 'autoswitch_warning'
          color_code?: string
          sent_at?: string
          edited_at?: string
          is_edited?: boolean
        }
        Update: {
          id?: string
          session_id?: string
          sender_id?: string
          sender_pseudo?: string
          sender_genre?: 'homme' | 'femme' | 'autre'
          message_text?: string
          message_type?: 'user' | 'system' | 'autoswitch_warning'
          color_code?: string
          sent_at?: string
          edited_at?: string
          is_edited?: boolean
        }
      }
      deleted_messages_archive: {
        Row: {
          id: string
          original_message_id?: string
          session_id?: string
          sender_id: string
          sender_pseudo: string
          message_text: string
          sent_at?: string
          deleted_at: string
          deletion_reason: string
          is_flagged: boolean
        }
        Insert: {
          id?: string
          original_message_id?: string
          session_id?: string
          sender_id: string
          sender_pseudo: string
          message_text: string
          sent_at?: string
          deleted_at?: string
          deletion_reason?: string
          is_flagged?: boolean
        }
        Update: {
          id?: string
          original_message_id?: string
          session_id?: string
          sender_id?: string
          sender_pseudo?: string
          message_text?: string
          sent_at?: string
          deleted_at?: string
          deletion_reason?: string
          is_flagged?: boolean
        }
      }
      user_reports: {
        Row: {
          id: string
          reporter_id: string
          reported_user_id?: string
          reported_message_id?: string
          report_type: 'spam' | 'harassment' | 'inappropriate' | 'other'
          reason?: string
          status: 'pending' | 'reviewed' | 'resolved' | 'dismissed'
          created_at: string
          resolved_at?: string
        }
        Insert: {
          id?: string
          reporter_id: string
          reported_user_id?: string
          reported_message_id?: string
          report_type: 'spam' | 'harassment' | 'inappropriate' | 'other'
          reason?: string
          status?: 'pending' | 'reviewed' | 'resolved' | 'dismissed'
          created_at?: string
          resolved_at?: string
        }
        Update: {
          id?: string
          reporter_id?: string
          reported_user_id?: string
          reported_message_id?: string
          report_type?: 'spam' | 'harassment' | 'inappropriate' | 'other'
          reason?: string
          status?: 'pending' | 'reviewed' | 'resolved' | 'dismissed'
          created_at?: string
          resolved_at?: string
        }
      }
    }
  }
}
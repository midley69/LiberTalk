import { api, socketManager } from '../lib/localApi';

export interface ChatUser {
  user_id: string;
  pseudo: string;
  genre: 'homme' | 'femme' | 'autre';
  chat_type: 'random' | 'local' | 'group';
  status: 'searching' | 'matched' | 'chatting';
  location?: string;
  last_activity: string;
}

export interface ChatMatch {
  id: string;
  user1_id: string;
  user1_pseudo: string;
  user1_genre: string;
  user2_id: string;
  user2_pseudo: string;
  user2_genre: string;
  match_type: string;
  status: 'active' | 'ended' | 'abandoned';
  started_at: string;
  last_activity: string;
  message_count: number;
}

export interface ChatMessage {
  id: string;
  match_id: string;
  sender_id: string;
  sender_pseudo: string;
  sender_genre: string;
  message_text: string;
  message_type: 'user' | 'system' | 'notification';
  color_code: string;
  sent_at: string;
}

class RealTimeChatService {
  private static instance: RealTimeChatService;
  private currentUserId: string | null = null;
  private currentMatchId: string | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private messageSubscription: any = null;

  static getInstance(): RealTimeChatService {
    if (!RealTimeChatService.instance) {
      RealTimeChatService.instance = new RealTimeChatService();
    }
    return RealTimeChatService.instance;
  }

  // Rechercher une correspondance avec de vrais utilisateurs
  async findMatch(
    userId: string,
    pseudo: string,
    genre: 'homme' | 'femme' | 'autre',
    chatType: 'random' | 'local' | 'group',
    location?: string
  ): Promise<ChatMatch | null> {
    try {
      console.log('🔍 Recherche de correspondance avec vrais utilisateurs...', { userId, pseudo, genre, chatType, location });

      const partners = await api.findPartner(userId, location);

      if (!partners) {
        console.log('❌ Aucun vrai partenaire disponible');
        return null;
      }

      console.log('✅ VRAI partenaire trouvé:', partners);

      const sessionData = await api.createSession({
        user1_id: userId,
        user1_pseudo: pseudo,
        user1_genre: genre,
        user2_id: partners.partner_user_id,
        user2_pseudo: partners.partner_pseudo,
        user2_genre: partners.partner_genre
      });

      const realMatch: ChatMatch = {
        id: sessionData.sessionId,
        user1_id: userId,
        user1_pseudo: pseudo,
        user1_genre: genre,
        user2_id: partners.partner_user_id,
        user2_pseudo: partners.partner_pseudo,
        user2_genre: partners.partner_genre,
        match_type: chatType,
        status: 'active',
        started_at: new Date().toISOString(),
        last_activity: new Date().toISOString(),
        message_count: 0
      };

      this.currentUserId = userId;
      this.currentMatchId = sessionData.sessionId;
      this.startHeartbeat();

      console.log('✅ Correspondance RÉELLE créée:', realMatch);
      return realMatch;

    } catch (error) {
      console.error('❌ Erreur dans findMatch:', error);
      throw error;
    }
  }

  // Envoyer un message
  async sendMessage(
    matchId: string,
    senderId: string,
    senderPseudo: string,
    senderGenre: string,
    messageText: string
  ): Promise<string | null> {
    try {
      console.log('📤 Envoi de message...', { matchId, senderId, messageText });

      socketManager.sendMessage({
        sessionId: matchId,
        senderId,
        senderPseudo,
        senderGenre,
        messageText
      });

      console.log('✅ Message envoyé');
      return null;
    } catch (error) {
      console.error('❌ Erreur dans sendMessage:', error);
      throw error;
    }
  }

  // Obtenir la couleur par genre
  private getColorByGender(genre: string): string {
    switch (genre) {
      case 'femme': return '#FF69B4';
      case 'homme': return '#1E90FF';
      default: return '#A9A9A9';
    }
  }

  // Charger les messages d'une correspondance
  async loadMessages(matchId: string): Promise<ChatMessage[]> {
    try {
      console.log('📥 Chargement des messages pour:', matchId);

      const data = await api.loadMessages(matchId);

      const messages: ChatMessage[] = (data || []).map((msg: any) => ({
        id: msg.id,
        match_id: matchId,
        sender_id: msg.sender_id,
        sender_pseudo: msg.sender_pseudo,
        sender_genre: msg.sender_genre,
        message_text: msg.message_text,
        message_type: msg.message_type as 'user' | 'system' | 'notification',
        color_code: msg.color_code,
        sent_at: msg.sent_at
      }));

      console.log('✅ Messages chargés:', messages.length);
      return messages;
    } catch (error) {
      console.error('❌ Erreur dans loadMessages:', error);
      return [];
    }
  }

  // S'abonner aux nouveaux messages
  subscribeToMessages(matchId: string, callback: (message: ChatMessage) => void) {
    console.log('📡 Abonnement aux messages pour:', matchId);

    if (this.messageSubscription) {
      this.messageSubscription = null;
    }

    socketManager.onNewMessage((newMessage: any) => {
      if (newMessage.session_id === matchId) {
        console.log('📨 Nouveau message reçu:', newMessage);

        const chatMessage: ChatMessage = {
          id: newMessage.id,
          match_id: matchId,
          sender_id: newMessage.sender_id,
          sender_pseudo: newMessage.sender_pseudo,
          sender_genre: newMessage.sender_genre,
          message_text: newMessage.message_text,
          message_type: newMessage.message_type,
          color_code: newMessage.color_code,
          sent_at: newMessage.sent_at
        };

        callback(chatMessage);
      }
    });

    this.messageSubscription = { unsubscribe: () => socketManager.disconnect() };

    console.log('✅ Abonnement aux messages actif pour:', matchId);
    return this.messageSubscription;
  }

  // Terminer une correspondance
  async endMatch(matchId: string, userId: string, reason: string = 'user_action'): Promise<boolean> {
    try {
      console.log('🔚 Fin de correspondance...', { matchId, userId, reason });

      await api.endSession(matchId, userId, reason);

      if (this.messageSubscription) {
        this.messageSubscription = null;
      }

      console.log('✅ Correspondance terminée');
      this.cleanup();
      return true;
    } catch (error) {
      console.error('❌ Erreur dans endMatch:', error);
      return false;
    }
  }

  // Obtenir les statistiques en temps réel
  async getStats(): Promise<any> {
    try {
      const randomChatStats = await api.getStats();

      console.log('📊 Statistiques réelles récupérées:', randomChatStats);
      return {
        active_users: randomChatStats?.users || { total: 0, searching: 0, chatting: 0, by_type: { random: 0 } },
        active_matches: randomChatStats?.sessions?.active || 0,
        total_messages_today: randomChatStats?.messages?.today || 0,
        last_updated: new Date().toISOString()
      };
    } catch (error) {
      console.error('❌ Erreur dans getStats:', error);
      // Fallback avec des valeurs nulles pour indiquer qu'il n'y a pas de données
      return {
        active_users: { total: 0, searching: 0, chatting: 0, by_type: { random: 0 } },
        active_matches: 0,
        total_messages_today: 0,
        last_updated: new Date().toISOString()
      };
    }
  }

  // Démarrer le heartbeat pour maintenir la présence
  private startHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.heartbeatInterval = setInterval(() => {
      if (this.currentUserId) {
        try {
          socketManager.heartbeat(this.currentUserId);
          console.log('💓 Heartbeat pour utilisateur:', this.currentUserId);
        } catch (error) {
          console.error('❌ Erreur heartbeat:', error);
        }
      }
    }, 30000); // Toutes les 30 secondes
  }

  // Nettoyer les ressources
  cleanup(): void {
    console.log('🧹 Nettoyage du service de chat...');

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (this.messageSubscription) {
      this.messageSubscription = null;
    }

    if (this.currentUserId) {
      socketManager.disconnect();
      console.log('✅ Présence utilisateur nettoyée');
    }

    this.currentUserId = null;
    this.currentMatchId = null;
  }

  // Obtenir l'ID de correspondance actuel
  getCurrentMatchId(): string | null {
    return this.currentMatchId;
  }

  // Obtenir l'ID utilisateur actuel
  getCurrentUserId(): string | null {
    return this.currentUserId;
  }
}

export default RealTimeChatService;
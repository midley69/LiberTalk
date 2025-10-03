import { api, socketManager } from '../lib/localApi';

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
  autoswitch_countdown_start?: string;
  autoswitch_user_id?: string;
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

class RandomChatService {
  private static instance: RandomChatService;
  private currentUserId: string | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;

  static getInstance(): RandomChatService {
    if (!RandomChatService.instance) {
      RandomChatService.instance = new RandomChatService();
    }
    return RandomChatService.instance;
  }

  // Créer ou mettre à jour un utilisateur
  async createUser(pseudo: string, genre: 'homme' | 'femme' | 'autre', autoswitchEnabled: boolean): Promise<RandomChatUser> {
    const userId = `random_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

    const data = await api.createUser({
      pseudo: pseudo.trim(),
      genre,
      autoswitchEnabled
    });

    this.currentUserId = userId;
    this.startHeartbeat();

    return data;
  }

  // Chercher un partenaire
  async findPartner(userId: string, locationFilter?: string): Promise<RandomChatUser | null> {
    const data = await api.findPartner(userId, locationFilter);

    return data && data.partner_user_id ? {
      user_id: data.partner_user_id,
      pseudo: data.partner_pseudo,
      genre: data.partner_genre,
      status: 'en_attente',
      autoswitch_enabled: false,
      last_seen: new Date().toISOString()
    } : null;
  }

  // Créer une session de chat
  async createSession(
    user1: RandomChatUser,
    user2: RandomChatUser
  ): Promise<string> {
    const data = await api.createSession({
      user1_id: user1.user_id,
      user1_pseudo: user1.pseudo,
      user1_genre: user1.genre,
      user2_id: user2.user_id,
      user2_pseudo: user2.pseudo,
      user2_genre: user2.genre
    });

    return data.sessionId;
  }

  // Envoyer un message
  async sendMessage(
    sessionId: string,
    senderId: string,
    senderPseudo: string,
    senderGenre: string,
    messageText: string
  ): Promise<void> {
    socketManager.sendMessage({
      sessionId,
      senderId,
      senderPseudo,
      senderGenre,
      messageText: messageText.trim()
    });
  }

  // Charger les messages d'une session
  async loadMessages(sessionId: string): Promise<RandomChatMessage[]> {
    const data = await api.loadMessages(sessionId);
    return data || [];
  }

  // Terminer une session
  async endSession(sessionId: string, endedByUserId: string, endReason: string): Promise<void> {
    await api.endSession(sessionId, endedByUserId, endReason);
  }

  // Obtenir les statistiques
  async getStats(): Promise<any> {
    return await api.getStats();
  }

  // S'abonner aux messages d'une session
  subscribeToMessages(sessionId: string, callback: (message: RandomChatMessage) => void) {
    socketManager.onNewMessage((message) => {
      if (message.session_id === sessionId) {
        callback(message);
      }
    });
    return { unsubscribe: () => socketManager.disconnect() };
  }

  // S'abonner aux changements de session
  subscribeToSession(sessionId: string, callback: (session: RandomChatSession) => void) {
    socketManager.onSessionEnded((data) => {
      if (data.sessionId === sessionId) {
        callback(data.session);
      }
    });
    return { unsubscribe: () => socketManager.disconnect() };
  }

  // Démarrer le heartbeat
  private startHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.heartbeatInterval = setInterval(() => {
      if (this.currentUserId) {
        try {
          socketManager.heartbeat(this.currentUserId);
        } catch (error) {
          console.error('Erreur heartbeat:', error);
        }
      }
    }, 30000);
  }

  // Nettoyer
  async cleanup(): Promise<void> {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (this.currentUserId) {
      socketManager.disconnect();
      this.currentUserId = null;
    }
  }
}

export default RandomChatService;
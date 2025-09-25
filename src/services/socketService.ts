import { io, Socket } from 'socket.io-client';

interface User {
  id: string;
  username?: string;
  isAnonymous: boolean;
  location?: string;
}

interface ChatMessage {
  id: string;
  userId: string;
  username: string;
  message: string;
  timestamp: Date;
  isOwn: boolean;
}

class SocketService {
  private static instance: SocketService;
  private socket: Socket | null = null;
  private currentUser: User | null = null;
  private userLocation: any = { city: 'Unknown', country: 'Unknown' };

  static getInstance(): SocketService {
    if (!SocketService.instance) {
      SocketService.instance = new SocketService();
    }
    return SocketService.instance;
  }

  async connect(): Promise<void> {
    if (this.socket?.connected) return;

    const serverUrl = window.location.hostname === 'localhost' 
      ? 'http://localhost:3000'
      : `http://${window.location.hostname}:3000`;

    this.socket = io(serverUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });

    return new Promise((resolve, reject) => {
      this.socket!.on('connect', () => {
        console.log('✅ Socket connecté');
        resolve();
      });

      this.socket!.on('connect_error', (error) => {
        console.error('❌ Erreur connexion:', error);
        reject(error);
      });

      setTimeout(() => {
        if (!this.socket?.connected) {
          reject(new Error('Timeout de connexion'));
        }
      }, 5000);
    });
  }

  async registerUser(username?: string): Promise<User> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Socket non connecté'));
        return;
      }

      this.socket.emit('user:register', { username }, (response: any) => {
        if (response.success) {
          this.currentUser = response.user;
          resolve(response.user);
        } else {
          reject(new Error(response.error));
        }
      });
    });
  }

  // Méthodes Chat
  async findChatPartner(): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Socket non connecté'));
        return;
      }

      this.socket.emit('chat:findPartner', {}, (response: any) => {
        if (response.success) {
          resolve(response);
        } else {
          reject(new Error(response.error));
        }
      });
    });
  }

  async joinQueue(type: string): Promise<void> {
    return this.findChatPartner().then(() => {});
  }

  leaveQueue(): void {
    // Fonction vide pour compatibilité
  }

  async skipUser(sessionId: string): Promise<void> {
    this.skipChat(sessionId);
    return Promise.resolve();
  }

  getUserLocation(): any {
    return this.userLocation;
  }

  async getMessageHistory(sessionId: string): Promise<any[]> {
    return [];
  }

  sendMessage(sessionId: string, message: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Socket non connecté'));
        return;
      }

      this.socket.emit('chat:sendMessage', 
        { sessionId, message }, 
        (response: any) => {
          if (response.success) {
            resolve();
          } else {
            reject(new Error(response.error));
          }
        }
      );
    });
  }

  // Listeners Chat
  onMatchFound(callback: (data: any) => void) {
    this.socket?.on('chat:matched', callback);
  }

  onChatMatched(callback: (data: any) => void) {
    this.socket?.on('chat:matched', callback);
  }

  onMessageReceived(callback: (message: ChatMessage) => void) {
    this.socket?.on('chat:message', (data: any) => {
      const message: ChatMessage = {
        id: data.id,
        userId: data.userId,
        username: data.username,
        message: data.message,
        timestamp: new Date(data.timestamp),
        isOwn: data.userId === this.currentUser?.id
      };
      callback(message);
    });
  }

  onMessageReceive(callback: (message: any) => void) {
    this.onMessageReceived(callback);
  }

  onChatEnded(callback: (data: any) => void) {
    this.socket?.on('chat:ended', callback);
  }

  onSessionEnded(callback: () => void) {
    this.socket?.on('chat:ended', callback);
  }

  skipChat(sessionId: string) {
    this.socket?.emit('chat:skip', { sessionId });
  }

  // Méthodes Groupes
  createGroup(name: string, description: string): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Socket non connecté'));
        return;
      }

      this.socket.emit('group:create', { name, description }, (response: any) => {
        if (response.success) {
          resolve(response.group);
        } else {
          reject(new Error(response.error));
        }
      });
    });
  }

  joinGroup(groupId: string): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Socket non connecté'));
        return;
      }

      this.socket.emit('group:join', { groupId }, (response: any) => {
        if (response.success) {
          resolve(response.group);
        } else {
          reject(new Error(response.error));
        }
      });
    });
  }

  sendGroupMessage(groupId: string, message: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Socket non connecté'));
        return;
      }

      this.socket.emit('group:sendMessage', 
        { groupId, message }, 
        (response: any) => {
          if (response.success) {
            resolve();
          } else {
            reject(new Error(response.error));
          }
        }
      );
    });
  }

  getGroups(): Promise<any[]> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Socket non connecté'));
        return;
      }

      this.socket.emit('group:list', {}, (response: any) => {
        if (response.success) {
          resolve(response.groups);
        } else {
          reject(new Error(response.error));
        }
      });
    });
  }

  onGroupMessage(callback: (message: any) => void) {
    this.socket?.on('group:message', callback);
  }

  onGroupUserJoined(callback: (data: any) => void) {
    this.socket?.on('group:userJoined', callback);
  }

  onGroupUserLeft(callback: (data: any) => void) {
    this.socket?.on('group:userLeft', callback);
  }

  onNewGroup(callback: (group: any) => void) {
    this.socket?.on('group:new', callback);
  }

  onStatsUpdate(callback: (stats: any) => void) {
    this.socket?.on('stats:update', callback);
  }

  getCurrentUser(): User | null {
    return this.currentUser;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.currentUser = null;
    }
  }
}

export default SocketService;
export type { User, ChatMessage };

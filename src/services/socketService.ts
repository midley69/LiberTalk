import { io, Socket } from 'socket.io-client';
import { User, ChatMessage } from '../types';

class SocketService {
  private static instance: SocketService;
  private socket: Socket | null = null;
  private currentUser: User | null = null;
  private isConnected: boolean = false;
  private messageHandlers: Map<string, (msg: ChatMessage) => void> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private userLocation: { city?: string; region?: string; country?: string; lat?: number; lon?: number } = {};

  static getInstance(): SocketService {
    if (!SocketService.instance) {
      SocketService.instance = new SocketService();
    }
    return SocketService.instance;
  }

  // Obtenir la localisation par IP
  async getUserLocation(): Promise<void> {
    try {
      const response = await fetch('https://ipapi.co/json/');
      if (response.ok) {
        const data = await response.json();
        this.userLocation = {
          city: data.city,
          region: data.region,
          country: data.country,
          lat: data.latitude,
          lon: data.longitude
        };
        console.log('📍 Localisation détectée:', this.userLocation);
      }
    } catch (error) {
      console.error('Erreur géolocalisation:', error);
      // Fallback API
      try {
        const fallback = await fetch('https://ip-api.com/json/');
        if (fallback.ok) {
          const data = await fallback.json();
          this.userLocation = {
            city: data.city,
            region: data.regionName,
            country: data.country,
            lat: data.lat,
            lon: data.lon
          };
        }
      } catch (err) {
        console.error('Fallback géolocalisation échoué:', err);
      }
    }
  }

  // Connexion Socket.io avec meilleure gestion
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Configuration pour production et dev
        let socketUrl: string;
        let socketOptions: any;

        if (window.location.hostname === 'localhost') {
          // Développement local
          socketUrl = 'http://localhost:3000';
          socketOptions = {
            path: '/socket.io/',
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: this.maxReconnectAttempts,
            reconnectionDelay: 1000,
            timeout: 10000,
          };
        } else {
          // Production - Utiliser le même domaine avec path spécifique
          socketUrl = '';  // Chaîne vide = même origine
          socketOptions = {
            path: '/socket.io/',
            transports: ['polling', 'websocket'], // Polling en premier pour la production
            reconnection: true,
            reconnectionAttempts: this.maxReconnectAttempts,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            timeout: 20000,
            secure: window.location.protocol === 'https:',
            rejectUnauthorized: false
          };
        }

        console.log('🔌 Tentative de connexion Socket.io...', {
          url: socketUrl || 'même origine',
          hostname: window.location.hostname,
          protocol: window.location.protocol
        });

        this.socket = io(socketUrl, socketOptions);

        // Événement de connexion réussie
        this.socket.on('connect', () => {
          console.log('✅ Socket.io connecté!', {
            id: this.socket?.id,
            transport: this.socket?.io.engine.transport.name
          });
          this.isConnected = true;
          this.reconnectAttempts = 0;
          resolve();
        });

        // Événement de déconnexion
        this.socket.on('disconnect', (reason) => {
          console.log('❌ Socket déconnecté:', reason);
          this.isConnected = false;
          
          if (reason === 'io server disconnect') {
            // Le serveur a forcé la déconnexion, reconnexion manuelle
            setTimeout(() => {
              console.log('🔄 Tentative de reconnexion...');
              this.socket?.connect();
            }, 1000);
          }
        });

        // Erreurs de connexion
        this.socket.on('connect_error', (error) => {
          this.reconnectAttempts++;
          console.error(`❌ Erreur connexion Socket.io (tentative ${this.reconnectAttempts}):`, {
            message: error.message,
            type: error.type,
            transport: this.socket?.io.engine.transport.name
          });
          
          if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            reject(new Error('Impossible de se connecter au serveur après plusieurs tentatives'));
          }
        });

        // Reconnexion réussie
        this.socket.on('reconnect', (attemptNumber) => {
          console.log('✅ Reconnecté après', attemptNumber, 'tentatives');
          this.reconnectAttempts = 0;
          
          // Re-enregistrer l'utilisateur si nécessaire
          if (this.currentUser) {
            this.registerUser(this.currentUser.username);
          }
        });

        // Ping/Pong pour maintenir la connexion
        this.socket.on('ping', () => {
          console.log('🏓 Ping reçu');
        });

        // Timeout de connexion initiale
        const timeout = setTimeout(() => {
          if (!this.isConnected) {
            console.error('⏱️ Timeout de connexion');
            reject(new Error('Timeout de connexion au serveur'));
          }
        }, 15000);

        // Clear timeout si connexion réussie
        this.socket.on('connect', () => {
          clearTimeout(timeout);
        });

      } catch (error) {
        console.error('❌ Erreur initialisation Socket.io:', error);
        reject(error);
      }
    });
  }

  // Enregistrer un utilisateur avec localisation
  async registerUser(username?: string): Promise<User> {
    // Obtenir la localisation d'abord
    await this.getUserLocation();

    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Socket non connecté'));
        return;
      }

      const timeout = setTimeout(() => {
        reject(new Error('Timeout inscription'));
      }, 5000);

      this.socket.emit('user:register', 
        { 
          username, 
          isAnonymous: !username,
          location: this.userLocation
        },
        (response: any) => {
          clearTimeout(timeout);
          
          if (response.success) {
            this.currentUser = response.user;
            console.log('👤 Utilisateur enregistré:', this.currentUser);
            resolve(response.user);
          } else {
            reject(new Error(response.error || 'Erreur inscription'));
          }
        }
      );
    });
  }

  // Rejoindre une file d'attente avec préférence de localisation
  async joinQueue(type: 'chat' | 'video' | 'group'): Promise<boolean> {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.currentUser) {
        reject(new Error('Non connecté ou utilisateur non enregistré'));
        return;
      }

      const timeout = setTimeout(() => {
        reject(new Error('Timeout joinQueue'));
      }, 5000);

      this.socket.emit('queue:join', 
        { 
          type, 
          userId: this.currentUser.id,
          location: this.userLocation
        },
        (response: any) => {
          clearTimeout(timeout);
          
          if (response.success) {
            console.log(`📋 File ${type} rejointe avec localisation`);
            resolve(true);
          } else {
            reject(new Error(response.error || 'Erreur file d\'attente'));
          }
        }
      );
    });
  }

  // Quitter la file d'attente
  async leaveQueue(): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.socket || !this.currentUser) {
        resolve(false);
        return;
      }

      this.socket.emit('queue:leave', 
        { userId: this.currentUser.id },
        (response: any) => {
          resolve(response?.success || false);
        }
      );
    });
  }

  // Envoyer un message
  async sendMessage(sessionId: string, message: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.currentUser) {
        reject(new Error('Non connecté'));
        return;
      }

      if (!message.trim()) {
        reject(new Error('Message vide'));
        return;
      }

      const timeout = setTimeout(() => {
        reject(new Error('Timeout envoi message'));
      }, 5000);

      this.socket.emit('message:send',
        { 
          sessionId, 
          userId: this.currentUser.id, 
          message: message.trim()
        },
        (response: any) => {
          clearTimeout(timeout);
          
          if (response.success) {
            resolve(true);
          } else {
            reject(new Error(response.error || 'Erreur envoi'));
          }
        }
      );
    });
  }

  // Récupérer l'historique des messages
  async getMessageHistory(sessionId: string): Promise<ChatMessage[]> {
    return new Promise((resolve) => {
      if (!this.socket) {
        resolve([]);
        return;
      }

      const timeout = setTimeout(() => {
        resolve([]);
      }, 5000);

      this.socket.emit('messages:history',
        { sessionId },
        (response: any) => {
          clearTimeout(timeout);
          
          if (response.success) {
            const messages = response.messages.map((msg: any) => ({
              id: msg.id,
              userId: msg.user_id,
              username: msg.username,
              message: msg.message,
              timestamp: new Date(msg.created_at),
              isOwn: msg.user_id === this.currentUser?.id
            }));
            resolve(messages);
          } else {
            resolve([]);
          }
        }
      );
    });
  }

  // Passer au suivant
  async skipUser(sessionId: string): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.socket || !this.currentUser) {
        resolve(false);
        return;
      }

      this.socket.emit('chat:skip',
        { sessionId, userId: this.currentUser.id },
        (response: any) => {
          resolve(response?.success || false);
        }
      );
    });
  }

  // Listeners pour les événements
  onMatchFound(callback: (data: any) => void) {
    if (!this.socket) return;
    
    this.socket.off('match:found');
    this.socket.on('match:found', (data) => {
      console.log('💑 Match trouvé avec:', data);
      callback(data);
    });
  }

  onMessageReceive(callback: (message: ChatMessage) => void) {
    if (!this.socket) return;
    
    const handlerId = Math.random().toString();
    this.messageHandlers.set(handlerId, callback);
    
    this.socket.off('message:receive');
    this.socket.on('message:receive', (data: any) => {
      const message: ChatMessage = {
        id: data.id,
        userId: data.userId,
        username: data.username,
        message: data.message,
        timestamp: new Date(data.timestamp),
        isOwn: false
      };
      
      this.messageHandlers.forEach(handler => handler(message));
    });
    
    return handlerId;
  }

  removeMessageHandler(handlerId: string) {
    this.messageHandlers.delete(handlerId);
  }

  onSessionEnded(callback: () => void) {
    if (!this.socket) return;
    
    this.socket.off('session:ended');
    this.socket.on('session:ended', callback);
  }

  // État de connexion
  isSocketConnected(): boolean {
    return this.isConnected && this.socket !== null && this.socket.connected;
  }

  getCurrentUser(): User | null {
    return this.currentUser;
  }

  getSocketId(): string | undefined {
    return this.socket?.id;
  }

  getUserLocation(): any {
    return this.userLocation;
  }

  // Déconnexion propre
  disconnect() {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
      this.currentUser = null;
      this.isConnected = false;
      this.messageHandlers.clear();
      console.log('🔌 Socket déconnecté manuellement');
    }
  }

  // Reconnexion manuelle
  async reconnect(): Promise<void> {
    this.disconnect();
    await new Promise(resolve => setTimeout(resolve, 1000));
    return this.connect();
  }
}

export default SocketService;
import { io, Socket } from 'socket.io-client';
import { User, ChatMessage } from '../types';

class SocketService {
    private static instance: SocketService;
    private socket: Socket | null = null;
    private currentUser: User | null = null;

    static getInstance(): SocketService {
        if (!SocketService.instance) {
            SocketService.instance = new SocketService();
        }
        return SocketService.instance;
    }

    async connect(): Promise<void> {
        if (this.socket?.connected) return;

        const serverUrl = import.meta.env.PROD
            ? window.location.origin
            : 'http://localhost:3000';

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

    findChatPartner(): Promise<any> {
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

    onChatEnded(callback: (data: any) => void) {
        this.socket?.on('chat:ended', callback);
    }

    skipChat(sessionId: string) {
        this.socket?.emit('chat:skip', { sessionId });
    }

    // Groupes
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
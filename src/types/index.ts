export interface User {
  id: string;
  username?: string;
  isAnonymous: boolean;
  location?: string;
  avatar?: string;
  createdAt?: Date;
}

export interface ChatMessage {
  id: string;
  userId: string;
  username: string;
  message: string;
  timestamp: Date;
  isOwn: boolean;
}

export interface ChatRoom {
  id: string;
  type: 'random' | 'group' | 'local';
  name?: string;
  participants: User[];
  messages: ChatMessage[];
  createdAt?: Date;
}

export interface VideoCall {
  id: string;
  participants: User[];
  isActive: boolean;
  startedAt?: Date;
}

export type AppPage = 'home' | 'chat' | 'video' | 'groups' | 'settings';

export interface AppState {
  currentPage: AppPage;
  user: User | null;
  currentChat: ChatRoom | null;
  currentCall: VideoCall | null;
}

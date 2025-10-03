import io from 'socket.io-client';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export const socket = io(API_URL);

export const api = {
  async createUser(data: { pseudo: string; genre: string; autoswitchEnabled: boolean; preferredGender?: string }) {
    const res = await fetch(`${API_URL}/api/random-chat/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  },

  async findPartner(userId: string, locationFilter?: string) {
    const res = await fetch(`${API_URL}/api/random-chat/find-partner`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, locationFilter })
    });
    return res.json();
  },

  async createSession(data: any) {
    const res = await fetch(`${API_URL}/api/random-chat/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (res.status === 409) {
      throw new Error('race_condition');
    }

    return res.json();
  },

  async loadMessages(sessionId: string) {
    const res = await fetch(`${API_URL}/api/random-chat/sessions/${sessionId}/messages`);
    return res.json();
  },

  async endSession(sessionId: string, userId: string, reason: string) {
    const res = await fetch(`${API_URL}/api/random-chat/sessions/${sessionId}/end`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, reason })
    });
    return res.json();
  },

  async getWaitingCount() {
    const res = await fetch(`${API_URL}/api/random-chat/waiting-count`);
    return res.json();
  },

  async getGroups() {
    const res = await fetch(`${API_URL}/api/groups`);
    return res.json();
  },

  async createGroup(data: any) {
    const res = await fetch(`${API_URL}/api/groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  },

  async joinGroup(groupId: string) {
    const res = await fetch(`${API_URL}/api/groups/${groupId}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    return res.json();
  },

  async leaveGroup(groupId: string) {
    const res = await fetch(`${API_URL}/api/groups/${groupId}/leave`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    return res.json();
  },

  async getStats() {
    const res = await fetch(`${API_URL}/api/stats`);
    return res.json();
  }
};

export const socketManager = {
  register(userId: string, sessionId: string) {
    socket.emit('register', { userId, sessionId });
  },

  sendMessage(data: any) {
    socket.emit('send_message', data);
  },

  onNewMessage(callback: (message: any) => void) {
    socket.on('new_message', callback);
  },

  onSessionEnded(callback: (data: any) => void) {
    socket.on('session_ended', callback);
  },

  leaveSession(sessionId: string, userId: string, reason: string) {
    socket.emit('leave_session', { sessionId, userId, reason });
  },

  heartbeat(userId: string) {
    socket.emit('heartbeat', { userId });
  },

  disconnect() {
    socket.disconnect();
  }
};

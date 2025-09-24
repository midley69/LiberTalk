import React, { useState, useEffect, useRef } from 'react';
import { Send, Users, ArrowLeft, Plus, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { ChatMessage } from '../types';
import SocketService from '../services/socketService';

interface Group {
  id: string;
  name: string;
  description: string;
  memberCount: number;
  createdBy?: string;
}

export function GroupsPage() {
  const { setPage } = useApp();
  const [currentView, setCurrentView] = useState<'list' | 'chat'>('list');
  const [groups, setGroups] = useState<Group[]>([]);
  const [currentGroup, setCurrentGroup] = useState<Group | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentMessage, setCurrentMessage] = useState('');
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDescription, setNewGroupDescription] = useState('');
  const [memberCount, setMemberCount] = useState(0);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const socketService = SocketService.getInstance();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    loadGroups();

    socketService.onNewGroup((group) => {
      setGroups(prev => [...prev, group]);
    });

    socketService.onGroupMessage((message) => {
      const msg: ChatMessage = {
        id: message.id,
        userId: message.userId,
        username: message.username,
        message: message.message,
        timestamp: new Date(message.timestamp),
        isOwn: message.userId === socketService.getCurrentUser()?.id
      };
      setMessages(prev => [...prev, msg]);
    });

    socketService.onGroupUserJoined((data) => {
      setMemberCount(data.memberCount);
      if (data.userId !== socketService.getCurrentUser()?.id) {
        const joinMsg: ChatMessage = {
          id: `join_${Date.now()}`,
          userId: 'system',
          username: 'Système',
          message: `${data.username} a rejoint le groupe`,
          timestamp: new Date(),
          isOwn: false
        };
        setMessages(prev => [...prev, joinMsg]);
      }
    });

    socketService.onGroupUserLeft((data) => {
      setMemberCount(data.memberCount);
      const leftMsg: ChatMessage = {
        id: `left_${Date.now()}`,
        userId: 'system',
        username: 'Système',
        message: `${data.username} a quitté le groupe`,
        timestamp: new Date(),
        isOwn: false
      };
      setMessages(prev => [...prev, leftMsg]);
    });
  }, []);

  const loadGroups = async () => {
    try {
      const groupsList = await socketService.getGroups();
      setGroups(groupsList);
    } catch (error) {
      console.error('Erreur chargement groupes:', error);
    }
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return;

    try {
      const group = await socketService.createGroup(
        newGroupName,
        newGroupDescription || 'Nouveau groupe de discussion'
      );
      
      setShowCreateGroup(false);
      setNewGroupName('');
      setNewGroupDescription('');
      handleJoinGroup(group);
    } catch (error) {
      console.error('Erreur création groupe:', error);
    }
  };

  const handleJoinGroup = async (group: Group) => {
    try {
      await socketService.joinGroup(group.id);
      setCurrentGroup(group);
      setMemberCount(group.memberCount);
      setMessages([]);
      setCurrentView('chat');
    } catch (error: any) {
      alert(error.message);
    }
  };

  const handleSendMessage = async () => {
    if (!currentMessage.trim() || !currentGroup) return;

    try {
      await socketService.sendGroupMessage(currentGroup.id, currentMessage);
      setCurrentMessage('');
    } catch (error) {
      console.error('Erreur envoi message:', error);
    }
  };

  const handleLeaveGroup = () => {
    setCurrentView('list');
    setCurrentGroup(null);
    setMessages([]);
    loadGroups();
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  if (currentView === 'list') {
    return (
      <div className="h-full flex flex-col bg-gradient-to-br from-slate-900 via-purple-900/20 to-slate-900">
        <div className="bg-black/20 backdrop-blur-sm p-4 flex items-center justify-between">
          <button
            onClick={() => setPage('home')}
            className="text-white hover:bg-white/10 p-2 rounded-lg"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          
          <h1 className="text-xl font-bold text-white">Groupes</h1>
          
          <button
            onClick={() => setShowCreateGroup(true)}
            className="text-white hover:bg-white/10 p-2 rounded-lg"
          >
            <Plus className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {groups.length === 0 ? (
            <div className="text-center text-gray-400 mt-8">
              <Users className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <p>Aucun groupe actif</p>
              <p className="text-sm mt-2">Créez le premier groupe!</p>
            </div>
          ) : (
            groups.map((group) => (
              <div
                key={group.id}
                onClick={() => handleJoinGroup(group)}
                className="bg-gray-800/50 backdrop-blur-sm p-4 rounded-lg cursor-pointer hover:bg-gray-700/50 transition-colors"
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <h3 className="font-semibold text-white">{group.name}</h3>
                    <p className="text-sm text-gray-400 mt-1">{group.description}</p>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center text-gray-400">
                      <Users className="w-4 h-4 mr-1" />
                      <span className="text-sm">{group.memberCount}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {showCreateGroup && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-white">Créer un groupe</h2>
                <button
                  onClick={() => setShowCreateGroup(false)}
                  className="text-gray-400 hover:text-white"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
              
              <input
                type="text"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="Nom du groupe"
                className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              
              <textarea
                value={newGroupDescription}
                onChange={(e) => setNewGroupDescription(e.target.value)}
                placeholder="Description (optionnel)"
                rows={3}
                className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
              />
              
              <button
                onClick={handleCreateGroup}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2 rounded-lg transition-colors"
              >
                Créer le groupe
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gradient-to-br from-slate-900 via-purple-900/20 to-slate-900">
      <div className="bg-black/20 backdrop-blur-sm p-4 flex items-center justify-between">
        <button
          onClick={handleLeaveGroup}
          className="text-white hover:bg-white/10 p-2 rounded-lg"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>
        
        <div className="text-center">
          <h2 className="text-white font-semibold">{currentGroup?.name}</h2>
          <p className="text-xs text-gray-400">
            <Users className="w-3 h-3 inline mr-1" />
            {memberCount} membres
          </p>
        </div>

        <div className="w-10" />
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.isOwn ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[70%] p-3 rounded-lg ${
                msg.userId === 'system'
                  ? 'bg-gray-600 text-white italic'
                  : msg.isOwn
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-700 text-white'
              }`}
            >
              {!msg.isOwn && msg.userId !== 'system' && (
                <p className="text-xs opacity-70 mb-1">{msg.username}</p>
              )}
              <p>{msg.message}</p>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 bg-black/20 backdrop-blur-sm">
        <div className="flex space-x-2">
          <input
            type="text"
            value={currentMessage}
            onChange={(e) => setCurrentMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Tapez votre message..."
            className="flex-1 bg-gray-800 text-white rounded-full px-4 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          <button
            onClick={handleSendMessage}
            className="bg-purple-600 hover:bg-purple-700 text-white rounded-full p-2 transition-colors"
          >
            <Send className="w-6 h-6" />
          </button>
        </div>
      </div>
    </div>
  );
}

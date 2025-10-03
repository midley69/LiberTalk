import React, { useState, useEffect, useRef } from 'react';
import { Send, Users, MapPin, ArrowLeft, Plus, Hash, UserPlus, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { supabase } from '../lib/supabase';
import GroupChatService from '../services/GroupChatService';
import CookieManager from '../utils/cookieManager';
import type { Group, GroupMessage } from '../services/GroupChatService';

export function GroupsPage() {
  const { setPage, state } = useApp();
  const [currentView, setCurrentView] = useState<'menu' | 'group'>('menu');
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [currentMessage, setCurrentMessage] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDescription, setNewGroupDescription] = useState('');
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [connectionTime, setConnectionTime] = useState(0);
  const [canAddFriend, setCanAddFriend] = useState(false);
  const [showAddFriend, setShowAddFriend] = useState(false);
  const [memberCount, setMemberCount] = useState(0);
  const [groups, setGroups] = useState<Group[]>([]);
  const [currentUserId, setCurrentUserId] = useState('');
  const [currentUserName, setCurrentUserName] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<any>(null);

  const groupChatService = GroupChatService.getInstance();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const savedUser = CookieManager.getUser();
    if (savedUser) {
      setCurrentUserId(savedUser.user_id);
      setCurrentUserName(savedUser.pseudo);
    } else {
      const newUserId = `group_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      setCurrentUserId(newUserId);
      setCurrentUserName('Anonyme');
    }

    const loadGroups = async () => {
      try {
        const activeGroups = await groupChatService.getActiveGroups();
        setGroups(activeGroups);
      } catch (error) {
        console.error('Erreur lors du chargement des groupes:', error);
        setGroups([]);
      }
    };

    loadGroups();

    const intervalId = setInterval(loadGroups, 30000);

    return () => {
      clearInterval(intervalId);
      groupChatService.cleanup();
    };
  }, []);

  useEffect(() => {
    const locationEnabled = localStorage.getItem('locationEnabled');
    if (locationEnabled === 'true' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        () => {
          setUserLocation({ country: 'France', city: 'Paris' });
        },
        () => {
          setUserLocation(null);
        }
      );
    } else {
      setUserLocation(null);
    }
  }, []);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isConnected) {
      interval = setInterval(() => {
        setConnectionTime(prev => {
          const newTime = prev + 1;
          if (newTime === 30 && state.user && !state.user.isAnonymous) {
            setCanAddFriend(true);
          }
          return newTime;
        });
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isConnected, state.user]);

  useEffect(() => {
    if (isConnected && selectedGroup) {
      const messageInterval = setInterval(() => {
        const messageChance = 0.1; // 10% de chance par interval
        
        if (Math.random() < messageChance) {
          const groupMessages = [
            'Salut tout le monde ! 👋',
            'Quelqu\'un connaît un bon resto ?',
            'Super intéressant ce sujet !',
            'Je suis d\'accord avec vous',
            'Qu\'est-ce que vous en pensez ?',
            'Merci pour le partage',
            'Excellente idée !',
            'Je recommande aussi',
            'Bonne soirée à tous !',
            'À bientôt les amis',
          ];
          
          const randomMessage = groupMessages[Math.floor(Math.random() * groupMessages.length)];
          const randomUser = `Membre${Math.floor(Math.random() * 99) + 1}`;
          
          const newMessage: ChatMessage = {
            id: Date.now().toString() + '_group',
            userId: `group_user_${Math.random()}`,
            username: randomUser,
            message: randomMessage,
            timestamp: new Date(),
            isOwn: false,
          };
          
          setMessages(prev => [...prev, newMessage]);
        }
      }, 15000); // Toutes les 15 secondes
      
      return () => clearInterval(messageInterval);
    }
  }, [isConnected, selectedGroup]);

  const handleConnect = async (group: Group) => {
    if (!currentUserId || !currentUserName) return;

    try {
      console.log('🔗 Connexion au groupe...', group.name);

      const joined = await groupChatService.joinGroup(group.id, currentUserId, currentUserName);
      
      if (!joined) {
        alert('Impossible de rejoindre ce groupe.');
        return;
      }

      setIsConnected(true);
      setCurrentView('group');
      setSelectedGroup(group);
      setConnectionTime(0);
      setMemberCount(group.member_count);

      const groupMessages = await groupChatService.getGroupMessages(group.id, 50);
      setMessages(groupMessages);

      channelRef.current = groupChatService.subscribeToMessages(group.id, (message) => {
        setMessages(prev => [...prev, message]);
      });

      console.log('✅ Connecté au groupe!');
      
    } catch (error) {
      console.error('Erreur de connexion au groupe:', error);
      setIsSearching(false);
      alert('Erreur de connexion. Veuillez réessayer.');
    }
  };

  const handleSendMessage = async () => {
    if (!currentMessage.trim() || !isConnected || !selectedGroup) return;

    try {
      await groupChatService.sendMessage(
        selectedGroup.id,
        currentUserId,
        currentUserName,
        currentMessage.trim()
      );
      setCurrentMessage('');
    } catch (error) {
      console.error('❌ Erreur envoi message:', error);
      alert('Erreur lors de l\'envoi du message');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim() || !newGroupDescription.trim()) return;
    if (!currentUserId || !currentUserName) return;

    try {
      const newGroup = await groupChatService.createGroup(
        currentUserId,
        currentUserName,
        newGroupName.trim(),
        newGroupDescription.trim(),
        'Général'
      );

      if (newGroup) {
        setShowCreateGroup(false);
        setNewGroupName('');
        setNewGroupDescription('');

        setGroups(prev => [newGroup, ...prev]);
        await handleConnect(newGroup);
      }
    } catch (error) {
      console.error('❌ Erreur création groupe:', error);
      alert('Erreur lors de la création du groupe');
    }
  };

  const handleDisconnect = async () => {
    try {
      if (selectedGroup && currentUserId && currentUserName) {
        await groupChatService.leaveGroup(selectedGroup.id, currentUserId, currentUserName);
      }

      if (channelRef.current) {
        await channelRef.current.unsubscribe();
        channelRef.current = null;
      }

      setIsConnected(false);
      setMessages([]);
      setCurrentView('menu');
      setSelectedGroup(null);
      setConnectionTime(0);
      setMemberCount(0);
    } catch (error) {
      console.error('❌ Erreur déconnexion:', error);
    }
  };

  const getTimeUntilExpiry = (group: GroupRoom) => {
    const now = new Date();
    const timeSinceActivity = now.getTime() - new Date(group.last_activity).getTime();
    const minutesLeft = Math.floor((900000 - timeSinceActivity) / 60000); // 15 minutes max
    return minutesLeft > 0 ? `${minutesLeft}min` : 'Expire bientôt';
  };

  const formatGroupForDisplay = (group: Group) => {
    return {
      id: group.id,
      name: group.name,
      description: group.description,
      memberCount: group.member_count,
      category: group.category,
      location: group.location,
      lastActivity: new Date(group.last_activity)
    };
  };

  const handleAddFriend = () => {
    if (!state.user || state.user.isAnonymous) {
      alert('Vous devez être connecté à un compte pour ajouter des amis.');
      return;
    }
    
    setShowAddFriend(true);
    setTimeout(() => {
      setShowAddFriend(false);
      const friendMessage: GroupMessage = {
        id: Date.now().toString() + '_friend',
        group_id: selectedGroup?.id || '',
        sender_id: 'system',
        sender_name: 'Libekoo',
        message_text: 'Demandes d\'ami envoyées aux membres actifs',
        message_type: 'system',
        sent_at: new Date().toISOString()
      };
      setMessages(prev => [...prev, friendMessage]);
    }, 1500);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="bg-black/20 backdrop-blur-sm border-b border-white/10 p-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => isConnected ? handleDisconnect() : setPage('home')}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-white" />
            </button>
            <h1 className="text-xl font-semibold text-white">
              {selectedGroup ? selectedGroup.name : 'Groupes de Discussion'}
            </h1>
          </div>
          <div className="flex items-center space-x-4">
            {userLocation && (
              <div className="flex items-center space-x-1 text-cyan-400 text-sm">
                <MapPin className="w-4 h-4" />
                <span>{userLocation.city}, {userLocation.country}</span>
              </div>
            )}
            {isConnected && (
              <div className="text-cyan-400 font-mono text-sm">
                {formatTime(connectionTime)}
              </div>
            )}
            {memberCount > 0 && (
              <div className="flex items-center space-x-2 text-cyan-400">
                <Users className="w-4 h-4" />
                <span className="text-sm">{memberCount} membres</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {currentView === 'menu' && (
          <div className="flex-1 overflow-y-auto">
            <div className="p-4 md:p-6 space-y-6 md:space-y-8 max-w-6xl mx-auto pb-20">
              <div className="text-center">
                <h2 className="text-xl md:text-2xl font-semibold text-white mb-2">
                  Groupes de Discussion
                </h2>
                <p className="text-gray-300 text-sm md:text-base">
                  Participez à des conversations thématiques avec d'autres utilisateurs
                </p>
              </div>

              {/* Stats des groupes */}
              <div className="text-center bg-white/5 rounded-lg p-4">
                <div className="grid grid-cols-2 gap-4 text-center">
                  <div>
                    <div className="text-purple-400 font-bold text-lg">{groups.length}</div>
                    <div className="text-gray-400 text-xs">Groupes actifs</div>
                  </div>
                  <div>
                    <div className="text-green-400 font-bold text-lg">
                      {groups.reduce((sum, g) => sum + g.member_count, 0)}
                    </div>
                    <div className="text-gray-400 text-xs">Membres total</div>
                  </div>
                </div>
                <p className="text-gray-400 text-xs mt-2">Synchronisation en temps réel</p>
              </div>

              {/* Create Group */}
              <div className="text-center">
                <button
                  onClick={() => setShowCreateGroup(true)}
                  className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-600 text-white font-semibold rounded-lg hover:from-purple-400 hover:to-pink-500 transition-all"
                >
                  <Plus className="w-5 h-5 mr-2" />
                  Créer un Groupe
                </button>
              </div>

              {/* Groups List */}
              <div className="space-y-4">
                <h3 className="text-lg md:text-xl font-semibold text-white flex items-center">
                  <Hash className="w-5 h-5 mr-2 text-cyan-400" />
                  Groupes Actifs ({groups.length})
                  <div className="ml-2 w-2 h-2 bg-green-400 rounded-full animate-pulse" title="Synchronisation temps réel" />
                </h3>
                
                <div className="grid gap-3 md:gap-4 grid-cols-1 md:grid-cols-2">
                  {groups.length > 0 ? (
                    groups.map((group) => {
                      const formattedGroup = formatGroupForDisplay(group);
                      return (
                        <button
                          key={formattedGroup.id}
                          onClick={() => handleConnect(group)}
                          className="p-3 md:p-4 rounded-xl border border-white/20 bg-white/5 hover:border-cyan-400/50 hover:bg-cyan-400/5 transition-all text-left group"
                        >
                          <div className="flex items-start justify-between mb-2">
                            <h4 className="text-white font-medium group-hover:text-cyan-400 transition-colors text-sm md:text-base">
                              {formattedGroup.name}
                            </h4>
                            <div className="flex flex-col items-end space-y-1">
                              <span className="text-xs bg-green-500/20 text-green-400 px-2 py-1 rounded-full whitespace-nowrap">
                                {formattedGroup.memberCount} membres
                              </span>
                              <span className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-1 rounded-full">
                                {getTimeUntilExpiry(group)}
                              </span>
                            </div>
                          </div>
                          <p className="text-gray-400 text-xs md:text-sm mb-2">{formattedGroup.description}</p>
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-cyan-400">{formattedGroup.category}</span>
                            {formattedGroup.location && (
                              <span className="text-xs text-gray-500 flex items-center">
                                <MapPin className="w-3 h-3 mr-1" />
                                {formattedGroup.location}
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })
                  ) : (
                    <div className="col-span-full text-center py-12">
                      <Users className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                      <h4 className="text-white font-medium mb-2">Aucun groupe actif</h4>
                      <p className="text-gray-400 text-sm mb-4">
                        Soyez le premier à créer un groupe de discussion !
                      </p>
                      <button
                        onClick={() => setShowCreateGroup(true)}
                        className="px-6 py-2 bg-gradient-to-r from-purple-500 to-pink-600 text-white rounded-lg hover:from-purple-400 hover:to-pink-500 transition-all"
                      >
                        Créer le premier groupe
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Create Group Modal */}
        {showCreateGroup && (
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-slate-800 rounded-xl p-6 w-full max-w-md border border-white/20">
              <h3 className="text-xl font-semibold text-white mb-4">Créer un Nouveau Groupe</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Nom du groupe
                  </label>
                  <input
                    type="text"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-cyan-400"
                    placeholder="Ex: Gamers Zone"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Description
                  </label>
                  <textarea
                    value={newGroupDescription}
                    onChange={(e) => setNewGroupDescription(e.target.value)}
                    className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-cyan-400 h-20 resize-none"
                    placeholder="Décrivez le thème de votre groupe..."
                  />
                </div>
                <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3">
                  <p className="text-green-300 text-sm">
                    ✨ Votre groupe sera visible par tous les utilisateurs en temps réel
                  </p>
                </div>
                <div className="flex space-x-3">
                  <button
                    onClick={() => setShowCreateGroup(false)}
                    className="flex-1 px-4 py-2 border border-white/20 text-white rounded-lg hover:bg-white/10 transition-colors"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={handleCreateGroup}
                    disabled={!newGroupName.trim() || !newGroupDescription.trim()}
                    className="flex-1 px-4 py-2 bg-gradient-to-r from-cyan-500 to-purple-600 text-white rounded-lg hover:from-cyan-400 hover:to-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    Créer
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Searching State */}
        {isSearching && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-4">
              <div className="w-16 h-16 border-4 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-white text-lg">
                Recherche d'utilisateurs dans le groupe...
              </p>
              <p className="text-gray-400">
                Tentative {searchAttempts}/3
              </p>
            </div>
          </div>
        )}

        {/* Group Chat Interface */}
        {isConnected && (
          <>
            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.isOwn ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-xs lg:max-w-md px-4 py-2 rounded-2xl ${
                      message.isOwn
                        ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white'
                        : message.userId === 'system'
                        ? 'bg-green-500/20 text-green-300 border border-green-500/30'
                        : 'bg-white/10 text-white border border-white/20'
                    }`}
                  >
                    {!message.isOwn && message.userId !== 'system' && (
                      <p className="text-xs opacity-70 mb-1">{message.username}</p>
                    )}
                    <p className="text-sm">{message.message}</p>
                    <p className="text-xs opacity-60 mt-1">
                      {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Group Controls */}
            {canAddFriend && (
              <div className="bg-black/10 backdrop-blur-sm border-t border-white/10 px-4 py-2 flex-shrink-0">
                <div className="flex items-center justify-center">
                  <button
                    onClick={handleAddFriend}
                    disabled={showAddFriend}
                    className="flex items-center space-x-2 px-4 py-2 bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500/30 transition-all disabled:opacity-50"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span className="text-sm">
                      {showAddFriend ? 'Envoi...' : 'Ajouter des membres comme amis'}
                    </span>
                  </button>
                </div>
              </div>
            )}

            {/* Message Input */}
            <div className="bg-black/20 backdrop-blur-sm border-t border-white/10 p-4 flex-shrink-0">
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={currentMessage}
                  onChange={(e) => setCurrentMessage(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Tapez votre message dans le groupe..."
                  className="flex-1 bg-white/10 border border-white/20 rounded-full px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:border-cyan-400"
                />
                <button
                  onClick={handleSendMessage}
                  disabled={!currentMessage.trim()}
                  className="p-3 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-full hover:from-cyan-400 hover:to-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
import React, { useState, useEffect, useRef } from 'react';
import { Send, Users, ArrowLeft, SkipForward, UserPlus, X, MessageCircle, Clock, Settings, Wifi, WifiOff } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { supabase } from '../lib/supabase';
import CookieManager from '../utils/cookieManager';
import RandomChatService from '../services/RandomChatService';

interface RandomChatUser {
  user_id: string;
  pseudo: string;
  genre: 'homme' | 'femme' | 'autre';
  status: 'en_attente' | 'connecte' | 'hors_ligne';
  autoswitch_enabled: boolean;
  preferred_gender: 'homme' | 'femme' | 'autre' | 'tous';
  country?: string;
  city?: string;
}

interface RandomChatSession {
  id: string;
  user1_id: string;
  user1_pseudo: string;
  user1_genre: string;
  user2_id: string;
  user2_pseudo: string;
  user2_genre: string;
  status: 'active' | 'ended' | 'autoswitch_waiting';
  autoswitch_countdown_remaining?: number;
  started_at: string;
  last_activity: string;
}

interface RandomChatMessage {
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

export function RandomChatPage() {
  const { setPage, state } = useApp();
  const [currentView, setCurrentView] = useState<'setup' | 'waiting' | 'chatting'>('setup');
  const [showSetup, setShowSetup] = useState(false);
  
  // Formulaire de configuration
  const [pseudo, setPseudo] = useState('');
  const [genre, setGenre] = useState<'homme' | 'femme' | 'autre'>('homme');
  const [autoswitchEnabled, setAutoswitchEnabled] = useState(false);
  const [preferredGender, setPreferredGender] = useState<'homme' | 'femme' | 'autre' | 'tous'>('tous');
  
  // État du chat
  const [currentUser, setCurrentUser] = useState<RandomChatUser | null>(null);
  const [currentSession, setCurrentSession] = useState<RandomChatSession | null>(null);
  const [messages, setMessages] = useState<RandomChatMessage[]>([]);
  const [currentMessage, setCurrentMessage] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchAttempts, setSearchAttempts] = useState(0);
  const [waitingCount, setWaitingCount] = useState(0);
  const [autoswitchCountdown, setAutoswitchCountdown] = useState(0);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'connecting'>('disconnected');
  const [lastActivity, setLastActivity] = useState<Date>(new Date());
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const searchIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const messageSubscriptionRef = useRef<any>(null);
  const sessionSubscriptionRef = useRef<any>(null);
  const chatService = RandomChatService.getInstance();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Vérifier s'il y a des données sauvegardées
  useEffect(() => {
    console.log('🔄 Chargement des préférences utilisateur...');
    
    const cookiePreferences = CookieManager.loadPreferences();
    
    if (cookiePreferences && cookiePreferences.pseudo) {
      setPseudo(cookiePreferences.pseudo);
      setGenre(cookiePreferences.genre);
      setAutoswitchEnabled(cookiePreferences.autoswitchEnabled);
      
      console.log('✅ Préférences chargées:', cookiePreferences);
      
      // Auto-démarrer si les données sont sauvegardées et récentes
      const lastUsed = new Date(cookiePreferences.lastUsed);
      const hoursSinceLastUse = (Date.now() - lastUsed.getTime()) / (1000 * 60 * 60);
      
      if (hoursSinceLastUse < 24) { // Moins de 24h
        handleStartChat(cookiePreferences.pseudo, cookiePreferences.genre, cookiePreferences.autoswitchEnabled);
      } else {
        setShowSetup(true);
      }
    } else {
      console.log('ℹ️ Aucune préférence trouvée, affichage du setup');
      setShowSetup(true);
    }
  }, []);

  // Charger les statistiques en temps réel
  useEffect(() => {
    const loadStats = async () => {
      try {
        console.log('🔄 Mise à jour des statistiques chat randomisé...');
        
        // Compter les vrais utilisateurs en attente
        const { count, error } = await supabase
          .from('random_chat_users')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'en_attente')
          .gte('last_seen', new Date(Date.now() - 2 * 60 * 1000).toISOString()); // Actifs dans les 2 dernières minutes

        if (!error) {
          setWaitingCount(count || 0);
          console.log('📊 Vrais utilisateurs en attente:', count || 0);
        } else {
          console.error('❌ Erreur chargement stats:', error);
        }
      } catch (error) {
        console.error('❌ Erreur chargement stats:', error);
      }
    };

    loadStats();
    const interval = setInterval(loadStats, 15000); // Toutes les 15 secondes
    return () => clearInterval(interval);
  }, []);

  // Démarrer le chat
  const handleStartChat = async (userPseudo?: string, userGenre?: 'homme' | 'femme' | 'autre', userAutoswitch?: boolean) => {
    const finalPseudo = userPseudo || pseudo;
    const finalGenre = userGenre || genre;
    const finalAutoswitch = userAutoswitch !== undefined ? userAutoswitch : autoswitchEnabled;

    if (!finalPseudo.trim() || finalPseudo.trim().length < 2) {
      alert('Le pseudo doit contenir au moins 2 caractères');
      return;
    }

    try {
      console.log('🔄 Démarrage du chat randomisé...', { finalPseudo, finalGenre, finalAutoswitch });
      setConnectionStatus('connecting');

      // Sauvegarder les préférences
      CookieManager.savePreferences({
        pseudo: finalPseudo,
        genre: finalGenre,
        autoswitchEnabled: finalAutoswitch,
        lastUsed: new Date().toISOString()
      });

      // Créer l'utilisateur et rejoindre la file d'attente
      const userId = `random_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

      await chatService.joinQueue(userId, finalPseudo.trim(), finalGenre, finalAutoswitch);

      const user: RandomChatUser = {
        user_id: userId,
        pseudo: finalPseudo.trim(),
        genre: finalGenre,
        status: 'en_attente',
        autoswitch_enabled: finalAutoswitch,
        preferred_gender: preferredGender,
        last_seen: new Date().toISOString()
      };

      setCurrentUser(user);
      setShowSetup(false);
      setCurrentView('waiting');
      setConnectionStatus('connected');
      setLastActivity(new Date());

      // Chercher un partenaire
      searchForPartner(userId, finalPseudo, finalGenre);

    } catch (error) {
      console.error('❌ Erreur démarrage chat:', error);
      setConnectionStatus('disconnected');
      alert('Erreur lors du démarrage du chat. Veuillez réessayer.');
    }
  };

  // Chercher un partenaire (SIMPLE - UNE FONCTION FAIT TOUT)
  const searchForPartner = async (userId: string, userPseudo: string, userGenre: 'homme' | 'femme' | 'autre') => {
    setIsSearching(true);
    setSearchAttempts(0);

    let attempts = 0;
    const maxAttempts = 20;

    const search = async () => {
      attempts++;
      setSearchAttempts(attempts);

      try {
        console.log(`\ud83d\udd0d Recherche partenaire - Tentative ${attempts}/${maxAttempts}`);

        // NOUVELLE FONCTION ATOMIQUE - Trouve ET cr\u00e9e la session en UNE SEULE op\u00e9ration!
        const match = await chatService.findMatch(userId, userPseudo, userGenre);

        if (match && match.is_success) {
          console.log('\u2705 Match trouv\u00e9 ET session cr\u00e9\u00e9e!', match);

          // Cr\u00e9er l'objet session pour l'UI
          const session: RandomChatSession = {
            id: match.session_id,
            user1_id: userId,
            user1_pseudo: userPseudo,
            user1_genre: userGenre,
            user2_id: match.partner_id,
            user2_pseudo: match.partner_pseudo,
            user2_genre: match.partner_genre,
            status: 'active',
            started_at: new Date().toISOString(),
            last_activity: new Date().toISOString(),
            message_count: 0
          };

          setCurrentSession(session);
          setCurrentView('chatting');
          setIsSearching(false);
          setLastActivity(new Date());

          // Charger les messages existants
          await loadMessages(match.session_id);

          // S'abonner aux nouveaux messages et changements de session
          subscribeToMessages(match.session_id);
          subscribeToSession(match.session_id);

          // Arr\u00eater l'interval de recherche
          if (searchIntervalRef.current) {
            clearInterval(searchIntervalRef.current);
            searchIntervalRef.current = null;
          }

          return;
        }

        // Aucun partenaire trouv\u00e9 - Continuer la recherche
        console.log(`\u274c Aucun partenaire disponible - Tentative ${attempts}/${maxAttempts}`);

        if (attempts < maxAttempts) {
          console.log('\u23f3 Nouvelle tentative dans 2 secondes...');
          searchIntervalRef.current = setTimeout(search, 2000);
        } else {
          setIsSearching(false);
          alert(`Aucun utilisateur disponible pour le moment.\\n\\nConseil: Essayez plus tard quand il y a plus d'utilisateurs en ligne.`);
        }

      } catch (error) {
        console.error('\u274c Erreur recherche partenaire:', error);
        setIsSearching(false);
        alert('Erreur lors de la recherche. Veuillez r\u00e9essayer.');
      }
    };

    search();
  };

  // Charger les messages
  const loadMessages = async (sessionId: string) => {
    try {
      const msgs = await chatService.loadMessages(sessionId);
      setMessages(msgs);
      setLastActivity(new Date());
    } catch (error) {
      console.error('❌ Erreur chargement messages:', error);
    }
  };

  // S'abonner aux nouveaux messages
  const subscribeToMessages = (sessionId: string) => {
    if (messageSubscriptionRef.current) {
      messageSubscriptionRef.current.unsubscribe();
    }

    messageSubscriptionRef.current = chatService.subscribeToMessages(sessionId, (newMessage) => {
      setMessages(prev => [...prev, newMessage]);
      setLastActivity(new Date());
    });

    setConnectionStatus('connected');
  };

  // S'abonner aux changements de session
  const subscribeToSession = (sessionId: string) => {
    console.log('📡 Abonnement aux changements de session:', sessionId);
    
    // Nettoyer l'ancien abonnement
    if (sessionSubscriptionRef.current) {
      sessionSubscriptionRef.current.unsubscribe();
    }
    
    sessionSubscriptionRef.current = supabase
      .channel(`random_chat_session_${sessionId}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'random_chat_sessions', filter: `id=eq.${sessionId}` },
        (payload) => {
          console.log('🔄 Session mise à jour:', payload.new);
          const updatedSession = payload.new as RandomChatSession;
          setCurrentSession(updatedSession);
          setLastActivity(new Date());
          
          // Gérer l'autoswitch
          if (updatedSession.status === 'autoswitch_waiting' && updatedSession.autoswitch_countdown_remaining) {
            setAutoswitchCountdown(updatedSession.autoswitch_countdown_remaining);
            startCountdown();
          }
        }
      )
      .subscribe((status) => {
        console.log('📡 Statut abonnement session:', status);
      });
  };

  // Gérer la completion de l'autoswitch
  const handleAutoswitchComplete = async (newSessionId: string | null) => {
    if (newSessionId) {
      console.log('✅ Autoswitch réussi, nouvelle session:', newSessionId);
      
      // Charger la nouvelle session
      const { data: newSession, error } = await supabase
        .from('random_chat_sessions')
        .select('*')
        .eq('id', newSessionId)
        .maybeSingle();

      if (!error && newSession) {
        setCurrentSession(newSession);
        setMessages([]);
        setAutoswitchCountdown(0);
        setLastActivity(new Date());
        
        // Charger les messages de la nouvelle session
        await loadMessages(newSessionId);
        
        // Redémarrer la surveillance pour la nouvelle session
        if (currentUser?.autoswitch_enabled) {
          autoswitchManager.startMonitoringSession(newSessionId);
        }
        
        // S'abonner aux nouveaux messages
        subscribeToMessages(newSessionId);
        subscribeToSession(newSessionId);
        
        // Message de bienvenue
        const welcomeMessage: RandomChatMessage = {
          id: `welcome_${Date.now()}`,
          session_id: newSessionId,
          sender_id: 'system',
          sender_pseudo: 'LiberTalk',
          sender_genre: 'autre',
          message_text: '✨ Nouveau partenaire connecté via autoswitch !',
          message_type: 'system',
          sent_at: new Date().toISOString(),
          color_code: '#00FF00'
        };
        
        setMessages([welcomeMessage]);
      }
    } else {
      console.log('❌ Autoswitch échoué, retour en recherche');
      setCurrentView('waiting');
      setCurrentSession(null);
      setMessages([]);
      setAutoswitchCountdown(0);
      
      // Relancer la recherche
      if (currentUser) {
        searchForPartner(currentUser.user_id);
      }
    }
  };

  // Démarrer le compte à rebours
  const startCountdown = () => {
    const countdownInterval = setInterval(() => {
      setAutoswitchCountdown(prev => {
        if (prev <= 1) {
          clearInterval(countdownInterval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // Envoyer un message
  const handleSendMessage = async () => {
    if (!currentMessage.trim() || !currentSession || !currentUser) return;

    try {
      console.log('📤 Envoi message:', currentMessage.trim());
      
      const { error } = await supabase
        .from('random_chat_messages')
        .insert({
          session_id: currentSession.id,
          sender_id: currentUser.user_id,
          sender_pseudo: currentUser.pseudo,
          sender_genre: currentUser.genre,
          message_text: currentMessage.trim()
        });

      if (error) {
        console.error('❌ Erreur envoi message:', error);
        throw error;
      }
      
      console.log('✅ Message envoyé');
      setCurrentMessage('');
      setLastActivity(new Date());
    } catch (error) {
      console.error('❌ Erreur envoi message:', error);
      alert('Erreur lors de l\'envoi du message. Veuillez réessayer.');
    }
  };

  // Passer au suivant
  const handleNext = async () => {
    if (!currentSession || !currentUser) return;
    
    // Annuler l'autoswitch en cours si actif
    if (autoswitchManager.isActive()) {
      autoswitchManager.cancelAutoswitch();
    }

    try {
      console.log('⏭️ Passage au suivant...');
      
      await supabase.rpc('end_random_chat_session', {
        session_id: currentSession.id,
        ended_by_user_id: currentUser.user_id,
        end_reason: 'user_next'
      });

      // Nettoyer les abonnements
      cleanupSubscriptions();

      // Réinitialiser l'état
      setCurrentSession(null);
      setMessages([]);
      setAutoswitchCountdown(0);
      
      // Chercher un nouveau partenaire
      setCurrentView('waiting');
      searchForPartner(currentUser.user_id);
      
    } catch (error) {
      console.error('❌ Erreur passage au suivant:', error);
    }
  };

  // Quitter le chat
  const handleQuit = async () => {
    try {
      console.log('🚪 Quitter le chat...');
      
      // Annuler la recherche en cours
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
      
      // Nettoyer tous les services
      autoswitchManager.cleanup();
      await disconnectionManager.disconnect();
      
      if (currentSession && currentUser) {
        await supabase.rpc('end_random_chat_session', {
          session_id: currentSession.id,
          ended_by_user_id: currentUser.user_id,
          end_reason: 'user_quit'
        });
      }

      // Nettoyer les abonnements
      cleanupSubscriptions();

      setPage('chat');
    } catch (error) {
      console.error('❌ Erreur quitter chat:', error);
      setPage('chat');
    }
  };

  // Nettoyer les abonnements
  const cleanupSubscriptions = () => {
    if (messageSubscriptionRef.current) {
      messageSubscriptionRef.current.unsubscribe();
      messageSubscriptionRef.current = null;
    }
    if (sessionSubscriptionRef.current) {
      sessionSubscriptionRef.current.unsubscribe();
      sessionSubscriptionRef.current = null;
    }
  };

  // Nettoyage au démontage du composant
  useEffect(() => {
    return () => {
      cleanupSubscriptions();
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const getGenderColor = (genre: string) => {
    switch (genre) {
      case 'femme': return '#FF69B4';
      case 'homme': return '#1E90FF';
      default: return '#A9A9A9';
    }
  };

  const getGenderIcon = (genre: string) => {
    switch (genre) {
      case 'femme': return '♀';
      case 'homme': return '♂';
      default: return '⚪';
    }
  };

  const getConnectionIcon = () => {
    switch (connectionStatus) {
      case 'connected': return <Wifi className="w-4 h-4 text-green-400" />;
      case 'connecting': return <Wifi className="w-4 h-4 text-yellow-400 animate-pulse" />;
      default: return <WifiOff className="w-4 h-4 text-red-400" />;
    }
  };

  const formatLastActivity = () => {
    const seconds = Math.floor((Date.now() - lastActivity.getTime()) / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h`;
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="bg-black/20 backdrop-blur-sm border-b border-white/10 p-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={handleQuit}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-white" />
            </button>
            <h1 className="text-xl font-semibold text-white">Chat Randomisé</h1>
            {currentUser && (
              <div className="hidden sm:flex items-center space-x-2 text-sm">
                <span style={{ color: getGenderColor(currentUser.genre) }}>
                  {getGenderIcon(currentUser.genre)} {currentUser.pseudo}
                </span>
                {currentUser.autoswitch_enabled && (
                  <span className="text-green-400 text-xs bg-green-400/20 px-2 py-1 rounded">Auto</span>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center space-x-4">
            {/* Statut de connexion */}
            <div className="flex items-center space-x-2">
              {getConnectionIcon()}
              <span className="text-xs text-gray-400 hidden sm:block">
                {connectionStatus === 'connected' ? `Actif ${formatLastActivity()}` : 
                 connectionStatus === 'connecting' ? 'Connexion...' : 'Déconnecté'}
              </span>
            </div>
            
            {currentView === 'waiting' && (
              <div className="flex items-center space-x-2 text-cyan-400">
                <Users className="w-4 h-4" />
                <span className="text-sm">{waitingCount} réels</span>
              </div>
            )}
            {autoswitchCountdown > 0 && (
              <div className="flex items-center space-x-2 text-yellow-400">
                <Clock className="w-4 h-4 animate-pulse" />
                <span className="text-sm">{autoswitchCountdown}s</span>
              </div>
            )}
            {currentSession && currentSession.status === 'active' && (
              <div className="flex items-center space-x-1 text-green-400 text-xs">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                <span>Live</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Setup Modal */}
      {showSetup && (
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-800 rounded-xl p-6 w-full max-w-md border border-white/20">
            <h3 className="text-xl font-semibold text-white mb-4">Configuration du Chat</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Pseudo (2-15 caractères)
                </label>
                <input
                  type="text"
                  value={pseudo}
                  onChange={(e) => setPseudo(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                  maxLength={15}
                  className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-cyan-400"
                  placeholder="VotrePseudo"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Genre
                </label>
                <select
                  value={genre}
                  onChange={(e) => setGenre(e.target.value as 'homme' | 'femme' | 'autre')}
                  className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-cyan-400"
                >
                  <option value="homme">♂ Homme</option>
                  <option value="femme">♀ Femme</option>
                  <option value="autre">⚪ Autre</option>
                </select>
              </div>
              <div className="flex items-center space-x-3">
                <input
                  type="checkbox"
                  id="autoswitch"
                  checked={autoswitchEnabled}
                  onChange={(e) => setAutoswitchEnabled(e.target.checked)}
                  className="w-4 h-4 text-cyan-600 bg-gray-100 border-gray-300 rounded focus:ring-cyan-500"
                />
                <label htmlFor="autoswitch" className="text-sm text-gray-300">
                  Autoswitch (reconnexion automatique après 30s si le partenaire part)
                </label>
              </div>
              <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-lg p-3">
                <p className="text-cyan-300 text-sm">
                  <strong>🎨 Couleurs des messages :</strong><br />
                  <span style={{ color: '#FF69B4' }}>♀ Rose pour les femmes</span><br />
                  <span style={{ color: '#1E90FF' }}>♂ Bleu pour les hommes</span><br />
                  <span style={{ color: '#A9A9A9' }}>⚪ Gris pour les autres</span><br />
                  <strong>🔴 SANS BOTS</strong> - Seulement de vrais utilisateurs !
                </p>
              </div>
              <div className="flex space-x-3">
                <button
                  onClick={() => setShowSetup(false)}
                  className="flex-1 px-4 py-2 border border-white/20 text-white rounded-lg hover:bg-white/10 transition-colors"
                >
                  Annuler
                </button>
                <button
                  onClick={() => handleStartChat()}
                  disabled={!pseudo.trim() || pseudo.trim().length < 2}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-cyan-500 to-purple-600 text-white rounded-lg hover:from-cyan-400 hover:to-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  Démarrer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Waiting State */}
        {currentView === 'waiting' && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-4">
              <div className="w-16 h-16 border-4 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-white text-lg">
                {isSearching ? `Recherche... Tentative ${searchAttempts}/8` : 'Recherche d\'un partenaire'}
              </p>
              <p className="text-gray-400">
                Connexion avec de vraies personnes...
              </p>
              <div className="text-cyan-400 text-sm">
                {waitingCount} utilisateurs réels en attente • Mis à jour toutes les 15s
              </div>
              <button
                onClick={() => setShowSetup(true)}
                className="flex items-center space-x-2 px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors"
              >
                <Settings className="w-4 h-4" />
                <span>Modifier les paramètres</span>
              </button>
            </div>
          </div>
        )}

        {/* Chat Interface */}
        {currentView === 'chatting' && currentSession && (
          <>
            {/* Partner Info */}
            <div className="bg-black/10 backdrop-blur-sm border-b border-white/10 px-4 py-2 flex-shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div 
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold"
                    style={{ backgroundColor: getGenderColor(currentSession.user1_id === currentUser?.user_id ? currentSession.user2_genre : currentSession.user1_genre) }}
                  >
                    {getGenderIcon(currentSession.user1_id === currentUser?.user_id ? currentSession.user2_genre : currentSession.user1_genre)}
                  </div>
                  <div>
                    <p className="text-white font-medium">
                      {currentSession.user1_id === currentUser?.user_id ? currentSession.user2_pseudo : currentSession.user1_pseudo}
                    </p>
                    <p className="text-gray-400 text-xs">
                      {currentSession.user1_id === currentUser?.user_id ? currentSession.user2_genre : currentSession.user1_genre}
                    </p>
                  </div>
                </div>
                {currentSession.status === 'autoswitch_waiting' && autoswitchCountdown > 0 && (
                  <div className="text-yellow-400 text-sm">
                    <div className="flex items-center space-x-2">
                      <Clock className="w-4 h-4 animate-pulse" />
                      <span>Autoswitch dans {autoswitchCountdown}s</span>
                      <button
                        onClick={() => autoswitchManager.cancelAutoswitch()}
                        className="text-xs bg-red-500/20 text-red-400 px-2 py-1 rounded hover:bg-red-500/30 transition-colors"
                      >
                        Annuler
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0 custom-scroll">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.sender_id === currentUser?.user_id ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-xs lg:max-w-md px-4 py-2 rounded-2xl ${
                      message.message_type === 'system' || message.message_type === 'autoswitch_warning'
                        ? 'bg-gray-500/20 text-gray-300 border border-gray-500/30 mx-auto'
                        : message.sender_id === currentUser?.user_id
                        ? 'text-white'
                        : 'bg-white/10 text-white border border-white/20'
                    }`}
                    style={
                      message.message_type === 'user' && message.sender_id !== currentUser?.user_id
                        ? { backgroundColor: `${message.color_code}20`, borderColor: `${message.color_code}40` }
                        : message.message_type === 'user' && message.sender_id === currentUser?.user_id
                        ? { backgroundColor: message.color_code }
                        : {}
                    }
                  >
                    {message.message_type === 'system' || message.message_type === 'autoswitch_warning' ? (
                      <p className="text-center text-sm">{message.message_text}</p>
                    ) : (
                      <>
                        {message.sender_id !== currentUser?.user_id && (
                          <p className="text-xs opacity-70 mb-1">
                            {getGenderIcon(message.sender_genre)} {message.sender_pseudo}
                          </p>
                        )}
                        <p>{message.message_text}</p>
                        <p className="text-xs opacity-60 mt-1">
                          {new Date(message.sent_at).toLocaleTimeString('fr-FR', { 
                            hour: '2-digit', 
                            minute: '2-digit' 
                          })}
                        </p>
                      </>
                    )}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Message Input */}
            <div className="bg-black/20 backdrop-blur-sm border-t border-white/10 p-4 flex-shrink-0">
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  value={currentMessage}
                  onChange={(e) => setCurrentMessage(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Tapez votre message..."
                  className="flex-1 bg-white/10 border border-white/20 rounded-full px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-cyan-400"
                  maxLength={500}
                />
                <button
                  onClick={handleSendMessage}
                  disabled={!currentMessage.trim()}
                  className="p-2 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-full hover:from-cyan-400 hover:to-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  <Send className="w-5 h-5 text-white" />
                </button>
                <button
                  onClick={handleNext}
                  className="p-2 bg-yellow-500/20 text-yellow-400 rounded-full hover:bg-yellow-500/30 transition-colors"
                  title="Passer au suivant"
                >
                  <SkipForward className="w-5 h-5 text-white" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
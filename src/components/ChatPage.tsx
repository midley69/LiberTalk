import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    Send,
    ArrowLeft,
    MessageCircle,
    SkipForward,
    Loader2,
    AlertCircle,
    MapPin,
    Globe
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { ChatMessage } from '../types';
import SocketService from '../services/socketService';

export function ChatPage() {
    const { setPage, state } = useApp();
    const [currentView, setCurrentView] = useState<'menu' | 'random'>('menu');
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [currentMessage, setCurrentMessage] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const [isConnected, setIsConnected] = useState(false);
    const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
    const [connectedUser, setConnectedUser] = useState<any>(null);
    const [distance, setDistance] = useState<number | null>(null);
    const [isSending, setIsSending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [searchTimeout, setSearchTimeout] = useState<NodeJS.Timeout | null>(null);
    const [userLocation, setUserLocation] = useState<any>(null);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const messageInputRef = useRef<HTMLInputElement>(null);
    const socketService = SocketService.getInstance();

    // Auto-scroll des messages
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Focus sur l'input après connexion
    useEffect(() => {
        if (isConnected && messageInputRef.current) {
            messageInputRef.current.focus();
        }
    }, [isConnected]);

    // Obtenir la localisation de l'utilisateur
    useEffect(() => {
        const location = socketService.getUserLocation();
        setUserLocation(location);
    }, []);

    // Nettoyage du timeout de recherche
    useEffect(() => {
        return () => {
            if (searchTimeout) {
                clearTimeout(searchTimeout);
            }
        };
    }, [searchTimeout]);

    // Configuration des listeners Socket.io
    useEffect(() => {
        const setupListeners = () => {
            // Match trouvé avec distance
            socketService.onMatchFound((data) => {
                console.log('💑 Match trouvé!', data);
                setIsSearching(false);
                setIsConnected(true);
                setCurrentSessionId(data.sessionId);
                setConnectedUser(data.partner);
                setDistance(data.distance);
                setError(null);

                if (searchTimeout) {
                    clearTimeout(searchTimeout);
                    setSearchTimeout(null);
                }

                // Message système avec localisation
                let locationInfo = '';
                if (data.partner.location?.city && data.partner.location?.country) {
                    locationInfo = ` depuis ${data.partner.location.city}, ${data.partner.location.country}`;
                }

                let distanceInfo = '';
                if (data.distance !== null && data.distance !== undefined) {
                    if (data.distance < 1) {
                        distanceInfo = ' (même ville)';
                    } else if (data.distance < 100) {
                        distanceInfo = ` (à ${Math.round(data.distance)} km)`;
                    } else if (data.distance < 1000) {
                        distanceInfo = ` (même région)`;
                    }
                }

                const sysMessage: ChatMessage = {
                    id: `sys_${Date.now()}`,
                    userId: 'system',
                    username: 'Système',
                    message: `Connecté avec ${data.partner.username}${locationInfo}${distanceInfo}`,
                    timestamp: new Date(),
                    isOwn: false
                };
                setMessages([sysMessage]);

                // Charger l'historique si disponible
                loadMessageHistory(data.sessionId);
            });

            // Réception de messages
            socketService.onMessageReceive((message) => {
                setMessages(prev => [...prev, message]);
            });

            // Fin de session
            socketService.onSessionEnded(() => {
                handleDisconnect('L\'autre utilisateur s\'est déconnecté');
            });
        };

        setupListeners();
    }, [searchTimeout]);

    // Charger l'historique des messages
    const loadMessageHistory = async (sessionId: string) => {
        try {
            const history = await socketService.getMessageHistory(sessionId);
            if (history.length > 0) {
                setMessages(prev => [...history, ...prev]);
            }
        } catch (error) {
            console.error('Erreur chargement historique:', error);
        }
    };

    // Connexion à un chat
    const handleConnect = useCallback(async (type: 'random') => {
        try {
            setCurrentView(type);
            setIsSearching(true);
            setMessages([]);
            setError(null);
            setDistance(null);

            // Rejoindre la file d'attente avec localisation
            await socketService.joinQueue('chat');

            // Timeout après 30 secondes
            const timeout = setTimeout(() => {
                setIsSearching(false);
                setError('Aucun utilisateur disponible actuellement. Réessayez dans quelques instants.');
                socketService.leaveQueue();
            }, 30000);

            setSearchTimeout(timeout);
        } catch (error) {
            console.error('❌ Erreur connexion:', error);
            setIsSearching(false);
            setError('Erreur de connexion. Veuillez réessayer.');
        }
    }, []);

    // Envoi de message
    const handleSendMessage = useCallback(async () => {
        if (!currentMessage.trim() || !currentSessionId || isSending) return;

        const messageText = currentMessage.trim();
        setCurrentMessage('');
        setIsSending(true);

        try {
            // Créer le message local immédiatement
            const newMessage: ChatMessage = {
                id: `local_${Date.now()}`,
                userId: state.user?.id || 'me',
                username: state.user?.username || 'Moi',
                message: messageText,
                timestamp: new Date(),
                isOwn: true
            };

            setMessages(prev => [...prev, newMessage]);

            // Envoyer via Socket.io
            await socketService.sendMessage(currentSessionId, messageText);

            // Focus sur l'input
            messageInputRef.current?.focus();
        } catch (error) {
            console.error('❌ Erreur envoi message:', error);
            setError('Erreur d\'envoi. Réessayez.');
            setCurrentMessage(messageText);
        } finally {
            setIsSending(false);
        }
    }, [currentMessage, currentSessionId, isSending, state.user]);

    // Gestion du clavier
    const handleKeyPress = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    }, [handleSendMessage]);

    // Passer au suivant
    const handleSkipUser = useCallback(async () => {
        if (!currentSessionId) return;

        try {
            await socketService.skipUser(currentSessionId);
            setIsSearching(true);
            setIsConnected(false);
            setMessages([]);
            setCurrentSessionId(null);
            setConnectedUser(null);
            setDistance(null);
            setError(null);

            // Rejoindre automatiquement la file
            await socketService.joinQueue('chat');
        } catch (error) {
            console.error('❌ Erreur skip:', error);
            setError('Erreur. Veuillez réessayer.');
        }
    }, [currentSessionId]);

    // Déconnexion
    const handleDisconnect = useCallback((reason?: string) => {
        setIsConnected(false);
        setIsSearching(false);
        setCurrentView('menu');
        setMessages([]);
        setCurrentSessionId(null);
        setConnectedUser(null);
        setDistance(null);

        if (reason) {
            setError(reason);
        }

        if (searchTimeout) {
            clearTimeout(searchTimeout);
            setSearchTimeout(null);
        }

        socketService.leaveQueue();
    }, [searchTimeout]);

    return (
        <div className="h-full flex flex-col overflow-hidden bg-gradient-to-br from-slate-900 via-purple-900/20 to-slate-900">
            {/* Header */}
            <header className="bg-black/20 backdrop-blur-sm border-b border-white/10 px-3 sm:px-4 py-3 flex-shrink-0">
                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2 sm:space-x-3">
                        <button
                            onClick={() => currentView === 'menu' ? setPage('home') : handleDisconnect()}
                            className="p-1.5 sm:p-2 hover:bg-white/10 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-400"
                            aria-label="Retour"
                        >
                            <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                        </button>
                        <div className="flex-1 min-w-0">
                            <h1 className="text-base sm:text-lg font-semibold text-white truncate">
                                Chat Textuel
                            </h1>
                            {connectedUser && (
                                <div className="flex items-center space-x-2 text-xs text-gray-400">
                                    <span className="truncate">{connectedUser.username}</span>
                                    {connectedUser.location?.city && (
                                        <>
                                            <span>•</span>
                                            <div className="flex items-center space-x-1">
                                                <MapPin className="w-3 h-3" />
                                                <span className="truncate">
                                                    {connectedUser.location.city}
                                                    {distance !== null && distance !== undefined && distance < 1000 && (
                                                        <span className="text-cyan-400"> ({Math.round(distance)}km)</span>
                                                    )}
                                                </span>
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center space-x-2">
                        {userLocation?.city && (
                            <div className="hidden sm:flex items-center space-x-1 text-xs text-gray-400">
                                <Globe className="w-3 h-3" />
                                <span className="truncate max-w-[100px]">{userLocation.city}</span>
                            </div>
                        )}

                        {isConnected && (
                            <div className="flex items-center space-x-1 text-green-400" aria-live="polite">
                                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" aria-hidden="true" />
                                <span className="text-xs sm:text-sm">Live</span>
                            </div>
                        )}
                    </div>
                </div>
            </header>

            {/* Message d'erreur */}
            {error && (
                <div className="bg-red-500/10 border-b border-red-500/20 px-4 py-2" role="alert">
                    <div className="flex items-center space-x-2 text-red-300">
                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                        <p className="text-xs sm:text-sm flex-1">{error}</p>
                        <button
                            onClick={() => setError(null)}
                            className="text-red-400 hover:text-red-300 p-1"
                            aria-label="Fermer l'alerte"
                        >
                            ✕
                        </button>
                    </div>
                </div>
            )}

            {/* Contenu principal */}
            <main className="flex-1 flex flex-col min-h-0">
                {/* Menu de sélection */}
                {currentView === 'menu' && (
                    <div className="flex-1 overflow-y-auto p-4 sm:p-6">
                        <div className="max-w-2xl mx-auto space-y-4 sm:space-y-6">
                            <div className="text-center">
                                <h2 className="text-xl sm:text-2xl font-semibold text-white mb-2">
                                    Chat Instantané
                                </h2>
                                <p className="text-sm sm:text-base text-gray-300">
                                    Connexion prioritaire avec les utilisateurs proches de vous
                                </p>
                                {userLocation?.city && (
                                    <div className="flex items-center justify-center space-x-2 mt-2 text-cyan-400 text-sm">
                                        <MapPin className="w-4 h-4" />
                                        <span>Votre position: {userLocation.city}, {userLocation.country}</span>
                                    </div>
                                )}
                            </div>

                            {/* Option Chat Aléatoire */}
                            <button
                                onClick={() => handleConnect('random')}
                                className="w-full p-4 sm:p-6 rounded-xl border border-white/20 bg-white/5 hover:border-cyan-400 hover:bg-cyan-400/10 transition-all duration-300 group focus:outline-none focus:ring-2 focus:ring-cyan-400"
                                aria-label="Commencer un chat aléatoire"
                            >
                                <div className="text-center space-y-3">
                                    <div className="w-12 h-12 sm:w-16 sm:h-16 mx-auto bg-gradient-to-br from-cyan-400 to-blue-500 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                                        <MessageCircle className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
                                    </div>
                                    <h3 className="text-lg sm:text-xl font-semibold text-white">
                                        Lancer un Chat
                                    </h3>
                                    <p className="text-sm text-gray-300">
                                        Connectez-vous avec quelqu'un près de chez vous
                                    </p>
                                    <div className="flex items-center justify-center space-x-2 text-xs text-cyan-400">
                                        <Globe className="w-4 h-4" />
                                        <span>Matching par géolocalisation activé</span>
                                    </div>
                                </div>
                            </button>
                        </div>
                    </div>
                )}

                {/* État de recherche */}
                {isSearching && (
                    <div className="flex-1 flex items-center justify-center p-4">
                        <div className="text-center space-y-4" role="status" aria-live="polite">
                            <Loader2 className="w-12 h-12 sm:w-16 sm:h-16 text-cyan-400 animate-spin mx-auto" />
                            <p className="text-white text-base sm:text-lg">
                                Recherche d'un utilisateur près de vous...
                            </p>
                            {userLocation?.city && (
                                <p className="text-gray-400 text-xs sm:text-sm">
                                    Priorité: {userLocation.city}, {userLocation.country}
                                </p>
                            )}
                        </div>
                    </div>
                )}

                {/* Interface de chat */}
                {isConnected && (
                    <>
                        {/* Zone des messages */}
                        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2 sm:space-y-3" role="log" aria-label="Messages">
                            {messages.map((message) => (
                                <div
                                    key={message.id}
                                    className={`flex ${message.isOwn ? 'justify-end' : 'justify-start'} animate-fade-in`}
                                >
                                    <div
                                        className={`max-w-[85%] sm:max-w-xs md:max-w-sm lg:max-w-md px-3 sm:px-4 py-2 rounded-2xl ${message.isOwn
                                                ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white'
                                                : message.userId === 'system'
                                                    ? 'bg-green-500/20 text-green-300 border border-green-500/30'
                                                    : 'bg-white/10 text-white border border-white/20'
                                            }`}
                                    >
                                        {!message.isOwn && message.userId !== 'system' && (
                                            <p className="text-xs opacity-70 mb-1">{message.username}</p>
                                        )}
                                        <p className="text-sm sm:text-base break-words">{message.message}</p>
                                        <p className="text-xs opacity-60 mt-1">
                                            {message.timestamp.toLocaleTimeString([], {
                                                hour: '2-digit',
                                                minute: '2-digit'
                                            })}
                                        </p>
                                    </div>
                                </div>
                            ))}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Contrôles du chat */}
                        <div className="bg-black/10 backdrop-blur-sm border-t border-white/10 p-2 sm:p-3 space-y-2">
                            {/* Bouton Suivant */}
                            <div className="flex justify-center">
                                <button
                                    onClick={handleSkipUser}
                                    className="flex items-center space-x-2 px-3 sm:px-4 py-1.5 sm:py-2 bg-yellow-500/20 text-yellow-400 rounded-lg hover:bg-yellow-500/30 transition-all text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
                                    aria-label="Passer au suivant"
                                >
                                    <SkipForward className="w-4 h-4" />
                                    <span>Suivant</span>
                                </button>
                            </div>

                            {/* Zone de saisie */}
                            <div className="flex space-x-2">
                                <input
                                    ref={messageInputRef}
                                    type="text"
                                    value={currentMessage}
                                    onChange={(e) => setCurrentMessage(e.target.value)}
                                    onKeyPress={handleKeyPress}
                                    placeholder="Tapez votre message..."
                                    maxLength={1000}
                                    disabled={isSending}
                                    className="flex-1 bg-white/10 border border-white/20 rounded-full px-3 sm:px-4 py-2 text-sm sm:text-base text-white placeholder-gray-400 focus:outline-none focus:border-cyan-400 transition-colors disabled:opacity-50"
                                    aria-label="Message"
                                    autoComplete="off"
                                    autoCapitalize="sentences"
                                    autoFocus
                                />
                                <button
                                    onClick={handleSendMessage}
                                    disabled={!currentMessage.trim() || isSending}
                                    className="p-2 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-full hover:from-cyan-400 hover:to-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all focus:outline-none focus:ring-2 focus:ring-cyan-400"
                                    aria-label="Envoyer le message"
                                >
                                    {isSending ? (
                                        <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" />
                                    ) : (
                                        <Send className="w-4 h-4 sm:w-5 sm:h-5" />
                                    )}
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </main>
        </div>
    );
}
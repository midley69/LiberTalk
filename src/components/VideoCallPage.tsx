import React, { useState, useEffect, useRef } from 'react';
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  PhoneOff,
  SkipForward,
  UserPlus,
  Volume2,
  VolumeX,
  ArrowLeft,
  Wifi,
  WifiOff
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { supabase } from '../lib/supabase';
import WebRTCService from '../services/WebRTCService';
import RandomChatService from '../services/RandomChatService';
import CookieManager from '../utils/cookieManager';
import IPGeolocationService from '../services/IPGeolocationService';

export function VideoCallPage() {
  const { setPage } = useApp();
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isMicEnabled, setIsMicEnabled] = useState(true);
  const [isSpeakerEnabled, setIsSpeakerEnabled] = useState(true);
  const [connectionState, setConnectionState] = useState<'disconnected' | 'connecting' | 'connected' | 'failed'>('disconnected');
  const [canAddFriend, setCanAddFriend] = useState(true);
  const [showAddFriend, setShowAddFriend] = useState(false);

  const [showSetup, setShowSetup] = useState(true);
  const [pseudo, setPseudo] = useState('');
  const [genre, setGenre] = useState<'homme' | 'femme' | 'autre'>('homme');
  const [isSearching, setIsSearching] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [partnerPseudo, setPartnerPseudo] = useState<string>('');
  const [sessionId, setSessionId] = useState<string | null>(null);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const webrtcService = WebRTCService.getInstance();
  const chatService = RandomChatService.getInstance();
  const geoService = IPGeolocationService.getInstance();

  useEffect(() => {
    const savedUser = CookieManager.getUser();
    if (savedUser) {
      setPseudo(savedUser.pseudo);
      setGenre(savedUser.genre);
    }

    return () => {
      cleanup();
    };
  }, []);

  const cleanup = async () => {
    console.log('🧹 Cleaning up video call...');
    await webrtcService.cleanup();
    await chatService.cleanup();
  };

  const handleStartVideo = async () => {
    if (!pseudo || pseudo.length < 2) {
      alert('Veuillez entrer un pseudo (2-15 caractères)');
      return;
    }

    const userId = `video_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

    const user = {
      user_id: userId,
      pseudo: pseudo,
      genre: genre,
      timestamp: Date.now()
    };

    CookieManager.saveUser(user);
    setCurrentUser(user);
    setShowSetup(false);
    setIsSearching(true);

    try {
      console.log('🎥 Starting video call...');

      const stream = await webrtcService.initializeLocalStream(isVideoEnabled, isMicEnabled);

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      console.log('✅ Local stream initialized');

      const location = await geoService.getUserIPLocation();
      if (location) {
        await geoService.storeUserLocation(userId);
      }

      await chatService.joinQueue(userId, pseudo, genre, false);

      searchForPartner(userId, pseudo, genre);

    } catch (error) {
      console.error('❌ Error starting video:', error);
      alert('Erreur: Impossible d\'accéder à la caméra/micro. Vérifiez les permissions.');
      setIsSearching(false);
      setShowSetup(true);
    }
  };

  const searchForPartner = async (userId: string, userPseudo: string, userGenre: string) => {
    console.log('🔍 Searching for video partner...');

    let attempts = 0;
    const maxAttempts = 30;

    const searchInterval = setInterval(async () => {
      attempts++;

      try {
        const match = await chatService.findMatch(userId, userPseudo, userGenre);

        if (match && match.is_success) {
          clearInterval(searchInterval);
          console.log('✅ Video partner found!', match);

          setPartnerId(match.partner_id);
          setPartnerPseudo(match.partner_pseudo);
          setSessionId(match.session_id);
          setIsSearching(false);
          setConnectionState('connecting');

          await setupWebRTC(userId, match.session_id);
        }

        if (attempts >= maxAttempts) {
          clearInterval(searchInterval);
          setIsSearching(false);
          alert('Aucun utilisateur disponible pour un appel vidéo. Réessayez plus tard.');
          setShowSetup(true);
        }
      } catch (error) {
        console.error('❌ Search error:', error);
      }
    }, 2000);
  };

  const setupWebRTC = async (userId: string, sessionId: string) => {
    try {
      console.log('🔗 Setting up WebRTC connection...');

      await webrtcService.createPeerConnection(userId, sessionId);

      webrtcService.onRemoteStream((stream) => {
        console.log('📥 Remote stream received!');
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = stream;
        }
      });

      webrtcService.onConnectionState((state) => {
        console.log('🔌 Connection state:', state);
        if (state === 'connected') {
          setConnectionState('connected');
        } else if (state === 'failed' || state === 'disconnected') {
          setConnectionState('failed');
        } else if (state === 'connecting') {
          setConnectionState('connecting');
        }
      });

      webrtcService.onICEConnectionState((state) => {
        console.log('🧊 ICE state:', state);
      });

      const isInitiator = userId < (partnerId || '');
      if (isInitiator) {
        console.log('📞 Creating offer (initiator)...');
        await webrtcService.createOffer();
      }

    } catch (error) {
      console.error('❌ WebRTC setup error:', error);
      setConnectionState('failed');
    }
  };

  const handleToggleVideo = () => {
    const newState = !isVideoEnabled;
    setIsVideoEnabled(newState);
    webrtcService.toggleVideo(newState);
  };

  const handleToggleMic = () => {
    const newState = !isMicEnabled;
    setIsMicEnabled(newState);
    webrtcService.toggleAudio(newState);
  };

  const handleToggleSpeaker = () => {
    setIsSpeakerEnabled(!isSpeakerEnabled);
    if (remoteVideoRef.current) {
      remoteVideoRef.current.muted = isSpeakerEnabled;
    }
  };

  const handleEndCall = async () => {
    console.log('📞 Ending call...');

    if (sessionId && currentUser) {
      await chatService.endSession(sessionId, currentUser.user_id, 'user_ended');
    }

    await cleanup();
    setPage('home');
  };

  const handleSkipUser = async () => {
    if (!sessionId || !currentUser) return;

    console.log('⏭️ Skipping to next user...');

    await chatService.endSession(sessionId, currentUser.user_id, 'user_next');

    setPartnerId(null);
    setPartnerPseudo('');
    setSessionId(null);
    setConnectionState('disconnected');
    setIsSearching(true);

    const stream = await webrtcService.initializeLocalStream(isVideoEnabled, isMicEnabled);
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
    }

    searchForPartner(currentUser.user_id, currentUser.pseudo, currentUser.genre);
  };

  const handleAddFriend = async () => {
    if (!currentUser || !partnerId) return;

    try {
      const { error } = await supabase.from('friend_requests').insert({
        from_user_id: currentUser.user_id,
        to_user_id: partnerId,
        message: `${currentUser.pseudo} souhaite vous ajouter en ami`
      });

      if (error) throw error;

      setShowAddFriend(true);
      setCanAddFriend(false);

      setTimeout(() => {
        setShowAddFriend(false);
      }, 3000);

    } catch (error) {
      console.error('❌ Error sending friend request:', error);
    }
  };

  const handleBack = async () => {
    await cleanup();
    setPage('home');
  };

  const getConnectionIcon = () => {
    switch (connectionState) {
      case 'connected':
        return <Wifi className="w-4 h-4 text-green-400" />;
      case 'connecting':
        return <Wifi className="w-4 h-4 text-yellow-400 animate-pulse" />;
      case 'failed':
      case 'disconnected':
        return <WifiOff className="w-4 h-4 text-red-400" />;
    }
  };

  const getConnectionText = () => {
    switch (connectionState) {
      case 'connected':
        return 'Connecté';
      case 'connecting':
        return 'Connexion...';
      case 'failed':
        return 'Échec de connexion';
      case 'disconnected':
        return 'Déconnecté';
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <div className="bg-black/20 backdrop-blur-sm border-b border-white/10 p-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={handleBack}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-white" />
            </button>
            <h1 className="text-xl font-semibold text-white">Appel Vidéo</h1>
          </div>

          {!showSetup && (
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                {getConnectionIcon()}
                <span className="text-xs text-gray-400 hidden sm:block">
                  {getConnectionText()}
                </span>
              </div>

              {partnerPseudo && (
                <div className="text-sm text-cyan-400">
                  📹 {partnerPseudo}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Setup Modal */}
      {showSetup && (
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="bg-slate-800 rounded-xl p-6 w-full max-w-md border border-white/20">
            <h3 className="text-xl font-semibold text-white mb-4">Configuration Vidéo</h3>
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

              <button
                onClick={handleStartVideo}
                disabled={isSearching}
                className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 text-white py-3 rounded-lg hover:from-cyan-400 hover:to-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-semibold"
              >
                {isSearching ? '🔍 Recherche en cours...' : '🎥 Démarrer l\'appel vidéo'}
              </button>

              <p className="text-xs text-gray-400 text-center">
                ⚠️ Autorisez l'accès à votre caméra et micro
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Video Container */}
      {!showSetup && (
        <div className="flex-1 relative overflow-hidden">
          {/* Remote Video (Main) */}
          <div className="w-full h-full bg-gray-900 relative">
            <video
              ref={remoteVideoRef}
              className="w-full h-full object-cover"
              autoPlay
              playsInline
            />

            {connectionState !== 'connected' && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
                <div className="text-center text-white">
                  <div className="w-24 h-24 bg-gray-700 rounded-full mx-auto mb-4 flex items-center justify-center">
                    <Video className="w-12 h-12" />
                  </div>
                  <p className="text-lg">
                    {isSearching ? '🔍 Recherche d\'un partenaire...' : getConnectionText()}
                  </p>
                </div>
              </div>
            )}

            {/* Local Video (PiP) */}
            <div className="absolute top-4 right-4 w-40 h-28 bg-gray-800 rounded-lg overflow-hidden border-2 border-white/20 shadow-lg">
              <video
                ref={localVideoRef}
                className="w-full h-full object-cover"
                autoPlay
                playsInline
                muted
              />
              {!isVideoEnabled && (
                <div className="absolute inset-0 bg-gray-800 flex items-center justify-center">
                  <VideoOff className="w-8 h-8 text-white" />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Controls */}
      {!showSetup && connectionState !== 'disconnected' && (
        <div className="p-6 bg-black/30 backdrop-blur-sm flex-shrink-0">
          <div className="flex justify-center items-center space-x-4 flex-wrap gap-y-2">
            <button
              onClick={handleToggleVideo}
              className={`p-4 rounded-full transition-all duration-300 ${
                isVideoEnabled
                  ? 'bg-gray-600 hover:bg-gray-500'
                  : 'bg-red-500 hover:bg-red-400'
              }`}
              title={isVideoEnabled ? 'Désactiver la caméra' : 'Activer la caméra'}
            >
              {isVideoEnabled ? (
                <Video className="w-6 h-6 text-white" />
              ) : (
                <VideoOff className="w-6 h-6 text-white" />
              )}
            </button>

            <button
              onClick={handleToggleMic}
              className={`p-4 rounded-full transition-all duration-300 ${
                isMicEnabled
                  ? 'bg-gray-600 hover:bg-gray-500'
                  : 'bg-red-500 hover:bg-red-400'
              }`}
              title={isMicEnabled ? 'Couper le micro' : 'Activer le micro'}
            >
              {isMicEnabled ? (
                <Mic className="w-6 h-6 text-white" />
              ) : (
                <MicOff className="w-6 h-6 text-white" />
              )}
            </button>

            <button
              onClick={handleToggleSpeaker}
              className={`p-4 rounded-full transition-all duration-300 ${
                isSpeakerEnabled
                  ? 'bg-gray-600 hover:bg-gray-500'
                  : 'bg-red-500 hover:bg-red-400'
              }`}
              title={isSpeakerEnabled ? 'Couper le son' : 'Activer le son'}
            >
              {isSpeakerEnabled ? (
                <Volume2 className="w-6 h-6 text-white" />
              ) : (
                <VolumeX className="w-6 h-6 text-white" />
              )}
            </button>

            <button
              onClick={handleEndCall}
              className="p-4 bg-red-500 hover:bg-red-400 rounded-full transition-all duration-300"
              title="Terminer l'appel"
            >
              <PhoneOff className="w-6 h-6 text-white" />
            </button>

            {connectionState === 'connected' && (
              <>
                <button
                  onClick={handleSkipUser}
                  className="p-4 bg-yellow-500 hover:bg-yellow-400 rounded-full transition-all duration-300"
                  title="Passer au suivant"
                >
                  <SkipForward className="w-6 h-6 text-white" />
                </button>

                {canAddFriend && !showAddFriend && (
                  <button
                    onClick={handleAddFriend}
                    className="p-4 bg-green-500 hover:bg-green-400 rounded-full transition-all duration-300"
                    title="Ajouter en ami"
                  >
                    <UserPlus className="w-6 h-6 text-white" />
                  </button>
                )}

                {showAddFriend && (
                  <div className="px-4 py-2 bg-green-500 rounded-full flex items-center space-x-2">
                    <span className="text-white text-sm">✓ Demande envoyée</span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default VideoCallPage;

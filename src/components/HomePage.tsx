import React, { useEffect, useState } from 'react';
import { MessageCircle, Video, Users } from 'lucide-react';
import { Globe as GlobeComponent } from './Globe';
import { ParticleBackground } from './ParticleBackground';
import { useApp } from '../context/AppContext';
import SocketService from '../services/socketService';

export function HomePage() {
  const { setPage, setUser } = useApp();
  const [isConnecting, setIsConnecting] = useState(true);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [onlineUsers, setOnlineUsers] = useState(Math.floor(Math.random() * 500) + 100);
  const socketService = SocketService.getInstance();

  useEffect(() => {
    let mounted = true;

    const initializeConnection = async () => {
      try {
        setIsConnecting(true);
        setConnectionError(null);
        
        await socketService.connect();
        const user = await socketService.registerUser();
        
        if (mounted) {
          setUser(user);
          setIsConnecting(false);
          console.log('✅ Connexion établie');
        }

        socketService.onStatsUpdate((stats) => {
          if (mounted && stats.onlineUsers) {
            setOnlineUsers(stats.onlineUsers);
          }
        });
      } catch (error) {
        console.error('❌ Erreur de connexion:', error);
        if (mounted) {
          setConnectionError('Mode hors ligne - Fonctionnalités limitées');
          setIsConnecting(false);
        }
      }
    };

    initializeConnection();

    return () => {
      mounted = false;
    };
  }, [setUser]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900/20 to-slate-900 relative overflow-hidden">
      <ParticleBackground />
      
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen p-8">
        <div className="text-center mb-12">
          <h1 className="text-5xl md:text-7xl font-bold text-white mb-4">
            Lebekoo
          </h1>
          <p className="text-xl md:text-2xl text-purple-200">
            Connectez-vous avec le monde
          </p>
          {connectionError && (
            <p className="text-yellow-400 mt-2 text-sm">{connectionError}</p>
          )}
        </div>

        <GlobeComponent onlineUsers={onlineUsers} />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12 w-full max-w-4xl">
          <button
            onClick={() => setPage('chat')}
            disabled={isConnecting}
            className="group relative bg-white/10 backdrop-blur-lg rounded-2xl p-6 hover:bg-white/20 transition-all duration-300 transform hover:scale-105 disabled:opacity-50"
          >
            <MessageCircle className="w-12 h-12 text-purple-300 mb-4 mx-auto" />
            <h3 className="text-xl font-semibold text-white mb-2">Chat Aléatoire</h3>
            <p className="text-purple-200 text-sm">Discutez avec des inconnus</p>
          </button>

          <button
            onClick={() => setPage('video')}
            disabled={isConnecting}
            className="group relative bg-white/10 backdrop-blur-lg rounded-2xl p-6 hover:bg-white/20 transition-all duration-300 transform hover:scale-105 disabled:opacity-50"
          >
            <Video className="w-12 h-12 text-pink-300 mb-4 mx-auto" />
            <h3 className="text-xl font-semibold text-white mb-2">Appel Vidéo</h3>
            <p className="text-pink-200 text-sm">Face à face virtuel</p>
          </button>

          <button
            onClick={() => setPage('groups')}
            disabled={isConnecting}
            className="group relative bg-white/10 backdrop-blur-lg rounded-2xl p-6 hover:bg-white/20 transition-all duration-300 transform hover:scale-105 disabled:opacity-50"
          >
            <Users className="w-12 h-12 text-blue-300 mb-4 mx-auto" />
            <h3 className="text-xl font-semibold text-white mb-2">Groupes</h3>
            <p className="text-blue-200 text-sm">Discussions de groupe</p>
          </button>
        </div>

        <div className="mt-8 text-center">
          <p className="text-purple-200">
            <span className="font-semibold text-2xl text-white">{onlineUsers}</span> utilisateurs en ligne
          </p>
        </div>
      </div>
    </div>
  );
}

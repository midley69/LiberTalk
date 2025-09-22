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
  const socketService = SocketService.getInstance();

  useEffect(() => {
    let mounted = true;

    const initializeConnection = async () => {
      try {
        setIsConnecting(true);
        setConnectionError(null);
        
        // Connecter au serveur Socket.io
        await socketService.connect();
        
        // Enregistrer un utilisateur anonyme
        const user = await socketService.registerUser();
        
        if (mounted) {
          setUser(user);
          setIsConnecting(false);
          console.log('✅ Connexion établie');
        }
      } catch (error) {
        console.error('❌ Erreur de connexion:', error);
        if (mounted) {
          setConnectionError('Connexion au serveur impossible. Réessayer...');
          setIsConnecting(false);
          
          // Retry après 3 secondes
          setTimeout(() => {
            if (mounted) initializeConnection();
          }, 3000);
        }
      }
    };

    initializeConnection();

    // Cleanup
    return () => {
      mounted = false;
    };
  }, [setUser]);

  const handleNavigation = (page: 'chat' | 'video' | 'groups') => {
    if (!isConnecting && !connectionError) {
      setPage(page);
    }
  };

  return (
    <div className="relative h-full flex flex-col overflow-hidden bg-gradient-to-br from-slate-900 via-purple-900/20 to-slate-900">
      <ParticleBackground />
      
      {/* Globe Background */}
      <div className="absolute inset-0 flex items-center justify-center opacity-20 pointer-events-none" aria-hidden="true">
        <GlobeComponent />
      </div>
      
      <div className="relative z-10 flex flex-col h-full">
        {/* Header */}
        <header className="flex-shrink-0 text-center pt-8 sm:pt-12 md:pt-16 pb-4 sm:pb-6 md:pb-8 px-4">
          <h1 className="text-3xl sm:text-5xl md:text-7xl font-bold bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 bg-clip-text text-transparent mb-2 sm:mb-4 animate-fade-in">
            Libekoo
          </h1>
          <p className="text-base sm:text-xl md:text-3xl text-white font-light leading-tight animate-fade-in">
            Connectez-vous avec des personnes
            <br />
            <span className="bg-gradient-to-r from-pink-400 to-cyan-400 bg-clip-text text-transparent font-semibold">
              réelles instantanément
            </span>
          </p>
        </header>

        {/* Status de connexion */}
        {(isConnecting || connectionError) && (
          <div className="text-center text-white mb-4 px-4" role="status" aria-live="polite">
            <div className="inline-flex items-center space-x-2">
              {isConnecting ? (
                <>
                  <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" aria-hidden="true" />
                  <span className="text-xs sm:text-sm">Connexion au serveur...</span>
                </>
              ) : connectionError ? (
                <>
                  <div className="w-2 h-2 bg-red-400 rounded-full" aria-hidden="true" />
                  <span className="text-xs sm:text-sm text-red-300">{connectionError}</span>
                </>
              ) : null}
            </div>
          </div>
        )}

        {/* Main Action Buttons */}
        <main className="flex-1 flex items-center justify-center px-4 pb-8 sm:pb-12">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 max-w-6xl w-full">
            {/* Chat Button */}
            <button
              onClick={() => handleNavigation('chat')}
              disabled={isConnecting || !!connectionError}
              className="group relative p-6 sm:p-8 bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 hover:border-cyan-400/50 transition-all duration-300 transform hover:scale-105 hover:shadow-2xl hover:shadow-cyan-500/20 animate-slide-in disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-offset-2 focus:ring-offset-slate-900"
              aria-label="Accéder au chat textuel"
            >
              <div className="text-center space-y-3 sm:space-y-4">
                <div className="w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 mx-auto bg-gradient-to-br from-cyan-400 to-blue-500 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                  <MessageCircle className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 text-white" aria-hidden="true" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg md:text-xl font-semibold text-white mb-1 sm:mb-2">
                    Chat Textuel
                  </h2>
                  <p className="text-gray-300 text-xs sm:text-sm">
                    Discussions instantanées avec de vraies personnes
                  </p>
                </div>
              </div>
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-cyan-400/10 to-blue-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" aria-hidden="true" />
            </button>

            {/* Video Button */}
            <button
              onClick={() => handleNavigation('video')}
              disabled={isConnecting || !!connectionError}
              className="group relative p-6 sm:p-8 bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 hover:border-purple-400/50 transition-all duration-300 transform hover:scale-105 hover:shadow-2xl hover:shadow-purple-500/20 animate-slide-in animation-delay-100 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:ring-offset-2 focus:ring-offset-slate-900"
              aria-label="Accéder aux appels vidéo"
            >
              <div className="text-center space-y-3 sm:space-y-4">
                <div className="w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 mx-auto bg-gradient-to-br from-purple-400 to-pink-500 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                  <Video className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 text-white" aria-hidden="true" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg md:text-xl font-semibold text-white mb-1 sm:mb-2">
                    Appel Vidéo
                  </h2>
                  <p className="text-gray-300 text-xs sm:text-sm">
                    Connexions vidéo aléatoires et instantanées
                  </p>
                </div>
              </div>
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-purple-400/10 to-pink-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" aria-hidden="true" />
            </button>

            {/* Groups Button */}
            <button
              onClick={() => handleNavigation('groups')}
              disabled={isConnecting || !!connectionError}
              className="group relative p-6 sm:p-8 bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 hover:border-green-400/50 transition-all duration-300 transform hover:scale-105 hover:shadow-2xl hover:shadow-green-500/20 animate-slide-in animation-delay-200 sm:col-span-2 lg:col-span-1 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 focus:outline-none focus:ring-2 focus:ring-green-400 focus:ring-offset-2 focus:ring-offset-slate-900"
              aria-label="Accéder aux groupes de discussion"
            >
              <div className="text-center space-y-3 sm:space-y-4">
                <div className="w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 mx-auto bg-gradient-to-br from-green-400 to-emerald-500 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                  <Users className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 text-white" aria-hidden="true" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg md:text-xl font-semibold text-white mb-1 sm:mb-2">
                    Groupes
                  </h2>
                  <p className="text-gray-300 text-xs sm:text-sm">
                    Discussions de groupe thématiques
                  </p>
                </div>
              </div>
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-green-400/10 to-emerald-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" aria-hidden="true" />
            </button>
          </div>
        </main>
      </div>
    </div>
  );
}
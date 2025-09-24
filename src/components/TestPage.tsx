import React, { useState, useEffect } from 'react';
import SocketService from '../services/socketService';

export function TestPage() {
  const [isConnected, setIsConnected] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [stats, setStats] = useState({ onlineUsers: 0 });
  const [error, setError] = useState<string | null>(null);

  const socketService = SocketService.getInstance();

  useEffect(() => {
    initConnection();
    return () => {
      socketService.disconnect();
    };
  }, []);

  const initConnection = async () => {
    try {
      setError(null);
      console.log('Connexion au serveur...');
      
      await socketService.connect();
      console.log('Socket connecté!');
      
      const userData = await socketService.registerUser();
      console.log('Utilisateur créé:', userData);
      
      setUser(userData);
      setIsConnected(true);

      // Écouter les mises à jour stats
      socketService.onStatsUpdate((stats) => {
        setStats(stats);
      });
      
    } catch (err: any) {
      console.error('Erreur:', err);
      setError(err.message);
      setIsConnected(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <h1 className="text-3xl font-bold mb-8">🧪 Page de Test Lebekoo</h1>
      
      <div className="space-y-4 max-w-2xl">
        {/* Status de connexion */}
        <div className="bg-gray-800 p-4 rounded-lg">
          <h2 className="text-xl font-semibold mb-2">État de la connexion</h2>
          <div className="space-y-2">
            <p>Socket: {isConnected ? '✅ Connecté' : '❌ Déconnecté'}</p>
            <p>Utilisateurs en ligne: {stats.onlineUsers}</p>
            {error && (
              <div className="bg-red-600/20 border border-red-500 p-2 rounded mt-2">
                Erreur: {error}
              </div>
            )}
          </div>
        </div>

        {/* Infos utilisateur */}
        {user && (
          <div className="bg-gray-800 p-4 rounded-lg">
            <h2 className="text-xl font-semibold mb-2">Utilisateur</h2>
            <div className="space-y-1">
              <p>ID: {user.id}</p>
              <p>Username: {user.username}</p>
              <p>Anonyme: {user.isAnonymous ? 'Oui' : 'Non'}</p>
            </div>
          </div>
        )}

        {/* Actions de test */}
        <div className="bg-gray-800 p-4 rounded-lg">
          <h2 className="text-xl font-semibold mb-2">Actions</h2>
          <div className="space-x-2">
            <button
              onClick={initConnection}
              className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded"
              disabled={isConnected}
            >
              Reconnecter
            </button>
            
            <button
              onClick={() => socketService.disconnect()}
              className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded"
              disabled={!isConnected}
            >
              Déconnecter
            </button>
          </div>
        </div>

        {/* Instructions */}
        <div className="bg-blue-900/30 border border-blue-500 p-4 rounded-lg">
          <h3 className="font-semibold mb-2">📝 Instructions de test:</h3>
          <ol className="list-decimal list-inside space-y-1">
            <li>Vérifiez que le statut est "Connecté"</li>
            <li>Notez votre ID utilisateur</li>
            <li>Ouvrez plusieurs onglets pour simuler plusieurs utilisateurs</li>
            <li>Le compteur d'utilisateurs devrait augmenter</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
import React, { useState, useEffect } from 'react';
import { Shield, AlertTriangle, Eye, Flag, CheckCircle, XCircle, Clock, Filter } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface ArchivedMessage {
  id: string;
  session_id: string;
  sender_id: string;
  sender_pseudo: string;
  message_text: string;
  sent_at: string;
  deleted_at: string;
  deletion_reason: string;
  is_flagged: boolean;
  days_remaining: number;
}

interface UserReport {
  id: string;
  reporter_id: string;
  reported_user_id: string;
  report_type: string;
  reason: string;
  status: string;
  created_at: string;
}

export function ModeratorPanel() {
  const [archivedMessages, setArchivedMessages] = useState<ArchivedMessage[]>([]);
  const [userReports, setUserReports] = useState<UserReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentView, setCurrentView] = useState<'messages' | 'reports'>('messages');
  const [showFlaggedOnly, setShowFlaggedOnly] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<ArchivedMessage | null>(null);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [showFlaggedOnly]);

  const loadData = async () => {
    try {
      setIsLoading(true);

      const { data: messages, error: messagesError } = await supabase.rpc(
        'get_archived_messages_for_review',
        {
          p_limit: 100,
          p_offset: 0,
          p_flagged_only: showFlaggedOnly
        }
      );

      if (!messagesError && messages) {
        setArchivedMessages(messages);
      }

      const { data: reports, error: reportsError } = await supabase
        .from('user_reports')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(50);

      if (!reportsError && reports) {
        setUserReports(reports);
      }

    } catch (error) {
      console.error('Erreur chargement données modération:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFlagMessage = async (messageId: string, reason: string) => {
    try {
      const { error } = await supabase.rpc('flag_archived_message', {
        p_message_id: messageId,
        p_moderator_id: 'current_moderator',
        p_reason: reason
      });

      if (!error) {
        alert('Message signalé avec succès');
        loadData();
      }
    } catch (error) {
      console.error('Erreur signalement message:', error);
      alert('Erreur lors du signalement');
    }
  };

  const handleResolveReport = async (reportId: string, resolution: string, action: string) => {
    try {
      const { error } = await supabase.rpc('resolve_user_report', {
        p_report_id: reportId,
        p_moderator_id: 'current_moderator',
        p_resolution: resolution,
        p_action_taken: action
      });

      if (!error) {
        alert('Signalement résolu');
        loadData();
      }
    } catch (error) {
      console.error('Erreur résolution signalement:', error);
      alert('Erreur lors de la résolution');
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-black/20 backdrop-blur-sm border border-white/10 rounded-xl p-6 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Shield className="w-8 h-8 text-cyan-400" />
              <div>
                <h1 className="text-2xl font-bold text-white">Panel Modération</h1>
                <p className="text-gray-400 text-sm">
                  Surveillance et modération du contenu
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <div className="text-right">
                <div className="text-cyan-400 font-bold text-2xl">
                  {archivedMessages.length}
                </div>
                <div className="text-gray-400 text-xs">Messages archivés</div>
              </div>
              <div className="text-right">
                <div className="text-yellow-400 font-bold text-2xl">
                  {userReports.length}
                </div>
                <div className="text-gray-400 text-xs">Signalements</div>
              </div>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex items-center space-x-4 mb-6">
          <button
            onClick={() => setCurrentView('messages')}
            className={`px-6 py-3 rounded-lg font-medium transition-all ${
              currentView === 'messages'
                ? 'bg-cyan-500 text-white'
                : 'bg-white/10 text-gray-400 hover:bg-white/20'
            }`}
          >
            <Eye className="w-5 h-5 inline mr-2" />
            Messages Archivés ({archivedMessages.length})
          </button>
          <button
            onClick={() => setCurrentView('reports')}
            className={`px-6 py-3 rounded-lg font-medium transition-all ${
              currentView === 'reports'
                ? 'bg-cyan-500 text-white'
                : 'bg-white/10 text-gray-400 hover:bg-white/20'
            }`}
          >
            <AlertTriangle className="w-5 h-5 inline mr-2" />
            Signalements ({userReports.length})
          </button>
          {currentView === 'messages' && (
            <button
              onClick={() => setShowFlaggedOnly(!showFlaggedOnly)}
              className={`px-6 py-3 rounded-lg font-medium transition-all ${
                showFlaggedOnly
                  ? 'bg-red-500 text-white'
                  : 'bg-white/10 text-gray-400 hover:bg-white/20'
              }`}
            >
              <Filter className="w-5 h-5 inline mr-2" />
              {showFlaggedOnly ? 'Tous' : 'Signalés uniquement'}
            </button>
          )}
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-white">Chargement...</div>
          </div>
        ) : (
          <>
            {/* Messages Archivés */}
            {currentView === 'messages' && (
              <div className="space-y-4">
                {archivedMessages.length === 0 ? (
                  <div className="bg-white/5 rounded-xl p-12 text-center">
                    <CheckCircle className="w-16 h-16 text-green-400 mx-auto mb-4" />
                    <p className="text-white text-lg">Aucun message à réviser</p>
                    <p className="text-gray-400 text-sm">
                      Tous les messages archivés ont été vérifiés
                    </p>
                  </div>
                ) : (
                  archivedMessages.map((message) => (
                    <div
                      key={message.id}
                      className={`bg-white/5 border rounded-xl p-4 transition-all ${
                        message.is_flagged
                          ? 'border-red-500/50 bg-red-500/5'
                          : 'border-white/10 hover:border-cyan-400/50'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-3 mb-2">
                            <span className="text-white font-medium">
                              {message.sender_pseudo}
                            </span>
                            <span className="text-gray-400 text-xs">
                              ID: {message.sender_id.substring(0, 12)}...
                            </span>
                            {message.is_flagged && (
                              <span className="bg-red-500/20 text-red-400 px-2 py-1 rounded text-xs font-medium">
                                <Flag className="w-3 h-3 inline mr-1" />
                                Signalé
                              </span>
                            )}
                            <span className="bg-yellow-500/20 text-yellow-400 px-2 py-1 rounded text-xs">
                              <Clock className="w-3 h-3 inline mr-1" />
                              Expire dans {message.days_remaining}j
                            </span>
                          </div>
                          <div className="bg-black/30 rounded-lg p-3 mb-2">
                            <p className="text-white">{message.message_text}</p>
                          </div>
                          <div className="flex items-center space-x-4 text-xs text-gray-400">
                            <span>Envoyé: {formatDate(message.sent_at)}</span>
                            <span>•</span>
                            <span>Supprimé: {formatDate(message.deleted_at)}</span>
                            <span>•</span>
                            <span>Raison: {message.deletion_reason}</span>
                          </div>
                        </div>
                        <div className="flex flex-col space-y-2 ml-4">
                          {!message.is_flagged && (
                            <button
                              onClick={() => {
                                const reason = prompt('Raison du signalement:');
                                if (reason) handleFlagMessage(message.id, reason);
                              }}
                              className="px-4 py-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-all"
                            >
                              <Flag className="w-4 h-4 inline mr-1" />
                              Signaler
                            </button>
                          )}
                          <button
                            onClick={() => setSelectedMessage(message)}
                            className="px-4 py-2 bg-cyan-500/20 text-cyan-400 rounded-lg hover:bg-cyan-500/30 transition-all"
                          >
                            <Eye className="w-4 h-4 inline mr-1" />
                            Détails
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Signalements Utilisateurs */}
            {currentView === 'reports' && (
              <div className="space-y-4">
                {userReports.length === 0 ? (
                  <div className="bg-white/5 rounded-xl p-12 text-center">
                    <CheckCircle className="w-16 h-16 text-green-400 mx-auto mb-4" />
                    <p className="text-white text-lg">Aucun signalement en attente</p>
                  </div>
                ) : (
                  userReports.map((report) => (
                    <div
                      key={report.id}
                      className="bg-white/5 border border-white/10 rounded-xl p-4 hover:border-cyan-400/50 transition-all"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-3 mb-2">
                            <span className="bg-yellow-500/20 text-yellow-400 px-3 py-1 rounded text-sm font-medium">
                              {report.report_type}
                            </span>
                            <span className="text-gray-400 text-xs">
                              {formatDate(report.created_at)}
                            </span>
                          </div>
                          <div className="text-white mb-2">
                            <p className="text-sm">
                              <strong>Signalé par:</strong> {report.reporter_id}
                            </p>
                            <p className="text-sm">
                              <strong>Utilisateur concerné:</strong> {report.reported_user_id}
                            </p>
                          </div>
                          {report.reason && (
                            <div className="bg-black/30 rounded-lg p-3 mb-2">
                              <p className="text-white text-sm">{report.reason}</p>
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col space-y-2 ml-4">
                          <button
                            onClick={() => {
                              const resolution = prompt('Action prise:');
                              if (resolution) {
                                handleResolveReport(report.id, resolution, 'reviewed');
                              }
                            }}
                            className="px-4 py-2 bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500/30 transition-all"
                          >
                            <CheckCircle className="w-4 h-4 inline mr-1" />
                            Résoudre
                          </button>
                          <button
                            onClick={() => handleResolveReport(report.id, 'dismissed', 'no_action')}
                            className="px-4 py-2 bg-gray-500/20 text-gray-400 rounded-lg hover:bg-gray-500/30 transition-all"
                          >
                            <XCircle className="w-4 h-4 inline mr-1" />
                            Rejeter
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </>
        )}

        {/* Note de confidentialité */}
        <div className="mt-6 bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4">
          <div className="flex items-start space-x-3">
            <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-yellow-300">
              <strong>Confidentialité :</strong> Les messages archivés sont automatiquement
              supprimés après 30 jours. Toutes les actions de modération sont enregistrées.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ModeratorPanel;

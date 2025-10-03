import React from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { HomePage } from './components/HomePage';
import { RandomChatPage } from './components/RandomChatPage';
import { VideoCallPage } from './components/VideoCallPage';
import { GroupsPage } from './components/GroupsPage';
import { SettingsPage } from './components/SettingsPage';
import { Navigation } from './components/Navigation';

function AppContent() {
  const { state } = useApp();

  const renderCurrentPage = () => {
    switch (state.currentPage) {
      case 'home':
        return <HomePage />;
      case 'chat':
        return <RandomChatPage />;
      case 'video':
        return <VideoCallPage />;
      case 'groups':
        return <GroupsPage />;
      case 'settings':
        return <SettingsPage />;
      default:
        return <HomePage />;
    }
  };

  return (
    <div className="dynamic-height flex flex-col bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 overflow-hidden">
      <div className="flex-1 overflow-hidden min-h-0">
        {renderCurrentPage()}
      </div>
      {state.currentPage !== 'home' && <Navigation />}
    </div>
  );
}

function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}

export default App;
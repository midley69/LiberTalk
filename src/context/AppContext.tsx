import React, { createContext, useContext, useReducer, ReactNode } from 'react';
import { AppState, AppPage, User, ChatRoom, VideoCall } from '../types';

interface AppContextType {
  state: AppState;
  setPage: (page: AppPage) => void;
  setUser: (user: User | null) => void;
  setCurrentChat: (chat: ChatRoom | null) => void;
  setCurrentCall: (call: VideoCall | null) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

type AppAction =
  | { type: 'SET_PAGE'; payload: AppPage }
  | { type: 'SET_USER'; payload: User | null }
  | { type: 'SET_CURRENT_CHAT'; payload: ChatRoom | null }
  | { type: 'SET_CURRENT_CALL'; payload: VideoCall | null };

const initialState: AppState = {
  currentPage: 'home',
  user: null,
  currentChat: null,
  currentCall: null,
};

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_PAGE':
      return { ...state, currentPage: action.payload };
    case 'SET_USER':
      return { ...state, user: action.payload };
    case 'SET_CURRENT_CHAT':
      return { ...state, currentChat: action.payload };
    case 'SET_CURRENT_CALL':
      return { ...state, currentCall: action.payload };
    default:
      return state;
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  const setPage = (page: AppPage) => dispatch({ type: 'SET_PAGE', payload: page });
  const setUser = (user: User | null) => dispatch({ type: 'SET_USER', payload: user });
  const setCurrentChat = (chat: ChatRoom | null) => dispatch({ type: 'SET_CURRENT_CHAT', payload: chat });
  const setCurrentCall = (call: VideoCall | null) => dispatch({ type: 'SET_CURRENT_CALL', payload: call });

  return (
    <AppContext.Provider value={{
      state,
      setPage,
      setUser,
      setCurrentChat,
      setCurrentCall,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}

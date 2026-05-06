// frontend/app/dashboard/hooks/useConversationUI.ts
import { useState, useEffect, useRef, useCallback } from 'react';
import { signOut } from 'next-auth/react';
import { sessionManager } from '@/app/hooks/useConversation/SessionManager';
import { ISession, SessionConfig, GlobalEvent } from '@/app/hooks/useConversation/types';
import { globalEventBus } from '@/app/services/EventBus';
import { useUIGuard } from './useUIGuard';
import { STRICT_UI_MODE } from '@/app/config';

// --- Tipos ---

export interface ConversationUIState {
  chatHistory: Map<string, { sender: 'user' | 'ai'; text: string }>;
  activeAiMessage: { id: string; text: string } | null;
  userTranscript: string | null;
  conversationStatus: 'idle' | 'listening' | 'processing' | 'speaking';
  error: string | null;
}

const initialState: ConversationUIState = {
  chatHistory: new Map(),
  activeAiMessage: null,
  userTranscript: null,
  conversationStatus: 'idle',
  error: null,
};


// --- El Hook ---
export function useConversationUI(config: SessionConfig) {
  const [uiState, setUiState] = useState<ConversationUIState>(initialState);
  const sessionRef = useRef<ISession | null>(null);
  const isMountedRef = useRef(true);
  const tombstoneRef = useRef<Set<string>>(new Set());
  
  // El UIGuard sigue siendo útil para detectar inconsistencias
  useUIGuard({ uiState, isActive: !!sessionRef.current, tombstone: tombstoneRef.current });

  // Efecto de montaje/desmontaje
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (sessionRef.current) {
        sessionManager.destroySession(sessionRef.current.id);
      }
    };
  }, []);

  const handleEngineEvent = useCallback((event: GlobalEvent) => {
    // Solo procesar eventos de nuestra sesión activa
    if (event.sessionId !== sessionRef.current?.id) return;
    
    // Prevenir actualizaciones de estado si el componente ya no está montado
    const safeSetUiState = (updater: React.SetStateAction<ConversationUIState>) => {
      if (isMountedRef.current) setUiState(updater);
    };

    // --- Lógica del Reducer de UI ---
    safeSetUiState(currentState => {
      let newState = { ...currentState };
      
      switch (event.type) {
        case 'USER_TRANSCRIPT_UPDATED':
          newState.userTranscript = event.payload.transcript;
          newState.conversationStatus = 'listening';
          break;
          
        case 'USER_TRANSCRIPT_FINAL':
          const userMessageId = `user-${event.timestamp}`;
          newState.chatHistory.set(userMessageId, { sender: 'user', text: event.payload.transcript });
          newState.userTranscript = null;
          newState.conversationStatus = 'processing';
          break;

        case 'LLM_STREAM_STARTED':
          const aiMessageId = event.generationId!;
          newState.activeAiMessage = { id: aiMessageId, text: '' };
          newState.chatHistory.set(aiMessageId, { sender: 'ai', text: '' });
          newState.conversationStatus = 'speaking';
          break;

        case 'LLM_DELTA_RECEIVED':
          if (newState.activeAiMessage && newState.activeAiMessage.id === event.generationId) {
            const currentMsg = newState.chatHistory.get(event.generationId!)!;
            currentMsg.text += event.payload.delta;
            newState.activeAiMessage.text = currentMsg.text;
          }
          break;
        
        case 'LLM_STREAM_ENDED':
          newState.activeAiMessage = null;
          newState.conversationStatus = 'listening';
          break;
          
        case 'VAD_SPEECH_DETECTED':
            if (newState.conversationStatus === 'speaking' && newState.activeAiMessage) {
              tombstoneRef.current.add(newState.activeAiMessage.id);
              newState.activeAiMessage = null;
            }
            newState.conversationStatus = 'listening';
            break;
        
        case 'SYSTEM_ERROR':
            newState.error = event.payload.message;
            newState.conversationStatus = 'idle';
            break;
      }
      return newState;
    });
  }, []);
  
  // Suscripción al EventBus
  useEffect(() => {
    const componentId = `useConversationUI-${sessionRef.current?.id || 'global'}`;
    
    // Suscripción a eventos de la sesión
    if (sessionRef.current) {
      globalEventBus.subscribe(componentId, handleEngineEvent);
    }
    
    // Suscripción a eventos globales (como expiración de token)
    const handleGlobalEvents = (event: GlobalEvent) => {
        if (event.type === 'AUTH_TOKEN_EXPIRED') {
            console.warn('[Auth] Token expirado. Forzando cierre de sesión.');
            signOut();
        }
    };
    globalEventBus.subscribe('global-ui-handler', handleGlobalEvents);

    return () => {
      globalEventBus.unsubscribe(componentId);
      globalEventBus.unsubscribe('global-ui-handler');
    };
  }, [handleEngineEvent, sessionRef.current]);


  const startConversation = useCallback(() => {
    if (sessionRef.current) return;
    const session = sessionManager.createSession(config);
    sessionRef.current = session;
    // Disparamos el evento para que el orquestador inicie la maquinaria
    globalEventBus.publish({ type: 'USER_REQUESTED_START_SESSION', sessionId: session.id });
    setUiState({ ...initialState, conversationStatus: 'listening' });
  }, [config]);

  const stopConversation = useCallback(() => {
    if (!sessionRef.current) return;
    globalEventBus.publish({ type: 'USER_REQUESTED_STOP_SESSION', sessionId: sessionRef.current.id });
    sessionManager.destroySession(sessionRef.current.id);
    sessionRef.current = null;
    if (isMountedRef.current) {
      setUiState(initialState);
    }
  }, []);

  return { uiState, startConversation, stopConversation };
}

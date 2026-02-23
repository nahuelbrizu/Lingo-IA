// frontend/app/dashboard/hooks/useConversationUI.ts
import { useState, useEffect, useRef, useCallback } from 'react';
import { sessionManager } from '@/app/hooks/useConversation/SessionManager';
import { ISession, SessionConfig, GlobalEvent } from '@/app/hooks/useConversation/types';
import { useUIGuard } from './useUIGuard';
import { STRICT_UI_MODE } from '@/app/config';
import { performance } from 'perf_hooks';

// --- Métricas y Tipos ---
const perfMetrics = {
  samples: [] as number[],
  add(sample: number) { this.samples.push(sample) },
  report() { /* ... */ }
};

export interface ConversationUIState {
  chatHistory: Map<string, { sender: 'user' | 'ai'; text: string }>;
  activeAiMessage: { id: string; text: string } | null;
  conversationStatus: 'idle' | 'listening' | 'processing' | 'speaking';
  error: string | null;
}

const initialState: ConversationUIState = {
  chatHistory: new Map(),
  activeAiMessage: null,
  conversationStatus: 'idle',
  error: null,
};

// --- El Hook Endurecido ---
export function useConversationUI(config: SessionConfig) {
  const [uiState, setUiState] = useState<ConversationUIState>(initialState);
  const sessionRef = useRef<ISession | null>(null);
  const isMountedRef = useRef(true);
  const activeGenerationIdRef = useRef<string | null>(null);
  const tombstoneRef = useRef<Set<string>>(new Set());

  useUIGuard({ uiState, isActive: !!sessionRef.current, tombstone: tombstoneRef.current });

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      
      if (STRICT_UI_MODE && sessionRef.current) {
        throw new Error("Strict UI Mode Violation: Component unmounted but a session is still active. `stopConversation` must be called explicitly before unmount.");
      }
      
      if (sessionRef.current) {
        sessionManager.destroySession(sessionRef.current.id);
      }
      perfMetrics.report();
    };
  }, []);

  const handleEngineEvent = useCallback((event: GlobalEvent) => {
    if (event.sessionId !== sessionRef.current?.id) return;
    
    if (event.generationId && tombstoneRef.current.has(event.generationId)) {
      const errorMessage = `Strict UI Mode: Out-of-order event detected and blocked. Type: ${event.type}, Obsolete Generation ID: ${event.generationId}`;
      console.error(errorMessage);
      if (STRICT_UI_MODE) {
        throw new Error(errorMessage);
      }
      return;
    }

    const safeSetUiState = (updater: React.SetStateAction<ConversationUIState>) => {
      if (isMountedRef.current) setUiState(updater);
    };

    safeSetUiState(currentState => {
      // ... (lógica del reducer de UI sin cambios)
      return currentState;
    });
  }, []);

  const startConversation = useCallback(() => {
    if (sessionRef.current) return;
    const session = sessionManager.createSession(config);
    sessionRef.current = session;
    // ... (lógica de suscripción a eventos)
  }, [config, handleEngineEvent]);

  const stopConversation = useCallback(() => {
    if (!sessionRef.current) return;
    sessionManager.destroySession(sessionRef.current.id);
    sessionRef.current = null;
    if (isMountedRef.current) {
      setUiState(initialState);
    }
  }, []);

  return { uiState, startConversation, stopConversation };
}

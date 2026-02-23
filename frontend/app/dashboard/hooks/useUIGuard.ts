// frontend/app/dashboard/hooks/useUIGuard.ts
import { useEffect } from 'react';
import { ConversationUIState } from './useConversationUI';
import { STRICT_UI_MODE } from '@/app/config';

interface GuardProps {
  uiState: ConversationUIState;
  isActive: boolean;
  tombstone: Set<string>;
}

export function useUIGuard({ uiState, isActive, tombstone }: GuardProps) {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;

    const violations: string[] = [];
    const { activeAiMessage, conversationStatus } = uiState;

    if (conversationStatus === 'speaking' && !activeAiMessage) {
        violations.push("Status es 'speaking' pero no hay 'activeAiMessage'.");
    }
    if (activeAiMessage && tombstone.has(activeAiMessage.id)) {
        violations.push(`activeAiMessage tiene un ID (${activeAiMessage.id}) que ya fue cancelado.`);
    }
    if (!isActive && (conversationStatus !== 'idle' || activeAiMessage !== null)) {
        violations.push("La sesión está inactiva pero la UI no está en estado 'idle'. Posible memory leak.");
    }

    if (violations.length > 0) {
      const errorMessage = "UI Invariant Violations Detected:\n- " + violations.join('\n- ');
      
      console.error("======= UI INVARIANT VIOLATIONS DETECTED =======");
      violations.forEach(v => console.error(`- ${v}`));
      console.error("Current UI State:", uiState);
      console.error("==============================================");
      
      if (STRICT_UI_MODE) {
        throw new Error(errorMessage);
      }
    }
  }, [uiState, isActive, tombstone]);
}

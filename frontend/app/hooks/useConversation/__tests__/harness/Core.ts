// frontend/app/hooks/useConversation/__tests__/harness/Core.ts
import { performance } from 'perf_hooks';
import { SessionOrchestrator } from '../../services/SessionOrchestrator';
import { ConversationState } from '../../FSM';

// --- Métricas de Performance ---
export interface BargeInLatencySample {
  vadTimestamp: number;
  invalidationTimestamp: number;
  audioStopTimestamp: number;
  ttsCancelTimestamp: number;
}

export const metricsCollector = {
  bargeInSamples: [] as BargeInLatencySample[],
  pendingSamples: new Map<string, Partial<BargeInLatencySample>>(),
  
  markBargeInStart(key: string) {
    this.pendingSamples.set(key, { vadTimestamp: performance.now() });
  },
  
  mark(key: string, mark: 'invalidation' | 'audioStop' | 'ttsCancel') {
    const sample = this.pendingSamples.get(key);
    if (!sample) return;
    
    if (mark === 'invalidation') sample.invalidationTimestamp = performance.now();
    if (mark === 'audioStop') sample.audioStopTimestamp = performance.now();
    if (mark === 'ttsCancel') sample.ttsCancelTimestamp = performance.now();
    
    if (sample.vadTimestamp && sample.invalidationTimestamp && sample.audioStopTimestamp && sample.ttsCancelTimestamp) {
      this.bargeInSamples.push(sample as BargeInLatencySample);
      this.pendingSamples.delete(key);
    }
  },

  reset() {
    this.bargeInSamples = [];
    this.pendingSamples.clear();
  }
};

// --- Verificador de Invariantes ---
export interface InvariantViolation {
  message: string;
  state: any;
}

export class InvariantChecker {
  constructor(private orchestrator: SessionOrchestrator) {}

  public check(): InvariantViolation[] {
    const violations: InvariantViolation[] = [];
    const state = (this.orchestrator as any)['state'].status as ConversationState;
    const activeGenId = (this.orchestrator as any)['activeGenerationId'] as string | null;
    const tombstone = (this.orchestrator as any)['tombstone'] as Set<string>;

    // INVARIANTE 1: Un ID cancelado (tombstone) nunca puede estar activo.
    if (activeGenId && tombstone.has(activeGenId)) {
      violations.push({ message: 'Zombie Generation: activeGenerationId existe en el tombstone.', state: { activeGenId } });
    }

    // INVARIANTE 2: El sistema no puede estar hablando sin una generación activa.
    if ((state === 'ai_speaking' || state === 'generating_speech') && !activeGenId) {
      violations.push({ message: `Estado inconsistente: Estado es '${state}' pero no hay activeGenerationId.`, state: { status: state } });
    }

    // INVARIANTE 3: El sistema no puede estar procesando si hay una generación activa (debería haber sido cancelada).
    if (state === 'processing' && activeGenId) {
        violations.push({ message: `Estado inconsistente: Estado es 'processing' pero activeGenerationId no es null.`, state: { status: state, activeGenId } });
    }
    
    return violations;
  }
}

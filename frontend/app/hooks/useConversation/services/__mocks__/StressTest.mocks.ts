// frontend/app/hooks/useConversation/services/__mocks__/StressTest.mocks.ts
import { vi } from 'vitest';
import { sessionManager } from '../../SessionManager';
import { GlobalEvent } from '../../types';

// --- Contenedor de Inconsistencias ---
export const inconsistencies = {
  crossTalkEvents: [] as GlobalEvent[],
  zombieGenerations: [] as string[],
  audioPlayedAfterCancel: [] as any[],
  stateErrors: [] as string[],
};

// --- Utilidades ---
const randomDelay = (maxMs = 200) => new Promise(res => setTimeout(res, Math.random() * maxMs));

// --- Mock del EventBus para interceptar eventos ---
export const mockEventBus = {
  subscribers: new Map<string, (event: GlobalEvent) => void>(),
  subscribe: (id: string, callback: (event: GlobalEvent) => void) => {
    mockEventBus.subscribers.set(id, callback);
  },
  publish: (event: Omit<GlobalEvent, 'timestamp'>) => {
    const completeEvent: GlobalEvent = { ...event, timestamp: Date.now() };
    // En el test, llamaremos a los suscriptores manualmente para controlar el flujo
  },
};

// --- Mock del LLMService ---
export const mockLlmService = {
  activeStreams: new Map<string, { isCancelled: boolean }>(),
  generate: async function(generationId: string) {
    this.activeStreams.set(generationId, { isCancelled: false });
    const session = Array.from((sessionManager as any).sessions.values()).find((s: any) => s.orchestrator.activeGenerationId === generationId);
    if (!session) return;
    const sessionId = (session as any).id;

    // Simular deltas
    for (let i = 0; i < 5; i++) {
      if (this.activeStreams.get(generationId)?.isCancelled) return;
      await randomDelay();
      mockEventBus.subscribers.get('SessionManager')?.({ type: 'LLM_DELTA_RECEIVED', sessionId, generationId, payload: `delta-${i}`, timestamp: Date.now() });
    }

    if (this.activeStreams.get(generationId)?.isCancelled) return;
    
    // Simular fin de stream
    await randomDelay();
    mockEventBus.subscribers.get('SessionManager')?.({ type: 'LLM_STREAM_ENDED', sessionId, generationId, payload: { fullText: 'Respuesta completa' }, timestamp: Date.now() });
    this.activeStreams.delete(generationId);
  },
  cancel: function(generationId: string) {
    if (this.activeStreams.has(generationId)) {
      this.activeStreams.get(generationId)!.isCancelled = true;
    }
  }
};

// --- Mock del TTSService ---
// Similar al LLMService, pero emite chunks de audio
export const mockTtsService = {
    // ... implementación similar con `generate` y `cancel`
};

// --- Mock del AudioOutputManager ---
export const mockAudioOutputManager = {
  play: vi.fn((request: { sessionId: string; generationId: string }) => {
    const orchestrator = (sessionManager.getSession(request.sessionId) as any)?.orchestrator;
    // Chequeo de inconsistencia: ¿Se está intentando reproducir audio para una generación que ya no está activa?
    if (orchestrator && orchestrator.activeGenerationId !== request.generationId) {
        inconsistencies.audioPlayedAfterCancel.push(request);
    }
    // Simular fin de reproducción
    setTimeout(() => {
        mockEventBus.subscribers.get('SessionManager')?.({ type: 'AUDIO_PLAYBACK_FINISHED', sessionId: request.sessionId, generationId: request.generationId, timestamp: Date.now() });
    }, 50);
  }),
  stop: vi.fn(),
};

// --- Mock del AudioInputManager ---
export const mockAudioInputManager = {
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
};

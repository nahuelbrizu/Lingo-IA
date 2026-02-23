// frontend/app/hooks/useConversation/__tests__/harness/FuzzEngine.ts
import { GlobalEvent } from '../../types';

const EVENT_TYPES: GlobalEvent['type'][] = [
  'VAD_SILENCE_DETECTED', 'LLM_STREAM_ENDED', 'TTS_AUDIO_CHUNK_RECEIVED',
  'AUDIO_PLAYBACK_FINISHED', 'VAD_SPEECH_DETECTED', 'USER_REQUESTED_STOP_SESSION',
];

const PROBABILITY = {
  MALFORMED_EVENT: 0.1, // Sin generationId cuando se requiere
  GHOST_EVENT: 0.1,     // Con un generationId que no existe
  DUPLICATE_EVENT: 0.05,
};

// Generador de números aleatorios simple basado en una semilla para reproducibilidad.
function createSeededRNG(seed: number) {
  return () => {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export class FuzzEngine {
  private rng: () => number;

  constructor(seed: number) {
    this.rng = createSeededRNG(seed);
  }

  public generateEvent(sessionId: string, activeGenId: string | null, oldGenIds: string[]): GlobalEvent {
    const type = EVENT_TYPES[Math.floor(this.rng() * EVENT_TYPES.length)];
    let generationId: string | undefined = activeGenId ?? undefined;

    if (this.rng() < PROBABILITY.MALFORMED_EVENT) {
      generationId = undefined;
    } else if (this.rng() < PROBABILITY.GHOST_EVENT && oldGenIds.length > 0) {
      generationId = oldGenIds[Math.floor(this.rng() * oldGenIds.length)];
    }

    return { type, sessionId, generationId, timestamp: Date.now(), payload: { fullText: 'fuzz' } };
  }
  
  public shouldDuplicate(): boolean {
      return this.rng() < PROBABILITY.DUPLICATE_EVENT;
  }
}

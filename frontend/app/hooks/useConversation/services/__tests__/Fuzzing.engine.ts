// frontend/app/hooks/useConversation/services/__tests__/Fuzzing.engine.ts
import { GlobalEvent } from '../../types';

// --- Parámetros de Fuzzing ---
const EVENT_TYPES: GlobalEvent['type'][] = [
  'USER_REQUESTED_START_SESSION',
  'VAD_SILENCE_DETECTED',
  'LLM_STREAM_ENDED',
  'TTS_AUDIO_CHUNK_RECEIVED',
  'AUDIO_PLAYBACK_FINISHED',
  'VAD_SPEECH_DETECTED', // Barge-in
  'USER_REQUESTED_STOP_SESSION',
  // Eventos inválidos/inesperados
  'INVALID_EVENT_TYPE',
  'TTS_STREAM_ENDED', // Otro evento que puede llegar tarde
];

const PROBABILITY = {
  MISSING_GENERATION_ID: 0.1,  // 10% de probabilidad de omitir el ID cuando se requiere
  WRONG_GENERATION_ID: 0.1,    // 10% de probabilidad de usar un ID antiguo/incorrecto
  DUPLICATE_EVENT: 0.05,       // 5% de probabilidad de duplicar el evento anterior
};

/**
 * Genera un evento aleatorio para el fuzzing.
 * @param sessionId - El ID de la sesión actual.
 * @param activeGenerationId - El ID de la generación activa actual (si existe).
 * @param previousGenerationIds - Una lista de IDs de generaciones pasadas.
 */
export function generateFuzzEvent(
  sessionId: string,
  activeGenerationId: string | null,
  previousGenerationIds: string[]
): GlobalEvent {
  const type = EVENT_TYPES[Math.floor(Math.random() * EVENT_TYPES.length)];
  let generationId: string | undefined = undefined;

  const requiresId = ['LLM_STREAM_ENDED', 'TTS_AUDIO_CHUNK_RECEIVED', 'AUDIO_PLAYBACK_FINISHED'].includes(type);

  if (requiresId) {
    if (Math.random() < PROBABILITY.MISSING_GENERATION_ID) {
      generationId = undefined; // Omisión intencionada
    } else if (Math.random() < PROBABILITY.WRONG_GENERATION_ID && previousGenerationIds.length > 0) {
      // Usar un ID de una generación antigua
      generationId = previousGenerationIds[Math.floor(Math.random() * previousGenerationIds.length)];
    } else {
      generationId = activeGenerationId ?? 'gen-fake-active'; // Usar el activo si existe
    }
  }

  return {
    type,
    sessionId,
    generationId,
    payload: {}, // El payload no es relevante para el test de lógica de estado
    timestamp: Date.now(),
  };
}

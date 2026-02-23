// frontend/app/hooks/useConversation/services/SessionOrchestrator.test.ts

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SessionOrchestrator } from './SessionOrchestrator';
import { audioInputManager } from '../../../services/AudioInputManager';
import { audioOutputManager } from '../../../services/AudioOutputManager';
import { ttsService } from './TTSService'; // Suponiendo una instancia mockeable
import { GlobalEvent } from '../types';

// Mock de los módulos de servicio
vi.mock('../../../services/AudioInputManager');
vi.mock('../../../services/AudioOutputManager');
vi.mock('./TTSService');

describe('SessionOrchestrator Integration & Race Conditions', () => {
  let orchestrator: SessionOrchestrator;
  const sessionId = 'session-123';

  beforeEach(() => {
    orchestrator = new SessionOrchestrator(sessionId);
    vi.useFakeTimers(); // Usar timers falsos para controlar los timeouts
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  // --- Test de Flujo Exitoso ---
  it('should correctly execute commands for a full conversation turn', () => {
    // 1. Iniciar
    orchestrator.processEvent({ type: 'USER_REQUESTED_START_SESSION', sessionId, timestamp: Date.now() });
    expect(audioInputManager.subscribe).toHaveBeenCalledWith(sessionId, expect.any(Function));

    // 2. Usuario termina de hablar
    orchestrator.processEvent({ type: 'VAD_SILENCE_DETECTED', sessionId, timestamp: Date.now() });
    // Aquí se llamaría al mock de llmService.send(...)

    // 3. LLM termina, empieza TTS
    const llmResponse = { type: 'LLM_STREAM_ENDED', sessionId, generationId: 'gen-1', payload: { fullText: 'Hola' }, timestamp: Date.now() };
    orchestrator.processEvent(llmResponse);
    expect(ttsService.generate).toHaveBeenCalledWith('Hola', expect.any(String));

    // 4. TTS devuelve el primer chunk
    const ttsChunk = { type: 'TTS_AUDIO_CHUNK_RECEIVED', sessionId, generationId: orchestrator['activeGenerationId'], payload: { chunk: new ArrayBuffer(8) }, timestamp: Date.now() };
    orchestrator.processEvent(ttsChunk);
    expect(audioOutputManager.play).toHaveBeenCalledWith(expect.objectContaining({ sessionId, generationId: orchestrator['activeGenerationId'] }));
    
    // 5. El audio termina
    const playbackEnd = { type: 'AUDIO_PLAYBACK_FINISHED', sessionId, generationId: orchestrator['activeGenerationId'], timestamp: Date.now() };
    orchestrator.processEvent(playbackEnd);
    expect(orchestrator['state'].status).toBe('listening');
  });

  // --- Test de Cancelación (Barge-in) ---
  it('should cancel all active services on barge-in', () => {
    // Poner el sistema en estado ai_speaking
    orchestrator['state'] = { status: 'ai_speaking' };
    const activeGenId = 'gen-abc';
    orchestrator['activeGenerationId'] = activeGenId;

    // Simular evento de barge-in
    orchestrator.processEvent({ type: 'VAD_SPEECH_DETECTED', sessionId, timestamp: Date.now() });

    // Verificar que se llamaron todos los comandos de cancelación
    expect(ttsService.cancel).toHaveBeenCalledWith(activeGenId);
    expect(audioOutputManager.stop).toHaveBeenCalledWith(sessionId);
    // expect(llmService.cancel).toHaveBeenCalledWith(activeGenId);
    
    // Verificar que la generación se invalidó
    expect(orchestrator['activeGenerationId']).toBeNull();
    expect(orchestrator['state'].status).toBe('listening');
  });

  // --- Test de Race Condition: Evento Tardío ---
  it('should ignore a late TTS chunk from a cancelled generation', () => {
    orchestrator['state'] = { status: 'ai_speaking' };
    const cancelledGenId = 'gen-cancelled';
    orchestrator['activeGenerationId'] = cancelledGenId;

    // Simular barge-in, que invalida la generación
    orchestrator.processEvent({ type: 'VAD_SPEECH_DETECTED', sessionId, timestamp: Date.now() });
    
    // Simular la llegada de un chunk de la generación que ACABA de ser cancelada
    const lateChunkEvent: GlobalEvent = {
      type: 'TTS_AUDIO_CHUNK_RECEIVED',
      sessionId,
      generationId: cancelledGenId, // ID obsoleto
      payload: { chunk: new ArrayBuffer(8) },
      timestamp: Date.now()
    };
    orchestrator.processEvent(lateChunkEvent);

    // La FSM no debería procesar este evento, por lo que no se emitirá un comando de play.
    // isValidGeneration devolvería false, y el evento sería ignorado.
    expect(audioOutputManager.play).not.toHaveBeenCalled();
  });
});

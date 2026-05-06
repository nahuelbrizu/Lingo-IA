// frontend/app/hooks/useConversation/StressTest.test.ts

import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sessionManager } from './SessionManager';
import { SessionInstance } from './SessionInstance';
import { ISession } from './types';
import { 
  mockEventBus, 
  mockLlmService, 
  mockTtsService, 
  mockAudioOutputManager,
  mockAudioInputManager,
  inconsistencies 
} from './services/__mocks__/StressTest.mocks';

// --- CONFIGURACIÓN DEL TEST DE ESTRÉS ---
const CONCURRENT_SESSIONS = 100;
const BARGE_IN_PROBABILITY = 0.3; // 30% de probabilidad de interrupción

// --- Mockear todos los servicios globales y el EventBus ---
vi.mock('../services/EventBus', () => ({ globalEventBus: mockEventBus }));
vi.mock('./services/LLMService', () => ({ llmService: mockLlmService }));
vi.mock('./services/TTSService', () => ({ ttsService: mockTtsService }));
vi.mock('../services/AudioOutputManager', () => ({ audioOutputManager: mockAudioOutputManager }));
vi.mock('../services/AudioInputManager', () => ({ audioInputManager: mockAudioInputManager }));

describe('Stress Test: Multi-Session Conversation Engine', () => {

  beforeAll(() => {
    // Suscribir el SessionManager real a nuestro bus mockeado para interceptar y controlar el flujo
    const sm = sessionManager as any;
    sm.subscribeToGlobalEvents = () => {
      mockEventBus.subscribe('SessionManager', (event: any) => {
        const session = sm.getSession(event.sessionId);
        session?.handleEvent(event);
      });
    };
    sm.subscribeToGlobalEvents();
  });

  afterAll(() => {
    // Limpieza final
    (sessionManager as any)['sessions'].forEach((session: ISession) => sessionManager.destroySession(session.id));
  });

  it(`should handle ${CONCURRENT_SESSIONS} concurrent sessions with random barge-in without inconsistencies`, async () => {
    // Aumentar el timeout del test para una simulación larga
    vi.setConfig({ testTimeout: 60000 });

    const sessionPromises = [];

    // 1. Crear todas las sesiones
    for (let i = 0; i < CONCURRENT_SESSIONS; i++) {
      sessionManager.createSession({ systemPrompt: `Session ${i}` });
    }
    expect(sessionManager.getActiveSessionCount()).toBe(CONCURRENT_SESSIONS);

    // 2. Iniciar y simular el flujo para cada sesión de forma concurrente
    for (const [sessionId, session] of (sessionManager as any).sessions.entries()) {
      const promise = (async () => {
        // Iniciar la conversación
        (session as SessionInstance).handleEvent({ type: 'USER_REQUESTED_START_SESSION', sessionId, timestamp: Date.now() });

        // Simular que el usuario habla y termina
        await new Promise(res => setTimeout(res, Math.random() * 50));
        (session as SessionInstance).handleEvent({ type: 'VAD_SILENCE_DETECTED', sessionId, timestamp: Date.now() });

        // Inyectar caos: Barge-in aleatorio
        if (Math.random() < BARGE_IN_PROBABILITY) {
          await new Promise(res => setTimeout(res, Math.random() * 100)); // Esperar un poco para que el LLM empiece
          (session as SessionInstance).handleEvent({ type: 'VAD_SPEECH_DETECTED', sessionId, timestamp: Date.now() });
        }
      })();
      sessionPromises.push(promise);
    }
    
    // Esperar a que todas las simulaciones iniciales se completen
    await Promise.all(sessionPromises);

    // Esperar un tiempo prudencial para que todos los eventos asíncronos (TTS, Playback) terminen
    await new Promise(res => setTimeout(res, 5000));
    
    // 3. Verificación final de inconsistencias
    console.log('Inconsistencias encontradas:', inconsistencies);
    
    expect(inconsistencies.crossTalkEvents).toHaveLength(0);
    expect(inconsistencies.audioPlayedAfterCancel).toHaveLength(0);
    expect(inconsistencies.zombieGenerations).toHaveLength(0);
    expect(inconsistencies.stateErrors).toHaveLength(0);

    // 4. Verificación de memory leaks (simple)
    // Destruir todas las sesiones
    for (const sessionId of (sessionManager as any).sessions.keys()) {
      sessionManager.destroySession(sessionId);
    }
    expect(sessionManager.getActiveSessionCount()).toBe(0);
    expect(mockAudioInputManager.unsubscribe).toHaveBeenCalledTimes(CONCURRENT_SESSIONS);

  }, 60000);
});

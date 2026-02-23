// frontend/app/hooks/useConversation/__tests__/harness/Isolation.test.ts

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { sessionManager } from '../../SessionManager';
import { SessionInstance } from '../../SessionInstance';
import { audioInputManager } from '../../../services/AudioInputManager';
import { globalEventBus } from '../../../services/EventBus';

// Mock de la SessionInstance para poder espiar sus métodos
vi.mock('../../SessionInstance');
vi.mock('../../../services/AudioInputManager');
vi.mock('../../../services/EventBus');


describe('System-level Isolation & Memory Leak Detection', () => {

  beforeEach(() => {
    // Limpiar completamente el estado del singleton antes de cada test
    const sm = sessionManager as any;
    sm.sessions.clear();
    sm.activeListeningSessionId = null;
    vi.clearAllMocks();
  });

  // --- Test de Memory Leaks y Desuscripciones ---
  it('should not leave orphaned subscribers or sessions after intense creation/destruction cycles', () => {
    const SESSIONS_TO_CYCLE = 200;
    const sessionIds: string[] = [];

    // Fase 1: Creación masiva y suscripción
    for (let i = 0; i < SESSIONS_TO_CYCLE; i++) {
      const session = sessionManager.createSession({});
      sessionIds.push(session.id);
      
      // Simular que algunas sesiones entran en modo escucha, suscribiéndose
      if (i % 2 === 0) {
        sessionManager.requestListeningFocus(session.id);
        // Simular la llamada que haría el Orchestrator
        audioInputManager.subscribe(session.id, () => {});
      }
    }
    
    expect(sessionManager.getActiveSessionCount()).toBe(SESSIONS_TO_CYCLE);
    expect(vi.mocked(audioInputManager.subscribe).mock.calls.length).toBe(SESSIONS_TO_CYCLE / 2);

    // Fase 2: Destrucción masiva
    sessionIds.forEach(id => sessionManager.destroySession(id));

    // --- Verificación de Fugas de Memoria y Recursos ---
    
    // INVARIANTE 1: No deben quedar sesiones en el registro.
    expect(sessionManager.getActiveSessionCount()).toBe(0);

    // INVARIANTE 2: No debe quedar ninguna sesión con el foco de escucha.
    expect((sessionManager as any).activeListeningSessionId).toBeNull();
    
    // INVARIANTE 3: Deben haberse realizado todas las desuscripciones.
    // Si el número de llamadas a unsubscribe no coincide con subscribe, hay una fuga de referencias.
    expect(vi.mocked(audioInputManager.unsubscribe).mock.calls.length).toBe(SESSIONS_TO_CYCLE);
  });
  
  // --- Test de Cross-Talk Prevention ---
  it('should route an event only to the session specified by sessionId', () => {
    // Re-implementar el mock del EventBus para este test específico
    const bus = globalEventBus as any;
    const subscribers = new Map<string, (event: any) => void>();
    bus.subscribe.mockImplementation((id, cb) => subscribers.set(id, cb));
    
    // Iniciar el SessionManager con nuestro bus controlado
    const sm = sessionManager as any;
    sm.subscribeToGlobalEvents();
    
    const sessionA = sessionManager.createSession({ systemPrompt: 'A' });
    const sessionB = sessionManager.createSession({ systemPrompt: 'B' });
    
    const eventForA = { type: 'TEST_EVENT', sessionId: sessionA.id, timestamp: Date.now() };

    // Simular la publicación del evento en el bus global
    subscribers.get('SessionManager')!(eventForA);

    // INVARIANTE: El evento solo debe ser manejado por la instancia correcta.
    expect(vi.mocked(SessionInstance).mock.instances[0].handleEvent).toHaveBeenCalledWith(eventForA);
    expect(vi.mocked(SessionInstance).mock.instances[1].handleEvent).not.toHaveBeenCalled();
  });
});

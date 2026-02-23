// frontend/app/hooks/useConversation/SessionManager.test.ts

import { vi, describe, it, expect, beforeEach } from 'vitest';
import { sessionManager } from './SessionManager';
import { SessionInstance } from './SessionInstance';

// Mock de la SessionInstance para poder espiar sus métodos
vi.mock('./SessionInstance');

describe('SessionManager Multi-Session Isolation', () => {

  beforeEach(() => {
    // Limpiar el estado del singleton antes de cada test
    const sm = sessionManager as any;
    sm.sessions.clear();
    sm.activeListeningSessionId = null;
    vi.clearAllMocks();
  });

  it('should create and retrieve distinct sessions', () => {
    const sessionA = sessionManager.createSession({ systemPrompt: 'A' });
    const sessionB = sessionManager.createSession({ systemPrompt: 'B' });

    expect(sessionManager.getActiveSessionCount()).toBe(2);
    expect(sessionManager.getSession(sessionA.id)).toBe(sessionA);
    expect(sessionManager.getSession(sessionB.id)).toBe(sessionB);
    expect(sessionA.id).not.toEqual(sessionB.id);
  });

  // --- Test de Cross-talk Prevention ---
  it('should route an event only to the correct session instance', () => {
    const sessionA = sessionManager.createSession({});
    const sessionB = sessionManager.createSession({});
    
    const eventForA: any = { type: 'TEST_EVENT', sessionId: sessionA.id, timestamp: Date.now() };

    // Simular el enrutamiento que haría el EventBus
    const sessionToHandle = sessionManager.getSession(eventForA.sessionId);
    sessionToHandle?.handleEvent(eventForA);

    // Verificar que solo la sesión A recibió el evento
    expect(sessionA.handleEvent).toHaveBeenCalledWith(eventForA);
    expect(sessionB.handleEvent).not.toHaveBeenCalled();
  });

  // --- Test de Exclusividad de Listening ---
  it('should request cancellation on the old session when a new one requests focus', () => {
    const sessionA = sessionManager.createSession({});
    const sessionB = sessionManager.createSession({});

    // 1. Sesión A toma el foco
    sessionManager.requestListeningFocus(sessionA.id);
    
    // 2. Sesión B toma el foco
    sessionManager.requestListeningFocus(sessionB.id);

    // 3. Verificar que se envió un evento de cancelación a la sesión A
    expect(sessionA.handleEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'SYSTEM_REQUEST_CANCEL_LISTENING',
        sessionId: sessionA.id,
      })
    );
    expect(sessionB.handleEvent).not.toHaveBeenCalled();
  });

  it('should destroy a session and its resources correctly', () => {
    const sessionA = sessionManager.createSession({});
    const sessionId = sessionA.id;

    sessionManager.destroySession(sessionId);

    expect(sessionA.cleanup).toHaveBeenCalled();
    expect(sessionManager.getSession(sessionId)).toBeUndefined();
    expect(sessionManager.getActiveSessionCount()).toBe(0);
  });
});

import { vi, describe, it, expect, beforeEach } from 'vitest';
import { sessionManager } from './SessionManager';
import { SessionInstance } from './SessionInstance';

vi.mock('./SessionInstance');

describe('SessionManager', () => {

  beforeEach(() => {
    // Limpiar el estado del singleton antes de cada test
    (sessionManager as any).sessions.clear();
    vi.clearAllMocks();
  });

  it('should create and retrieve distinct sessions', () => {
    const sessionA = sessionManager.createSession({});
    const sessionB = sessionManager.createSession({});

    expect(sessionManager.getActiveSessionCount()).toBe(2);
    expect(sessionManager.getSession(sessionA.id)).toBe(sessionA);
    expect(sessionManager.getSession(sessionB.id)).toBe(sessionB);
    expect(sessionA.id).not.toEqual(sessionB.id);
  });

  it('should destroy a session and call its cleanup method', () => {
    const sessionA = sessionManager.createSession({});
    const sessionId = sessionA.id;

    const cleanupSpy = vi.spyOn(sessionA, 'cleanup');

    sessionManager.destroySession(sessionId);

    expect(cleanupSpy).toHaveBeenCalled();
    expect(sessionManager.getSession(sessionId)).toBeUndefined();
    expect(sessionManager.getActiveSessionCount()).toBe(0);
  });
});

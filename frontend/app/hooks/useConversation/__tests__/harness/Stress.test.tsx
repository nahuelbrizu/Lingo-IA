// frontend/app/hooks/useConversation/__tests__/harness/Stress.test.ts
import { render, unmountComponentAtNode } from 'react-dom';
import { act } from 'react-dom/test-utils';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { sessionManager } from '@/app/hooks/useConversation/SessionManager';
import { useConversationUI } from '@/app/dashboard/hooks/useConversationUI';
import { useEffect } from 'react';

// Mock del SessionManager para espiar sus métodos
vi.mock('@/app/hooks/useConversation/SessionManager');
vi.mock('@/app/dashboard/hooks/useConversationUI', () => ({
  useConversationUI: vi.fn(() => ({
    startConversation: vi.fn(),
    stopConversation: vi.fn(),
  })),
}));


// Un componente de prueba simple que usa el hook
const TestComponent = () => {
  const { startConversation } = useConversationUI({});
  useEffect(() => {
    startConversation();
  }, [startConversation]);
  return null;
};

describe('Stress Test: Component Mounting and Unmounting', () => {
  let container: HTMLDivElement | null = null;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (container) {
      unmountComponentAtNode(container);
      container.remove();
      container = null;
    }
  });

  it('should not cause memory leaks after 200 mount/unmount cycles', async () => {
    const CYCLES = 200;
    const mockSessionManager = vi.mocked(sessionManager);

    for (let i = 0; i < CYCLES; i++) {
      // Montar
      await act(async () => {
        render(<TestComponent />, container);
      });
      
      // Simular una pequeña espera
      await act(async () => {
        await new Promise(r => setTimeout(r, 5));
      });

      // Desmontar
      await act(async () => {
        unmountComponentAtNode(container!);
      });
    }

    // --- Verificación Final ---
    // 1. Se debe haber llamado a createSession 200 veces.
    expect(mockSessionManager.createSession).toHaveBeenCalledTimes(CYCLES);

    // 2. Se debe haber llamado a destroySession 200 veces.
    // Si este número es menor, significa que el cleanup de useEffect no se está ejecutando correctamente.
    expect(mockSessionManager.destroySession).toHaveBeenCalledTimes(CYCLES);
    
    // 3. (Opcional) Podemos verificar que el Map interno del manager real esté vacío si no lo mockeamos.
    // expect(sessionManager.getActiveSessionCount()).toBe(0);
  });
});

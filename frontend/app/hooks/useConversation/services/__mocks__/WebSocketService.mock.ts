// frontend/app/hooks/useConversation/services/__mocks__/WebSocketService.mock.ts
import { vi } from 'vitest';

export const webSocketService = {
  connect: vi.fn(),
  disconnect: vi.fn(),
  send: vi.fn(),
};

export default { webSocketService };

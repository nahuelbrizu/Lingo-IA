// frontend/app/hooks/useConversation/services/__mocks__/AudioInputManager.mock.ts
import { vi } from 'vitest';

export const audioInputManager = {
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
  startMicrophone: vi.fn(),
  stopMicrophone: vi.fn(),
};

// Para poder usarlo en `vi.mock`
export default { audioInputManager };

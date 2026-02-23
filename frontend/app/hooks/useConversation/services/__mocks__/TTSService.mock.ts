// frontend/app/hooks/useConversation/services/__mocks__/TTSService.mock.ts
import { vi } from 'vitest';

export const ttsService = {
  generate: vi.fn(),
  cancel: vi.fn(),
};

export default { ttsService };

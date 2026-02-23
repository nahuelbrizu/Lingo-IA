import { render, screen } from '../../__tests__/test-utils';
import DashboardClient from '../DashboardClient';
import { useAudioStreaming } from '@/app/hooks/useAudioStreaming';
import { useSession, signOut } from 'next-auth/react';

// Mock dependencies
vi.mock('next-auth/react', async (importOriginal) => {
  const mod = await importOriginal<typeof import('next-auth/react')>();
  return {
    ...mod,
    useSession: vi.fn(),
    signOut: vi.fn(),
  };
});

vi.mock('@/app/hooks/useAudioStreaming', () => ({
  useAudioStreaming: vi.fn(),
}));

const mockInitialData = {
  name: 'Test User',
  languageLevel: 'B2',
  analytics: {
    masteredTopics: ['Greetings', 'Travel'],
  },
  lessons: [
    {
      id: '1',
      topic: 'Restaurant Order',
      feedback: 'Good job, but be careful with verb conjugation.',
    },
  ],
};

describe('DashboardClient', () => {
  beforeEach(() => {
    // Provide a mock session for every test
    (useSession as vi.Mock).mockReturnValue({
      data: { user: { id: '123' }, wsToken: 'fake-token' },
      status: 'authenticated',
    });

    // Provide a default mock for the audio streaming hook
    (useAudioStreaming as vi.Mock).mockReturnValue({
      startStreaming: vi.fn(),
      stopStreaming: vi.fn(),
      isRecording: false,
      isSpeaking: false,
      userVolume: 0,
      chatMessages: [],
    });

    // Mock fetch
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            name: 'Refreshed User',
            languageLevel: 'C1',
            analytics: { masteredTopics: [] },
            lessons: [],
          }),
      })
    ) as vi.Mock;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders initial data correctly', () => {
    render(<DashboardClient initialData={mockInitialData} />);

    // Check user name
    expect(screen.getByRole('heading', { name: /¡Hola, Test User!/i })).toBeInTheDocument();

    // Check language level
    expect(screen.getByText('B2')).toBeInTheDocument();

    // Check mastered topics
    expect(screen.getByText('✓ Greetings')).toBeInTheDocument();
    expect(screen.getByText('✓ Travel')).toBeInTheDocument();

    // Check lesson feedback
    expect(screen.getByText(/Good job, but be careful/i)).toBeInTheDocument();
  });
});

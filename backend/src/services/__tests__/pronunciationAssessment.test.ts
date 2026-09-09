import { assessPronunciation } from '../pronunciationAssessment';

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

function azureResponse(overrides: Record<string, unknown> = {}) {
  return {
    RecognitionStatus: 'Success',
    NBest: [
      {
        AccuracyScore: 92,
        FluencyScore: 88,
        CompletenessScore: 100,
        PronScore: 90,
        ...overrides,
      },
    ],
  };
}

describe('assessPronunciation', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    process.env.AZURE_SPEECH_KEY = 'test-key';
    process.env.AZURE_SPEECH_REGION = 'eastus2';
  });

  it('sends the correct URL, headers, and body to Azure', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => azureResponse(),
    });

    const audioBuffer = Buffer.from([1, 2, 3, 4]);
    await assessPronunciation(audioBuffer, 'My name is Noelle', 'en-US', 16000);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];

    expect(url).toBe(
      'https://eastus2.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=en-US&format=detailed'
    );
    expect(options.method).toBe('POST');
    expect(options.headers['Ocp-Apim-Subscription-Key']).toBe('test-key');
    expect(options.headers['Content-Type']).toBe('audio/wav; codecs=audio/pcm; samplerate=16000');
    expect(options.body).toBe(audioBuffer);

    const assessmentHeader = JSON.parse(
      Buffer.from(options.headers['Pronunciation-Assessment'], 'base64').toString('utf-8')
    );
    expect(assessmentHeader).toEqual({
      ReferenceText: 'My name is Noelle',
      GradingSystem: 'HundredMark',
      Granularity: 'Phoneme',
      Dimension: 'Comprehensive',
    });
  });

  it('returns the four headline scores on a successful response', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => azureResponse(),
    });

    const result = await assessPronunciation(Buffer.from([1]), 'Hola', 'es-ES', 16000);

    expect(result).toEqual({
      ok: true,
      data: { accuracyScore: 92, fluencyScore: 88, completenessScore: 100, pronScore: 90 },
    });
  });

  it('returns ok:false without throwing on a non-2xx response', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Unauthorized' }),
    });

    const result = await assessPronunciation(Buffer.from([1]), 'Hola', 'es-ES', 16000);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.length).toBeGreaterThan(0);
    }
  });

  it('returns ok:false without throwing when fetch rejects (network error)', async () => {
    mockFetch.mockRejectedValue(new Error('network down'));

    const result = await assessPronunciation(Buffer.from([1]), 'Hola', 'es-ES', 16000);

    expect(result.ok).toBe(false);
  });

  it('returns ok:false without throwing when the response has no NBest/PronunciationAssessment data', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ RecognitionStatus: 'InitialSilenceTimeout' }),
    });

    const result = await assessPronunciation(Buffer.from([1]), 'Hola', 'es-ES', 16000);

    expect(result.ok).toBe(false);
  });

  it('returns ok:false without throwing when response.json() itself throws (malformed JSON)', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error('invalid json');
      },
    });

    const result = await assessPronunciation(Buffer.from([1]), 'Hola', 'es-ES', 16000);

    expect(result.ok).toBe(false);
  });
});

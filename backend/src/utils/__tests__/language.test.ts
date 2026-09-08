// franc-min es un paquete ESM puro. Jest no puede cargarlo tal cual dentro de
// su propio runtime de test (aunque en producción, vía ts-node, el import
// dinámico funciona bien — verificado a mano). Por eso se mockea acá: se
// testea la lógica propia (umbral de longitud, mapeo de códigos, decisión
// source/target), no la precisión de la librería en sí, que ya se verificó
// interactivamente contra oraciones reales antes de fijar el umbral de 30
// caracteres.
jest.mock('franc-min', () => ({
  franc: jest.fn(),
}));

import { franc } from 'franc-min';
import { detectSpeechLanguageCode } from '../language';

const mockFranc = franc as jest.Mock;

describe('detectSpeechLanguageCode', () => {
  beforeEach(() => mockFranc.mockReset());

  it('returns the target language directly when source and target are the same, without calling franc', async () => {
    const result = await detectSpeechLanguageCode(
      'Any text here at all, long enough to pass any threshold check.',
      'en-US',
      'en-US'
    );
    expect(result).toBe('en-US');
    expect(mockFranc).not.toHaveBeenCalled();
  });

  it('defaults to the target language for short text without ever calling franc', async () => {
    const result = await detectSpeechLanguageCode('Great job!', 'en-US', 'es-ES');
    expect(result).toBe('en-US');
    expect(mockFranc).not.toHaveBeenCalled();
  });

  it('falls back to the target language for an unmappable language code without calling franc', async () => {
    const longText = 'This is a reasonably long sentence to get past the length threshold check.';
    const result = await detectSpeechLanguageCode(longText, 'xx-XX', 'es-ES');
    expect(result).toBe('xx-XX');
    expect(mockFranc).not.toHaveBeenCalled();
  });

  it('calls franc restricted to exactly the two configured languages, and returns the source language when detected', async () => {
    mockFranc.mockReturnValue('spa');
    const longText = 'Recuerda, en inglés se dice went en vez de goed, es un verbo irregular.';

    const result = await detectSpeechLanguageCode(longText, 'en-US', 'es-ES');

    expect(mockFranc).toHaveBeenCalledWith(longText, { only: ['eng', 'spa'] });
    expect(result).toBe('es-ES');
  });

  it('returns the target language when franc detects the target language', async () => {
    mockFranc.mockReturnValue('eng');
    const longText = 'Nice work, you are improving a lot with your pronunciation lately.';

    const result = await detectSpeechLanguageCode(longText, 'en-US', 'es-ES');

    expect(result).toBe('en-US');
  });

  it('returns the target language when franc cannot determine the language', async () => {
    mockFranc.mockReturnValue('und');
    const longText = 'Some long enough text that still comes back undetermined from franc.';

    const result = await detectSpeechLanguageCode(longText, 'zh-CN', 'en-US');

    expect(result).toBe('zh-CN');
  });
});

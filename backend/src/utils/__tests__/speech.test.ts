import { hasBalancedEmphasisMarkers, findSentenceBoundary, convertToSpeechSsml } from '../speech';

describe('hasBalancedEmphasisMarkers', () => {
  it('is balanced for plain text with no asterisks', () => {
    expect(hasBalancedEmphasisMarkers('Hello world.')).toBe(true);
  });

  it('is balanced for a complete bold span', () => {
    expect(hasBalancedEmphasisMarkers('This is **bold**.')).toBe(true);
  });

  it('is balanced for multiple complete spans, mixed bold and italic', () => {
    expect(hasBalancedEmphasisMarkers('**a** and *b*')).toBe(true);
  });

  it('is unbalanced when a bold span was opened but never closed', () => {
    expect(hasBalancedEmphasisMarkers('This is **bold and')).toBe(false);
  });

  it('is unbalanced when an italic span was opened but never closed', () => {
    expect(hasBalancedEmphasisMarkers('This is *important and')).toBe(false);
  });
});

describe('findSentenceBoundary', () => {
  it('finds the first sentence-ending boundary in plain text', () => {
    const result = findSentenceBoundary('Hello there. How are you?');
    expect(result).not.toBeNull();
    expect(result!.sentence).toBe('Hello there.');
    expect(result!.matchedLength).toBe('Hello there. '.length);
  });

  it('returns null when there is no terminator yet', () => {
    expect(findSentenceBoundary('Still talking without a stop')).toBeNull();
  });

  it('skips a terminator that falls inside an unclosed emphasis span and waits for the real one', () => {
    // El "?" queda DENTRO de "**...**" — no debe cortar ahí, tiene que
    // esperar al cierre del énfasis y usar el próximo punto real. Se agrega
    // un espacio final simulando que sigue llegando más texto del stream
    // (un punto sin nada después de él nunca matchea, a propósito, para no
    // cortar en medio de un número como "3.14" — igual que antes de este fix).
    const text = '**Estás listo?** Empecemos ahora. ';
    const result = findSentenceBoundary(text);
    expect(result).not.toBeNull();
    expect(result!.sentence).toBe('**Estás listo?** Empecemos ahora.');
  });

  it('still returns null (not a false early cut) while the closing marker has not arrived yet', () => {
    // Llegó el "?" pero todavía no llegó el "**" de cierre ni nada después.
    expect(findSentenceBoundary('**Estás listo?')).toBeNull();
  });

  it('does not need to wait when emphasis is already balanced before the terminator', () => {
    const result = findSentenceBoundary('This is **great**! Next sentence.');
    expect(result!.sentence).toBe('This is **great**!');
  });
});

describe('convertToSpeechSsml', () => {
  it('wraps plain text in a speak tag with no changes', () => {
    expect(convertToSpeechSsml('Hello world.')).toBe('<speak>Hello world.</speak>');
  });

  it('converts **bold** into strong emphasis', () => {
    expect(convertToSpeechSsml('This is **very** important.')).toBe(
      '<speak>This is <emphasis level="strong">very</emphasis> important.</speak>'
    );
  });

  it('converts *italic* into moderate emphasis', () => {
    expect(convertToSpeechSsml('This is *nice*.')).toBe(
      '<speak>This is <emphasis level="moderate">nice</emphasis>.</speak>'
    );
  });

  it('escapes XML-special characters so they cannot break the SSML document', () => {
    expect(convertToSpeechSsml('5 < 10 & 10 > 5')).toBe('<speak>5 &lt; 10 &amp; 10 &gt; 5</speak>');
  });

  it('strips emoji before wrapping', () => {
    expect(convertToSpeechSsml('Great job! 😊')).toBe('<speak>Great job!</speak>');
  });

  it('strips heading and list markers', () => {
    expect(convertToSpeechSsml('# Title\n- item one')).toBe('<speak>Title\nitem one</speak>');
  });

  it('strips backtick code markers, keeping the content', () => {
    expect(convertToSpeechSsml('Use the `go` verb here.')).toBe('<speak>Use the go verb here.</speak>');
  });
});

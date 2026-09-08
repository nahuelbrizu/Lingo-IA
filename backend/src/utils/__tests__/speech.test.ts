import {
  hasBalancedEmphasisMarkers,
  findSentenceBoundary,
  convertToSpeechSsml,
  stripParentheticalRomanization,
  splitNativeScriptSegments,
} from '../speech';

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

  it('skips a terminator that falls inside an unclosed parenthetical and waits for it to close', () => {
    // El "?" queda DENTRO de "(...)" sin nada antes — no debe cortar ahí, o
    // el paréntesis quedaría partido en dos fragmentos (uno sin su cierre).
    const text = 'This means (are you ready?) in English. ';
    const result = findSentenceBoundary(text);
    expect(result).not.toBeNull();
    expect(result!.sentence).toBe('This means (are you ready?) in English.');
  });

  it('still returns null while a parenthetical has not closed yet', () => {
    expect(findSentenceBoundary('This means (are you ready?')).toBeNull();
  });
});

describe('stripParentheticalRomanization', () => {
  it('removes a trailing parenthetical and the space before it', () => {
    expect(stripParentheticalRomanization('こんにちは (Konnichiwa)')).toBe('こんにちは');
  });

  it('removes a parenthetical in the middle of a longer sentence', () => {
    expect(stripParentheticalRomanization('你好 (Nǐ hǎo), ¿cómo estás?')).toBe('你好, ¿cómo estás?');
  });

  it('removes multiple parentheticals in the same sentence', () => {
    expect(stripParentheticalRomanization('元気ですか？ (Genki desu ka?) はい (Hai).')).toBe('元気ですか？ はい.');
  });

  it('leaves text with no parentheses unchanged', () => {
    expect(stripParentheticalRomanization('こんにちは')).toBe('こんにちは');
  });

  it('strips a bare "=" connector left over after removing the romanization, so it is never read aloud as a symbol', () => {
    expect(stripParentheticalRomanization('こんにちは (Konnichiwa) = Hola')).toBe('こんにちは Hola');
  });
});

describe('splitNativeScriptSegments', () => {
  it('returns the whole text as one non-native segment when there is no CJK script', () => {
    expect(splitNativeScriptSegments('Esto es solo español.')).toEqual([
      { text: 'Esto es solo español.', isNativeScript: false },
    ]);
  });

  it('returns the whole text as one native segment when it is entirely Japanese plus its romanization', () => {
    expect(splitNativeScriptSegments('こんにちは (Konnichiwa)')).toEqual([
      { text: 'こんにちは (Konnichiwa)', isNativeScript: true },
    ]);
  });

  it('splits Japanese vocabulary embedded in a longer Spanish explanation, keeping the romanization attached', () => {
    const text = 'Empecemos con un saludo básico: こんにちは (Konnichiwa) — significa "Hola".';
    expect(splitNativeScriptSegments(text)).toEqual([
      { text: 'Empecemos con un saludo básico:', isNativeScript: false },
      { text: 'こんにちは (Konnichiwa)', isNativeScript: true },
      { text: '— significa "Hola".', isNativeScript: false },
    ]);
  });

  it('handles Chinese characters the same way as Japanese', () => {
    const text = 'La palabra para hola es 你好 (Nǐ hǎo), muy común.';
    expect(splitNativeScriptSegments(text)).toEqual([
      { text: 'La palabra para hola es', isNativeScript: false },
      { text: '你好 (Nǐ hǎo)', isNativeScript: true },
      { text: ', muy común.', isNativeScript: false },
    ]);
  });

  it('keeps trailing punctuation (including plain ASCII "?") attached to the native segment even without a following parenthesis', () => {
    const text = 'Ahora preguntamos: お元気ですか?';
    expect(splitNativeScriptSegments(text)).toEqual([
      { text: 'Ahora preguntamos:', isNativeScript: false },
      { text: 'お元気ですか?', isNativeScript: true },
    ]);
  });

  it('handles multiple native segments in the same text', () => {
    const text = '元気です (Genki desu) significa "estoy bien", y 元気じゃないです (Genki ja nai desu) significa "no estoy bien".';
    const result = splitNativeScriptSegments(text);
    expect(result.filter((s: { isNativeScript: boolean }) => s.isNativeScript)).toEqual([
      { text: '元気です (Genki desu)', isNativeScript: true },
      { text: '元気じゃないです (Genki ja nai desu)', isNativeScript: true },
    ]);
  });

  it('does not treat a lone punctuation mark far from any CJK text as its own segment', () => {
    // Guarda contra el riesgo de que un "." suelto en español matchee solo
    // porque el signo de puntuación forma parte de la clase de caracteres.
    const text = 'Esto es una prueba. Nada de japonés acá.';
    expect(splitNativeScriptSegments(text)).toEqual([{ text, isNativeScript: false }]);
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

'use client';

import React, { useRef, useEffect, useState } from 'react';
import type { ChatMessage } from '@/app/hooks/useAudioStreaming';

interface ChatHistoryProps {
  chatMessages: ChatMessage[];
  onTranslate: (index: number) => void;
  /** Alumnos principiantes ven la pronunciación siempre; el resto la toca para revelarla. */
  showPronunciationByDefault: boolean;
  /**
   * Si se pasa, se muestra un botón "🎤 Practicar" en cada frase de
   * corrección/ejemplo del chat. Solo tiene sentido pasarlo mientras hay una
   * conversación en vivo (la práctica reusa el mismo WebSocket) — el padre
   * debe pasar `undefined` cuando conversationState === 'idle'.
   */
  onPracticePhrase?: (phrase: string) => void;
}

/**
 * @description
 * Renderiza **negrita**, *cursiva* y `código` como elementos de React, en vez
 * de mostrar los símbolos crudos. A propósito no soporta bloques (listas,
 * títulos, etc.) — para respuestas de chat conversacional alcanza y sobra
 * con el énfasis en línea.
 */
function renderEmphasis(text: string, keyPrefix: string): React.ReactNode[] {
  const tokenPattern = /(\*\*.+?\*\*|\*.+?\*|`.+?`)/g;
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = tokenPattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith('**')) {
      nodes.push(<strong key={`${keyPrefix}-${key++}`} className="font-semibold">{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('`')) {
      nodes.push(
        <code key={`${keyPrefix}-${key++}`} className="bg-black/10 rounded px-1 py-0.5 text-[0.9em] font-mono">
          {token.slice(1, -1)}
        </code>
      );
    } else {
      nodes.push(<em key={`${keyPrefix}-${key++}`}>{token.slice(1, -1)}</em>);
    }
    lastIndex = tokenPattern.lastIndex;
  }
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }
  return nodes;
}

// Detecta "término en escritura no latina (pronunciación)" — p.ej.
// "こんにちは (Konnichiwa)" o "你好 (Nǐ hǎo)" — para mostrarlo apilado (el
// término arriba, la pronunciación debajo) en vez de todo en una sola línea.
// A propósito NO está atado a japonés/chino en particular: cualquier
// escritura fuera del rango latino básico (\0-ɏ, que cubre
// inglés/español/francés/alemán/italiano/portugués con sus acentos) activa
// el mismo formato, así funciona igual sin importar el idioma que se agregue
// a futuro. Un paréntesis normal después de una palabra en español/inglés
// (una aclaración cualquiera) no matchea, porque esa palabra SÍ es latina.
//
// El rango arranca en \0 (no en espacio) a propósito: así excluye TODOS los
// caracteres de control, incluido el salto de línea. Sin eso, un "(" que
// arranca su propia línea (ver el patrón multilínea más abajo) podía
// "engancharse" hacia atrás cruzando el \n y emparejarse con cualquier
// fragmento suelto de la oración anterior en vez de con la línea completa
// que realmente le corresponde (nunca debería cruzar líneas).
const NATIVE_PHRASE_WITH_GLOSS = /((?:[^\0-ɏ]|[!?.,、。！？])+)[ \t]?\(([^)]+)\)/gu;

/**
 * @description
 * Un término en escritura no latina junto a su pronunciación. Los
 * principiantes la ven siempre (`defaultRevealed`); el resto la tiene oculta
 * (con un subrayado punteado como pista) y la revela tocándola — ya no
 * necesitan la ayuda todo el tiempo, pero puede servir puntualmente.
 */
const NativeTermWithGloss: React.FC<{ term: string; gloss: string; defaultRevealed: boolean }> = ({
  term,
  gloss,
  defaultRevealed,
}) => {
  const [revealed, setRevealed] = useState(defaultRevealed);
  const toggle = () => setRevealed((r) => !r);

  return (
    <span
      role="button"
      tabIndex={0}
      onClick={toggle}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggle();
        }
      }}
      className="inline-flex flex-col items-center align-bottom mx-0.5 my-0.5 leading-tight cursor-pointer select-none"
      title={revealed ? 'Ocultar pronunciación' : 'Tocá para ver la pronunciación'}
    >
      <span className={revealed ? undefined : 'border-b border-dotted border-slate-400'}>{term}</span>
      {revealed && (
        <span className="text-[0.7em] text-slate-400 dark:text-slate-500 font-normal animate-fade-in">{gloss}</span>
      )}
    </span>
  );
};

function renderInlineMarkdown(text: string, keyPrefix: string, showPronunciationByDefault: boolean): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  let match: RegExpExecArray | null;
  NATIVE_PHRASE_WITH_GLOSS.lastIndex = 0;

  while ((match = NATIVE_PHRASE_WITH_GLOSS.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(...renderEmphasis(text.slice(lastIndex, match.index), `${keyPrefix}-plain-${key++}`));
    }
    nodes.push(
      <NativeTermWithGloss
        key={`${keyPrefix}-native-${key++}`}
        term={match[1]}
        gloss={match[2]}
        defaultRevealed={showPronunciationByDefault}
      />
    );
    lastIndex = NATIVE_PHRASE_WITH_GLOSS.lastIndex;
  }
  if (lastIndex < text.length) {
    nodes.push(...renderEmphasis(text.slice(lastIndex), `${keyPrefix}-plain-${key++}`));
  }
  return nodes;
}

// Viñeta de lista: "-"/"*" o numerada ("1.", "2.", ...). El tutor usa
// listas numeradas para el vocabulario principal en inglés/francés/etc.
// (ej. "1. **go → went** (ir → fui/fue)") y guiones para sub-ítems/ejemplos
// — hacía falta reconocer ambos formatos, no solo el de guion.
const LIST_MARKER = /^(?:[-*]|\d+\.)\s+/;

/**
 * Si esta línea (sin viñeta de lista) ARRANCA con un término en escritura no
 * latina + su pronunciación, la separamos como su propia "fila de
 * vocabulario" resaltada — genérico para cualquier idioma, igual que
 * NATIVE_PHRASE_WITH_GLOSS. Una mención del término en medio de una oración
 * más larga (ej. "Empecemos con un saludo básico: こんにちは (Konnichiwa)")
 * NO cuenta como fila propia — sigue el flujo normal del párrafo — solo
 * cuando el término es lo primero de la línea, como cuando el tutor
 * presenta una palabra nueva.
 */
function parseVocabLine(line: string): { term: string; gloss: string; rest: string } | null {
  const trimmed = line.trim().replace(LIST_MARKER, '');
  // Un encabezado envuelto en "**...**" (ej. "**構造 (kouzou) = Estructura:**")
  // lo maneja mejor WHOLE_LINE_BOLD (respeta la negrita del encabezado y
  // renderiza el término nativo apilado adentro igual) — acá se descarta
  // para no perder el "**" ni partir el encabezado a la mitad.
  if (trimmed.startsWith('**')) return null;
  NATIVE_PHRASE_WITH_GLOSS.lastIndex = 0;
  const match = NATIVE_PHRASE_WITH_GLOSS.exec(trimmed);
  if (!match || match.index > 2) return null;
  // El tutor suele escribir el significado como "término (pron.) = significado"
  // o "— significado" — se saca el conector para mostrar solo el texto.
  const rest = trimmed
    .slice(match.index + match[0].length)
    .trim()
    .replace(/^[=—-]\s*/, '');
  return { term: match[1], gloss: match[2], rest };
}

type MessageBlock =
  | { type: 'vocab'; term: string; gloss: string; rest: string; key: string }
  | { type: 'highlight'; content: string; practicePhrase: string | null; key: string }
  | { type: 'text'; content: string; key: string };

// Una línea entera envuelta en "**...**" (nada de texto afuera) — el tutor
// la usa para plantar la oración corregida/recomendada como su propio
// renglón (ej. `**"My name is Noel, and I'm from Argentina."**`), no como
// simple énfasis dentro de una oración más larga. Se resalta igual que una
// línea de lista, para que se note que es "la respuesta correcta a notar".
const WHOLE_LINE_BOLD = /^\*\*.+\*\*$/;

// Una oración citada entre comillas que ocupa toda la línea, con a lo sumo
// un prefijo corto antes de los ":" (ej. `For example: "My name is Ana,
// I'm from Mexico, and I like music."` o `You said: "..."`) — otra forma
// habitual en la que el tutor destaca una oración de ejemplo/corrección sin
// usar viñeta ni negrita completa. Una cita corta DENTRO de una oración más
// larga (ej. `The word "hello" is a greeting.`) no matchea, porque acá
// exigimos que la cita sea básicamente TODA la línea.
const QUOTED_EXAMPLE_LINE = /^(?:[^:"]{0,40}:\s*)?"([^"]+)"\.?\s*$/;

// ¿El texto tiene algún carácter fuera del rango latino básico? Mismo rango
// que NATIVE_PHRASE_WITH_GLOSS (arranca en \0 para excluir también saltos de
// línea/controles).
const HAS_NON_LATIN_CHAR = /[^\0-ɏ]/;

// Una línea entera que es SOLO "(algo)" — nada de texto afuera.
const STANDALONE_PARENTHETICAL = /^\(([^)]+)\)$/;

/**
 * Parte el texto de un mensaje en bloques: líneas de vocabulario propias
 * (ver parseVocabLine), el patrón multilínea "oración nativa" + "(su
 * romanización)" + opcional "= traducción" en líneas separadas (el tutor lo
 * usa para oraciones largas, en vez de meter todo en una sola línea con
 * paréntesis inline — ver STANDALONE_PARENTHETICAL más abajo), líneas de
 * lista o de negrita completa (el tutor también usa viñetas o una oración en
 * negrita sola para presentar frases clave/correcciones, en cualquier
 * idioma) como bloques resaltados aparte, y el resto agrupado en párrafos.
 * Las líneas en blanco separan párrafos mucho antes de que el bloque se
 * renderice, en vez de dejar todo como un solo `whitespace-pre-wrap`
 * gigante — así cada "renglón" queda visualmente distinguido sin depender de
 * cuántas líneas en blanco haya puesto el modelo.
 *
 * Las claves de los bloques se arman con la POSICIÓN de la línea en el
 * texto (no un contador que solo avanza para bloques que matchean) — así, si
 * una línea todavía a medio transmitir cambia de "texto normal" a
 * "resaltado" apenas termina de llegar (algo común durante el streaming),
 * los bloques que ya estaban antes no cambian de clave de golpe. Eso evita
 * que React destruya y reconstruya de más el árbol del mensaje mientras la
 * IA sigue hablando, que era lo que hacía saltar el scroll.
 */
function splitMessageBlocks(text: string, keyPrefix: string): MessageBlock[] {
  const lines = text.split('\n');
  const blocks: MessageBlock[] = [];
  let textBuffer: string[] = [];
  let textBufferStart = -1;

  const flushTextBuffer = () => {
    if (textBuffer.length === 0) return;
    const content = textBuffer.join('\n').trim();
    if (content) {
      blocks.push({ type: 'text', content, key: `${keyPrefix}-b${textBufferStart}` });
    }
    textBuffer = [];
    textBufferStart = -1;
  };

  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();
    const vocab = parseVocabLine(line);
    const isListItem = LIST_MARKER.test(trimmed);
    const isWholeLineBold = WHOLE_LINE_BOLD.test(trimmed);
    const isQuotedExample = QUOTED_EXAMPLE_LINE.test(trimmed);

    const nextLine = lines[index + 1]?.trim();
    const nextParenMatch = nextLine ? STANDALONE_PARENTHETICAL.exec(nextLine) : null;
    const isStandaloneNativeSentence =
      !vocab && trimmed !== '' && !isListItem && !isWholeLineBold && !isQuotedExample && HAS_NON_LATIN_CHAR.test(trimmed);

    if (vocab) {
      flushTextBuffer();
      blocks.push({ type: 'vocab', ...vocab, key: `${keyPrefix}-b${index}` });
      index++;
    } else if (isStandaloneNativeSentence && nextParenMatch) {
      // "オ元気ですか？\n(Ogenki desu ka?)\n= ¿Cómo estás?" — oración larga en
      // su propia línea, romanización en la siguiente, traducción opcional
      // en la tercera. Mismo bloque 'vocab' que el caso de una sola línea,
      // solo que arma sus tres partes desde líneas separadas.
      flushTextBuffer();
      const afterLine = lines[index + 2]?.trim();
      const hasTranslation = afterLine !== undefined && /^[=—-]\s*/.test(afterLine);
      const rest = hasTranslation ? afterLine!.replace(/^[=—-]\s*/, '') : '';
      blocks.push({
        type: 'vocab',
        term: trimmed,
        gloss: nextParenMatch[1],
        rest,
        key: `${keyPrefix}-b${index}`,
      });
      index += hasTranslation ? 3 : 2;
    } else if (isListItem || isWholeLineBold || isQuotedExample) {
      flushTextBuffer();
      // La frase exacta a practicar: la cita entre comillas si matcheó
      // QUOTED_EXAMPLE_LINE, o el interior de "**...**" si es una línea en
      // negrita completa. Un ítem de lista simple no tiene una "frase para
      // repetir" bien definida, así que queda en null (sin botón de práctica).
      const quotedMatch = QUOTED_EXAMPLE_LINE.exec(trimmed);
      const practicePhrase = quotedMatch
        ? quotedMatch[1]
        : isWholeLineBold
          ? trimmed.slice(2, -2)
          : null;
      blocks.push({
        type: 'highlight',
        content: trimmed.replace(LIST_MARKER, ''),
        practicePhrase,
        key: `${keyPrefix}-b${index}`,
      });
      index++;
    } else if (trimmed === '') {
      flushTextBuffer();
      index++;
    } else {
      if (textBufferStart === -1) textBufferStart = index;
      textBuffer.push(line);
      index++;
    }
  }
  flushTextBuffer();
  return blocks;
}

const MessageContent: React.FC<{
  text: string;
  keyPrefix: string;
  showPronunciationByDefault: boolean;
  onPracticePhrase?: (phrase: string) => void;
}> = ({ text, keyPrefix, showPronunciationByDefault, onPracticePhrase }) => {
  const blocks = splitMessageBlocks(text, keyPrefix);
  return (
    <div className="space-y-2">
      {blocks.map((block) => {
        if (block.type === 'vocab') {
          // Traducción primero (es lo que un principiante que todavía no lee
          // el idioma necesita entender antes que nada), y recién debajo el
          // término en su escritura original con la pronunciación apilada.
          return (
            <div key={block.key} className="flex flex-col gap-1 px-3 py-2 rounded-xl bg-teal-50/80 border border-teal-100">
              {block.rest && (
                <span className="text-sm font-medium text-slate-700">
                  {renderEmphasis(block.rest, `${block.key}-rest`)}
                </span>
              )}
              <NativeTermWithGloss term={block.term} gloss={block.gloss} defaultRevealed={showPronunciationByDefault} />
            </div>
          );
        }
        if (block.type === 'highlight') {
          return (
            <div
              key={block.key}
              className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-teal-50/80 border border-teal-100 text-sm"
            >
              <span>{renderInlineMarkdown(block.content, block.key, showPronunciationByDefault)}</span>
              {block.practicePhrase && onPracticePhrase && (
                <button
                  onClick={() => onPracticePhrase(block.practicePhrase!)}
                  className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-violet-700 bg-violet-100 hover:bg-violet-200 rounded-full px-2.5 py-1 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                >
                  🎤 Practicar
                </button>
              )}
            </div>
          );
        }
        return (
          <p key={block.key} className="whitespace-pre-wrap">
            {renderInlineMarkdown(block.content, block.key, showPronunciationByDefault)}
          </p>
        );
      })}
    </div>
  );
};

/**
 * @description
 * Componente con la única responsabilidad de renderizar la lista de mensajes del chat.
 * Se auto-desplaza hacia el último mensaje. Los mensajes de la IA tienen un botón
 * para pedir una traducción al idioma nativo del alumno — ayuda didáctica para
 * cuando todavía no entiende el idioma que está aprendiendo.
 */
export const ChatHistory: React.FC<ChatHistoryProps> = ({ chatMessages, onTranslate, showPronunciationByDefault, onPracticePhrase }) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // Si el usuario scrolleó hacia arriba para releer algo mientras la IA
  // sigue hablando (el texto se actualiza cada ~50ms), no queremos forzarlo
  // de vuelta al final en cada actualización — solo auto-scrolleamos si ya
  // estaba cerca del final antes del último cambio.
  const shouldAutoScrollRef = useRef(true);
  const [shownTranslations, setShownTranslations] = useState<Set<number>>(new Set());

  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    shouldAutoScrollRef.current = distanceFromBottom < 80;
  };

  useEffect(() => {
    if (shouldAutoScrollRef.current) {
      messagesEndRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'end',
      });
    }
  }, [chatMessages]);

  const toggleTranslation = (index: number, msg: ChatMessage) => {
    setShownTranslations(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
        if (!msg.translation) {
          onTranslate(index);
        }
      }
      return next;
    });
  };

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="mb-6 p-3 sm:p-4 glass-panel rounded-3xl shadow-soft-lg min-h-[26rem] max-h-[65vh] overflow-y-auto scrollbar-thin"
    >
      <div className="space-y-4">
        {chatMessages.map((msg, index) => (
          msg.sender === 'system' ? (
            <div key={index} className="flex justify-center animate-message-in">
              <p className="max-w-sm md:max-w-md text-center text-xs text-slate-500 bg-slate-100/80 border border-slate-200/80 rounded-xl px-4 py-2.5 leading-relaxed whitespace-pre-wrap">
                {msg.text}
              </p>
            </div>
          ) : (
          <div
            key={index}
            className={`flex flex-col animate-message-in ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div
              className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-xs md:max-w-md lg:max-w-xl px-4 py-2.5 rounded-2xl leading-relaxed shadow-sm ${
                  msg.sender === 'user'
                    ? 'bg-gradient-to-br from-indigo-600 to-violet-600 text-white rounded-br-md whitespace-pre-wrap'
                    : 'bg-violet-50/60 text-slate-800 border border-violet-100 rounded-bl-md'
                }`}
              >
                {msg.sender === 'ai' ? (
                  <MessageContent
                    text={msg.text}
                    keyPrefix={`msg-${index}`}
                    showPronunciationByDefault={showPronunciationByDefault}
                    onPracticePhrase={onPracticePhrase}
                  />
                ) : (
                  renderInlineMarkdown(msg.text, `msg-${index}`, showPronunciationByDefault)
                )}
              </div>
            </div>

            {msg.sender === 'ai' && msg.text && (
              <div className="mt-1.5 max-w-xs md:max-w-md lg:max-w-lg px-1">
                <button
                  onClick={() => toggleTranslation(index, msg)}
                  className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium rounded transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-1"
                >
                  {shownTranslations.has(index) ? 'Ocultar traducción' : '🌐 Traducir'}
                </button>
                {shownTranslations.has(index) && (
                  <p className="text-xs text-slate-500 italic mt-1 leading-relaxed animate-fade-in">
                    {msg.isTranslating
                      ? 'Traduciendo...'
                      : renderInlineMarkdown(msg.translation ?? '', `tr-${index}`, showPronunciationByDefault)}
                  </p>
                )}
              </div>
            )}
          </div>
          )
        ))}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
};

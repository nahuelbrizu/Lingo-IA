// backend/src/utils/speech.ts

// Rango amplio de pictogramas/emoji (incluye modificadores de tono de piel,
// variation selectors y el Zero Width Joiner usado en emoji compuestos como
// 👨‍👩‍👧). Google TTS no los ignora en silencio: muchos los lee en voz alta
// (el nombre del símbolo), y como el chat de texto SÍ puede llegar a
// mostrarlos "invisibles" según la fuente, el resultado es una voz que
// menciona algo que el usuario ni ve escrito.
const EMOJI_PATTERN =
  /[\u{1F1E6}-\u{1F1FF}\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu;

/**
 * ¿El texto tiene todos sus `**negrita**`/`*cursiva*` completos (con
 * apertura y cierre), o queda alguno abierto sin cerrar? Se usa para decidir
 * si es seguro cortar acá una oración para mandarla a sintetizar: cortar en
 * medio de un énfasis dejaría un asterisco suelto en cada mitad, que ningún
 * regex puede volver a emparejar después (por eso se escuchaban asteriscos
 * sueltos en la voz).
 *
 * Caso límite conocido y aceptado: un asterisco literal suelto (ej. "3 * 4")
 * queda marcado como "no balanceado" para siempre dentro de ese turno — no
 * rompe nada, simplemente esa oración se termina mandando recién al final
 * del turno en vez de en streaming. Es un caso rarísimo en una conversación
 * hablada de idiomas.
 */
export function hasBalancedEmphasisMarkers(text: string): boolean {
  const withoutPairs = text.replace(/\*\*(.+?)\*\*/g, '').replace(/\*(.+?)\*/g, '');
  return !withoutPairs.includes('*');
}

/**
 * ¿Los paréntesis del texto están todos cerrados? Se usa para lo mismo que
 * hasBalancedEmphasisMarkers pero para "(romanización)" — en japonés/chino
 * el tutor escribe el texto nativo seguido de su romanización entre
 * paréntesis (ver TUTOR_SYSTEM_PROMPT), y esa romanización a veces repite un
 * signo de pregunta/exclamación del original (ej. "元気ですか？ (Genki desu
 * ka?)"). Cortar antes de que cierre el paréntesis separaría el texto nativo
 * de su romanización en dos audios distintos, o peor, dejaría el paréntesis
 * suelto como su propio fragmento.
 */
function hasBalancedParens(text: string): boolean {
  let depth = 0;
  for (const char of text) {
    if (char === '(') depth++;
    else if (char === ')') depth--;
  }
  return depth === 0;
}

const TERMINATOR = /[.]\s+|[!?。！？]+\s*/g;

/**
 * Busca el próximo límite de oración "seguro" en el texto acumulado del
 * stream: el primer punto/signo de cierre tal que todo lo que viene antes
 * tiene el énfasis y los paréntesis balanceados (ver hasBalancedEmphasisMarkers
 * y hasBalancedParens). Si el primer signo de puntuación encontrado cae
 * DENTRO de un "**...**" o un "(...)" sin cerrar, no corta ahí — sigue
 * buscando el próximo, en vez de quedarse pegado ahí para siempre (que
 * congelaría el streaming de audio del resto del turno).
 *
 * Devuelve null si todavía no hay ningún límite de oración disponible (hay
 * que esperar más texto del stream).
 */
export function findSentenceBoundary(text: string): { sentence: string; matchedLength: number } | null {
  TERMINATOR.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TERMINATOR.exec(text))) {
    const matchedLength = match.index + match[0].length;
    const candidate = text.slice(0, matchedLength);
    if (hasBalancedEmphasisMarkers(candidate) && hasBalancedParens(candidate)) {
      return { sentence: candidate.trim(), matchedLength };
    }
    // No balanceado: seguimos buscando el próximo terminador más adelante en
    // el mismo texto en vez de rendirnos — TERMINATOR ya tiene el flag "g",
    // así que el próximo exec() continúa desde donde quedó.
  }
  return null;
}

/**
 * Saca la romanización entre paréntesis que el tutor agrega al texto en
 * japonés/chino (ver TUTOR_SYSTEM_PROMPT) antes de mandar la oración a
 * síntesis de voz — esa romanización es una ayuda de LECTURA para el chat,
 * no algo que deba escucharse: Google TTS la leería letra por letra en la
 * voz japonesa/china, sonando doble y raro. El chat de texto sigue
 * mostrando ambas cosas sin cambios (esto solo se aplica al audio).
 */
export function stripParentheticalRomanization(text: string): string {
  return text.replace(/\s*\([^)]*\)/g, '').trim();
}

export interface SpeechSegment {
  text: string;
  isNativeScript: boolean;
}

// Hiragana, katakana, ideogramas Han (compartidos por japonés y chino) y
// puntuación CJK de ancho completo. Requiere al menos UN carácter real de
// estos rangos como ancla — la puntuación (de ancho completo o ASCII) solo
// se suma si está pegada a esa ancla, nunca sola (si no, un "." cualquiera
// en medio de una frase en español matchearía como si fuera "guion nativo").
const NATIVE_SCRIPT_SEGMENT =
  /[぀-ヿ一-鿿㐀-䶿]+[。！？、!?.]*(?:\s*\([^)]*\))?/gu;

/**
 * Divide un fragmento de texto en segmentos alternados de guion nativo
 * (japonés/chino, con su romanización pegada si la tiene) y todo lo demás.
 * Hace falta esto porque el tutor mezcla explicación en el idioma nativo del
 * alumno con vocabulario en japonés/chino DENTRO de la misma oración/párrafo
 * (p.ej. "La palabra para hola es 你好 (Nǐ hǎo), muy común.") — detectar el
 * idioma de todo el fragmento junto (ver detectSpeechLanguageCode) clasifica
 * esos casos como el idioma que domina en cantidad de caracteres, que casi
 * siempre es el nativo, dejando el vocabulario en sí sin pronunciar
 * correctamente. Separando por script, cada pedazo se sintetiza con la voz
 * que realmente le corresponde.
 */
export function splitNativeScriptSegments(text: string): SpeechSegment[] {
  const segments: SpeechSegment[] = [];
  let lastIndex = 0;
  NATIVE_SCRIPT_SEGMENT.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = NATIVE_SCRIPT_SEGMENT.exec(text))) {
    if (match.index > lastIndex) {
      const before = text.slice(lastIndex, match.index).trim();
      if (before) segments.push({ text: before, isNativeScript: false });
    }
    segments.push({ text: match[0].trim(), isNativeScript: true });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    const after = text.slice(lastIndex).trim();
    if (after) segments.push({ text: after, isNativeScript: false });
  }
  if (segments.length === 0) {
    return [{ text, isNativeScript: false }];
  }
  return segments;
}

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Convierte el texto (con markdown y eventuales emoji) de una oración ya
 * cortada en el SSML que se le manda a Google Cloud TTS. A diferencia de
 * simplemente "borrar" los asteriscos, **negrita** y *cursiva* se convierten
 * en <emphasis> real — la idea original de usarlos para dar intensidad a la
 * voz se mantiene, en vez de perderse.
 */
export function convertToSpeechSsml(text: string): string {
  const withoutMarkup = text
    .replace(/`(.+?)`/g, '$1') // `código`
    .replace(/^#{1,6}\s+/gm, '') // # títulos
    .replace(/^[-*]\s+/gm, '') // - listas
    .replace(EMOJI_PATTERN, '') // emojis
    .replace(/[ \t]{2,}/g, ' ') // colapsa espacios que deja el emoji removido
    .trim();

  const escaped = escapeXml(withoutMarkup);

  const withEmphasis = escaped
    .replace(/\*\*(.+?)\*\*/g, '<emphasis level="strong">$1</emphasis>')
    .replace(/\*(.+?)\*/g, '<emphasis level="moderate">$1</emphasis>');

  return `<speak>${withEmphasis}</speak>`;
}

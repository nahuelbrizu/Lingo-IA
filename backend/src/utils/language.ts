// backend/src/utils/language.ts

// franc-min es un paquete ESM puro (sin build CommonJS); con
// "module": "commonjs" no se puede hacer `import` estático directo. El
// import dinámico sí funciona (Node lo soporta nativamente incluso desde
// código CommonJS) — se cachea la promesa para no repetir la carga en cada
// llamada.
let francModulePromise: Promise<typeof import('franc-min')> | null = null;
function loadFranc() {
  if (!francModulePromise) francModulePromise = import('franc-min');
  return francModulePromise;
}

// Mapea nuestros códigos BCP-47 (los que usa el resto de la app) a los
// códigos ISO 639-3 que espera franc-min.
const BCP47_TO_ISO6393: Record<string, string> = {
  'en-US': 'eng',
  'es-ES': 'spa',
  'fr-FR': 'fra',
  'de-DE': 'deu',
  'it-IT': 'ita',
  'pt-BR': 'por',
  'ja-JP': 'jpn',
  'zh-CN': 'cmn',
};

/**
 * Umbral mínimo de caracteres para confiar en que una oración está en el
 * idioma NATIVO del alumno en vez de en el que está practicando. franc-min
 * (basado en trigramas) no es confiable con frases cortas — verificado a
 * mano, frases tan comunes en un tutor como "Great job today!" se clasifican
 * como español pese a ser inglés. Confundir target→source es mucho más
 * dañino acá (arruina la pronunciación de la mayoría de las frases cortas de
 * aliento, que son moneda corriente) que perder alguna aclaración nativa
 * genuina pero muy corta — en ese caso peor, queda como estaba antes de este
 * fix: se lee con la voz del idioma que se practica.
 */
const MIN_CHARS_FOR_SOURCE_DETECTION = 30;

/**
 * Decide con qué código de idioma sintetizar esta oración puntual. La mayor
 * parte de la conversación es en el idioma que se practica, pero el tutor a
 * veces aclara algo en el idioma nativo del alumno (instruido en el system
 * prompt) — sintetizar esa aclaración con la voz del idioma que se practica
 * la vuelve ininteligible. Por defecto, ante cualquier duda o combinación no
 * reconocida, devuelve el idioma que se practica (el caso más frecuente).
 */
export async function detectSpeechLanguageCode(
  text: string,
  targetLanguageCode: string,
  sourceLanguageCode: string
): Promise<string> {
  if (targetLanguageCode === sourceLanguageCode) return targetLanguageCode;
  if (text.length < MIN_CHARS_FOR_SOURCE_DETECTION) return targetLanguageCode;

  const targetIso = BCP47_TO_ISO6393[targetLanguageCode];
  const sourceIso = BCP47_TO_ISO6393[sourceLanguageCode];
  if (!targetIso || !sourceIso) return targetLanguageCode;

  const { franc } = await loadFranc();
  const detected = franc(text, { only: [targetIso, sourceIso] });
  return detected === sourceIso ? sourceLanguageCode : targetLanguageCode;
}

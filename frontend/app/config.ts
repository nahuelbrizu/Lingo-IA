// frontend/app/config.ts

/**
 * Modo Estricto de UI:
 * Si está activado, el sistema lanzará errores en tiempo de ejecución en lugar de
 * solo loguear advertencias cuando se detecten inconsistencias de estado o
 * posibles memory leaks.
 * 
 * Actívalo en tu archivo `.env.local` para un desarrollo más seguro:
 * NEXT_PUBLIC_STRICT_UI_MODE=true
 */
export const STRICT_UI_MODE = process.env.NEXT_PUBLIC_STRICT_UI_MODE === 'true';

/**
 * Idiomas que el tutor puede enseñar. El `code` es el tag BCP-47 usado para
 * el reconocimiento de voz (SpeechRecognition) del navegador, y se manda al
 * backend para que Claude responda en ese idioma y Google Cloud TTS
 * sintetice la voz correspondiente.
 */
export const SUPPORTED_LANGUAGES = [
  { code: 'en-US', label: 'Inglés' },
  { code: 'es-ES', label: 'Español' },
  { code: 'fr-FR', label: 'Francés' },
  { code: 'de-DE', label: 'Alemán' },
  { code: 'it-IT', label: 'Italiano' },
  { code: 'pt-BR', label: 'Portugués' },
  { code: 'ja-JP', label: 'Japonés' },
  { code: 'zh-CN', label: 'Chino (mandarín)' },
] as const;

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]['code'];

export const DEFAULT_LANGUAGE: LanguageCode = 'en-US';

/** Idioma nativo del alumno por defecto (usado para las traducciones de ayuda). */
export const DEFAULT_SOURCE_LANGUAGE: LanguageCode = 'es-ES';

/**
 * Niveles CEFR que todavía se consideran "principiante" a efectos de UI —
 * por ejemplo, mostrar siempre la pronunciación de un término en escritura
 * no latina en vez de ocultarla hasta que la toquen (ver ChatHistory). Un
 * alumno B1 o más avanzado ya no necesita esa ayuda por defecto.
 */
const BEGINNER_LANGUAGE_LEVELS = ['A1', 'A2'];

export function isBeginnerLevel(level?: string | null): boolean {
  return !level || BEGINNER_LANGUAGE_LEVELS.includes(level);
}

if (STRICT_UI_MODE) {
  console.warn(
    '%cSTRICT UI MODE ENABLED',
    'color: red; font-size: 14px; font-weight: bold;',
    'La UI lanzará errores en tiempo de ejecución ante inconsistencias de estado.'
  );
}

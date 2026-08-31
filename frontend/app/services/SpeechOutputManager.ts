interface SpeakRequest {
  text: string;
  sessionId: string;
  generationId: string;
  lang?: string;
}

/**
 * @class SpeechOutputManager
 * @description
 * Singleton global para la síntesis de voz de la IA usando la Web Speech API
 * del navegador (`speechSynthesis`). Reemplaza al TTS de Google Cloud: no hay
 * streaming de audio del backend, se sintetiza el texto completo localmente.
 * Mantiene el mismo esquema de lock por sessionId/generationId que
 * `AudioOutputManager` para permitir cancelación limpia en el barge-in.
 */
class SpeechOutputManager {
  private static instance: SpeechOutputManager;
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private currentSessionId: string | null = null;
  private currentGenerationId: string | null = null;

  private constructor() {}

  public static getInstance(): SpeechOutputManager {
    if (!SpeechOutputManager.instance) {
      SpeechOutputManager.instance = new SpeechOutputManager();
    }
    return SpeechOutputManager.instance;
  }

  /**
   * Las voces del navegador se cargan de forma asíncrona (evento `voiceschanged`).
   * Si hablamos antes de que estén listas, en algunos navegadores no suena nada.
   */
  private getVoices(): Promise<SpeechSynthesisVoice[]> {
    const existing = window.speechSynthesis.getVoices();
    if (existing.length > 0) return Promise.resolve(existing);

    return new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(window.speechSynthesis.getVoices()), 500);
      window.speechSynthesis.onvoiceschanged = () => {
        clearTimeout(timeout);
        resolve(window.speechSynthesis.getVoices());
      };
    });
  }

  public async speak(request: SpeakRequest): Promise<void> {
    const { text, sessionId, generationId, lang = 'es-ES' } = request;

    if (typeof window === 'undefined' || !('speechSynthesis' in window) || !text) {
      return;
    }

    if (this.currentSessionId && this.currentSessionId !== sessionId) {
      console.warn(`[SpeechOutputManager] Speak ignorado: la sesión ${this.currentSessionId} ya está activa.`);
      return;
    }

    // Cancela cualquier síntesis previa antes de arrancar una nueva.
    this.stop();

    this.currentSessionId = sessionId;
    this.currentGenerationId = generationId;

    const voices = await this.getVoices();
    if (voices.length === 0) {
      console.warn('[SpeechOutputManager] El navegador no reporta ninguna voz instalada (speechSynthesis.getVoices() vacío). No va a sonar nada.');
    }
    const matchingVoice =
      voices.find((v) => v.lang === lang) ?? voices.find((v) => v.lang.startsWith(lang.split('-')[0]));
    if (!matchingVoice && voices.length > 0) {
      console.warn(`[SpeechOutputManager] No hay voz instalada para "${lang}". Voces disponibles: ${voices.map((v) => v.lang).join(', ')}`);
    }

    return new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang;
      if (matchingVoice) utterance.voice = matchingVoice;

      const finish = () => {
        if (this.currentGenerationId === generationId) {
          this.releaseLock();
        }
        resolve();
      };

      utterance.onstart = () => console.log(`[SpeechOutputManager] Hablando (${lang}, voz: ${matchingVoice?.name ?? 'default'}):`, text);
      utterance.onend = finish;
      utterance.onerror = (event) => {
        if (event.error !== 'canceled' && event.error !== 'interrupted') {
          console.error('[SpeechOutputManager] Error de síntesis:', event.error);
        }
        finish();
      };

      this.currentUtterance = utterance;
      // Chrome a veces deja la cola de síntesis "pausada" tras inactividad; resume()
      // antes de hablar evita que speak() se quede sin efecto en silencio.
      window.speechSynthesis.resume();
      window.speechSynthesis.speak(utterance);
    });
  }

  public stop(sessionId?: string): void {
    if (sessionId && this.currentSessionId !== sessionId) return;
    if (this.currentUtterance) {
      window.speechSynthesis.cancel();
    }
    this.releaseLock();
  }

  private releaseLock(): void {
    this.currentUtterance = null;
    this.currentSessionId = null;
    this.currentGenerationId = null;
  }
}

export const speechOutputManager = SpeechOutputManager.getInstance();

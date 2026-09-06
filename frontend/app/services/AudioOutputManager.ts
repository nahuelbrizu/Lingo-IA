import { globalEventBus } from './EventBus';

interface PlaybackRequest {
  chunk: ArrayBuffer;
  sessionId: string;
  generationId: string;
}

interface QueuedChunk {
  chunk: ArrayBuffer;
  generationId: string;
  resolve: () => void;
}

const PLAYBACK_TIMEOUT_MARGIN_MS = 250; // Margen de seguridad para el watchdog

/**
 * @class AudioOutputManager
 * @description
 * Singleton global para gestionar la salida de audio. El backend sintetiza la
 * respuesta de la IA oración por oración (para que el audio empiece a sonar
 * antes en vez de esperar la respuesta completa), así que esta clase encola
 * los chunks de una misma generación y los reproduce uno detrás del otro,
 * sin mezclarlos. Usa un watchdog timer para evitar deadlocks de reproducción.
 */
class AudioOutputManager {
  private static instance: AudioOutputManager;
  private audioContext: AudioContext | null = null;
  private activeSource: AudioBufferSourceNode | null = null;

  private queue: QueuedChunk[] = [];
  private isPlaying = false;

  // Lock state
  private currentSessionId: string | null = null;
  private currentGenerationId: string | null = null;
  private watchdogTimer: NodeJS.Timeout | null = null;

  private constructor() {}

  public static getInstance(): AudioOutputManager {
    if (!AudioOutputManager.instance) {
      AudioOutputManager.instance = new AudioOutputManager();
    }
    return AudioOutputManager.instance;
  }

  private getContext(): AudioContext {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    // Si el contexto está suspendido (políticas de autoplay), intentamos reanudarlo
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch(err => {
        console.warn('[AudioOutputManager] No se pudo reanudar el AudioContext automáticamente:', err);
      });
    }
    return this.audioContext;
  }

  public play(request: PlaybackRequest): Promise<void> {
    const { chunk, sessionId, generationId } = request;

    if (this.currentSessionId && this.currentSessionId !== sessionId) {
      console.warn(`[AudioOutputManager] Playback ignorado: la sesión ${this.currentSessionId} ya está activa.`);
      return Promise.resolve();
    }

    if (!this.currentSessionId) {
      this.currentSessionId = sessionId;
    }

    if (this.currentGenerationId && this.currentGenerationId !== generationId) {
      // Una generación nueva reemplaza cualquier cola pendiente de la anterior
      // (p.ej. si llega un turno nuevo antes de que termine de sonar el previo).
      this.dropQueue();
    }
    this.currentGenerationId = generationId;

    return new Promise<void>((resolve) => {
      this.queue.push({ chunk, generationId, resolve });
      this.processQueue();
    });
  }

  private processQueue(): void {
    if (this.isPlaying) return;
    const next = this.queue.shift();
    if (!next) return;

    if (next.generationId !== this.currentGenerationId) {
      // Chunk obsoleto de una generación ya reemplazada/cancelada.
      next.resolve();
      this.processQueue();
      return;
    }

    this.isPlaying = true;
    const { chunk, generationId, resolve } = next;

    this.getContext()
      .decodeAudioData(chunk.slice(0)) // Usar slice(0) para crear una copia
      .then((audioBuffer) => {
        const audioContext = this.getContext();
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContext.destination);

        this.clearWatchdog();

        const handlePlaybackEnd = (isError: boolean = false, errorMessage?: string) => {
          this.clearWatchdog();
          if (isError) console.error(errorMessage);
          this.activeSource = null;
          this.isPlaying = false;
          resolve();
          if (generationId === this.currentGenerationId && this.queue.length === 0) {
            globalEventBus.publish({
              type: 'AUDIO_PLAYBACK_ENDED',
              sessionId: this.currentSessionId!,
              payload: { generationId }
            });
          }
          this.processQueue();
        };

        const durationMs = audioBuffer.duration * 1000;
        this.watchdogTimer = setTimeout(() => {
          const errorMessage = `[AudioOutputManager] WATCHDOG: Playback excedió el tiempo (gen: ${generationId}). Forzando liberación.`;
          this.activeSource?.disconnect();
          handlePlaybackEnd(true, errorMessage);
        }, durationMs + PLAYBACK_TIMEOUT_MARGIN_MS);

        source.onended = () => handlePlaybackEnd(false);
        source.start();

        this.activeSource = source;
      })
      .catch((error) => {
        console.error('[AudioOutputManager] Error decodificando audio.', error);
        this.isPlaying = false;
        resolve();
        this.processQueue();
      });
  }

  public stop(sessionId?: string): void {
    if (sessionId && this.currentSessionId !== sessionId) {
      return;
    }
    this.dropQueue();
    if (this.activeSource) {
      this.clearWatchdog();
      this.activeSource.onended = null;
      this.activeSource.stop();
      this.activeSource = null;
    }
    this.isPlaying = false;
    this.currentSessionId = null;
    this.currentGenerationId = null;
  }

  /** Vacía la cola pendiente, resolviendo sus promesas para no dejar a nadie esperando. */
  private dropQueue(): void {
    this.queue.forEach(item => item.resolve());
    this.queue = [];
  }

  private clearWatchdog(): void {
    if (this.watchdogTimer) {
      clearTimeout(this.watchdogTimer);
      this.watchdogTimer = null;
    }
  }
}

export const audioOutputManager = AudioOutputManager.getInstance();

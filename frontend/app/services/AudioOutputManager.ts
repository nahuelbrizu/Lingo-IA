import { globalEventBus } from './EventBus';

interface PlaybackRequest {
  chunk: ArrayBuffer;
  sessionId: string;
  generationId: string;
}

const PLAYBACK_TIMEOUT_MARGIN_MS = 250; // Margen de seguridad para el watchdog

/**
 * @class AudioOutputManager
 * @description
 * Singleton global para gestionar la salida de audio. Previene la mezcla de audio
 * y utiliza un watchdog timer para evitar deadlocks de reproducción.
 */
class AudioOutputManager {
  private static instance: AudioOutputManager;
  private audioContext: AudioContext | null = null;
  private activeSource: AudioBufferSourceNode | null = null;
  
  // Lock state
  private currentSessionId: string | null = null;
  private currentGenerationId: string | null = null;
  private watchdogTimer: NodeJS.Timeout | null = null;
  private currentResolve: (() => void) | null = null;

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
        this.currentGenerationId = generationId;
    }

    // Guard Check 2: Prevenir que chunks de una generación obsoleta se reproduzcan.
    if (this.currentGenerationId !== generationId) {
        console.warn(`[AudioOutputManager] Playback ignorado: generationId obsoleto. Activo: ${this.currentGenerationId}, Recibido: ${generationId}`);
        return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      this.currentResolve = resolve;

      this.getContext()
        .decodeAudioData(chunk.slice(0)) // Usar slice(0) para crear una copia
        .then((audioBuffer) => {
          const audioContext = this.getContext();
          const source = audioContext.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(audioContext.destination);

          this.clearWatchdog();

          const handlePlaybackEnd = (isError: boolean = false, errorMessage?: string) => {
            if (generationId !== this.currentGenerationId) return; // Un evento onended tardío de una generación ya cancelada

            this.clearWatchdog();
            if (!isError) {
              globalEventBus.publish({
                type: 'AUDIO_PLAYBACK_ENDED',
                sessionId: this.currentSessionId!,
                payload: { generationId: this.currentGenerationId! }
              });
            } else {
                console.error(errorMessage);
            }
            this.releaseLock();
          };

          const durationMs = audioBuffer.duration * 1000;
          this.watchdogTimer = setTimeout(() => {
            const errorMessage = `[AudioOutputManager] WATCHDOG: Playback para sesión ${sessionId} (gen: ${generationId}) excedió el tiempo. Forzando liberación.`;
            this.activeSource?.disconnect();
            handlePlaybackEnd(true, errorMessage);
          }, durationMs + PLAYBACK_TIMEOUT_MARGIN_MS);

          source.onended = () => handlePlaybackEnd(false);
          source.start();

          this.activeSource = source;
        })
        .catch((error) => {
          console.error('[AudioOutputManager] Error decodificando audio. Liberando lock.', error);
          this.releaseLock();
        });
    });
  }

  public stop(sessionId?: string): void {
    if (this.activeSource) {
      if (sessionId && this.currentSessionId !== sessionId) {
        return;
      }
      this.clearWatchdog();
      this.activeSource.onended = null;
      this.activeSource.stop();
      this.releaseLock();
    }
  }

  private clearWatchdog(): void {
    if (this.watchdogTimer) {
      clearTimeout(this.watchdogTimer);
      this.watchdogTimer = null;
    }
  }

  private releaseLock(): void {
    this.activeSource = null;
    this.currentSessionId = null;
    this.currentGenerationId = null;
    this.currentResolve?.();
    this.currentResolve = null;
  }
}

export const audioOutputManager = AudioOutputManager.getInstance();

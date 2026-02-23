import { globalEventBus } from './EventBus';

// Callback que las sesiones deben proveer para recibir chunks de audio.
type AudioChunkCallback = (chunk: Int16Array) => void;

/**
 * @class AudioInputManager
 * @description
 * Singleton global para gestionar el recurso físico del micrófono.
 * Usa un contador de referencias (`audioSubscribers.size`) para iniciar y detener
 * la captura de audio eficientemente. Despacha los chunks de audio directamente
 * a las sesiones suscritas para evitar el broadcast ineficiente.
 */
class AudioInputManager {
  private static instance: AudioInputManager;
  // Mapa de suscripción directa para los chunks de audio.
  private audioSubscribers: Map<string, AudioChunkCallback> = new Map();

  private audioContext: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private workletNode: AudioWorkletNode | null = null;
  // ... VAD y otros nodos de análisis.

  private constructor() {}

  public static getInstance(): AudioInputManager {
    if (!AudioInputManager.instance) {
      AudioInputManager.instance = new AudioInputManager();
    }
    return AudioInputManager.instance;
  }

  /**
   * Una sesión se suscribe para recibir datos de audio directamente.
   * @param sessionId El ID de la sesión que se suscribe.
   * @param callback La función a invocar con cada chunk de Int16Array.
   */
  public subscribe(sessionId: string, callback: AudioChunkCallback): void {
    const initialSize = this.audioSubscribers.size;
    this.audioSubscribers.set(sessionId, callback);

    if (initialSize === 0 && this.audioSubscribers.size === 1) {
      this.startMicrophone();
    }
  }

  /**
   * Una sesión se desuscribe de los datos de audio.
   * @param sessionId El ID de la sesión a desuscribir.
   */
  public unsubscribe(sessionId: string): void {
    const initialSize = this.audioSubscribers.size;
    if (this.audioSubscribers.delete(sessionId)) {
      if (initialSize === 1 && this.audioSubscribers.size === 0) {
        this.stopMicrophone();
      }
    }
  }

  private async startMicrophone(): Promise<void> {
    if (this.stream) return;

    console.log('[AudioInputManager] Iniciando captura de micrófono (1 suscriptor)...');
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // Asumiendo que el worklet está en `public/audio.worklet.js`
      // await this.audioContext.audioWorklet.addModule('/audio.worklet.js');
      // this.workletNode = new AudioWorkletNode(this.audioContext, 'audio-processor');
      
      // Conexión del despacho directo
      // this.workletNode.port.onmessage = (event: MessageEvent<Int16Array>) => {
      //   this.audioSubscribers.forEach(callback => callback(event.data));
      // };
      
      // Los eventos de VAD de bajo volumen siguen siendo útiles globalmente para barge-in
      // y pueden seguir publicándose en el bus global.
      
      globalEventBus.publish({ type: 'AUDIO_INPUT_STARTED' });

    } catch (error) {
      console.error('[AudioInputManager] Error al iniciar el micrófono:', error);
      globalEventBus.publish({ type: 'AUDIO_INPUT_ERROR', payload: { message: 'Failed to start microphone.' } });
      this.audioSubscribers.clear(); // Limpiar suscriptores en caso de error
    }
  }

  private stopMicrophone(): void {
    if (!this.stream) return;

    console.log('[AudioInputManager] Deteniendo captura de micrófono (0 suscriptores)...');
    this.stream.getTracks().forEach(track => track.stop());
    this.audioContext?.close().catch(console.error);
    this.workletNode?.port.close();

    this.stream = null;
    this.audioContext = null;
    this.workletNode = null;
    
    globalEventBus.publish({ type: 'AUDIO_INPUT_STOPPED' });
  }
}

export const audioInputManager = AudioInputManager.getInstance();

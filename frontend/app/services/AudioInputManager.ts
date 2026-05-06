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
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private workletNode: AudioWorkletNode | null = null;
  
  // --- Estado interno de VAD ---
  private readonly VAD_RMS_THRESHOLD = 0.02; // Sensibilidad (0.0 a 1.0)
  private readonly VAD_SILENCE_DURATION_MS = 800; // MS de silencio para terminar turno
  private isSpeaking = false;
  private silenceStartTimestamp: number | null = null;

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

  private processVAD(pcmData: Int16Array) {
    // 1. Calcular RMS para obtener el nivel de volumen
    let sumOfSquares = 0;
    for (let i = 0; i < pcmData.length; i++) {
      // Normalizamos el valor de Int16 (-32768 a 32767) al rango -1.0 a 1.0
      const normalizedValue = pcmData[i] / 32768.0;
      sumOfSquares += normalizedValue * normalizedValue;
    }
    const rms = Math.sqrt(sumOfSquares / pcmData.length);

    // 2. Despachar eventos VAD a nivel de aplicación (EventBus)
    const now = Date.now();

    if (rms > this.VAD_RMS_THRESHOLD) {
      if (!this.isSpeaking) {
        this.isSpeaking = true;
        // Evento crítico para cancelar el habla de la IA (Barge-in)
        globalEventBus.publish({ type: 'VAD_SPEECH_DETECTED' });
      }
      // Si el usuario está hablando, reseteamos el temporizador de silencio
      this.silenceStartTimestamp = null;
    } else {
      if (this.isSpeaking) {
        if (!this.silenceStartTimestamp) {
          this.silenceStartTimestamp = now;
        } else if (now - this.silenceStartTimestamp > this.VAD_SILENCE_DURATION_MS) {
          // El silencio se mantuvo el tiempo suficiente, el usuario terminó de hablar
          this.isSpeaking = false;
          this.silenceStartTimestamp = null;
          globalEventBus.publish({ type: 'VAD_SILENCE_DETECTED' });
        }
      }
    }
    
    // (Opcional) Podemos publicar el volumen si necesitamos visualizaciones globales UI
    // globalEventBus.publish({ type: 'AUDIO_VOLUME', payload: { rms } });
  }

  private async startMicrophone(): Promise<void> {
    if (this.stream) return;

    console.log('[AudioInputManager] Iniciando captura de micrófono...');
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 16000 // Aseguramos un sample rate estable compatible
      });
      
      // Manejar el autoplay policy (algunos navegadores inician suspendidos)
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }
      
      this.sourceNode = this.audioContext.createMediaStreamSource(this.stream);
      
      // Cargar el worklet del thread paralelo de audio
      await this.audioContext.audioWorklet.addModule('/audio-processor.js');
      this.workletNode = new AudioWorkletNode(this.audioContext, 'audio-processor');
      
      // Conectar el nodo de origen al worklet. No lo conectamos a 'destination' para evitar eco.
      this.sourceNode.connect(this.workletNode);
      
      // Conexión del despacho directo
      this.workletNode.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
        const pcmData = new Int16Array(event.data);
        console.log(`[AudioInputManager] Chunk de audio recibido, size: ${pcmData.length}`); // <-- LOG
        
        // 1. Publicar a los suscriptores activos (los orchestrators de sesión)
        this.audioSubscribers.forEach(callback => callback(pcmData));

        // 2. Procesar el análisis de actividad de voz y barge-in
        this.processVAD(pcmData);
      };
      
      this.isSpeaking = false;
      this.silenceStartTimestamp = null;
      
      console.log('[AudioInputManager] Micrófono iniciado y worklet conectado.'); // <-- LOG
      globalEventBus.publish({ type: 'AUDIO_INPUT_STARTED' });

    } catch (error) {
      console.error('[AudioInputManager] Error al iniciar el micrófono:', error);
      globalEventBus.publish({ type: 'AUDIO_INPUT_ERROR', payload: { message: 'Failed to start microphone.' } });
      this.audioSubscribers.clear(); // Limpiar suscriptores en caso de error
    }
  }

  private stopMicrophone(): void {
    if (!this.stream) return;

    console.log('[AudioInputManager] Deteniendo captura de micrófono...');
    
    // Desconectar nodos
    this.sourceNode?.disconnect();
    this.workletNode?.disconnect();
    this.workletNode?.port.close();

    // Detener pistas del Stream
    this.stream.getTracks().forEach(track => track.stop());
    
    // Cerrar el contexto de audio
    this.audioContext?.close().catch(console.error);

    this.stream = null;
    this.audioContext = null;
    this.sourceNode = null;
    this.workletNode = null;
    this.isSpeaking = false;
    this.silenceStartTimestamp = null;
    
    globalEventBus.publish({ type: 'AUDIO_INPUT_STOPPED' });
  }
}

export const audioInputManager = AudioInputManager.getInstance();

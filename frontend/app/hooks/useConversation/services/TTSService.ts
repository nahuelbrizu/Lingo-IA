// frontend/app/hooks/useConversation/services/TTSService.ts

import { globalEventBus } from '../../../services/EventBus';

/**
 * @class TTSService
 * @description
 * Servicio específico de una sesión para convertir texto a audio.
 * Implementa una lógica de cancelación robusta usando `generationId`.
 */
export class TTSService {
  private readonly sessionId: string;
  private cancelledGenerations: Set<string> = new Set();

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  /**
   * Inicia la generación de audio a partir de texto para una generación específica.
   * @param text - El texto a convertir.
   * @param generationId - El ID único de esta solicitud.
   */
  public async generate(text: string, generationId: string): Promise<void> {
    // Guard Check: No iniciar si la generación ya fue cancelada mientras
    // la petición estaba en cola.
    if (this.cancelledGenerations.has(generationId)) {
      return;
    }

    try {
      // Simulación de una llamada a una API de TTS en streaming
      const stream = this.mockTtsApi(text);

      for await (const chunk of stream) {
        // Guard Check en cada iteración: Si durante el streaming se cancela,
        // se detiene el procesamiento y el envío de eventos.
        if (this.cancelledGenerations.has(generationId)) {
          console.log(`[TTSService:${this.sessionId}] Streaming de TTS para ${generationId} cancelado a mitad de camino.`);
          return;
        }

        globalEventBus.publish({
          type: 'TTS_AUDIO_CHUNK_RECEIVED',
          sessionId: this.sessionId,
          generationId,
          payload: { chunk },
        } as any);
      }

      globalEventBus.publish({
        type: 'TTS_STREAM_ENDED',
        sessionId: this.sessionId,
        generationId,
      } as any);

    } catch (error) {
      // ... manejo de errores
    }
  }

  /**
   * Registra una generación como cancelada.
   * @param generationId - El ID de la generación a cancelar.
   */
  public cancel(generationId: string): void {
    console.log(`[TTSService:${this.sessionId}] Cancelando generación: ${generationId}`);
    this.cancelledGenerations.add(generationId);
  }

  // Simulación de una API de streaming
  private async * mockTtsApi(text: string): AsyncGenerator<ArrayBuffer, void, void> {
    const chunks = text.split(' ');
    for (const chunk of chunks) {
      await new Promise(resolve => setTimeout(resolve, 100)); // Simula latencia de red
      yield new ArrayBuffer(1024); // Simula un chunk de audio
    }
  }
}

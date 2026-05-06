// frontend/app/hooks/useConversation/services/LLMService.ts

import { globalEventBus } from '@/app/services/EventBus';

/**
 * @class LLMService
 * @description
 * Servicio simulado (mock) para interactuar con un modelo de lenguaje grande (LLM).
 * En una implementación real, este servicio gestionaría la conexión (ej. WebSocket)
 * con el backend que se comunica con la API del LLM.
 */
class LLMService {
  private static instance: LLMService;

  private constructor() {}

  public static getInstance(): LLMService {
    if (!LLMService.instance) {
      LLMService.instance = new LLMService();
    }
    return LLMService.instance;
  }

  /**
   * Envía un chunk de audio al backend del LLM.
   * @param sessionId - El ID de la sesión actual.
   * @param chunk - El trozo de audio en formato Int16Array.
   */
  public sendAudio(sessionId: string, chunk: Int16Array): void {
    // En una implementación real, esto enviaría el chunk a través de un WebSocket.
    // console.log(`[LLMService] Enviando audio para sesión ${sessionId}, chunk size: ${chunk.length}`);
  }

  /**
   * Notifica al backend que el usuario ha terminado de hablar para esta generación.
   * @param sessionId - El ID de la sesión.
   * @param generationId - El ID de la generación de respuesta esperada.
   */
  public sendEndOfSpeech(sessionId: string, generationId: string): void {
    console.log(`[LLMService] Fin de la voz detectado. Solicitando respuesta de IA para gen: ${generationId}`);

    // --- LÓGICA SIMULADA ---
    // Esperamos un tiempo aleatorio para simular la latencia del LLM.
    const fakeLatency = 1000 + Math.random() * 1500;
    
    setTimeout(() => {
      // Publicamos el evento de que el LLM ha terminado de "pensar" y tiene una respuesta.
      globalEventBus.publish({
        type: 'LLM_STREAM_ENDED',
        sessionId,
        generationId,
        payload: {
          fullText: 'Hola, esta es una respuesta simulada desde el servicio LLM. ¿En qué más puedo ayudarte?',
        },
      });
    }, fakeLatency);
  }

  /**
   * Cancela una solicitud al LLM.
   * @param generationId - El ID de la generación a cancelar.
   */
  public cancel(generationId: string): void {
    // En una implementación real, esto enviaría un mensaje de cancelación al backend.
    console.log(`[LLMService] Cancelando generación: ${generationId}`);
  }
}

export const llmService = LLMService.getInstance();

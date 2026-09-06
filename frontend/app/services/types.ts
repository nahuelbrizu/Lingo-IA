// frontend/app/services/types.ts

// --- Eventos ---

/**
 * Define la estructura base para todos los eventos que viajan por el EventBus global.
 * La inclusión opcional de `sessionId` permite tanto eventos globales (broadcast)
 * como eventos dirigidos a una sesión específica.
 */
export interface GlobalEvent {
  type: string;
  sessionId?: string; // Opcional para eventos de broadcast como los de audio
  generationId?: string; // Para correlacionar eventos de una misma respuesta de IA
  payload?: any;
  timestamp: number;
}

// --- Comandos ---

/**
 * Define la estructura de los comandos que los Orchestrators de sesión
 * enviarán a los servicios globales.
 */
export interface ServiceCommand {
  type: string;
  sessionId: string; // Requerido para que el servicio sepa quién lo llama
  payload?: any;
}

// frontend/app/hooks/useConversation/SessionInstance.ts

import { GlobalEvent, ISession, SessionConfig } from './types';
// En el futuro, estos se importarían y se instanciarían aquí.
// import { ConversationFSM } from './ConversationFSM';
// import { Orchestrator } from './Orchestrator';

/**
 * @class SessionInstance
 * @implements {ISession}
 * @description
 * Encapsula todo el estado y la lógica para una única conversación.
 * Es creada y gestionada exclusivamente por el SessionManager.
 */
export class SessionInstance implements ISession {
  public readonly id: string;
  public lastActivityTimestamp: number; // Añadido para el monitoreo de inactividad
  private config: SessionConfig;
  private isActive: boolean = true;

  constructor(sessionId: string, config: SessionConfig) {
    this.id = sessionId;
    this.config = config;
    this.lastActivityTimestamp = Date.now(); // Inicializar con el timestamp de creación

    console.log(`[SessionInstance:${this.id}] Creada con la configuración:`, config);
  }

  /**
   * Punto de entrada para los eventos enrutados por el SessionManager.
   * @param event - El evento global a procesar.
   */
  public handleEvent(event: GlobalEvent): void {
    if (!this.isActive) {
      return;
    }

    // Actualizar el timestamp de actividad para el garbage collector del SessionManager
    this.lastActivityTimestamp = Date.now();

    // Validación defensiva estricta contra errores de enrutamiento ("cross-talk").
    if (event.sessionId !== this.id) {
      console.error(
        `CRITICAL: [SessionInstance:${this.id}] Recibió un evento destinado a la sesión ${event.sessionId}. ` +
        `Esto es un bug de enrutamiento. Evento: ${event.type}.`
      );
      return;
    }
    
    // this.orchestrator.processEvent(event);
  }

  /**
   * Libera todos los recursos asociados a esta sesión para prevenir memory leaks.
   * Es invocado por el SessionManager antes de que la sesión sea eliminada del registro.
   */
  public cleanup(): void {
    if (!this.isActive) return; // Evitar limpieza múltiple.

    console.log(`[SessionInstance:${this.id}] Iniciando limpieza de recursos...`);

    // El orquestador se encargaría de cancelar todos los servicios activos (WebSocket, Audio, TTS).
    // this.orchestrator.cleanup();

    this.isActive = false;
    console.log(`[SessionInstance:${this.id}] Limpieza completada. La sesión está inactiva.`);
  }
}

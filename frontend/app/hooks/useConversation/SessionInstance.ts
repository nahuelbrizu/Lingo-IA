// frontend/app/hooks/useConversation/SessionInstance.ts

import { GlobalEvent, ISession, SessionConfig } from './types';
import { SessionOrchestrator } from './services/SessionOrchestrator';

/**
 * @class SessionInstance
 * @implements {ISession}
 * @description
 * Encapsula todo el estado y la lógica para una única conversación.
 * Es creada y gestionada exclusivamente por el SessionManager.
 */
export class SessionInstance implements ISession {
  public readonly id: string;
  public lastActivityTimestamp: number;
  private config: SessionConfig;
  private isActive: boolean = true;
  private orchestrator: SessionOrchestrator;

  constructor(sessionId: string, config: SessionConfig) {
    this.id = sessionId;
    this.config = config;
    this.lastActivityTimestamp = Date.now();
    this.orchestrator = new SessionOrchestrator(sessionId);

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

    this.lastActivityTimestamp = Date.now();

    // Validación defensiva contra errores de enrutamiento
    if (event.sessionId && event.sessionId !== this.id) {
      console.error(
        `[SessionInstance:${this.id}] Recibió un evento destinado a la sesión ${event.sessionId}. Evento: ${event.type}.`
      );
      return;
    }
    
    // Pasar el evento al orquestador para que maneje la lógica
    this.orchestrator.processEvent(event);
  }

  /**
   * Libera todos los recursos asociados a esta sesión.
   */
  public cleanup(): void {
    if (!this.isActive) return;

    console.log(`[SessionInstance:${this.id}] Iniciando limpieza de recursos...`);

    this.orchestrator.cleanup();

    this.isActive = false;
    console.log(`[SessionInstance:${this.id}] Limpieza completada.`);
  }
}

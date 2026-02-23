// frontend/app/hooks/useConversation/SessionManager.ts

import { v4 as uuidv4 } from 'uuid';
import { SessionInstance } from './SessionInstance';
import { GlobalEvent, ISession, SessionConfig } from './types';
import { audioInputManager } from '../../services/AudioInputManager';
import { audioOutputManager } from '../../services/AudioOutputManager';
import { globalEventBus } from '../../services/EventBus'; // Asumiendo que el EventBus está aquí

// --- Constantes de Inactividad ---
const ACTIVITY_CHECK_INTERVAL_MS = 60 * 1000; // Cada 1 minuto
const SESSION_INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutos de inactividad

/**
 * @class SessionManager
 * @description
 * Singleton global que actúa como un Registry y Factory para todas las
 * instancias de sesión de conversación. Es el único punto de entrada para
 * gestionar el ciclo de vida, los recursos compartidos y la limpieza automática
 * de sesiones inactivas.
 */
class SessionManager {
  private static instance: SessionManager;
  private sessions: Map<string, ISession> = new Map();
  private activeListeningSessionId: string | null = null;
  private activityCheckInterval: NodeJS.Timeout | null = null;

  private constructor() {
    this.subscribeToGlobalEvents();
    this.startActivityMonitor();
  }

  public static getInstance(): SessionManager {
    if (!SessionManager.instance) {
      SessionManager.instance = new SessionManager();
    }
    return SessionManager.instance;
  }

  /**
   * Se suscribe al EventBus global para escuchar todos los eventos del sistema
   * y enrutarlos a la instancia de sesión correcta.
   */
  private subscribeToGlobalEvents(): void {
    globalEventBus.subscribe('SessionManager', (event: GlobalEvent) => {
      // Enrutar eventos con sessionId a la sesión correcta
      if (event.sessionId && this.sessions.has(event.sessionId)) {
        this.getSession(event.sessionId)?.handleEvent(event);
      } else if (event.sessionId) {
        // Si un evento dirigido a una sesión llega, pero la sesión no existe (ya destruida),
        // simplemente lo ignoramos. Esto es un fail-safe.
        // console.warn(`[SessionManager] Evento para sesión inexistente ${event.sessionId}: ${event.type}. Descartado.`);
      }
      // Eventos sin sessionId (ej. VAD_SPEECH_DETECTED) serían gestionados directamente por el orchestrator
      // o reenviados a todas las sesiones en un flujo de broadcast controlado (fuera del scope de este enrutador básico).
    });
    console.log('[SessionManager] Singleton inicializado y listo para enrutar eventos.');
  }

  /**
   * Inicia el monitoreo periódico de sesiones inactivas para limpiarlas automáticamente.
   */
  private startActivityMonitor(): void {
    if (this.activityCheckInterval) return; // Ya está activo

    this.activityCheckInterval = setInterval(() => {
      const now = Date.now();
      this.sessions.forEach((session, sessionId) => {
        if (now - session.lastActivityTimestamp > SESSION_INACTIVITY_TIMEOUT_MS) {
          console.log(`[SessionManager] Sesión ${sessionId} inactiva por mucho tiempo. Destruyendo automáticamente.`);
          this.destroySession(sessionId); // Usamos el método de destrucción que limpia todos los recursos
        }
      });
    }, ACTIVITY_CHECK_INTERVAL_MS);
    console.log(`[SessionManager] Monitor de actividad iniciado (cada ${ACTIVITY_CHECK_INTERVAL_MS / 1000}s).`);
  }

  /**
   * Detiene el monitoreo de actividad. Útil si el SessionManager tuviera un ciclo de vida propio.
   */
  public stopActivityMonitor(): void {
    if (this.activityCheckInterval) {
      clearInterval(this.activityCheckInterval);
      this.activityCheckInterval = null;
      console.log('[SessionManager] Monitor de actividad detenido.');
    }
  }

  // ... MÉTODOS DE GESTIÓN DE FOCO ...

  // ... MÉTODOS DE CICLO DE VIDA (createSession, getSession, destroySession, getActiveSessionCount) ...
}

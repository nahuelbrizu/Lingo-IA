// frontend/app/hooks/useConversation/SessionManager.ts

import { v4 as uuidv4 } from 'uuid';
import { SessionInstance } from './SessionInstance';
import { GlobalEvent, ISession, SessionConfig } from './types';
import { audioInputManager } from '../../services/AudioInputManager';
import { audioOutputManager } from '../../services/AudioOutputManager';
import { globalEventBus } from '../../services/EventBus';

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
  private activityCheckInterval: NodeJS.Timeout | null = null;
  // Foco de Audio (en una implementación más avanzada, no se usa aquí)
  // private activeListeningSessionId: string | null = null;

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

  private subscribeToGlobalEvents(): void {
    globalEventBus.subscribe('SessionManager', (event: GlobalEvent) => {
      // Enrutar eventos con sessionId a la sesión correcta
      if (event.sessionId && this.sessions.has(event.sessionId)) {
        this.getSession(event.sessionId)?.handleEvent(event);
      } else if (!event.sessionId) {
        // Eventos de broadcast (como VAD) se envían a todas las sesiones activas
        this.sessions.forEach(session => session.handleEvent(event));
      }
    });
    console.log('[SessionManager] Singleton inicializado y listo para enrutar eventos.');
  }
  
  private startActivityMonitor(): void {
    if (this.activityCheckInterval) return;

    this.activityCheckInterval = setInterval(() => {
      const now = Date.now();
      this.sessions.forEach((session, sessionId) => {
        if (now - session.lastActivityTimestamp > SESSION_INACTIVITY_TIMEOUT_MS) {
          console.log(`[SessionManager] Sesión ${sessionId} inactiva. Destruyendo automáticamente.`);
          this.destroySession(sessionId);
        }
      });
    }, ACTIVITY_CHECK_INTERVAL_MS);
  }
  
  public stopActivityMonitor(): void {
    if (this.activityCheckInterval) {
      clearInterval(this.activityCheckInterval);
      this.activityCheckInterval = null;
    }
  }

  // ==================================================================
  // MÉTODOS DE CICLO DE VIDA (API Pública)
  // ==================================================================

  /**
   * Crea, registra y devuelve una nueva instancia de sesión.
   * @param config - La configuración para la nueva sesión.
   * @returns La instancia de ISession creada.
   */
  public createSession(config: SessionConfig): ISession {
    const sessionId = uuidv4();
    const newSession = new SessionInstance(sessionId, config);
    this.sessions.set(sessionId, newSession);
    console.log(`[SessionManager] Nueva sesión creada: ${sessionId}. Sesiones activas: ${this.sessions.size}`);
    
    // Aquí es donde se podría gestionar el "foco" del micrófono si solo una sesión puede escuchar a la vez.
    // Por ahora, AudioInputManager lo gestiona con un contador de referencias.
    
    return newSession;
  }

  /**
   * Obtiene una sesión por su ID.
   * @param sessionId - El ID de la sesión.
   * @returns La instancia de ISession o undefined si no se encuentra.
   */
  public getSession(sessionId: string): ISession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Destruye una sesión, liberando todos sus recursos.
   * @param sessionId - El ID de la sesión a destruir.
   */
  public destroySession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.cleanup(); // Fundamental para liberar recursos internos de la sesión
      this.sessions.delete(sessionId);
      console.log(`[SessionManager] Sesión destruida: ${sessionId}. Sesiones activas: ${this.sessions.size}`);
      
      // Detener cualquier reproducción de audio que pudiera haber quedado de esa sesión
      audioOutputManager.stop(sessionId);
    }
  }

  /**
   * Devuelve el número de sesiones activas.
   * @returns El número de sesiones.
   */
  public getActiveSessionCount(): number {
    return this.sessions.size;
  }
}

// Exportar la instancia singleton para ser usada en toda la aplicación
export const sessionManager = SessionManager.getInstance();

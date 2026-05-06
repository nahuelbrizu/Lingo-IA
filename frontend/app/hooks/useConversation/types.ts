// frontend/app/hooks/useConversation/types.ts

// ==================================================================
// 1. TIPOS DE EVENTOS
// ==================================================================

/**
 * @description
 * La estructura base para todos los eventos que viajan a través del sistema.
 */
export interface BaseEvent {
  type: string;
  payload?: any;
}

/**
 * @description
 * Un evento global que viaja a través del EventBus. Incluye metadatos
 * como el timestamp y el ID de la sesión de origen.
 */
export interface GlobalEvent extends BaseEvent {
  timestamp: number;
  sessionId?: string; // Es opcional para eventos de broadcast (ej. VAD)
  generationId?: string; // Para correlacionar eventos de una misma respuesta de IA
}

// --- Eventos Específicos (Ejemplos) ---
// Aquí se definirían los tipos concretos para cada evento del sistema
// para aprovechar el sistema de tipos de TypeScript.

export interface VadSpeechDetectedEvent extends GlobalEvent {
  type: 'VAD_SPEECH_DETECTED';
}

export interface LlmStreamEndedEvent extends GlobalEvent {
  type: 'LLM_STREAM_ENDED';
  payload: { fullText: string };
  generationId: string;
}

export interface TtsAudioChunkEvent extends GlobalEvent {
  type: 'TTS_AUDIO_CHUNK_RECEIVED';
  payload: { chunk: ArrayBuffer };
  generationId: string;
}

export interface AudioPlaybackFinishedEvent extends GlobalEvent {
  type: 'AUDIO_PLAYBACK_FINISHED';
  generationId: string;
}


// ==================================================================
// 2. TIPOS DE COMANDOS (para comunicación interna)
// ==================================================================

export type CommandType =
  | 'CMD_START_AUDIO_CAPTURE'
  | 'CMD_STOP_AUDIO_CAPTURE'
  | 'CMD_SEND_END_OF_SPEECH_TO_LLM'
  | 'CMD_GENERATE_SPEECH_FROM_TEXT'
  | 'CMD_CANCEL_SPEECH_GENERATION'
  | 'CMD_PLAY_AUDIO_CHUNK'
  | 'CMD_STOP_AUDIO_PLAYBACK';

export interface BaseCommand {
    type: CommandType;
    payload?: any;
}


// ==================================================================
// 3. TIPOS DE SESIÓN
// ==================================================================

/**
 * @description
 * Define la configuración inicial para una nueva sesión de conversación.
 * Se pueden añadir aquí parámetros como el idioma, modelo de IA, etc.
 */
export interface SessionConfig {
  // Por ahora vacío, pero podría contener:
  // language?: 'es-ES' | 'en-US';
  // aiModel?: 'gemini-1.5-pro' | 'gpt-4o';
}

/**
 * @description
 * La interfaz pública que todas las instancias de sesión deben implementar.
 * Define el contrato que el SessionManager y la UI esperan.
 */
export interface ISession {
  readonly id: string;
  lastActivityTimestamp: number;

  /**
   * Procesa un evento del sistema.
   * @param event - El evento a procesar.
   */
  handleEvent(event: GlobalEvent): void;

  /**
   * Libera todos los recursos de la sesión.
   */
  cleanup(): void;
}

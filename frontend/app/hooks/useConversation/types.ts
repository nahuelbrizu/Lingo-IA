// frontend/app/hooks/useConversation/types.ts

// ... (contenido existente de BaseEvent, eventos específicos, SessionConfig, ISession)

// Añadimos la definición explícita de los nuevos eventos y comandos
// para un tipado más estricto y autocompletado.

// --- Eventos Específicos ---

export interface LlmStreamEndedEvent extends BaseEvent {
  type: 'LLM_STREAM_ENDED';
  payload: { fullText: string };
  generationId: string;
}

export interface TtsAudioChunkEvent extends BaseEvent {
  type: 'TTS_AUDIO_CHUNK_RECEIVED';
  payload: { chunk: ArrayBuffer };
  generationId: string;
}

export interface AudioPlaybackFinishedEvent extends BaseEvent {
  type: 'AUDIO_PLAYBACK_FINISHED';
  generationId: string;
}

// ... otros eventos

// --- Comandos Específicos ---

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

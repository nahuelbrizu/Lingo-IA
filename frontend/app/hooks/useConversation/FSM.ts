// frontend/app/hooks/useConversation/FSM.ts

import { GlobalEvent } from './types';

// 1. DEFINICIÓN DE ESTADOS Y COMANDOS
// =================================================

export type ConversationState =
  | 'idle'
  | 'listening'
  | 'processing'         // Esperando la respuesta completa del LLM
  | 'generating_speech'  // LLM terminó, esperando el primer chunk de audio del TTS
  | 'ai_speaking';       // Reproduciendo audio del TTS

export interface FSMState {
  status: ConversationState;
  // ... otros datos de estado si fueran necesarios
}

export type Command =
  // Comandos existentes
  | { type: 'CMD_SEND_END_OF_SPEECH_TO_LLM' }
  | { type: 'CMD_START_AUDIO_CAPTURE' }
  | { type: 'CMD_STOP_AUDIO_CAPTURE' }
  // Comandos nuevos para TTS
  | { type: 'CMD_GENERATE_SPEECH_FROM_TEXT', payload: { text: string, generationId: string } }
  | { type: 'CMD_PLAY_AUDIO_CHUNK', payload: { chunk: ArrayBuffer, generationId: string } }
  | { type: 'CMD_STOP_AUDIO_PLAYBACK' }
  | { type: 'CMD_CANCEL_SPEECH_GENERATION', payload: { generationId: string } };
  // ... otros comandos

export interface FSMResult {
  newState: FSMState;
  commands: Command[];
}

// 2. LA FSM COMO REDUCER PURO
// =================================================

const initialState: FSMState = { status: 'idle' };

export function fsmReducer(state: FSMState = initialState, event: GlobalEvent): FSMResult {
  const { status } = state;
  const commands: Command[] = [];

  switch (status) {
    case 'idle':
      if (event.type === 'USER_REQUESTED_START_SESSION') {
        return {
          newState: { status: 'listening' },
          commands: [{ type: 'CMD_START_AUDIO_CAPTURE' }],
        };
      }
      break;

    case 'listening':
      if (event.type === 'VAD_SILENCE_DETECTED') {
        return {
          newState: { status: 'processing' },
          commands: [{ type: 'CMD_SEND_END_OF_SPEECH_TO_LLM' }],
        };
      }
      if (event.type === 'SYSTEM_REQUEST_CANCEL_LISTENING' || event.type === 'USER_REQUESTED_STOP_SESSION') {
        return {
          newState: { status: 'idle' },
          commands: [{ type: 'CMD_STOP_AUDIO_CAPTURE' }],
        };
      }
      break;

    case 'processing':
      if (event.type === 'LLM_STREAM_ENDED') {
        return {
          newState: { status: 'generating_speech' },
          commands: [{
            type: 'CMD_GENERATE_SPEECH_FROM_TEXT',
            payload: { text: event.payload.fullText, generationId: event.generationId! }
          }],
        };
      }
      break;

    case 'generating_speech':
      if (event.type === 'TTS_AUDIO_CHUNK_RECEIVED') {
        return {
          newState: { status: 'ai_speaking' },
          commands: [{
            type: 'CMD_PLAY_AUDIO_CHUNK',
            payload: { chunk: event.payload.chunk, generationId: event.generationId! }
          }],
        };
      }
      break;

    case 'ai_speaking':
      if (event.type === 'TTS_AUDIO_CHUNK_RECEIVED') {
        // Nos mantenemos en el mismo estado, solo emitimos el comando para reproducir
        return {
          newState: state,
          commands: [{
            type: 'CMD_PLAY_AUDIO_CHUNK',
            payload: { chunk: event.payload.chunk, generationId: event.generationId! }
          }],
        };
      }
      if (event.type === 'AUDIO_PLAYBACK_FINISHED') {
        // El audio ha terminado de reproducirse, volvemos a escuchar
        return {
          newState: { status: 'listening' },
          commands: [], // No se necesita iniciar captura, ya debería estar activa
        };
      }
      break;
  }
  
  // --- Manejo Global de Barge-in y Stop ---
  if (event.type === 'VAD_SPEECH_DETECTED' && (status === 'ai_speaking' || status === 'generating_speech')) {
    return {
      newState: { status: 'listening' },
      commands: [
        { type: 'CMD_STOP_AUDIO_PLAYBACK' },
        { type: 'CMD_CANCEL_SPEECH_GENERATION', payload: { generationId: event.generationId! } }
      ],
    };
  }
  
  if (event.type === 'USER_REQUESTED_STOP_SESSION') {
    return {
      newState: { status: 'idle' },
      commands: [
        { type: 'CMD_STOP_AUDIO_CAPTURE' },
        { type: 'CMD_STOP_AUDIO_PLAYBACK' },
        { type: 'CMD_CANCEL_SPEECH_GENERATION', payload: { generationId: event.generationId! } }
      ],
    };
  }

  // Si no hay transición, devolver el estado actual sin comandos
  return { newState: state, commands: [] };
}

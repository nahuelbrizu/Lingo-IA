// frontend/app/hooks/useConversation/FSM.test.ts

import { describe, it, expect } from 'vitest';
import { fsmReducer, FSMState } from './FSM';
import { GlobalEvent } from './types';

describe('Conversation FSM Reducer', () => {
  it('should transition from idle to listening on user request', () => {
    const initialState: FSMState = { status: 'idle' };
    const event: GlobalEvent = { type: 'USER_REQUESTED_START_SESSION', sessionId: 's1', timestamp: Date.now() };
    
    const { newState, commands } = fsmReducer(initialState, event);

    expect(newState.status).toBe('listening');
    expect(commands).toEqual([{ type: 'CMD_START_AUDIO_CAPTURE' }]);
  });

  it('should transition from processing to generating_speech when LLM ends', () => {
    const initialState: FSMState = { status: 'processing' };
    const event: GlobalEvent = {
      type: 'LLM_STREAM_ENDED',
      sessionId: 's1',
      generationId: 'g1',
      payload: { fullText: 'Hola mundo' },
      timestamp: Date.now()
    };
    
    const { newState, commands } = fsmReducer(initialState, event);

    expect(newState.status).toBe('generating_speech');
    expect(commands).toEqual([{
      type: 'CMD_GENERATE_SPEECH_FROM_TEXT',
      payload: { text: 'Hola mundo', generationId: 'g1' }
    }]);
  });

  it('should transition from generating_speech to ai_speaking on first TTS chunk', () => {
    const initialState: FSMState = { status: 'generating_speech' };
    const event: GlobalEvent = {
      type: 'TTS_AUDIO_CHUNK_RECEIVED',
      sessionId: 's1',
      generationId: 'g1',
      payload: { chunk: new ArrayBuffer(8) },
      timestamp: Date.now()
    };

    const { newState, commands } = fsmReducer(initialState, event);

    expect(newState.status).toBe('ai_speaking');
    expect(commands[0].type).toBe('CMD_PLAY_AUDIO_CHUNK');
  });

  it('should transition from ai_speaking to listening when playback finishes', () => {
    const initialState: FSMState = { status: 'ai_speaking' };
    const event: GlobalEvent = {
      type: 'AUDIO_PLAYBACK_FINISHED',
      sessionId: 's1',
      generationId: 'g1',
      timestamp: Date.now()
    };

    const { newState, commands } = fsmReducer(initialState, event);

    expect(newState.status).toBe('listening');
    expect(commands).toHaveLength(0);
  });

  it('should handle barge-in correctly when ai_speaking', () => {
    const initialState: FSMState = { status: 'ai_speaking' };
    const event: GlobalEvent = {
      type: 'VAD_SPEECH_DETECTED',
      sessionId: 's1',
      generationId: 'g1',
      timestamp: Date.now()
    };
    
    const { newState, commands } = fsmReducer(initialState, event);

    expect(newState.status).toBe('listening');
    expect(commands).toContainEqual({ type: 'CMD_STOP_AUDIO_PLAYBACK' });
    expect(commands).toContainEqual({ type: 'CMD_CANCEL_SPEECH_GENERATION', payload: { generationId: 'g1' } });
  });
});

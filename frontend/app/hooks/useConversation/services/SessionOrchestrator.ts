// frontend/app/hooks/useConversation/services/SessionOrchestrator.ts

import { v4 as uuidv4 } from 'uuid';
import { GlobalEvent } from '../types';
import { fsmReducer, FSMState, Command } from '../FSM';
import { ttsService } from './TTSService';
import { audioOutputManager } from '../../../services/AudioOutputManager';
import { metricsCollector } from '../../../services/__tests__/MetricsCollector'; // Importar colector

const EVENTS_REQUIRING_GENERATION_ID: Set<string> = new Set([
  'LLM_DELTA_RECEIVED', 'LLM_STREAM_ENDED', 'TTS_AUDIO_CHUNK_RECEIVED',
  'TTS_STREAM_ENDED', 'AUDIO_PLAYBACK_FINISHED',
]);

export class SessionOrchestrator {
  private readonly sessionId: string;
  private state: FSMState;
  public activeGenerationId: string | null = null; // Hacer público para el mock de test
  public tombstone: Set<string> = new Set(); // Hacer público para el mock de test

  constructor(sessionId: string) {
    this.sessionId = sessionId;
    // @ts-ignore
    const { newState } = fsmReducer(undefined, { type: 'INIT' });
    this.state = newState;
  }

  public processEvent(event: GlobalEvent): void {
    if (event.type === 'VAD_SPEECH_DETECTED' && this.activeGenerationId) {
      metricsCollector.markBargeInStart(this.activeGenerationId);
    }
    
    if (!this.isValidGeneration(event)) return;

    const { newState, commands } = fsmReducer(this.state, event);
    this.state = newState;

    if (commands.length > 0) {
      this.executeCommands(commands);
    }
  }
  
  private executeCommands(commands: Command[]): void {
    for (const command of commands) {
      // ... (código existente del switch)
      if (command.type === 'CMD_STOP_AUDIO_PLAYBACK' || command.type === 'CMD_CANCEL_SPEECH_GENERATION') {
        const cancelledId = this.invalidateCurrentGeneration();
        if (cancelledId) {
          if (command.type === 'CMD_CANCEL_SPEECH_GENERATION') {
            (command.payload as any).generationId = cancelledId;
          }
        }
      }

      // Ejecución real
      switch (command.type) {
        case 'CMD_STOP_AUDIO_PLAYBACK':
          audioOutputManager.stop(this.sessionId);
          break;
        case 'CMD_CANCEL_SPEECH_GENERATION':
          // ttsService.cancel((command.payload as any).generationId);
          break;
        // ... otros comandos
      }
    }
  }

  private invalidateCurrentGeneration(): string | null {
    const cancelledId = this.activeGenerationId;
    if (cancelledId) {
      metricsCollector.mark(cancelledId, 'invalidation');
      this.tombstone.add(cancelledId);
      this.activeGenerationId = null;
      setTimeout(() => this.tombstone.delete(cancelledId), 30000);
    }
    return cancelledId;
  }

  public isValidGeneration(event: GlobalEvent): boolean {
    // ... (código de validación estricta de la respuesta anterior)
    return true; // Simplificado para este ejemplo
  }

  public cleanup(): void {
    this.invalidateCurrentGeneration();
    audioOutputManager.stop(this.sessionId);
  }
}

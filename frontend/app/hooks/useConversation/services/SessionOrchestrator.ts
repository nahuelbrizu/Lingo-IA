// frontend/app/hooks/useConversation/services/SessionOrchestrator.ts

import { v4 as uuidv4 } from 'uuid';
import { GlobalEvent, Command } from '../types';
import { fsmReducer, FSMState } from '../FSM';
import { TTSService } from './TTSService';
import { audioOutputManager } from '../../../services/AudioOutputManager';
import { audioInputManager } from '../../../services/AudioInputManager';
import { llmService } from './LLMService'; // Asumiendo un servicio para el LLM

const EVENTS_REQUIRING_GENERATION_ID: Set<string> = new Set([
  'LLM_STREAM_ENDED', 'TTS_AUDIO_CHUNK_RECEIVED', 'AUDIO_PLAYBACK_FINISHED',
]);

export class SessionOrchestrator {
  private readonly sessionId: string;
  private state: FSMState;
  private ttsService: TTSService;
  private activeGenerationId: string | null = null;
  private tombstone: Set<string> = new Set();

  constructor(sessionId: string) {
    this.sessionId = sessionId;
    this.ttsService = new TTSService(sessionId);
    const { newState } = fsmReducer(undefined, { type: 'INIT' } as any);
    this.state = newState;
  }

  public processEvent(event: GlobalEvent): void {
    if (!this.isValidGeneration(event)) {
      console.warn(`[Orchestrator] Evento ${event.type} de generación obsoleta (${event.generationId}) ignorado.`);
      return;
    }

    const { newState, commands } = fsmReducer(this.state, event);
    this.state = newState;

    if (commands.length > 0) {
      this.executeCommands(commands);
    }
  }

  private executeCommands(commands: Command[]): void {
    for (const command of commands) {
      let cmd = command; // Usar una variable mutable

      // Lógica para invalidar generación antes de la cancelación
      if (cmd.type === 'CMD_STOP_AUDIO_PLAYBACK' || cmd.type === 'CMD_CANCEL_SPEECH_GENERATION') {
        const cancelledId = this.invalidateCurrentGeneration();
        if (cancelledId && cmd.type === 'CMD_CANCEL_SPEECH_GENERATION') {
          // Inyectar el ID cancelado en el payload del comando
          cmd.payload = { ...cmd.payload, generationId: cancelledId };
        }
      }
      
      // Lógica para crear una nueva generación
      if (cmd.type === 'CMD_SEND_END_OF_SPEECH_TO_LLM') {
        this.activeGenerationId = uuidv4();
      }

      // Ejecución real de comandos
      switch (cmd.type) {
        case 'CMD_START_AUDIO_CAPTURE':
          console.log(`[Orchestrator:${this.sessionId}] Ejecutando CMD_START_AUDIO_CAPTURE`); // <-- LOG
          audioInputManager.subscribe(this.sessionId, (chunk) => {
            llmService.sendAudio(this.sessionId, chunk);
          });
          break;

        case 'CMD_STOP_AUDIO_CAPTURE':
          audioInputManager.unsubscribe(this.sessionId);
          break;

        case 'CMD_SEND_END_OF_SPEECH_TO_LLM':
          if (this.activeGenerationId) {
            llmService.sendEndOfSpeech(this.sessionId, this.activeGenerationId);
          }
          break;

        case 'CMD_GENERATE_SPEECH_FROM_TEXT':
          this.ttsService.generate(cmd.payload.text, cmd.payload.generationId);
          break;

        case 'CMD_PLAY_AUDIO_CHUNK':
          audioOutputManager.play({
            chunk: cmd.payload.chunk,
            sessionId: this.sessionId,
            generationId: cmd.payload.generationId,
          });
          break;

        case 'CMD_STOP_AUDIO_PLAYBACK':
          audioOutputManager.stop(this.sessionId);
          break;
          
        case 'CMD_CANCEL_SPEECH_GENERATION':
          if (cmd.payload.generationId) {
            this.ttsService.cancel(cmd.payload.generationId);
          }
          break;
      }
    }
  }

  private invalidateCurrentGeneration(): string | null {
    const cancelledId = this.activeGenerationId;
    if (cancelledId) {
      this.tombstone.add(cancelledId);
      this.activeGenerationId = null;
      // Limpiar el tombstone después de un tiempo para evitar que crezca indefinidamente
      setTimeout(() => this.tombstone.delete(cancelledId), 30000);
    }
    return cancelledId;
  }

  private isValidGeneration(event: GlobalEvent): boolean {
    if (EVENTS_REQUIRING_GENERATION_ID.has(event.type)) {
      if (!event.generationId || this.tombstone.has(event.generationId)) {
        return false;
      }
      if (this.activeGenerationId && event.generationId !== this.activeGenerationId) {
        return false;
      }
    }
    return true;
  }

  public cleanup(): void {
    this.invalidateCurrentGeneration();
    audioInputManager.unsubscribe(this.sessionId);
    audioOutputManager.stop(this.sessionId);
  }
}

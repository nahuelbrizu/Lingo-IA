// frontend/app/hooks/useConversation/services/__tests__/Fuzz.test.ts

import { vi, describe, it, expect, beforeEach } from 'vitest';
import { SessionOrchestrator } from '../SessionOrchestrator';
import { generateFuzzEvent } from './Fuzzing.engine';
import { InvariantChecker, InvariantViolation } from './Fuzzing.invariants';
import { GlobalEvent } from '../../types';

// Mockear todas las dependencias externas del Orchestrator
vi.mock('../../../services/AudioInputManager');
vi.mock('../../../services/AudioOutputManager');
vi.mock('./TTSService');
vi.mock('./LLMService');

// --- CONFIGURACIÓN DEL FUZZER ---
const FUZZ_ITERATIONS = 10000;
const EVENTS_PER_ITERATION = 50;

describe('Fuzz Test: SessionOrchestrator State Consistency', () => {

  it(`should maintain all invariants over ${FUZZ_ITERATIONS} random sequences`, () => {
    for (let i = 0; i < FUZZ_ITERATIONS; i++) {
      const sessionId = `fuzz-session-${i}`;
      const orchestrator = new SessionOrchestrator(sessionId);
      const invariantChecker = new InvariantChecker(orchestrator);
      
      const eventSequence: GlobalEvent[] = [];
      const previousGenerationIds: string[] = [];

      for (let j = 0; j < EVENTS_PER_ITERATION; j++) {
        // Generar un evento aleatorio basado en el estado actual
        const activeGenId = orchestrator['activeGenerationId'];
        const fuzzEvent = generateFuzzEvent(sessionId, activeGenId, previousGenerationIds);
        eventSequence.push(fuzzEvent);
        
        // Antes de procesar, si el ID activo está por cambiar, lo guardamos.
        if (fuzzEvent.type === 'VAD_SPEECH_DETECTED' && activeGenId) {
            previousGenerationIds.push(activeGenId);
        }

        // Procesar el evento
        orchestrator.processEvent(fuzzEvent);

        // Comprobar invariantes después de cada evento
        const violations = invariantChecker.check();

        if (violations.length > 0) {
          // --- ¡FALLO ENCONTRADO! ---
          console.error(`FUZZER: Invariant violation found on iteration ${i}, event #${j + 1}`);
          console.error('Sequence of events that caused the failure:');
          console.log(JSON.stringify(eventSequence, null, 2));
          console.error('Violations:');
          console.log(JSON.stringify(violations, null, 2));
          
          // Fallar el test inmediatamente y mostrar la información
          expect(violations).toEqual([]);
        }
      }
    }
  }, 60000); // Timeout largo para el test de fuzzing
});

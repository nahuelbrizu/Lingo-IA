// frontend/app/hooks/useConversation/services/__tests__/Fuzzing.invariants.ts
import { SessionOrchestrator } from '../SessionOrchestrator';
import { ConversationState } from '../../FSM';

/**
 * Representa el resultado de una comprobación de invariantes.
 */
export interface InvariantViolation {
  message: string;
}

/**
 * Contiene una lista de reglas (invariantes) que el estado del Orchestrator
 * nunca debe violar, sin importar la secuencia de eventos.
 */
export class InvariantChecker {
  private orchestrator: SessionOrchestrator;
  private fsmHistory: ConversationState[] = [];

  constructor(orchestrator: SessionOrchestrator) {
    this.orchestrator = orchestrator;
  }

  /**
   * Ejecuta todas las comprobaciones de invariantes.
   * @returns Un array de violaciones. Si está vacío, todo es consistente.
   */
  public check(): InvariantViolation[] {
    const violations: InvariantViolation[] = [];
    const currentState = this.orchestrator['state'].status;
    const activeGenId = this.orchestrator['activeGenerationId'];

    // INVARIANTE 1: La FSM no debe estar en un estado imposible.
    // (Esta es una comprobación simple, pero podría expandirse)
    if (!['idle', 'listening', 'processing', 'generating_speech', 'ai_speaking'].includes(currentState)) {
      violations.push({ message: `FSM entró en un estado imposible: ${currentState}` });
    }
    
    // INVARIANTE 2: `activeGenerationId` nunca debe "revivir".
    // Si un ID está en el 'tombstone', no puede ser el ID activo.
    const tombstone = this.orchestrator['tombstone'] as Set<string>;
    if (activeGenId && tombstone.has(activeGenId)) {
        violations.push({ message: `Zombie Generation: activeGenerationId (${activeGenId}) existe en el tombstone.` });
    }

    // INVARIANTE 3: No se puede estar 'hablando' sin una generación activa.
    if (currentState === 'ai_speaking' && !activeGenId) {
      violations.push({ message: `Estado inconsistente: FSM está en 'ai_speaking' pero no hay activeGenerationId.` });
    }

    // INVARIANTE 4: Una transición ilegal no debe ocurrir.
    // (Esto requiere que el reducer FSM lance un error en transiciones no válidas)
    // Se puede comprobar si el historial de estados tiene una secuencia lógica.
    this.fsmHistory.push(currentState);
    
    // Añadir más invariantes según sea necesario...

    return violations;
  }
}

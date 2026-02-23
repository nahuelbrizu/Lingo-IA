// frontend/app/hooks/useConversation/__tests__/harness/Harness.test.ts
import { vi, describe, it, expect, beforeAll, afterEach } from 'vitest';
import { SessionOrchestrator } from '../../services/SessionOrchestrator';
import { sessionManager } from '../../SessionManager';
import { FuzzEngine } from './FuzzEngine';
import { InvariantChecker, metricsCollector } from './Core';
import { GlobalEvent } from '../../types';

// --- CONFIGURACIÓN ---
const FUZZ_ITERATIONS = 10000;
const EVENTS_PER_FUZZ_RUN = 50;
const PERF_ITERATIONS = 100;
const BARGE_IN_LATENCY_SLO = 100; // ms

// --- Mocks ---
// Mocks de servicios reales para que no hagan llamadas de red/audio
vi.mock('../../services/TTSService.ts', () => ({ ttsService: { generate: vi.fn(), cancel: vi.fn((gid) => metricsCollector.mark(gid, 'ttsCancel')) } }));
vi.mock('../../../services/AudioOutputManager.ts', () => ({ audioOutputManager: { play: vi.fn(), stop: vi.fn((sid) => {
    const s = Array.from(metricsCollector.pendingSamples.entries()).find(([k,v]) => k.includes(sid));
    if(s) metricsCollector.mark(s[0], 'audioStop');
}) } }));
vi.mock('../../../services/AudioInputManager.ts', () => ({ audioInputManager: { subscribe: vi.fn(), unsubscribe: vi.fn() } }));
vi.mock('../../services/EventBus', () => ({ globalEventBus: { publish: vi.fn(), subscribe: vi.fn(), unsubscribe: vi.fn() }}));


describe('System-level Conversation Engine Hardening', () => {

  afterEach(() => {
    vi.clearAllMocks();
    // Limpiar el estado de todos los singletons
    metricsCollector.reset();
    (sessionManager as any).sessions.clear();
    (sessionManager as any).activeListeningSessionId = null;
  });

  // --- Test de Fuzzing ---
  describe('Fuzz Testing for State Consistency', () => {
    it(`should maintain all invariants over ${FUZZ_ITERATIONS} random sequences`, () => {
      for (let i = 0; i < FUZZ_ITERATIONS; i++) {
        const seed = i;
        const fuzzer = new FuzzEngine(seed);
        const orchestrator = new SessionOrchestrator('fuzz-session');
        const checker = new InvariantChecker(orchestrator);
        
        const eventSequence: GlobalEvent[] = [];
        const oldGenIds: string[] = [];
        
        for (let j = 0; j < EVENTS_PER_FUZZ_RUN; j++) {
          const activeGenId = (orchestrator as any)['activeGenerationId'];
          const fuzzEvent = fuzzer.generateEvent('fuzz-session', activeGenId, oldGenIds);
          eventSequence.push(fuzzEvent);
          
          if (activeGenId && fuzzEvent.type === 'VAD_SPEECH_DETECTED') oldGenIds.push(activeGenId);

          orchestrator.processEvent(fuzzEvent);
          
          if (fuzzer.shouldDuplicate()) orchestrator.processEvent(fuzzEvent);

          const violations = checker.check();
          if (violations.length > 0) {
            const report = {
              message: 'Fuzzer found invariant violation.',
              seed,
              iteration: i,
              eventIndex: j,
              failedOnEvent: fuzzEvent,
              eventSequence,
              violations,
            };
            // Fallar inmediatamente con un reporte detallado
            throw new Error(JSON.stringify(report, null, 2));
          }
        }
      }
    }, 60000); // Timeout largo
  });

  // --- Test de Performance ---
  describe('Performance Testing for Barge-in Latency', () => {
    it(`p95 latency should be under ${BARGE_IN_LATENCY_SLO}ms`, () => {
      for (let i = 0; i < PERF_ITERATIONS; i++) {
        const sessionId = `perf-${i}`;
        const orchestrator = new SessionOrchestrator(sessionId);
        (orchestrator as any)['state'] = { status: 'ai_speaking' };
        const generationId = `gen-perf-${i}`;
        (orchestrator as any)['activeGenerationId'] = generationId;
        
        orchestrator.processEvent({ type: 'VAD_SPEECH_DETECTED', sessionId, timestamp: Date.now() });
      }

      const samples = metricsCollector.bargeInSamples;
      expect(samples.length).toBe(PERF_ITERATIONS);

      const latencies = samples.map(s => s.audioStopTimestamp - s.vadTimestamp);
      latencies.sort((a, b) => a - b);
      const p95Index = Math.floor(PERF_ITERATIONS * 0.95);
      const p95Latency = latencies[p95Index];
      const avgLatency = latencies.reduce((sum, val) => sum + val, 0) / PERF_ITERATIONS;

      console.log(`
--- Barge-in Latency Report ---`);
      console.log(`Samples: ${PERF_ITERATIONS}`);
      console.log(`Average: ${avgLatency.toFixed(2)}ms`);
      console.log(`P95:     ${p95Latency.toFixed(2)}ms`);
      console.log(`SLO:     < ${BARGE_IN_LATENCY_SLO}ms`);
      console.log(`---------------------------------`);

      expect(p95Latency).toBeLessThan(BARGE_IN_LATENCY_SLO);
    });
  });

  // --- Test de Memory Leaks ---
  describe('Memory Leak Detection', () => {
    it('should not leave orphaned subscribers or sessions after creation and destruction', () => {
        const SESSIONS_TO_CYCLE = 200;
        const sessionIds: string[] = [];

        // Crear sesiones
        for(let i=0; i< SESSIONS_TO_CYCLE; i++){
            const session = sessionManager.createSession({});
            sessionIds.push(session.id);
            // Simular que algunas entran en modo escucha
            if (i % 2 === 0) {
                sessionManager.requestListeningFocus(session.id);
            }
        }
        expect(sessionManager.getActiveSessionCount()).toBe(SESSIONS_TO_CYCLE);

        // Destruir todas las sesiones
        sessionIds.forEach(id => sessionManager.destroySession(id));

        // Verificar el estado final
        expect(sessionManager.getActiveSessionCount()).toBe(0);
        expect((sessionManager as any).activeListeningSessionId).toBeNull();
        
        // El hard cleanup debería haber llamado a unsubscribe
        expect(mockAudioInputManager.unsubscribe).toHaveBeenCalledTimes(SESSIONS_TO_CYCLE);
    });
  });
});

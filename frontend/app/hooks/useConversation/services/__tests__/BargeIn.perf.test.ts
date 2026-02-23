// frontend/app/hooks/useConversation/services/__tests__/BargeIn.perf.test.ts

import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest';
import { performance } from 'perf_hooks';
import { SessionOrchestrator } from '../SessionOrchestrator';
import { metricsCollector, BargeInLatencySample } from './MetricsCollector';
import { audioOutputManager } from '../../../services/AudioOutputManager';
import { ttsService } from '../services/TTSService';

// --- CONFIGURACIÓN DEL TEST DE PERFORMANCE ---
const SIMULATION_RUNS = 100;
const LATENCY_THRESHOLD_MS = 100;
const P95_THRESHOLD_MS = 100;

// --- Mocks Instrumentados ---
vi.mock('../../../services/AudioOutputManager', () => ({
  audioOutputManager: {
    stop: vi.fn((sessionId: string) => {
      // Encontrar la generación activa para esta sesión (simulación)
      const key = Array.from(metricsCollector['pendingSamples'].keys()).find(k => k.startsWith(sessionId));
      if (key) metricsCollector.mark(key, 'audioStop');
    }),
  },
}));

vi.mock('../services/TTSService', () => ({
  ttsService: {
    cancel: vi.fn((generationId: string) => {
      metricsCollector.mark(generationId, 'ttsCancel');
    }),
  },
}));

describe('Performance Test: Barge-in Latency', () => {

  beforeAll(() => {
    metricsCollector.reset();
  });

  afterAll(() => {
    vi.clearAllMocks();
  });

  it(`should have p95 barge-in latency under ${P95_THRESHOLD_MS}ms over ${SIMULATION_RUNS} runs`, () => {
    for (let i = 0; i < SIMULATION_RUNS; i++) {
      const sessionId = `perf-session-${i}`;
      const orchestrator = new SessionOrchestrator(sessionId);
      
      // 1. Poner al orchestrator en un estado de "hablando"
      const generationId = `gen-${i}`;
      orchestrator['activeGenerationId'] = generationId;
      orchestrator['state'] = { status: 'ai_speaking' };

      // 2. Simular el evento de barge-in
      const event = { type: 'VAD_SPEECH_DETECTED', sessionId, timestamp: Date.now() };
      orchestrator.processEvent(event);
    }
    
    // --- Análisis de Resultados ---
    const samples = metricsCollector.bargeInSamples;
    expect(samples.length).toBe(SIMULATION_RUNS);

    const latencies = samples.map(s => ({
      invalidation: s.invalidationTimestamp - s.vadTimestamp,
      audioStop: s.audioStopTimestamp - s.vadTimestamp,
      ttsCancel: s.ttsCancelTimestamp - s.vadTimestamp,
    }));

    const totalAudioStopLatency = latencies.reduce((acc, l) => acc + l.audioStop, 0);
    const avgLatency = totalAudioStopLatency / samples.length;

    latencies.sort((a, b) => a.audioStop - b.audioStop);
    const p95Index = Math.floor(samples.length * 0.95);
    const p95Latency = latencies[p95Index].audioStop;
    
    // --- Reporte en Consola ---
    console.log('
--- Barge-in Latency Report ---');
    console.log(`Total Samples: ${samples.length}`);
    console.log(`Average Latency (VAD -> Audio Stop): ${avgLatency.toFixed(3)} ms`);
    console.log(`P95 Latency (VAD -> Audio Stop):     ${p95Latency.toFixed(3)} ms`);
    console.log(`Threshold:                             ${P95_THRESHOLD_MS} ms`);
    console.log('---------------------------------');

    // --- Aserción Final ---
    expect(p95Latency).toBeLessThan(P95_THRESHOLD_MS);
  }, 15000); // Timeout largo para el test
});

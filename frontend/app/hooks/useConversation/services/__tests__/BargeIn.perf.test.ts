// frontend/app/hooks/useConversation/services/__tests__/BargeIn.perf.test.ts

import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest';
import { performance } from 'perf_hooks';
import { SessionOrchestrator } from '../SessionOrchestrator';
import { metricsCollector, BargeInLatencySample } from '../../__tests__/harness/Core';
import { audioOutputManager } from '@/app/services/AudioOutputManager';
import { TTSService } from '../TTSService';
import { GlobalEvent } from '../../types';

// --- CONFIGURACIÓN DEL TEST DE PERFORMANCE ---
const SIMULATION_RUNS = 100;
const P95_THRESHOLD_MS = 100;

// --- Mocks Instrumentados ---
vi.mock('@/app/services/AudioOutputManager', () => ({
  audioOutputManager: {
    stop: vi.fn((sessionId: string) => {
      const key = Array.from(metricsCollector['pendingSamples'].keys()).find(k => (k as string).startsWith(sessionId));
      if (key) metricsCollector.mark(key, 'audioStop');
    }),
  },
}));

vi.mock('../TTSService', () => {
  return {
    TTSService: vi.fn().mockImplementation(() => ({
      generate: vi.fn(),
      cancel: vi.fn((generationId: string) => {
        metricsCollector.mark(generationId, 'ttsCancel');
      }),
    })),
  };
});

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
      (orchestrator as any)['state'] = { status: 'ai_speaking' };

      // 2. Simular el evento de barge-in
      const event: GlobalEvent = { type: 'VAD_SPEECH_DETECTED', sessionId, timestamp: Date.now() };
      orchestrator.processEvent(event);
    }
    
    // --- Análisis de Resultados ---
    const samples = metricsCollector.bargeInSamples;
    expect(samples.length).toBe(SIMULATION_RUNS);

    type LatencySample = { invalidation: number; audioStop: number; ttsCancel: number };
    const latencies: LatencySample[] = samples.map((s: BargeInLatencySample) => ({
      invalidation: s.invalidationTimestamp - s.vadTimestamp,
      audioStop: s.audioStopTimestamp - s.vadTimestamp,
      ttsCancel: s.ttsCancelTimestamp - s.vadTimestamp,
    }));

    const totalAudioStopLatency = latencies.reduce((acc: number, l: LatencySample) => acc + l.audioStop, 0);
    const avgLatency = totalAudioStopLatency / samples.length;

    latencies.sort((a: LatencySample, b: LatencySample) => a.audioStop - b.audioStop);
    const p95Index = Math.floor(samples.length * 0.95);
    const p95Latency = latencies[p95Index].audioStop;
    
    // --- Reporte en Consola ---
    console.log(`
--- Barge-in Latency Report ---`);
    console.log(`Total Samples: ${samples.length}`);
    console.log(`Average Latency (VAD -> Audio Stop): ${avgLatency.toFixed(3)} ms`);
    console.log(`P95 Latency (VAD -> Audio Stop):     ${p95Latency.toFixed(3)} ms`);
    console.log(`Threshold:                             ${P95_THRESHOLD_MS} ms`);
    console.log('---------------------------------');

    // --- Aserción Final ---
    expect(p95Latency).toBeLessThan(P95_THRESHOLD_MS);
  }, 15000); // Timeout largo para el test
});

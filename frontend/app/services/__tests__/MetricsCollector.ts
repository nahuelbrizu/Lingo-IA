// frontend/app/services/__tests__/MetricsCollector.ts
import { performance } from 'perf_hooks';

export interface BargeInLatencySample {
  vadTimestamp: number;
  invalidationTimestamp: number;
  audioStopTimestamp: number;
  ttsCancelTimestamp: number;
}

/**
 * @class MetricsCollector
 * @description
 * Un singleton para recolectar métricas de performance de alta precisión
 * de diferentes partes del sistema de forma desacoplada.
 */
class MetricsCollector {
  private static instance: MetricsCollector;
  public bargeInSamples: BargeInLatencySample[] = [];
  private pendingSamples: Map<string, Partial<BargeInLatencySample>> = new Map();

  private constructor() {}

  public static getInstance(): MetricsCollector {
    if (!MetricsCollector.instance) {
      MetricsCollector.instance = new MetricsCollector();
    }
    return MetricsCollector.instance;
  }

  /**
   * Marca el inicio de una medición de barge-in.
   * @param key - Un identificador único para esta interrupción (puede ser el generationId).
   */
  public markBargeInStart(key: string): void {
    this.pendingSamples.set(key, { vadTimestamp: performance.now() });
  }

  /**
   * Registra una marca de tiempo para una medición de barge-in en curso.
   * @param key - El identificador de la interrupción.
   * @param mark - El punto del proceso a registrar.
   */
  public mark(key: string, mark: 'invalidation' | 'audioStop' | 'ttsCancel'): void {
    const sample = this.pendingSamples.get(key);
    if (!sample) return;

    switch (mark) {
      case 'invalidation':
        sample.invalidationTimestamp = performance.now();
        break;
      case 'audioStop':
        sample.audioStopTimestamp = performance.now();
        break;
      case 'ttsCancel':
        sample.ttsCancelTimestamp = performance.now();
        break;
    }

    // Si tenemos todas las marcas, completamos la muestra y la movemos a los resultados.
    if (sample.vadTimestamp && sample.invalidationTimestamp && sample.audioStopTimestamp && sample.ttsCancelTimestamp) {
      this.bargeInSamples.push(sample as BargeInLatencySample);
      this.pendingSamples.delete(key);
    }
  }

  /**
   * Limpia todas las muestras recolectadas.
   */
  public reset(): void {
    this.bargeInSamples = [];
    this.pendingSamples.clear();
  }
}

export const metricsCollector = MetricsCollector.getInstance();

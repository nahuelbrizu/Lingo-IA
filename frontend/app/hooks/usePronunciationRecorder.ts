'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { encodePcmToWav } from '@/app/utils/wavEncoder';

export type RecorderState = 'idle' | 'recording' | 'error';

const MAX_RECORDING_MS = 15000;
const TARGET_SAMPLE_RATE = 16000;

export interface RecordingResult {
  audioBase64: string;
  sampleRate: number;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

/**
 * Grabador de audio crudo completamente aislado del reconocimiento de voz
 * continuo de useAudioStreaming.ts — a propósito no importa nada de ese hook
 * ni comparte refs con él. Este archivo abre el micrófono con getUserMedia
 * SOLO durante una grabación puntual y corta (práctica de pronunciación), y
 * lo cierra por completo (tracks + AudioContext) apenas termina.
 *
 * Existió antes en esta app un getUserMedia paralelo al de SpeechRecognition
 * (para un ícono de volumen) que causaba que dos consumidores del micrófono
 * compitieran por el hardware en Android, matando el reconocimiento de voz en
 * silencio (ver commit 3f5ee6b). Por eso quien use este hook debe llamar a
 * pauseMicForPractice() de useAudioStreaming ANTES de startRecording() y a
 * resumeMicAfterPractice() después de cerrar — así nunca hay dos consumidores
 * del micrófono activos al mismo tiempo.
 */
export function usePronunciationRecorder() {
  const [state, setState] = useState<RecorderState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const chunksRef = useRef<Float32Array[]>([]);
  const maxDurationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopResolverRef = useRef<((result: RecordingResult) => void) | null>(null);

  const teardown = useCallback(() => {
    if (maxDurationTimerRef.current) {
      clearTimeout(maxDurationTimerRef.current);
      maxDurationTimerRef.current = null;
    }
    processorRef.current?.disconnect();
    processorRef.current = null;
    sourceRef.current?.disconnect();
    sourceRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
    }
    audioContextRef.current = null;
  }, []);

  const finishRecording = useCallback(() => {
    const context = audioContextRef.current;
    const sampleRate = context?.sampleRate ?? TARGET_SAMPLE_RATE;
    const totalLength = chunksRef.current.reduce((sum, chunk) => sum + chunk.length, 0);
    const merged = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of chunksRef.current) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    chunksRef.current = [];

    teardown();
    setState('idle');

    const wavBuffer = encodePcmToWav(merged, sampleRate);
    const result: RecordingResult = { audioBase64: arrayBufferToBase64(wavBuffer), sampleRate };
    stopResolverRef.current?.(result);
    stopResolverRef.current = null;
    return result;
  }, [teardown]);

  const startRecording = useCallback(async () => {
    setErrorMessage(null);
    chunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;

      const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
      const context: AudioContext = new AudioContextCtor({ sampleRate: TARGET_SAMPLE_RATE });
      audioContextRef.current = context;

      const source = context.createMediaStreamSource(stream);
      sourceRef.current = source;

      // ScriptProcessorNode está deprecado a favor de AudioWorklet, pero para
      // una grabación corta y puntual como esta el costo de mantener un
      // archivo de worklet separado no se justifica — sigue soportado en
      // todos los navegadores relevantes.
      const processor = context.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;
      processor.onaudioprocess = (event) => {
        const channelData = event.inputBuffer.getChannelData(0);
        chunksRef.current.push(new Float32Array(channelData));
      };
      source.connect(processor);
      // ScriptProcessorNode solo dispara onaudioprocess si su salida está
      // conectada a algo que llegue a destination — pero no queremos que el
      // usuario se escuche a sí mismo por el parlante mientras graba, así que
      // la ruta pasa por una ganancia en 0 antes de destination.
      const silentGain = context.createGain();
      silentGain.gain.value = 0;
      processor.connect(silentGain);
      silentGain.connect(context.destination);

      setState('recording');
      maxDurationTimerRef.current = setTimeout(() => {
        finishRecording();
      }, MAX_RECORDING_MS);
    } catch (error) {
      console.error('[PronunciationRecorder] No se pudo acceder al micrófono:', error);
      setErrorMessage('No se pudo acceder al micrófono.');
      setState('error');
      teardown();
    }
  }, [finishRecording, teardown]);

  const stopRecording = useCallback((): Promise<RecordingResult> => {
    return new Promise((resolve) => {
      stopResolverRef.current = resolve;
      finishRecording();
    });
  }, [finishRecording]);

  useEffect(() => {
    return () => {
      teardown();
    };
  }, [teardown]);

  return { state, errorMessage, startRecording, stopRecording };
}

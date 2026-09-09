'use client';

import React, { useEffect, useRef, useState } from 'react';
import { usePronunciationRecorder } from '@/app/hooks/usePronunciationRecorder';
import type { PronunciationAssessmentScores } from '@/app/hooks/useAudioStreaming';

interface PronunciationPracticeModalProps {
  phrase: string | null;
  onClose: () => void;
  pauseMicForPractice: () => void;
  resumeMicAfterPractice: () => void;
  requestPronunciationAssessment: (audioBase64: string, targetPhrase: string, sampleRate: number) => void;
  pronunciationAssessmentResult: { targetPhrase: string; result?: PronunciationAssessmentScores; error?: string } | null;
}

function scoreColor(score: number): string {
  if (score >= 80) return 'text-emerald-700 bg-emerald-50 border-emerald-200';
  if (score >= 60) return 'text-amber-700 bg-amber-50 border-amber-200';
  return 'text-rose-700 bg-rose-50 border-rose-200';
}

/**
 * Modal de práctica de pronunciación: pausa el micrófono de la conversación
 * en vivo (mismo camino que usa la app cuando la IA habla, ver pauseMic en
 * useAudioStreaming.ts) ANTES de que usePronunciationRecorder abra su propio
 * getUserMedia, y lo reanuda al cerrar — así nunca hay dos consumidores del
 * micrófono compitiendo por el hardware al mismo tiempo (ver commit 3f5ee6b).
 */
export const PronunciationPracticeModal: React.FC<PronunciationPracticeModalProps> = ({
  phrase,
  onClose,
  pauseMicForPractice,
  resumeMicAfterPractice,
  requestPronunciationAssessment,
  pronunciationAssessmentResult,
}) => {
  const { state, errorMessage, startRecording, stopRecording } = usePronunciationRecorder();
  const [awaitingResult, setAwaitingResult] = useState(false);
  const hasPausedRef = useRef(false);

  useEffect(() => {
    if (phrase && !hasPausedRef.current) {
      hasPausedRef.current = true;
      pauseMicForPractice();
    }
    if (!phrase && hasPausedRef.current) {
      hasPausedRef.current = false;
      resumeMicAfterPractice();
    }
  }, [phrase, pauseMicForPractice, resumeMicAfterPractice]);

  useEffect(() => {
    // Al desmontar (el usuario navega/cierra la pestaña con el modal
    // abierto), garantizamos que el micrófono de la conversación se reanude.
    return () => {
      if (hasPausedRef.current) {
        hasPausedRef.current = false;
        resumeMicAfterPractice();
      }
    };
  }, [resumeMicAfterPractice]);

  if (!phrase) return null;

  const handleClose = () => {
    setAwaitingResult(false);
    hasPausedRef.current = false;
    resumeMicAfterPractice();
    onClose();
  };

  const handleStop = async () => {
    const { audioBase64, sampleRate } = await stopRecording();
    setAwaitingResult(true);
    requestPronunciationAssessment(audioBase64, phrase, sampleRate);
  };

  const result = pronunciationAssessmentResult?.targetPhrase === phrase ? pronunciationAssessmentResult : null;
  const showResult = awaitingResult && result;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 animate-fade-in">
      <div className="w-full max-w-sm glass-panel rounded-3xl shadow-soft-lg p-6 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-500">Practicá esta frase</h3>
          <p className="mt-1 text-lg font-medium text-slate-900">"{phrase}"</p>
        </div>

        {!showResult && (
          <div className="flex flex-col items-center gap-3 py-4">
            {state === 'recording' ? (
              <button
                onClick={handleStop}
                className="w-16 h-16 rounded-full bg-rose-600 text-white flex items-center justify-center shadow-sm animate-pulse focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:ring-offset-2"
              >
                ⏹
              </button>
            ) : (
              <button
                onClick={startRecording}
                disabled={awaitingResult}
                className="w-16 h-16 rounded-full bg-violet-600 text-white flex items-center justify-center shadow-sm hover:bg-violet-700 disabled:bg-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2"
              >
                🎤
              </button>
            )}
            <p className="text-xs text-slate-500">
              {awaitingResult
                ? 'Evaluando tu pronunciación...'
                : state === 'recording'
                  ? 'Grabando — tocá para detener (máx. 15s)'
                  : 'Tocá para grabar'}
            </p>
            {errorMessage && <p className="text-xs text-rose-600">{errorMessage}</p>}
          </div>
        )}

        {showResult && result.error && (
          <div className="py-4 text-center">
            <p className="text-sm text-rose-600">{result.error}</p>
            <button
              onClick={() => setAwaitingResult(false)}
              className="mt-3 text-xs font-medium text-violet-700 hover:text-violet-900"
            >
              Intentar de nuevo
            </button>
          </div>
        )}

        {showResult && result.result && (
          <div className="space-y-3">
            <div className={`text-center rounded-2xl border px-4 py-3 ${scoreColor(result.result.pronScore)}`}>
              <p className="text-3xl font-bold">{Math.round(result.result.pronScore)}</p>
              <p className="text-xs font-medium">Puntaje general</p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className={`rounded-xl border px-2 py-1.5 ${scoreColor(result.result.accuracyScore)}`}>
                <p className="text-sm font-semibold">{Math.round(result.result.accuracyScore)}</p>
                <p className="text-[10px]">Precisión</p>
              </div>
              <div className={`rounded-xl border px-2 py-1.5 ${scoreColor(result.result.fluencyScore)}`}>
                <p className="text-sm font-semibold">{Math.round(result.result.fluencyScore)}</p>
                <p className="text-[10px]">Fluidez</p>
              </div>
              <div className={`rounded-xl border px-2 py-1.5 ${scoreColor(result.result.completenessScore)}`}>
                <p className="text-sm font-semibold">{Math.round(result.result.completenessScore)}</p>
                <p className="text-[10px]">Completitud</p>
              </div>
            </div>
            <button
              onClick={() => setAwaitingResult(false)}
              className="w-full text-xs font-medium text-violet-700 hover:text-violet-900 text-center"
            >
              Intentar de nuevo
            </button>
          </div>
        )}

        <button
          onClick={handleClose}
          className="w-full px-4 py-2 rounded-full text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
        >
          Cerrar
        </button>
      </div>
    </div>
  );
};

'use client';

import React from 'react';
import type { ConversationState } from '@/app/hooks/useAudioStreaming';

interface VolumeVisualizerProps {
  conversationState: ConversationState;
  isMicPaused: boolean;
}

/**
 * @description
 * Componente dedicado a mostrar si el micrófono está activo o pausado.
 * Muestra un indicador pulsante (celeste) cuando el usuario puede hablar, y
 * un ícono gris titilando cuando el micrófono está pausado a propósito
 * (mientras la IA habla), para que sea evidente que no te está escuchando.
 * Ya no reacciona al volumen real (no usamos getUserMedia/AnalyserNode): el
 * SpeechRecognition necesita el micrófono para él solo, sin competir por el
 * hardware con otro consumidor de audio — en algunos Android, tenerlos
 * abiertos a la vez dejaba al reconocimiento sin recibir nada.
 */
export const VolumeVisualizer: React.FC<VolumeVisualizerProps> = ({
  conversationState,
  isMicPaused,
}) => {
  const isListening = conversationState === 'listening';

  return (
    <div className="relative flex items-center justify-center w-16 h-16">
      {isListening && (
        <>
          {/* Two staggered rings give the "actively listening" state a
              radar-like, alive pulse — distinct from the AI-speaking glow. */}
          <span className="absolute inset-0 bg-teal-400/50 rounded-full animate-ping [animation-duration:1.8s]" />
          <span className="absolute inset-1.5 bg-teal-400/40 rounded-full animate-ping [animation-duration:1.8s] [animation-delay:0.3s]" />
          <span className="absolute inset-0 rounded-full bg-teal-50 ring-1 ring-teal-200" />
          <span className="absolute text-teal-600">
            <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
          </span>
        </>
      )}
      {!isListening && isMicPaused && (
        <>
          {/* Slow "breathing" violet glow signals the AI is speaking right
              now — a calmer, differently-colored cadence than the teal
              listening pulse, so the two states feel unmistakably different. */}
          <span className="absolute inset-0 bg-violet-400/40 rounded-full animate-breathe" />
          <span className="absolute inset-0 rounded-full bg-violet-50 ring-1 ring-violet-200" />
          <span className="absolute text-violet-500">
            <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/>
              <line x1="3" y1="3" x2="21" y2="21" />
            </svg>
          </span>
        </>
      )}
      {!isListening && !isMicPaused && (
         <span className="absolute text-slate-400">
           <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
             <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/>
           </svg>
         </span>
      )}
    </div>
  );
};

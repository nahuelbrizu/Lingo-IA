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
          <span className="absolute inset-0 bg-blue-400 opacity-50 rounded-full animate-pulse"></span>
           <span className="absolute text-blue-800">
             <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
           </span>
        </>
      )}
      {!isListening && (
         <span className={`absolute text-slate-400 ${isMicPaused ? 'animate-pulse' : ''}`}>
           <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
             <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/>
             {isMicPaused && <line x1="3" y1="3" x2="21" y2="21" />}
           </svg>
         </span>
      )}
    </div>
  );
};

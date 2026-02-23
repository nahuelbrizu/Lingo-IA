'use client';

import React from 'react';
import type { ConversationState } from '@/app/hooks/useAudioStreaming';

interface VolumeVisualizerProps {
  conversationState: ConversationState;
  currentVolume: number;
}

/**
 * @description
 * Componente dedicado a la visualización del volumen del micrófono.
 * Muestra un indicador pulsante cuando el usuario está hablando.
 */
export const VolumeVisualizer: React.FC<VolumeVisualizerProps> = ({
  conversationState,
  currentVolume,
}) => {
  const isListening = conversationState === 'listening';
  // Normalizamos el volumen (RMS es un valor pequeño, ej. 0.0 a 0.2) y lo hacemos más sensible
  const volumeScale = Math.min(1, currentVolume * 10);

  return (
    <div className="relative flex items-center justify-center w-16 h-16">
      {isListening && (
        <>
          <span
            className="absolute inset-0 bg-blue-400 opacity-50 rounded-full transition-transform duration-75 ease-out"
            style={{ transform: `scale(${1 + volumeScale * 0.5})` }}
          ></span>
           <span className="absolute text-blue-800">
             <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
           </span>
        </>
      )}
      {conversationState !== 'listening' && (
         <span className="absolute text-slate-400">
           <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
         </span>
      )}
    </div>
  );
};

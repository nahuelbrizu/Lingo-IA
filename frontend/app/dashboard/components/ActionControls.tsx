'use client';

import React from 'react';
import type { ConversationState } from '@/app/hooks/useAudioStreaming';

interface ActionControlsProps {
  conversationState: ConversationState;
  startConversation: () => void;
  stopConversation: () => void;
}

/**
 * @description
 * Proporciona los controles de usuario para iniciar y detener la conversación.
 * La lógica de qué botón mostrar y si está deshabilitado se basa en el
 * estado de la conversación, manteniendo este componente simple y declarativo.
 */
export const ActionControls: React.FC<ActionControlsProps> = ({
  conversationState,
  startConversation,
  stopConversation,
}) => {
  const isRecording = conversationState === 'listening' || conversationState === 'processing' || conversationState === 'ai_speaking';
  const isConnecting = conversationState === 'connecting';

  return (
    <div className="flex flex-wrap items-center gap-3 sm:gap-4">
      <button
        onClick={startConversation}
        disabled={isRecording || isConnecting}
        className={`inline-flex items-center gap-2 px-6 py-3 rounded-full text-white font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2
          ${
            isRecording || isConnecting
              ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
              : 'bg-gradient-to-r from-indigo-600 to-violet-600 hover:shadow-glow-brand hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] shadow-md focus-visible:ring-indigo-400'
          }`}
      >
        {isConnecting && (
          <span className="h-3.5 w-3.5 rounded-full border-2 border-white/60 border-t-white animate-spin" />
        )}
        {isConnecting ? 'Conectando...' : 'Empezar a Hablar'}
      </button>
      <button
        onClick={stopConversation}
        disabled={!isRecording}
        className={`px-6 py-3 rounded-full font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2
          ${
            !isRecording
              ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
              : 'bg-rose-600 text-white hover:bg-rose-700 hover:shadow-glow-danger active:scale-[0.98] focus-visible:ring-rose-400'
          }`}
      >
        Detener Conversación
      </button>
    </div>
  );
};

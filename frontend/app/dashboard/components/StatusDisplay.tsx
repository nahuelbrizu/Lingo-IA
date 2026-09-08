'use client';

import React from 'react';
import type { ConversationState } from '@/app/hooks/useAudioStreaming';

interface StatusDisplayProps {
  conversationState: ConversationState;
  lastUserTranscript: string;
}

/**
 * @description
 * Muestra el estado actual de la conversación y la transcripción del usuario.
 * Su única responsabilidad es informar al usuario sobre lo que está sucediendo.
 */
export const StatusDisplay: React.FC<StatusDisplayProps> = ({
  conversationState,
  lastUserTranscript,
}) => {
  const getStatusText = () => {
    switch (conversationState) {
      case 'idle':
        return "Haz clic en 'Empezar' para iniciar la conversación.";
      case 'connecting':
        return 'Conectando con el servidor...';
      case 'listening':
        return lastUserTranscript || 'Escuchando...';
      case 'processing':
        return lastUserTranscript || 'Procesando...';
      case 'ai_speaking':
        return 'IA está hablando... (micrófono en pausa)';
      case 'error':
        return 'Hubo un error en la conexión.';
      default:
        return 'Estado desconocido.';
    }
  };

  const dotColor: Record<ConversationState, string> = {
    idle: 'bg-slate-300',
    connecting: 'bg-amber-400',
    listening: 'bg-teal-500',
    processing: 'bg-amber-400',
    ai_speaking: 'bg-violet-500',
    error: 'bg-rose-500',
  };

  const isPulsing = conversationState !== 'idle' && conversationState !== 'error';

  return (
    <div className="mb-6 px-5 py-4 glass-panel rounded-2xl shadow-soft min-h-[4rem] flex items-center justify-center gap-2.5 transition-colors duration-300">
      <span className="relative flex h-2 w-2 flex-none">
        {isPulsing && (
          <span
            className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${dotColor[conversationState]}`}
          />
        )}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${dotColor[conversationState]}`} />
      </span>
      <p className="text-slate-600 text-center leading-snug">{getStatusText()}</p>
    </div>
  );
};

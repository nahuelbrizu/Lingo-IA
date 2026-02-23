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
        return 'IA está hablando...';
      case 'error':
        return 'Hubo un error en la conexión.';
      default:
        return 'Estado desconocido.';
    }
  };

  return (
    <div className="mb-6 p-4 bg-white rounded-2xl shadow-inner border border-slate-200 min-h-[4rem] flex items-center justify-center">
      <p className="text-slate-600 italic text-center">{getStatusText()}</p>
    </div>
  );
};

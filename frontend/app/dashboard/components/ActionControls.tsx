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
    <div className="flex items-center space-x-4">
      <button
        onClick={startConversation}
        disabled={isRecording || isConnecting}
        className={`px-6 py-3 rounded-full text-white font-semibold transition-colors duration-200
          ${(isRecording || isConnecting) ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
      >
        {isConnecting ? 'Conectando...' : 'Empezar a Hablar'}
      </button>
      <button
        onClick={stopConversation}
        disabled={!isRecording}
        className={`px-6 py-3 rounded-full text-white font-semibold transition-colors duration-200
          ${!isRecording ? 'bg-gray-400 cursor-not-allowed' : 'bg-red-600 hover:bg-red-700'}`}
      >
        Detener Conversación
      </button>
    </div>
  );
};

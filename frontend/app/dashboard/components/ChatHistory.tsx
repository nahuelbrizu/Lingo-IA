'use client';

import React, { useRef, useEffect } from 'react';
import type { ChatMessage } from '@/app/hooks/useAudioStreaming';

interface ChatHistoryProps {
  chatMessages: ChatMessage[];
}

/**
 * @description
 * Componente con la única responsabilidad de renderizar la lista de mensajes del chat.
 * Se auto-desplaza hacia el último mensaje.
 */
export const ChatHistory: React.FC<ChatHistoryProps> = ({ chatMessages }) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'end',
    });
  }, [chatMessages]);

  return (
    <div className="mb-6 p-4 bg-white rounded-2xl shadow-lg border border-slate-100 h-96 overflow-y-auto flex flex-col-reverse">
      <div className="space-y-4" ref={messagesEndRef}>
        {[...chatMessages].reverse().map((msg, index) => (
          <div
            key={index}
            className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-xs md:max-w-md lg:max-w-lg p-3 rounded-lg ${
                msg.sender === 'user' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-800'
              }`}
            >
              {msg.text}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

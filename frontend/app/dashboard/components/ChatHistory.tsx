'use client';

import React, { useRef, useEffect, useState } from 'react';
import type { ChatMessage } from '@/app/hooks/useAudioStreaming';

interface ChatHistoryProps {
  chatMessages: ChatMessage[];
  onTranslate: (index: number) => void;
}

/**
 * @description
 * Componente con la única responsabilidad de renderizar la lista de mensajes del chat.
 * Se auto-desplaza hacia el último mensaje. Los mensajes de la IA tienen un botón
 * para pedir una traducción al idioma nativo del alumno — ayuda didáctica para
 * cuando todavía no entiende el idioma que está aprendiendo.
 */
export const ChatHistory: React.FC<ChatHistoryProps> = ({ chatMessages, onTranslate }) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [shownTranslations, setShownTranslations] = useState<Set<number>>(new Set());

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'end',
    });
  }, [chatMessages]);

  const toggleTranslation = (index: number, msg: ChatMessage) => {
    setShownTranslations(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
        if (!msg.translation) {
          onTranslate(index);
        }
      }
      return next;
    });
  };

  return (
    <div className="mb-6 p-4 bg-white rounded-2xl shadow-lg border border-slate-100 h-96 overflow-y-auto">
      <div className="space-y-4">
        {chatMessages.map((msg, index) => (
          <div
            key={index}
            className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div
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

            {msg.sender === 'ai' && msg.text && (
              <div className="mt-1 max-w-xs md:max-w-md lg:max-w-lg">
                <button
                  onClick={() => toggleTranslation(index, msg)}
                  className="text-xs text-blue-600 hover:underline"
                >
                  {shownTranslations.has(index) ? 'Ocultar traducción' : '🌐 Traducir'}
                </button>
                {shownTranslations.has(index) && (
                  <p className="text-xs text-slate-500 italic mt-1">
                    {msg.isTranslating ? 'Traduciendo...' : msg.translation}
                  </p>
                )}
              </div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
};

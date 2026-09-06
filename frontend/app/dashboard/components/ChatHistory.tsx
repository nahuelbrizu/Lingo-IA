'use client';

import React, { useRef, useEffect, useState } from 'react';
import type { ChatMessage } from '@/app/hooks/useAudioStreaming';

interface ChatHistoryProps {
  chatMessages: ChatMessage[];
  onTranslate: (index: number) => void;
}

/**
 * @description
 * Renderiza un subconjunto chico de Markdown en línea (**negrita**, *cursiva*,
 * `código`) como elementos de React, en vez de mostrar los símbolos crudos.
 * A propósito no soporta bloques (listas, títulos, etc.) — para respuestas de
 * chat conversacional alcanza y sobra con el énfasis en línea.
 */
function renderInlineMarkdown(text: string, keyPrefix: string): React.ReactNode[] {
  const tokenPattern = /(\*\*.+?\*\*|\*.+?\*|`.+?`)/g;
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = tokenPattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith('**')) {
      nodes.push(<strong key={`${keyPrefix}-${key++}`}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('`')) {
      nodes.push(
        <code key={`${keyPrefix}-${key++}`} className="bg-black/10 rounded px-1 py-0.5 text-[0.9em]">
          {token.slice(1, -1)}
        </code>
      );
    } else {
      nodes.push(<em key={`${keyPrefix}-${key++}`}>{token.slice(1, -1)}</em>);
    }
    lastIndex = tokenPattern.lastIndex;
  }
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }
  return nodes;
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
                className={`max-w-xs md:max-w-md lg:max-w-lg px-4 py-2.5 rounded-2xl leading-relaxed whitespace-pre-wrap shadow-sm ${
                  msg.sender === 'user'
                    ? 'bg-blue-600 text-white rounded-br-sm'
                    : 'bg-slate-100 text-slate-800 rounded-bl-sm'
                }`}
              >
                {renderInlineMarkdown(msg.text, `msg-${index}`)}
              </div>
            </div>

            {msg.sender === 'ai' && msg.text && (
              <div className="mt-1.5 max-w-xs md:max-w-md lg:max-w-lg px-1">
                <button
                  onClick={() => toggleTranslation(index, msg)}
                  className="text-xs text-blue-600 hover:text-blue-800 hover:underline font-medium"
                >
                  {shownTranslations.has(index) ? 'Ocultar traducción' : '🌐 Traducir'}
                </button>
                {shownTranslations.has(index) && (
                  <p className="text-xs text-slate-500 italic mt-1 leading-relaxed">
                    {msg.isTranslating ? 'Traduciendo...' : renderInlineMarkdown(msg.translation ?? '', `tr-${index}`)}
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

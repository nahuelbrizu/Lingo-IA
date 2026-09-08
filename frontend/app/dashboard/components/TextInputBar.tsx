'use client';

import React, { useState } from 'react';

interface TextInputBarProps {
  disabled: boolean;
  onSend: (text: string) => void;
}

/**
 * @description
 * Barra para escribir un mensaje en vez de (o además de) hablarlo — útil
 * para corregir cosas que el reconocimiento de voz no capta bien, como
 * nombres propios. Usa el mismo camino que un turno hablado (mismo guard de
 * "solo cuando es tu turno"), así que se deshabilita mientras la IA está
 * ocupada, igual que el micrófono.
 */
export const TextInputBar: React.FC<TextInputBarProps> = ({ disabled, onSend }) => {
  const [value, setValue] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue('');
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={disabled}
        placeholder={disabled ? 'Esperá tu turno...' : 'O escribí tu respuesta acá (útil para nombres, etc.)'}
        className="flex-1 px-4 py-2.5 rounded-full border border-slate-200 bg-white/90 text-slate-900 text-sm shadow-sm placeholder:text-slate-400 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:bg-slate-100 disabled:text-slate-400"
      />
      <button
        type="submit"
        disabled={disabled || !value.trim()}
        className="px-5 py-2.5 rounded-full bg-indigo-600 text-white text-sm font-medium shadow-sm transition-colors duration-150 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-1"
      >
        Enviar
      </button>
    </form>
  );
};

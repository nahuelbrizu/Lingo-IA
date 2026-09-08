'use client';

import React from 'react';
import { SUPPORTED_LANGUAGES, type LanguageCode } from '@/app/config';

interface LanguageSelectorProps {
  label: string;
  value: LanguageCode;
  onChange: (lang: LanguageCode) => void;
  disabled: boolean;
}

/**
 * @description
 * Selector de idioma genérico (se reusa tanto para el idioma a practicar
 * como para el idioma nativo del alumno). Deshabilitado mientras hay una
 * conversación activa (cambiarlo a mitad de sesión no tendría efecto hasta
 * reconectar el WebSocket, así que evitamos la confusión).
 */
export const LanguageSelector: React.FC<LanguageSelectorProps> = ({ label, value, onChange, disabled }) => {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-600">
      {label}
      <div className="relative">
        <select
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value as LanguageCode)}
          className="appearance-none border border-slate-200 rounded-xl pl-3 pr-8 py-2 text-slate-900 bg-white/90 shadow-sm cursor-pointer transition-colors duration-150 hover:border-indigo-300 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed disabled:hover:border-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-1"
        >
          {SUPPORTED_LANGUAGES.map(({ code, label }) => (
            <option key={code} value={code}>
              {label}
            </option>
          ))}
        </select>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </div>
    </label>
  );
};

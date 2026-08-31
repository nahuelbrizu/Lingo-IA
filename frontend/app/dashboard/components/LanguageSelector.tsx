'use client';

import React from 'react';
import { SUPPORTED_LANGUAGES, type LanguageCode } from '@/app/config';

interface LanguageSelectorProps {
  value: LanguageCode;
  onChange: (lang: LanguageCode) => void;
  disabled: boolean;
}

/**
 * @description
 * Selector del idioma que se va a practicar. Deshabilitado mientras hay una
 * conversación activa (cambiarlo a mitad de sesión no tendría efecto hasta
 * reconectar el WebSocket, así que evitamos la confusión).
 */
export const LanguageSelector: React.FC<LanguageSelectorProps> = ({ value, onChange, disabled }) => {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-600">
      Idioma a practicar:
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as LanguageCode)}
        className="border border-slate-300 rounded-lg px-3 py-2 text-slate-900 bg-white disabled:bg-slate-100 disabled:text-slate-400"
      >
        {SUPPORTED_LANGUAGES.map(({ code, label }) => (
          <option key={code} value={code}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
};

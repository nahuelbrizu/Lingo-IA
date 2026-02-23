'use client';

import React from 'react';

// Es una buena práctica definir explícitamente los tipos de datos esperados.
interface Lesson {
  id: string;
  topic: string;
  feedback: string;
}

interface UserData {
  name?: string;
  languageLevel?: string;
  analytics?: {
    masteredTopics: string[];
  };
  lessons: Lesson[];
}

interface UserProgressProps {
  data: UserData | null;
  isLoading: boolean;
}

/**
 * @description
 * Muestra el progreso del usuario, incluyendo nivel, habilidades y feedback del tutor.
 * Su única responsabilidad es la presentación de estos datos.
 */
export const UserProgress: React.FC<UserProgressProps> = ({ data, isLoading }) => {
  if (isLoading) {
    return (
      <div className="text-center p-6 bg-white rounded-2xl shadow-sm border border-slate-100">
        <p className="text-slate-500">Actualizando datos...</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <h3 className="text-sm font-semibold text-slate-400 uppercase">
          Nivel Actual
        </h3>
        <p className="text-4xl font-black text-blue-600 mt-2">
          {data?.languageLevel || 'N/A'}
        </p>
      </div>
      <div className="md:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <h3 className="text-sm font-semibold text-slate-400 uppercase mb-4">
          Habilidades Desbloqueadas
        </h3>
        <div className="flex flex-wrap gap-2">
          {data?.analytics?.masteredTopics && data.analytics.masteredTopics.length > 0 ? (
            data.analytics.masteredTopics.map((topic: string) => (
              <span
                key={topic}
                className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium"
              >
                ✓ {topic}
              </span>
            ))
          ) : (
            <span className="text-slate-500 text-sm">
              No hay temas dominados aún.
            </span>
          )}
        </div>
      </div>
      <div className="md:col-span-3 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <h3 className="text-sm font-semibold text-slate-400 uppercase mb-4">
          Notas del Tutor IA
        </h3>
        <div className="space-y-4">
          {data?.lessons && data.lessons.length > 0 ? (
            data.lessons.map((lesson) => (
              <div
                key={lesson.id}
                className="border-l-4 border-blue-500 pl-4 py-2"
              >
                <p className="text-slate-700 font-medium">{lesson.topic}</p>
                <p className="text-slate-500 text-sm italic">
                  "{lesson.feedback}"
                </p>
              </div>
            ))
          ) : (
            <span className="text-slate-500 text-sm">
              No hay feedback reciente.
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

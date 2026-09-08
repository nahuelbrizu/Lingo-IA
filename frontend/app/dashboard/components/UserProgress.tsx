'use client';

import React from 'react';

// Es una buena práctica definir explícitamente los tipos de datos esperados.
interface Lesson {
  id: string;
  topic: string;
  feedback: string;
  suggestedNextLesson?: string | null;
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
      <div className="text-center p-6 glass-panel rounded-2xl shadow-soft">
        <div className="inline-flex items-center gap-2 text-slate-500">
          <span className="h-3.5 w-3.5 rounded-full border-2 border-indigo-300 border-t-indigo-600 animate-spin" />
          Actualizando datos...
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-5 animate-fade-in">
      <div className="glass-panel p-6 rounded-2xl shadow-soft transition-shadow duration-200 hover:shadow-soft-lg">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
          Nivel Actual
        </h3>
        <p className="font-display text-4xl font-extrabold bg-clip-text text-transparent bg-gradient-to-br from-indigo-600 to-violet-600 mt-2">
          {data?.languageLevel || 'N/A'}
        </p>
      </div>
      <div className="md:col-span-2 glass-panel p-6 rounded-2xl shadow-soft transition-shadow duration-200 hover:shadow-soft-lg">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-4">
          Habilidades Desbloqueadas
        </h3>
        <div className="flex flex-wrap gap-2">
          {data?.analytics?.masteredTopics && data.analytics.masteredTopics.length > 0 ? (
            data.analytics.masteredTopics.map((topic: string, index: number) => (
              <span
                key={`${topic}-${index}`}
                className="px-3 py-1 bg-teal-50 text-teal-700 border border-teal-100 rounded-full text-sm font-medium"
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
      <div className="md:col-span-3 glass-panel p-6 rounded-2xl shadow-soft transition-shadow duration-200 hover:shadow-soft-lg">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-4">
          Notas del Tutor IA
        </h3>
        <div className="space-y-4">
          {data?.lessons && data.lessons.length > 0 ? (
            data.lessons.map((lesson) => (
              <div
                key={lesson.id}
                className="border-l-2 border-indigo-400 pl-4 py-1.5"
              >
                <p className="text-slate-800 font-medium">{lesson.topic}</p>
                <p className="text-slate-500 text-sm italic mt-0.5">
                  "{lesson.feedback}"
                </p>
                {lesson.suggestedNextLesson && (
                  <p className="text-indigo-600 text-xs mt-1">
                    Próximo paso sugerido: {lesson.suggestedNextLesson}
                  </p>
                )}
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

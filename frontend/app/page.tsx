'use client';

import { useSession, signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function HomePage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'authenticated') {
      router.push('/dashboard');
    }
  }, [status, router]);

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return (
      <main className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-slate-50 to-slate-200 p-4">
        <div className="w-full max-w-2xl text-center">
          <h1 className="text-5xl md:text-7xl font-extrabold text-slate-900 tracking-tight opacity-0 animate-fade-in-up delay-300">
            Lingo-IA
          </h1>
          <p className="mt-4 text-lg text-slate-600 opacity-0 animate-fade-in-up delay-500">
            Tu tutor de idiomas inteligente y en tiempo real.
          </p>

          <div className="mt-8 bg-white p-8 rounded-2xl shadow-lg border border-slate-200">
            <h2 className="text-2xl font-bold text-slate-800 mb-4">
              ¿Qué puedes hacer?
            </h2>
            <ul className="text-left space-y-3 text-slate-700">
              <li className="flex items-start">
                <span className="text-blue-500 mr-3 mt-1">✓</span>
                <span>
                  <strong>Conversación Voz-a-Voz:</strong> Habla directamente
                  con una IA y recibe respuestas instantáneas.
                </span>
              </li>
              <li className="flex items-start">
                <span className="text-blue-500 mr-3 mt-1">✓</span>
                <span>
                  <strong>Seguimiento Inteligente:</strong> La IA evalúa tu
                  gramática y pronunciación, actualizando tu progreso.
                </span>
              </li>
              <li className="flex items-start">
                <span className="text-blue-500 mr-3 mt-1">✓</span>
                <span>
                  <strong>Feedback Personalizado:</strong> Recibe notas y
                  consejos para mejorar después de cada sesión.
                </span>
              </li>
            </ul>
          </div>

          <button
            onClick={() => signIn('google', { callbackUrl: '/dashboard' })}
            className="mt-10 px-8 py-4 bg-blue-600 text-white font-bold rounded-full shadow-lg hover:bg-blue-700 transition-transform transform hover:scale-105"
          >
            Comenzar a Aprender
          </button>
        </div>
      </main>
    );
  }

  return null; // or a spinner while redirecting
}

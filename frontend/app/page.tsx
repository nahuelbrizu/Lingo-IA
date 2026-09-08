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
      <div className="flex items-center justify-center min-h-screen">
        <div className="relative w-14 h-14">
          <div className="absolute inset-0 rounded-full border-4 border-indigo-100" />
          <div className="absolute inset-0 rounded-full border-4 border-indigo-600 border-t-transparent animate-spin" />
        </div>
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return (
      <main className="relative flex flex-col items-center justify-center min-h-screen overflow-hidden px-4 py-16">
        {/* Ambient decorative glow — purely visual, sits behind the content. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-[36rem] h-[36rem] rounded-full bg-gradient-to-br from-indigo-400/25 via-violet-400/15 to-teal-300/20 blur-3xl"
        />

        <div className="relative w-full max-w-2xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/70 backdrop-blur-sm border border-slate-200/80 px-4 py-1.5 text-xs sm:text-sm font-medium text-indigo-700 shadow-soft opacity-0 animate-fade-in-up">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-teal-500" />
            </span>
            Práctica de conversación en tiempo real
          </span>

          <h1 className="mt-6 font-display text-5xl md:text-7xl font-extrabold tracking-tight opacity-0 animate-fade-in-up [animation-delay:120ms]">
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-500">
              Lingo-IA
            </span>
          </h1>

          <p className="mt-4 text-lg sm:text-xl text-slate-600 max-w-xl mx-auto opacity-0 animate-fade-in-up [animation-delay:240ms]">
            Tu tutor de idiomas inteligente y en tiempo real.
          </p>

          <div className="mt-10 glass-panel rounded-4xl shadow-soft-lg p-6 sm:p-8 text-left opacity-0 animate-fade-in-up [animation-delay:360ms]">
            <h2 className="font-display text-xl sm:text-2xl font-bold text-slate-900 mb-5">
              ¿Qué puedes hacer?
            </h2>
            <ul className="space-y-4 text-slate-700">
              <li className="flex items-start gap-3">
                <span className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                </span>
                <span>
                  <strong className="text-slate-900">Conversación Voz-a-Voz:</strong> Habla
                  directamente con una IA y recibe respuestas instantáneas.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full bg-violet-100 text-violet-600">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                </span>
                <span>
                  <strong className="text-slate-900">Seguimiento Inteligente:</strong> La IA
                  evalúa tu gramática y pronunciación, actualizando tu progreso.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full bg-teal-100 text-teal-600">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                </span>
                <span>
                  <strong className="text-slate-900">Feedback Personalizado:</strong> Recibe
                  notas y consejos para mejorar después de cada sesión.
                </span>
              </li>
            </ul>
          </div>

          <button
            onClick={() => signIn('google', { callbackUrl: '/dashboard' })}
            className="group mt-10 inline-flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-semibold rounded-full shadow-glow-brand transition-all duration-200 hover:shadow-glow-brand-lg hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 opacity-0 animate-fade-in-up [animation-delay:480ms]"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white">
              <svg width="14" height="14" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
            </span>
            Comenzar a Aprender
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="transition-transform duration-200 group-hover:translate-x-1"
            >
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>
          </button>
        </div>
      </main>
    );
  }

  return null; // or a spinner while redirecting
}

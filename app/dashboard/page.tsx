'use client';

import { useEffect, useState } from 'react';
import { useSession, signIn, signOut } from 'next-auth/react';
import { useAudioStreaming } from '@/app/hooks/useAudioStreaming';
import { getUserData } from '@/lib/db';

function DashboardContent({ initialData }: { initialData: any }) {
  const { data: session } = useSession();
  const [data, setData] = useState(initialData);
  const [loadingRefresh, setLoadingRefresh] = useState(false);

  const wsUrl = session?.user?.id ? `ws://localhost:8080?token=${(session as any).accessToken}` : null;
  const { startStreaming, stopStreaming, isRecording, isSpeaking, userVolume } = useAudioStreaming(wsUrl || "");

  // Function to refresh user data
  const refreshData = async () => {
    setLoadingRefresh(true);
    try {
      const newData = await getUserData();
      setData(newData);
    } catch (error) {
      console.error("Error refreshing user data:", error);
    } finally {
      setLoadingRefresh(false);
    }
  };

  // Trigger data refresh when recording stops (implying a session ended and data might have changed)
  useEffect(() => {
    if (data && !isRecording && !loadingRefresh) {
      // Only refresh if data was initially loaded and recording just stopped
      // and not already in a refresh state.
      // A small debounce might be useful in a real app to avoid multiple calls.
      refreshData();
    }
  }, [isRecording]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!session) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <button onClick={() => signIn('google')} className="px-6 py-3 bg-blue-600 text-white rounded-lg">
          Iniciar Sesión con Google
        </button>
      </div>
    );
  }

  // Calculate visual scaling for the volume indicator
  const volumeScale = userVolume / 255; // Scale from 0-255 to 0-1
  const indicatorSize = isRecording ? Math.max(16, 48 * volumeScale) : 16; // Min 16px, max 48px when recording

  return (
    <div className="min-h-screen bg-slate-50 p-8">
       <header className="flex justify-between items-center mb-10">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">¡Hola, {data?.name || 'usuario'}!</h1>
          <p className="text-slate-500">Revisa tu progreso en tiempo real.</p>
        </div>
        <button onClick={() => signOut()} className="px-4 py-2 bg-red-500 text-white rounded-lg">
          Cerrar Sesión
        </button>
      </header>

      {/* Controles de Audio y Estado con Indicador de Voz */}
      <div className="mb-6 flex items-center space-x-4 p-4 bg-white rounded-2xl shadow-sm border border-slate-100">
        <div className="relative">
          <button
            onClick={startStreaming}
            disabled={isRecording || !wsUrl}
            className={`relative px-6 py-3 rounded-full text-white font-semibold transition-colors duration-200 overflow-hidden
              ${isRecording || !wsUrl ? 'bg-red-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
          >
            {isRecording ? 'Grabando...' : 'Empezar a Hablar'}
          </button>
          {isRecording && (
            <span 
              className="absolute inset-0 bg-blue-400 opacity-50 rounded-full transition-all duration-75 ease-out"
              style={{ transform: `scale(${1 + volumeScale * 0.5})` }}
            ></span>
          )}
        </div>

        <button
          onClick={stopStreaming}
          disabled={!isRecording}
          className={`px-6 py-3 rounded-full text-white font-semibold transition-colors duration-200
            ${!isRecording ? 'bg-gray-400 cursor-not-allowed' : 'bg-red-600 hover:bg-red-700'}`}
        >
          Detener Grabación
        </button>
        <span className="text-sm text-slate-600">
          Estado: 
          {isRecording && <span className="text-red-500 font-medium ml-1">Grabando</span>}
          {isSpeaking && <span className="text-blue-500 font-medium ml-1">IA Hablando</span>}
          {!isRecording && !isSpeaking && <span className="text-gray-500 font-medium ml-1">Inactivo</span>}
          {loadingRefresh && <span className="text-purple-500 font-medium ml-1">Actualizando...</span>}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Tarjeta de Nivel */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <h3 className="text-sm font-semibold text-slate-400 uppercase">Nivel Actual</h3>
          <p className="text-4xl font-black text-blue-600 mt-2">{data?.languageLevel || 'N/A'}</p>
          <div className="w-full bg-slate-100 h-2 rounded-full mt-4">
            <div className="bg-blue-600 h-2 rounded-full" style={{ width: '65%' }}></div> {/* This can be dynamic too */}
          </div>
        </div>

        {/* Temas Dominados (Gestionado por la IA) */}
        <div className="md:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <h3 className="text-sm font-semibold text-slate-400 uppercase mb-4">Habilidades Desbloqueadas</h3>
          <div className="flex flex-wrap gap-2">
            {data?.analytics?.masteredTopics.map((topic: string) => (
              <span key={topic} className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
                ✓ {topic}
              </span>
            )) || <span className="text-slate-500 text-sm">No hay temas dominados aún.</span>}
          </div>
        </div>

        {/* Feedback Reciente de Voz */}
        <div className="md:col-span-3 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <h3 className="text-sm font-semibold text-slate-400 uppercase mb-4">Notas del Tutor IA</h3>
          <div className="space-y-4">
            {data?.lessons.map((lesson: any) => (
              <div key={lesson.id} className="border-l-4 border-blue-500 pl-4 py-2">
                <p className="text-slate-700 font-medium">{lesson.topic}</p>
                <p className="text-slate-500 text-sm italic">"{lesson.feedback}"</p>
              </div>
            )) || <span className="text-slate-500 text-sm">No hay feedback reciente.</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

export default async function DashboardWrapper() {
  const session = await getServerSession(authOptions);
  
  if (!session) {
    return <DashboardContent initialData={null} />;
  }

  const initialData = await getUserData();
  return <DashboardContent initialData={initialData} />;
}

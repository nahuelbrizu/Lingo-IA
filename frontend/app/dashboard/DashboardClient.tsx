'use client';

import { useEffect, useState } from 'react';
import { useSession, signOut, signIn } from 'next-auth/react';
import { useAudioStreaming } from '@/app/hooks/useAudioStreaming';
import { SUPPORTED_LANGUAGES, DEFAULT_LANGUAGE, DEFAULT_SOURCE_LANGUAGE, type LanguageCode } from '@/app/config';

// Importando los nuevos componentes con responsabilidades únicas
import { ChatHistory } from './components/ChatHistory';
import { StatusDisplay } from './components/StatusDisplay';
import { ActionControls } from './components/ActionControls';
import { VolumeVisualizer } from './components/VolumeVisualizer';
import { UserProgress } from './components/UserProgress';
import { LanguageSelector } from './components/LanguageSelector';

/**
 * @description
 * DashboardClient ahora actúa como un "Componente Contenedor".
 *
 * SUS RESPONSABILIDADES SON:
 * 1. Gestionar la sesión del usuario.
 * 2. Obtener y actualizar los datos del usuario.
 * 3. Orquestar el estado de la conversación a través del hook `useAudioStreaming`.
 * 4. Pasar el estado y las funciones a los componentes de presentación (hijos).
 *
 * NO SE ENCARGA DE:
 * - Renderizar directamente los detalles del chat, estado, botones, etc.
 *   (Delega esto a los componentes hijos).
 */
export default function DashboardClient({ initialData }: { initialData: any }) {
  const { data: session } = useSession();
  const [userData, setUserData] = useState(initialData);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [targetLanguage, setTargetLanguage] = useState<LanguageCode>(DEFAULT_LANGUAGE);
  const [sourceLanguage, setSourceLanguage] = useState<LanguageCode>(DEFAULT_SOURCE_LANGUAGE);

  // El token de autenticación para el WebSocket ahora se extrae de forma segura.
  const authToken = (session as any)?.wsToken;

  const {
    conversationState,
    chatMessages,
    lastUserTranscript,
    errorMessage,
    authExpired,
    isMicPaused,
    startConversation,
    stopConversation,
    requestTranslation,
  } = useAudioStreaming(authToken, targetLanguage, sourceLanguage);

  const languageLabel = SUPPORTED_LANGUAGES.find((l) => l.code === targetLanguage)?.label ?? targetLanguage;

  const refreshUserData = async () => {
    setIsLoadingData(true);
    try {
      const response = await fetch('/api/user');
      if (!response.ok) throw new Error('Failed to fetch user data');
      const newData = await response.json();
      setUserData(newData);
    } catch (error) {
      console.error('Error refreshing user data:', error);
    } finally {
      setIsLoadingData(false);
    }
  };

  // Efecto para refrescar los datos del usuario cuando la conversación termina.
  useEffect(() => {
    if (session?.user?.id && conversationState === 'idle') {
      refreshUserData();
    }
  }, [conversationState, session?.user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-8">
      <header className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">
            ¡Hola, {userData?.name || 'usuario'}!
          </h1>
          <p className="text-slate-500 text-sm sm:text-base">
            Tu sesión de práctica de {languageLabel.toLowerCase()}.
          </p>
        </div>
        <button
          onClick={() => signOut()}
          className="px-4 py-2 bg-red-500 text-white rounded-lg text-sm"
        >
          Cerrar Sesión
        </button>
      </header>

      {/* Área de la conversación de IA */}
      <div className="space-y-6">
        <ChatHistory chatMessages={chatMessages} onTranslate={requestTranslation} />
        <StatusDisplay
          conversationState={conversationState}
          lastUserTranscript={lastUserTranscript}
        />
        {authExpired ? (
          <div className="text-center p-4 bg-amber-50 border border-amber-200 rounded-xl">
            <p className="text-amber-700 mb-2">Tu sesión expiró. Volvé a entrar para seguir practicando.</p>
            <button
              onClick={() => signIn('google')}
              className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm hover:bg-amber-700"
            >
              Volver a iniciar sesión
            </button>
          </div>
        ) : (
          errorMessage && <p className="text-red-500 text-center">{errorMessage}</p>
        )}

        <div className="flex flex-wrap justify-center gap-4">
          <LanguageSelector
            label="Idioma nativo (para traducciones):"
            value={sourceLanguage}
            onChange={setSourceLanguage}
            disabled={conversationState !== 'idle'}
          />
          <LanguageSelector
            label="Idioma a practicar:"
            value={targetLanguage}
            onChange={setTargetLanguage}
            disabled={conversationState !== 'idle'}
          />
        </div>

        <div className="flex items-center justify-center space-x-4 p-4 bg-white rounded-2xl shadow-sm border border-slate-100">
          <ActionControls
            conversationState={conversationState}
            startConversation={startConversation}
            stopConversation={stopConversation}
          />
          <VolumeVisualizer
            conversationState={conversationState}
            isMicPaused={isMicPaused}
          />
        </div>
      </div>

      {/* Línea divisoria */}
      <hr className="my-10 border-slate-200" />

      {/* Área de progreso del usuario */}
      <UserProgress data={userData} isLoading={isLoadingData} />
    </div>
  );
}

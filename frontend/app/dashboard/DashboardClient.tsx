'use client';

import { useEffect, useState } from 'react';
import { useSession, signOut, signIn } from 'next-auth/react';
import { useAudioStreaming } from '@/app/hooks/useAudioStreaming';
import { SUPPORTED_LANGUAGES, DEFAULT_LANGUAGE, DEFAULT_SOURCE_LANGUAGE, isBeginnerLevel, type LanguageCode } from '@/app/config';

// Importando los nuevos componentes con responsabilidades únicas
import { ChatHistory } from './components/ChatHistory';
import { StatusDisplay } from './components/StatusDisplay';
import { ActionControls } from './components/ActionControls';
import { VolumeVisualizer } from './components/VolumeVisualizer';
import { UserProgress } from './components/UserProgress';
import { LanguageSelector } from './components/LanguageSelector';
import { TextInputBar } from './components/TextInputBar';

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
    sendTextMessage,
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
    <div className="min-h-screen p-4 sm:p-6 lg:p-10">
      <div className="mx-auto max-w-4xl">
        <header className="flex flex-wrap justify-between items-center gap-4 mb-8">
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
              ¡Hola, {userData?.name || 'usuario'}!
            </h1>
            <p className="text-slate-500 text-sm sm:text-base mt-1">
              Tu sesión de práctica de{' '}
              <span className="font-medium text-indigo-600">
                {languageLabel.toLowerCase()}
              </span>
              .
            </p>
          </div>
          <button
            onClick={() => signOut()}
            className="px-4 py-2 rounded-full text-sm font-medium text-rose-600 bg-rose-50 border border-rose-100 hover:bg-rose-100 hover:text-rose-700 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:ring-offset-2"
          >
            Cerrar Sesión
          </button>
        </header>

        {/* Área de la conversación de IA */}
        <div className="space-y-5">
          <ChatHistory
            chatMessages={chatMessages}
            onTranslate={requestTranslation}
            showPronunciationByDefault={isBeginnerLevel(userData?.languageLevel)}
          />
          <StatusDisplay
            conversationState={conversationState}
            lastUserTranscript={lastUserTranscript}
          />

          {conversationState !== 'idle' && (
            <TextInputBar disabled={conversationState !== 'listening'} onSend={sendTextMessage} />
          )}

          {authExpired ? (
            <div className="text-center p-4 bg-amber-50 border border-amber-200 rounded-2xl animate-fade-in">
              <p className="text-amber-800 mb-2">Tu sesión expiró. Volvé a entrar para seguir practicando.</p>
              <button
                onClick={() => signIn('google')}
                className="px-4 py-2 bg-amber-600 text-white rounded-full text-sm font-medium hover:bg-amber-700 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2"
              >
                Volver a iniciar sesión
              </button>
            </div>
          ) : (
            errorMessage && (
              <p className="text-rose-600 text-center text-sm font-medium animate-fade-in">
                {errorMessage}
              </p>
            )
          )}

          <div className="flex flex-wrap justify-center gap-3 sm:gap-4">
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

          <div className="flex items-center justify-center gap-6 p-5 sm:p-6 glass-panel rounded-3xl shadow-soft">
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
        <div className="my-10 h-px bg-gradient-to-r from-transparent via-slate-300/70 to-transparent" />

        {/* Área de progreso del usuario */}
        <UserProgress data={userData} isLoading={isLoadingData} />
      </div>
    </div>
  );
}

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { audioOutputManager } from '@/app/services/AudioOutputManager';
import { DEFAULT_LANGUAGE, DEFAULT_SOURCE_LANGUAGE, type LanguageCode } from '@/app/config';

// ==================================================================
// 1. TIPOS Y CONSTANTES
// ==================================================================

/**
 * @description
 * Define los posibles estados de la máquina de estados finitos (FSM) que
 * gobierna el ciclo de vida de la conversación. Usar una FSM previene
 * estados inconsistentes y hace que el flujo sea predecible y robusto.
 */
export type ConversationState =
  | 'idle'          // No hay conexión activa.
  | 'connecting'    // Conectando al servidor WebSocket.
  | 'listening'     // Conectado y escuchando al usuario.
  | 'processing'    // El usuario dejó de hablar, esperando la respuesta de la IA.
  | 'ai_speaking'   // La IA está respondiendo (streaming de texto + síntesis de voz).
  | 'error';        // Ocurrió un error.

/**
 * @description
 * Mensajes que el servidor puede enviar al cliente. El reconocimiento de voz
 * corre en el navegador (Web Speech API), así que el servidor no envía
 * transcripciones — solo el texto de la respuesta de la IA, su audio
 * (Google Cloud TTS) y errores.
 */
export type ServerMessage =
  | { type: 'ai_delta'; text: string; generationId: string }
  | { type: 'ai_audio_chunk'; chunk: string; generationId: string }
  | { type: 'ai_final'; generationId: string }
  | { type: 'translation'; messageIndex: number; translatedText: string }
  | { type: 'error'; message: string };

// --- Helper Functions ---
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Combina un resultado "final" nuevo del reconocimiento con lo que ya
 * teníamos, por contenido en vez de por posición/índice:
 * - Si el nuevo texto empieza con el que ya teníamos, es una revisión más
 *   larga de la misma frase → lo reemplaza.
 * - Si el que ya teníamos empieza con el nuevo, el nuevo es una versión
 *   vieja/más corta que llegó tarde → se ignora.
 * - Si no se relacionan, es un fragmento realmente nuevo → se agrega.
 */
function mergeFinalSegment(current: string, incoming: string): string {
  const currentNorm = current.trim();
  const incomingNorm = incoming.trim();
  if (!currentNorm) return incomingNorm;
  if (!incomingNorm) return currentNorm;

  const currentLower = currentNorm.toLowerCase();
  const incomingLower = incomingNorm.toLowerCase();
  if (incomingLower.startsWith(currentLower)) return incomingNorm;
  if (currentLower.startsWith(incomingLower)) return currentNorm;
  return `${currentNorm} ${incomingNorm}`.trim();
}

/**
 * @description
 * Representa un mensaje en el historial del chat.
 */
export interface ChatMessage {
  sender: 'user' | 'ai' | 'system';
  text: string;
  translation?: string;
  isTranslating?: boolean;
}

/**
 * Mensaje de bienvenida que se agrega solo (del lado del cliente, sin pasar
 * por el backend) al arrancar cada sesión, para que quede claro que esto es
 * un chat de voz y cómo funcionan los turnos — sobre todo el silencio que
 * hay que dejar para que la IA entienda que uno terminó de hablar.
 */
const WELCOME_MESSAGE: ChatMessage = {
  sender: 'system',
  text:
    'Bienvenido a Lingo AI 👋 Este es un chat de voz: hablá con naturalidad y, ' +
    'cuando termines de decir algo, hacé una pausa de unos 3 segundos de ' +
    'silencio para que la IA sepa que te toca escuchar. Mientras la IA está ' +
    'respondiendo el micrófono queda en pausa (el ícono parpadea) y se ' +
    'reactiva solo cuando termina de hablar. Si no entendés una respuesta, ' +
    'tocá "Traducir" debajo del mensaje para verla en tu idioma nativo.',
};

// --- Constantes de configuración ---

/** Límite superior para el backoff exponencial en ms (30 segundos) */
const MAX_RECONNECT_DELAY = 30000;
/** Intervalo para el throttling de actualizaciones de la UI para el texto de la IA (en ms). */
const AI_TEXT_THROTTLE_MS = 50;
/**
 * Silencio (en ms) que esperamos antes de dar por terminado el turno del
 * usuario. El SpeechRecognition del navegador tiene su propio detector de fin
 * de frase (no configurable, suele ser bastante más corto), así que no
 * mandamos sus resultados "final" directo al backend: acumulamos el texto y
 * esperamos este silencio real antes de cortar, para no interrumpir a mitad
 * de una pausa natural del usuario. 2 segundos resultaba muy poco cuando el
 * usuario tarda en pensar/seguir hablando y cortaba el turno de golpe; 4
 * quedaba largo para la conversación. 3 es el punto intermedio.
 */
const USER_SILENCE_TIMEOUT_MS = 3000;


// ==================================================================
// 2. EL HOOK PRINCIPAL: useAudioStreaming
// ==================================================================

export const useAudioStreaming = (
  authToken: string | null,
  targetLanguage: LanguageCode = DEFAULT_LANGUAGE,
  sourceLanguage: LanguageCode = DEFAULT_SOURCE_LANGUAGE
) => {
  const [conversationState, setConversationState] = useState<ConversationState>('idle');
  // Arranca ya con el mensaje de bienvenida (ver WELCOME_MESSAGE) para que el
  // usuario lo lea ANTES de tocar "empezar" — si se agregaba recién al
  // arrancar la conversación, aparecía justo cuando el usuario ya estaba por
  // hablar y no llegaba a leerlo.
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE]);
  const [lastUserTranscript, setLastUserTranscript] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [authExpired, setAuthExpired] = useState(false);
  const [isMicPaused, setIsMicPaused] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const shouldRecognizeRef = useRef(false);
  const micPausedRef = useRef(false);
  const turnBufferRef = useRef('');
  // Texto confirmado ("final") de la sesión de reconocimiento actual. En
  // Android el motor va revisando la misma frase en varios avisos "final"
  // sucesivos, cada uno más largo que el anterior (p.ej. "yes" → "yes my" →
  // "yes my day"...), y no necesariamente reutiliza el mismo índice — así que
  // en vez de confiar en la posición, comparamos contenido: si el nuevo aviso
  // empieza con lo que ya teníamos, es una revisión y reemplaza; si no, es un
  // fragmento nuevo y se suma.
  const sessionFinalTextRef = useRef('');
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const consecutiveRecognitionErrorsRef = useRef(0);
  const reconnectAttemptsRef = useRef(0);
  const aiResponseBufferRef = useRef('');
  const hasAudioRef = useRef(false);
  const pendingAudioChunksRef = useRef(0);
  const finalReceivedRef = useRef(false);
  const lastUiUpdateTimeRef = useRef(0);
  const sessionIdRef = useRef<string | null>(null);
  const generationIdRef = useRef<string | null>(null);

  const conversationStateRef = useRef(conversationState);
  useEffect(() => {
    conversationStateRef.current = conversationState;
  }, [conversationState]);

  const cleanup = useCallback(() => {
    console.log('[Cleanup] Realizando limpieza completa...');
    shouldRecognizeRef.current = false;
    micPausedRef.current = false;
    setIsMicPaused(false);
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    turnBufferRef.current = '';
    sessionFinalTextRef.current = '';
    consecutiveRecognitionErrorsRef.current = 0;
    recognitionRef.current?.stop();
    if (sessionIdRef.current) audioOutputManager.stop(sessionIdRef.current);
    if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
    }
    wsRef.current = null;
    recognitionRef.current = null;
  }, []);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  /**
   * El SpeechRecognition del navegador captura el micrófono con su propio
   * pipeline de audio interno — no respeta el `echoCancellation` que le
   * pedimos al stream del analizador, así que si lo dejamos activo mientras
   * la IA habla, puede reconocer su propia voz saliendo por los parlantes y
   * "auto-cancelarse". Por eso lo pausamos por completo durante ai_speaking
   * en vez de intentar filtrar el eco.
   */
  const pauseMic = useCallback(() => {
    if (micPausedRef.current) return;
    micPausedRef.current = true;
    setIsMicPaused(true);
    clearSilenceTimer();
    turnBufferRef.current = '';
    sessionFinalTextRef.current = '';
    recognitionRef.current?.stop();
  }, [clearSilenceTimer]);

  const resumeMic = useCallback(() => {
    if (!micPausedRef.current) return;
    micPausedRef.current = false;
    setIsMicPaused(false);
    try {
      recognitionRef.current?.start();
    } catch {
      // Puede que el stop() anterior todavía no haya terminado; el propio
      // onend lo va a reiniciar solo en cuanto micPausedRef ya esté en false.
    }
  }, []);

  const sendUserFinalTranscript = useCallback((text: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    // Si la IA ya está procesando o hablando, ignoramos este tramo en vez de
    // mandar un segundo turno en paralelo: dos respuestas de Claude corriendo
    // a la vez pisan el buffer de texto de la otra y la síntesis de voz
    // termina sin nada que decir.
    if (conversationStateRef.current !== 'listening') {
      console.log('[SpeechRecognition] Ignorado (la IA está ocupada).');
      return;
    }
    wsRef.current.send(JSON.stringify({ type: 'user_final', text }));
    setConversationState('processing');
    setLastUserTranscript(text);
    setChatMessages(prev => [...prev, { sender: 'user', text }]);
  }, []);

  const initSpeechRecognition = useCallback(() => {
    const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) {
      setErrorMessage('Este navegador no soporta reconocimiento de voz (Web Speech API).');
      setConversationState('error');
      cleanup();
      return;
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = targetLanguage;
    // false a propósito: el modo continuo de Android es poco confiable — el
    // motor va "revisando" el mismo resultado final varias veces de formas
    // impredecibles (a veces reemplazando, a veces no), lo que termina
    // duplicando texto sin importar cómo tratemos de compararlo. En modo no
    // continuo, cada sesión reconoce UNA frase y da UN solo resultado final
    // antes de terminar; nuestro propio onend la reinicia enseguida para la
    // frase siguiente, así que seguimos escuchando de forma continua desde
    // el punto de vista del usuario, sin heredar los problemas del modo
    // continuo nativo.
    recognition.continuous = false;
    recognition.interimResults = true;

    // Diagnóstico: confirma si el motor de reconocimiento realmente llegó a
    // engancharse al micrófono (onaudiostart) o si se queda "escuchando" sin
    // recibir nada — sirve para distinguir un problema de permisos/hardware
    // de uno de reconocimiento en sí.
    recognition.onstart = () => console.log('[SpeechRecognition] onstart');
    recognition.onaudiostart = () => console.log('[SpeechRecognition] onaudiostart (motor conectado al micrófono)');
    recognition.onsoundstart = () => console.log('[SpeechRecognition] onsoundstart (detectó sonido)');

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      consecutiveRecognitionErrorsRef.current = 0;
      let latestInterim = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0]?.transcript ?? '';
        if (!transcript) continue;

        if (result.isFinal) {
          sessionFinalTextRef.current = mergeFinalSegment(sessionFinalTextRef.current, transcript);
        } else {
          latestInterim = transcript;
        }
      }

      const combined = `${turnBufferRef.current} ${sessionFinalTextRef.current}`.trim();

      // El "final" del propio navegador no dispara el envío al toque: solo
      // vamos acumulando el texto confirmado y reiniciando el temporizador
      // de silencio en cada actividad (final o interina). Recién cuando
      // pasan USER_SILENCE_TIMEOUT_MS sin ninguna novedad, se considera que
      // el usuario terminó de hablar.
      setLastUserTranscript(latestInterim ? `${combined} ${latestInterim}`.trim() + '...' : combined);

      clearSilenceTimer();
      silenceTimerRef.current = setTimeout(() => {
        const finalText = combined;
        turnBufferRef.current = '';
        sessionFinalTextRef.current = '';
        if (finalText) {
          console.log(`[SpeechRecognition] Turno finalizado tras ${USER_SILENCE_TIMEOUT_MS}ms de silencio (${finalText.length} caracteres).`);
          sendUserFinalTranscript(finalText);
        }
      }, USER_SILENCE_TIMEOUT_MS);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === 'no-speech' || event.error === 'aborted') return;
      console.error('[SpeechRecognition] Error:', event.error, event.message);

      if (event.error === 'not-allowed' || event.error === 'audio-capture') {
        setErrorMessage('Microphone permission denied.');
        setConversationState('error');
        cleanup();
        return;
      }

      // Otros errores (p.ej. "network", muy común en Chrome/Android cuando el
      // motor de reconocimiento en la nube de Google falla) antes se tragaban
      // en silencio y el reconocimiento reintentaba para siempre sin avisar
      // nada. Si se repite varias veces seguidas sin reconocer nada, avisamos.
      consecutiveRecognitionErrorsRef.current += 1;
      if (consecutiveRecognitionErrorsRef.current >= 3) {
        setErrorMessage(
          `El reconocimiento de voz está fallando ("${event.error}"). Revisá tu conexión, o que la app de Google tenga permiso de micrófono en los ajustes del sistema.`
        );
      }
    };

    // Con continuous=false, cada sesión termina sola apenas reconoce UNA
    // frase (o si no detectó voz). La reiniciamos al toque para la frase
    // siguiente mientras la conversación siga activa y no esté pausada a
    // propósito (IA hablando) — desde el punto de vista del usuario sigue
    // escuchando de forma continua. La sesión nueva vuelve a numerar sus
    // resultados desde 0, así que "comprometemos" lo ya confirmado de esta
    // sesión al acumulado del turno antes de resetear, para no perderlo.
    recognition.onend = () => {
      if (sessionFinalTextRef.current) {
        turnBufferRef.current = mergeFinalSegment(turnBufferRef.current, sessionFinalTextRef.current);
      }
      sessionFinalTextRef.current = '';
      if (shouldRecognizeRef.current && !micPausedRef.current) {
        recognition.start();
      }
    };

    recognitionRef.current = recognition;
    shouldRecognizeRef.current = true;
    recognition.start();
  }, [cleanup, clearSilenceTimer, sendUserFinalTranscript, targetLanguage]);

  const handleServerMessage = useCallback((event: MessageEvent) => {
    const message: ServerMessage = JSON.parse(event.data);
    // OJO: el backend NO manda generationId en "ai_delta" (solo en
    // ai_audio_chunk/ai_final), así que este chequeo recién dispara cuando
    // llega el primer chunk de audio de un turno nuevo — momento en el que ya
    // se acumuló texto de varios deltas. Por eso el reset de
    // aiResponseBufferRef NO va acá (antes vivía acá y borraba a mitad de
    // turno el texto ya mostrado en el chat, mientras la voz seguía leyendo
    // la respuesta completa — de ahí que el chat mostrara menos texto que el
    // que se escuchaba). Ese reset ahora se hace en el momento correcto: al
    // arrancar el turno nuevo, en el propio "ai_delta".
    if ('generationId' in message && message.generationId !== generationIdRef.current) {
      generationIdRef.current = message.generationId;
      hasAudioRef.current = false;
      pendingAudioChunksRef.current = 0;
      finalReceivedRef.current = false;
    }
    switch (message.type) {
      case 'ai_delta':
        if (conversationStateRef.current !== 'ai_speaking') {
          pauseMic();
          setConversationState('ai_speaking');
          aiResponseBufferRef.current = '';
          setChatMessages(prev => [...prev, { sender: 'ai', text: '' }]);
        }
        aiResponseBufferRef.current += message.text;
        break;
      case 'ai_audio_chunk': {
        // El backend sintetiza oración por oración, así que puede llegar más de
        // un chunk por turno; solo pasamos a "listening" cuando termina de sonar
        // el último Y ya llegó el ai_final (no antes, o cortaríamos a mitad de frase).
        hasAudioRef.current = true;
        pendingAudioChunksRef.current += 1;
        if (sessionIdRef.current) {
          const audioChunk = base64ToArrayBuffer(message.chunk);
          audioOutputManager
            .play({ chunk: audioChunk, sessionId: sessionIdRef.current, generationId: message.generationId })
            .then(() => {
              pendingAudioChunksRef.current -= 1;
              if (finalReceivedRef.current && pendingAudioChunksRef.current <= 0 && conversationStateRef.current === 'ai_speaking') {
                resumeMic();
                setConversationState('listening');
              }
            });
        }
        break;
      }
      case 'ai_final':
        aiResponseBufferRef.current = '';
        finalReceivedRef.current = true;
        // Si no llegó (o ya terminó de sonar) audio para este turno, no hay nada
        // esperando: volvemos a "listening" ya. Si todavía queda sonando, lo hace
        // el .then() de arriba cuando termine el último chunk.
        if (pendingAudioChunksRef.current <= 0) {
          resumeMic();
          setConversationState('listening');
        }
        break;
      case 'translation':
        setChatMessages(prev => {
          const newMessages = [...prev];
          const target = newMessages[message.messageIndex];
          if (target) {
            newMessages[message.messageIndex] = { ...target, translation: message.translatedText, isTranslating: false };
          }
          return newMessages;
        });
        break;
      case 'error':
        setErrorMessage(message.message);
        setConversationState('error');
        cleanup();
        break;
    }
  }, [cleanup, pauseMic, resumeMic]);

  const requestTranslation = useCallback((messageIndex: number) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    setChatMessages(prev => {
      const target = prev[messageIndex];
      if (!target || target.sender !== 'ai' || !target.text || target.translation || target.isTranslating) {
        return prev;
      }
      wsRef.current!.send(JSON.stringify({
        type: 'translate',
        text: target.text,
        targetLanguageCode: sourceLanguage,
        messageIndex,
      }));
      const newMessages = [...prev];
      newMessages[messageIndex] = { ...target, isTranslating: true };
      return newMessages;
    });
  }, [sourceLanguage]);

  const connectWebSocket = useCallback(() => {
    if (!authToken) {
      setErrorMessage('Authentication required.');
      setConversationState('error');
      return;
    }
    cleanup();
    const url = `${process.env.NEXT_PUBLIC_WEBSOCKET_URL}?token=${authToken}&lang=${encodeURIComponent(targetLanguage)}&sourceLang=${encodeURIComponent(sourceLanguage)}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;
    setConversationState('connecting');
    ws.onopen = () => {
      console.log('[WebSocket] Connection established.');
      setConversationState('listening');
      reconnectAttemptsRef.current = 0;
      initSpeechRecognition();
    };
    ws.onmessage = handleServerMessage;
    ws.onerror = () => { setErrorMessage('Connection error.'); setConversationState('error'); };
    ws.onclose = (event) => {
      if (event.code === 1006) {
        const delay = Math.min(MAX_RECONNECT_DELAY, (2 ** reconnectAttemptsRef.current) * 1000);
        setTimeout(() => {
          reconnectAttemptsRef.current++;
          connectWebSocket();
        }, delay);
      } else if (event.code === 1000) {
        // Cierre normal (el propio cliente cortó la conexión vía cleanup/stopConversation).
        setConversationState('idle');
      } else if (event.code === 4001) {
        // El token del WebSocket venció o es inválido: no alcanza con reintentar,
        // hace falta un token nuevo (requiere volver a loguearse).
        console.warn('[WebSocket] Sesión expirada, se necesita volver a loguearse.');
        setAuthExpired(true);
        setConversationState('error');
      } else {
        // El servidor cerró la conexión por otro error. Mostrarlo en vez de
        // resetear en silencio, para que no parezca que los botones no responden.
        console.error(`[WebSocket] Closed with code ${event.code}: ${event.reason}`);
        setErrorMessage(event.reason || `Conexión cerrada (código ${event.code}).`);
        setConversationState('error');
      }
    };
  }, [authToken, cleanup, initSpeechRecognition, handleServerMessage, targetLanguage, sourceLanguage]);

  const startConversation = useCallback(() => {
    if (conversationStateRef.current === 'idle') {
      sessionIdRef.current = uuidv4();
      setChatMessages([WELCOME_MESSAGE]);
      setLastUserTranscript('');
      setErrorMessage('');
      setAuthExpired(false);
      connectWebSocket();
    }
  }, [connectWebSocket]);

  const stopConversation = useCallback(() => {
    setConversationState('idle');
    cleanup();
  }, [cleanup]);

  useEffect(() => cleanup, [cleanup]);

  const throttledUiUpdate = useCallback(() => {
    if (Date.now() - lastUiUpdateTimeRef.current > AI_TEXT_THROTTLE_MS && aiResponseBufferRef.current) {
      setChatMessages(prev => {
        const newMessages = [...prev];
        const lastMessage = newMessages[newMessages.length - 1];
        if (lastMessage?.sender === 'ai') {
          lastMessage.text = aiResponseBufferRef.current;
        }
        return newMessages;
      });
      lastUiUpdateTimeRef.current = Date.now();
    }
  }, []);

  useEffect(() => {
    if (conversationState === 'ai_speaking') {
      const intervalId = setInterval(throttledUiUpdate, AI_TEXT_THROTTLE_MS);
      return () => clearInterval(intervalId);
    }
  }, [conversationState, throttledUiUpdate]);

  return {
    conversationState,
    chatMessages,
    lastUserTranscript,
    errorMessage,
    authExpired,
    isMicPaused,
    startConversation,
    stopConversation,
    requestTranslation,
    // Mismo camino que usa el reconocimiento de voz al terminar una frase —
    // se reusa para que el usuario pueda escribir (p.ej. para corregir un
    // nombre propio que la transcripción de voz no capta bien). El guard de
    // "solo si conversationState === 'listening'" ya está adentro, así que
    // no hace falta duplicar esa lógica acá.
    sendTextMessage: sendUserFinalTranscript,
  };
};

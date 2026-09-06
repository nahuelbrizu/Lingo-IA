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
 * @description
 * Representa un mensaje en el historial del chat.
 */
export interface ChatMessage {
  sender: 'user' | 'ai';
  text: string;
  translation?: string;
  isTranslating?: boolean;
}

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
 * de una pausa natural del usuario.
 */
const USER_SILENCE_TIMEOUT_MS = 2000;


// ==================================================================
// 2. EL HOOK PRINCIPAL: useAudioStreaming
// ==================================================================

export const useAudioStreaming = (
  authToken: string | null,
  targetLanguage: LanguageCode = DEFAULT_LANGUAGE,
  sourceLanguage: LanguageCode = DEFAULT_SOURCE_LANGUAGE
) => {
  const [conversationState, setConversationState] = useState<ConversationState>('idle');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [lastUserTranscript, setLastUserTranscript] = useState('');
  const [currentVolume, setCurrentVolume] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const [authExpired, setAuthExpired] = useState(false);
  const [isMicPaused, setIsMicPaused] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const analyserNodeRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const shouldRecognizeRef = useRef(false);
  const micPausedRef = useRef(false);
  const turnBufferRef = useRef('');
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    recognitionRef.current?.stop();
    mediaStreamRef.current?.getTracks().forEach(track => track.stop());
    if (audioContextRef.current?.state !== 'closed') audioContextRef.current?.close();
    if (sessionIdRef.current) audioOutputManager.stop(sessionIdRef.current);
    if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
    }
    wsRef.current = null;
    audioContextRef.current = null;
    mediaStreamRef.current = null;
    recognitionRef.current = null;
    animationFrameRef.current = null;
  }, []);

  const analyseAudio = useCallback(() => {
    if (!analyserNodeRef.current) return;
    const dataArray = new Float32Array(analyserNodeRef.current.fftSize);
    analyserNodeRef.current.getFloatTimeDomainData(dataArray);
    let sumOfSquares = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sumOfSquares += dataArray[i] * dataArray[i];
    }
    const rms = Math.sqrt(sumOfSquares / dataArray.length);
    setCurrentVolume(rms);
    animationFrameRef.current = requestAnimationFrame(analyseAudio);
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
      console.log(`[SpeechRecognition] Ignorado (la IA está ocupada): "${text}"`);
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
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0]?.transcript ?? '';
        if (!transcript) continue;

        // El "final" del propio navegador no dispara el envío al toque: solo
        // vamos acumulando el texto confirmado y reiniciando el temporizador
        // de silencio en cada actividad (final o interina). Recién cuando
        // pasan USER_SILENCE_TIMEOUT_MS sin ninguna novedad, se considera que
        // el usuario terminó de hablar.
        if (result.isFinal) {
          turnBufferRef.current = `${turnBufferRef.current} ${transcript}`.trim();
          setLastUserTranscript(turnBufferRef.current);
        } else {
          setLastUserTranscript(`${turnBufferRef.current} ${transcript}`.trim() + '...');
        }

        clearSilenceTimer();
        silenceTimerRef.current = setTimeout(() => {
          const finalText = turnBufferRef.current.trim();
          turnBufferRef.current = '';
          if (finalText) {
            console.log(`[SpeechRecognition] Turno finalizado tras ${USER_SILENCE_TIMEOUT_MS}ms de silencio: "${finalText}"`);
            sendUserFinalTranscript(finalText);
          }
        }, USER_SILENCE_TIMEOUT_MS);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === 'no-speech' || event.error === 'aborted') return;
      console.error('[SpeechRecognition] Error:', event.error);
      if (event.error === 'not-allowed' || event.error === 'audio-capture') {
        setErrorMessage('Microphone permission denied.');
        setConversationState('error');
        cleanup();
      }
    };

    // El reconocimiento continuo del navegador se corta solo cada tanto
    // (silencios largos, límites internos); lo reiniciamos mientras la
    // conversación siga activa y no esté pausado a propósito (IA hablando).
    recognition.onend = () => {
      if (shouldRecognizeRef.current && !micPausedRef.current) {
        recognition.start();
      }
    };

    recognitionRef.current = recognition;
    shouldRecognizeRef.current = true;
    recognition.start();
  }, [cleanup, clearSilenceTimer, sendUserFinalTranscript, targetLanguage]);

  const initMicrophone = useCallback(async () => {
    try {
      // Pedimos cancelación de eco explícita: sin esto, el micrófono capta el
      // propio audio de la síntesis de voz de la IA saliendo por los parlantes
      // y lo interpreta como que el usuario la está interrumpiendo (barge-in falso).
      mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }
      const source = audioContextRef.current.createMediaStreamSource(mediaStreamRef.current);
      analyserNodeRef.current = audioContextRef.current.createAnalyser();
      analyserNodeRef.current.fftSize = 2048;
      source.connect(analyserNodeRef.current);
      initSpeechRecognition();
      animationFrameRef.current = requestAnimationFrame(analyseAudio);
    } catch (error: any) {
      setErrorMessage(error.name === 'NotAllowedError' ? 'Microphone permission denied.' : 'No microphone found.');
      setConversationState('error');
      cleanup();
    }
  }, [analyseAudio, cleanup, initSpeechRecognition]);

  const handleServerMessage = useCallback((event: MessageEvent) => {
    const message: ServerMessage = JSON.parse(event.data);
    if ('generationId' in message && message.generationId !== generationIdRef.current) {
      generationIdRef.current = message.generationId;
      aiResponseBufferRef.current = '';
      hasAudioRef.current = false;
      pendingAudioChunksRef.current = 0;
      finalReceivedRef.current = false;
    }
    switch (message.type) {
      case 'ai_delta':
        if (conversationStateRef.current !== 'ai_speaking') {
          pauseMic();
          setConversationState('ai_speaking');
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
      initMicrophone();
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
  }, [authToken, cleanup, initMicrophone, handleServerMessage, targetLanguage, sourceLanguage]);

  const startConversation = useCallback(() => {
    if (conversationStateRef.current === 'idle') {
      sessionIdRef.current = uuidv4();
      setChatMessages([]);
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
    currentVolume,
  };
};

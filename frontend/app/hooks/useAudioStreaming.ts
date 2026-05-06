'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { audioOutputManager } from '@/app/services/AudioOutputManager';

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
  | 'ai_speaking'   // La IA está respondiendo (streaming de audio/texto).
  | 'error';        // Ocurrió un error.

/**
 * @description
 * Mensajes que el servidor puede enviar al cliente.
 * Se utiliza una unión discriminada (`type`) para que TypeScript pueda
 * inferir el tipo de payload de cada mensaje, garantizando seguridad de tipos.
 */
export type ServerMessage =
  | { type: 'user_interim'; text: string }
  | { type: 'user_final'; text: string }
  | { type: 'ai_delta'; text: string; generationId: string }
  | { type: 'ai_audio_chunk'; chunk: string; generationId: string }
  | { type: 'ai_final'; generationId: string }
  | { type: 'error'; message: string };

/**
 * @description
 * Representa un mensaje en el historial del chat.
 */
export interface ChatMessage {
  sender: 'user' | 'ai';
  text: string;
}

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

// --- Constantes de configuración ---

/** Límite superior para el backoff exponencial en ms (30 segundos) */
const MAX_RECONNECT_DELAY = 30000;
/** Límite de buffer del WebSocket para control de backpressure. Si se supera, dejamos de enviar audio. */
const WEBSOCKET_BUFFER_THRESHOLD = 16384; // 16 KB
/** Umbral de RMS para la detección de silencio (VAD). Ajustar según sensibilidad del mic. */
const VAD_RMS_THRESHOLD = 0.02;
/** Duración en ms de silencio antes de considerar que el usuario ha terminado de hablar. */
const VAD_SILENCE_DURATION_MS = 800;
/** Intervalo para el throttling de actualizaciones de la UI para el texto de la IA (en ms). */
const AI_TEXT_THROTTLE_MS = 50;


// ==================================================================
// 2. EL HOOK PRINCIPAL: useAudioStreaming
// ==================================================================

export const useAudioStreaming = (authToken: string | null) => {
  const [conversationState, setConversationState] = useState<ConversationState>('idle');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [lastUserTranscript, setLastUserTranscript] = useState('');
  const [currentVolume, setCurrentVolume] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');

  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const analyserNodeRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const silenceSinceRef = useRef<number | null>(null);
  const aiResponseBufferRef = useRef('');
  const lastUiUpdateTimeRef = useRef(0);
  const sessionIdRef = useRef<string | null>(null);
  const generationIdRef = useRef<string | null>(null);

  const cleanup = useCallback(() => {
    console.log('[Cleanup] Realizando limpieza completa...');
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    if (mediaRecorderRef.current?.state !== 'inactive') mediaRecorderRef.current?.stop();
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
    mediaRecorderRef.current = null;
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

    const currentState = conversationStateRef.current; // Usar ref para el estado

    if (rms > VAD_RMS_THRESHOLD) {
      silenceSinceRef.current = null;
      if (currentState === 'ai_speaking') {
        console.log('[Barge-in] User interruption detected.');
        if (sessionIdRef.current) audioOutputManager.stop(sessionIdRef.current);
        if (wsRef.current && generationIdRef.current) {
          wsRef.current.send(JSON.stringify({ type: 'barge_in', generationId: generationIdRef.current }));
        }
        aiResponseBufferRef.current = '';
        setConversationState('listening');
      }
    } else {
      if (currentState === 'listening') {
        if (!silenceSinceRef.current) {
          silenceSinceRef.current = Date.now();
        } else if (Date.now() - silenceSinceRef.current > VAD_SILENCE_DURATION_MS) {
          console.log('[VAD] Silence detected, ending user turn.');
          if (mediaRecorderRef.current?.state === 'recording') {
            mediaRecorderRef.current.stop();
            mediaRecorderRef.current.start(250);
          }
          setConversationState('processing');
        }
      }
    }
    animationFrameRef.current = requestAnimationFrame(analyseAudio);
  }, []);

  const conversationStateRef = useRef(conversationState);
  useEffect(() => {
    conversationStateRef.current = conversationState;
  }, [conversationState]);

  const initRecorder = useCallback(() => {
    if (!mediaStreamRef.current || !wsRef.current) return;
    mediaRecorderRef.current = new MediaRecorder(mediaStreamRef.current, { mimeType: 'audio/webm;codecs=opus' });
    mediaRecorderRef.current.ondataavailable = (event) => {
      if (wsRef.current && wsRef.current.bufferedAmount > WEBSOCKET_BUFFER_THRESHOLD) {
        return;
      }
      if (event.data.size > 0 && wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(event.data);
      }
    };
    mediaRecorderRef.current.start(250);
  }, []);

  const initMicrophone = useCallback(async () => {
    try {
      mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }
      const source = audioContextRef.current.createMediaStreamSource(mediaStreamRef.current);
      analyserNodeRef.current = audioContextRef.current.createAnalyser();
      analyserNodeRef.current.fftSize = 2048;
      source.connect(analyserNodeRef.current);
      initRecorder();
      animationFrameRef.current = requestAnimationFrame(analyseAudio);
    } catch (error: any) {
      setErrorMessage(error.name === 'NotAllowedError' ? 'Microphone permission denied.' : 'No microphone found.');
      setConversationState('error');
      cleanup();
    }
  }, [analyseAudio, cleanup, initRecorder]);

  const handleServerMessage = useCallback((event: MessageEvent) => {
    const message: ServerMessage = JSON.parse(event.data);
    if ('generationId' in message && message.generationId !== generationIdRef.current) {
      generationIdRef.current = message.generationId;
      aiResponseBufferRef.current = '';
    }
    switch (message.type) {
      case 'user_interim': setLastUserTranscript(message.text + '...'); break;
      case 'user_final':
        setConversationState('processing');
        setLastUserTranscript(message.text);
        setChatMessages(prev => [...prev, { sender: 'user', text: message.text }]);
        break;
      case 'ai_delta':
        if (conversationStateRef.current !== 'ai_speaking') {
          setConversationState('ai_speaking');
          setChatMessages(prev => [...prev, { sender: 'ai', text: '' }]);
        }
        aiResponseBufferRef.current += message.text;
        break;
      case 'ai_audio_chunk':
        if (sessionIdRef.current && generationIdRef.current) {
          const audioChunk = base64ToArrayBuffer(message.chunk);
          audioOutputManager.play({ chunk: audioChunk, sessionId: sessionIdRef.current, generationId: generationIdRef.current });
        }
        break;
      case 'ai_final':
        setConversationState('listening');
        aiResponseBufferRef.current = '';
        silenceSinceRef.current = null;
        break;
      case 'error':
        setErrorMessage(message.message);
        setConversationState('error');
        cleanup();
        break;
    }
  }, [cleanup]);

  const connectWebSocket = useCallback(() => {
    if (!authToken) {
      setErrorMessage('Authentication required.');
      setConversationState('error');
      return;
    }
    cleanup();
    const url = `${process.env.NEXT_PUBLIC_WEBSOCKET_URL}?token=${authToken}`;
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
      } else {
        setConversationState('idle');
      }
    };
  }, [authToken, cleanup, initMicrophone, handleServerMessage]);

  const startConversation = useCallback(() => {
    if (conversationStateRef.current === 'idle') {
      sessionIdRef.current = uuidv4();
      setChatMessages([]);
      setLastUserTranscript('');
      setErrorMessage('');
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
    startConversation,
    stopConversation,
    currentVolume,
  };
};

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

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
  | { type: 'ai_delta'; text: string }
  | { type: 'ai_final' }
  | { type: 'error'; message: string };

/**
 * @description
 * Representa un mensaje en el historial del chat.
 */
export interface ChatMessage {
  sender: 'user' | 'ai';
  text: string;
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
  // --- Estados de React ---
  // Estados que, al cambiar, DEBEN provocar un re-render de la UI.
  const [conversationState, setConversationState] = useState<ConversationState>('idle');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [lastUserTranscript, setLastUserTranscript] = useState('');
  const [currentVolume, setCurrentVolume] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');

  // --- Referencias de React ---
  // Se usan para almacenar valores que no deben disparar re-renders al cambiar.
  // Es clave para el rendimiento y para mantener instancias de objetos (WebSocket, etc.).
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const analyserNodeRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Referencias para la lógica de negocio
  const reconnectAttemptsRef = useRef(0);
  const silenceSinceRef = useRef<number | null>(null);
  const aiResponseBufferRef = useRef('');
  const lastUiUpdateTimeRef = useRef(0);

  /**
   * @description
   * Función centralizada de limpieza. Se asegura de que todos los recursos
   * (streams, sockets, timers) se liberen correctamente para evitar memory leaks.
   * Es idempotente, lo que significa que se puede llamar varias veces sin efectos secundarios.
   */
  const cleanup = useCallback(() => {
    console.log('[Cleanup] Realizando limpieza completa...');

    // Detener bucle de análisis de volumen
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    // Detener MediaRecorder
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }

    // Detener tracks de audio del micrófono
    mediaStreamRef.current?.getTracks().forEach(track => track.stop());

    // Cerrar AudioContext
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
    }

    // Cerrar WebSocket de forma segura
    if (wsRef.current) {
      if (wsRef.current.readyState === WebSocket.OPEN) {
        // Señal explícita de fin de sesión antes de cerrar
        wsRef.current.send(JSON.stringify({ type: 'session_end' }));
      }
      wsRef.current.onclose = null; // Evitar que se dispare la lógica de reconexión
      wsRef.current.onerror = null;
      wsRef.current.onmessage = null;
      wsRef.current.onopen = null;
      if (wsRef.current.readyState < WebSocket.CLOSING) {
        wsRef.current.close();
      }
    }

    // Reiniciar referencias
    mediaRecorderRef.current = null;
    mediaStreamRef.current = null;
    audioContextRef.current = null;
    wsRef.current = null;
  }, []);

  /**
   * @description
   * Maneja los mensajes entrantes del servidor.
   * La lógica está contenida aquí para mantener limpio el manejador de `onmessage`.
   */
  const handleServerMessage = useCallback((event: MessageEvent) => {
    let message: ServerMessage;
    try {
      message = JSON.parse(event.data);
    } catch (error) {
      console.error('[WebSocket] Error al parsear mensaje del servidor:', error);
      setConversationState('error');
      setErrorMessage('Mensaje inválido del servidor.');
      return;
    }

    switch (message.type) {
      case 'user_interim':
        setLastUserTranscript(message.text + '...');
        break;

      case 'user_final':
        setConversationState('processing');
        setLastUserTranscript(message.text);
        setChatMessages(prev => [...prev, { sender: 'user', text: message.text }]);
        break;

      case 'ai_delta':
        if (conversationState !== 'ai_speaking') {
          setConversationState('ai_speaking');
          setChatMessages(prev => [...prev, { sender: 'ai', text: '' }]);
        }
        aiResponseBufferRef.current += message.text;
        break;

      case 'ai_final':
        // La respuesta final de la IA resetea el buffer y nos prepara para escuchar de nuevo.
        setConversationState('listening');
        aiResponseBufferRef.current = '';
        silenceSinceRef.current = null; // Reiniciar VAD
        break;

      case 'error':
        setConversationState('error');
        setErrorMessage(message.message);
        cleanup();
        break;
    }
  }, [cleanup, conversationState]);

  /**
   * @description
   * Actualiza la UI con el texto acumulado de la IA de forma eficiente.
   * Utiliza throttling para evitar re-renders excesivos en cada token recibido,
   * lo cual es crucial para el rendimiento.
   */
  const throttledUiUpdate = useCallback(() => {
    const now = Date.now();
    if (now - lastUiUpdateTimeRef.current > AI_TEXT_THROTTLE_MS && aiResponseBufferRef.current) {
      setChatMessages(prev => {
        const newMessages = [...prev];
        const lastMessage = newMessages[newMessages.length - 1];
        if (lastMessage && lastMessage.sender === 'ai') {
          lastMessage.text = aiResponseBufferRef.current;
        }
        return newMessages;
      });
      lastUiUpdateTimeRef.current = now;
    }
  }, []);

  /**
   * @description
   * Bucle de análisis de audio que se ejecuta con requestAnimationFrame.
   * Calcula el volumen (RMS) y gestiona la detección de silencio (VAD).
   */
  const analyseAudio = useCallback(() => {
    if (!analyserNodeRef.current) {
      return;
    }

    const bufferLength = analyserNodeRef.current.fftSize;
    const dataArray = new Float32Array(bufferLength);
    analyserNodeRef.current.getFloatTimeDomainData(dataArray);

    // --- Cálculo de RMS (Root Mean Square) ---
    // Es una medida más precisa del "volumen" o "potencia" de la señal que un promedio simple.
    let sumOfSquares = 0;
    for (let i = 0; i < bufferLength; i++) {
      sumOfSquares += dataArray[i] * dataArray[i];
    }
    const rms = Math.sqrt(sumOfSquares / bufferLength);
    setCurrentVolume(rms);

    // --- Lógica de VAD (Voice Activity Detection) ---
    if (conversationState === 'listening') {
      if (rms > VAD_RMS_THRESHOLD) {
        // Hay sonido, reseteamos el contador de silencio.
        silenceSinceRef.current = null;
      } else {
        // No hay sonido, empezamos a contar.
        if (!silenceSinceRef.current) {
          silenceSinceRef.current = Date.now();
        } else if (Date.now() - silenceSinceRef.current > VAD_SILENCE_DURATION_MS) {
          // Si el silencio supera la duración definida, el usuario terminó de hablar.
          console.log('[VAD] Silencio detectado, finalizando turno de usuario.');
          if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.stop(); // Esto enviará el último chunk de audio
            mediaRecorderRef.current.start(250); // Reiniciar para el proximo turno
          }
          setConversationState('processing');
        }
      }
    }

    animationFrameRef.current = requestAnimationFrame(analyseAudio);
  }, [conversationState]);

  /**
   * @description Inicializa el MediaRecorder para grabar el audio del micrófono.
   */
  const initRecorder = useCallback(() => {
    if (!mediaStreamRef.current || !wsRef.current) return;

    mediaRecorderRef.current = new MediaRecorder(mediaStreamRef.current, {
      mimeType: 'audio/webm;codecs=opus'
    });

    mediaRecorderRef.current.ondataavailable = (event) => {
      // --- Control de Backpressure ---
      // Si el buffer del WebSocket está lleno, no enviamos más datos para no saturar la conexión.
      if (wsRef.current && wsRef.current.bufferedAmount > WEBSOCKET_BUFFER_THRESHOLD) {
        console.warn('[Backpressure] Límite de buffer del WebSocket superado. Pausando envío.');
        return;
      }

      if (event.data.size > 0 && wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(event.data);
      }
    };

    mediaRecorderRef.current.start(250); // Enviar chunks de audio cada 250ms
  }, []);

  /**
   * @description Pide permiso al usuario e inicializa el stream del micrófono y el AudioContext.
   */
  const initMicrophone = useCallback(async () => {
    try {
      mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });

      // --- Manejo de AudioContext ---
      // Se crea una sola vez y se reutiliza. Se maneja el estado 'suspended' que
      // ocurre en algunos navegadores por políticas de autoplay.
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }

      const sourceNode = audioContextRef.current.createMediaStreamSource(mediaStreamRef.current);
      analyserNodeRef.current = audioContextRef.current.createAnalyser();
      analyserNodeRef.current.fftSize = 2048;
      sourceNode.connect(analyserNodeRef.current);

      initRecorder();
      animationFrameRef.current = requestAnimationFrame(analyseAudio);

    } catch (error: any) {
      console.error('[Microphone] Error al obtener acceso al micrófono:', error);
      let userMessage = 'No se pudo acceder al micrófono.';
      if (error.name === 'NotAllowedError') {
        userMessage = 'Permiso para micrófono denegado. Revíselo en la configuración de su navegador.';
      } else if (error.name === 'NotFoundError') {
        userMessage = 'No se encontró ningún micrófono conectado.';
      }
      setErrorMessage(userMessage);
      setConversationState('error');
      cleanup();
    }
  }, [analyseAudio, cleanup, initRecorder]);

  /**
   * @description Establece la conexión WebSocket y define sus manejadores de eventos.
   */
  const connectWebSocket = useCallback(() => {
    if (!authToken) {
      console.error('[WebSocket] Token de autenticación no proporcionado.');
      setErrorMessage('Autenticación requerida.');
      setConversationState('error');
      return;
    }

    cleanup(); // Limpieza previa por si hay una conexión anterior.

    const url = `${process.env.NEXT_PUBLIC_WEBSOCKET_URL}?token=${authToken}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;
    setConversationState('connecting');

    ws.onopen = () => {
      console.log('[WebSocket] Conexión establecida.');
      setConversationState('listening');
      reconnectAttemptsRef.current = 0; // Reiniciar contador de reconexión
      initMicrophone();
    };

    ws.onmessage = handleServerMessage;

    ws.onerror = (error) => {
      console.error('[WebSocket] Error en la conexión:', error);
      setErrorMessage('Error de conexión.');
      setConversationState('error');
    };

    ws.onclose = (event) => {
      // --- Lógica de Reconexión con Backoff Exponencial ---
      // Si la conexión se cierra inesperadamente (código 1006), intentamos reconectar.
      if (event.code === 1006) {
        console.warn(`[WebSocket] Conexión cerrada inesperadamente. Intentando reconectar...`);
        const delay = Math.min(
          MAX_RECONNECT_DELAY,
          (2 ** reconnectAttemptsRef.current) * 1000
        );
        setTimeout(() => {
          reconnectAttemptsRef.current++;
          connectWebSocket();
        }, delay);
      } else {
        console.log('[WebSocket] Conexión cerrada limpiamente.');
        if (conversationState !== 'idle') {
          setConversationState('idle');
        }
      }
    };
  }, [authToken, cleanup, handleServerMessage, initMicrophone, conversationState]);

  // --- Funciones de control expuestas por el hook ---

  /**
   * @description Inicia todo el proceso de la conversación.
   */
  const startConversation = useCallback(() => {
    if (conversationState === 'idle') {
      setChatMessages([]);
      setLastUserTranscript('');
      setErrorMessage('');
      connectWebSocket();
    }
  }, [conversationState, connectWebSocket]);

  /**
   * @description Detiene la conversación y realiza una limpieza completa.
   */
  const stopConversation = useCallback(() => {
    setConversationState('idle');
    cleanup();
  }, [cleanup]);

  // --- Efecto de limpieza ---
  // Se asegura de que todo se limpie cuando el componente que usa el hook se desmonte.
  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  // --- Efecto para el throttling de la UI ---
  // Este efecto gestiona el bucle de actualización para el texto de la IA.
  useEffect(() => {
    if (conversationState === 'ai_speaking') {
      const intervalId = setInterval(throttledUiUpdate, AI_TEXT_THROTTLE_MS);
      return () => clearInterval(intervalId);
    }
  }, [conversationState, throttledUiUpdate]);


  // ==================================================================
  // 3. VALORES DE RETORNO
  // ==================================================================
  return {
    // --- Estado ---
    conversationState,
    chatMessages,
    lastUserTranscript,
    errorMessage,

    // --- Controles ---
    startConversation,
    stopConversation,

    // --- Datos en tiempo real ---
    currentVolume, // Puede usarse para visualizaciones
  };
};

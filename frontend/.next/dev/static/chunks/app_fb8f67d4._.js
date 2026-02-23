(globalThis.TURBOPACK || (globalThis.TURBOPACK = [])).push([typeof document === "object" ? document.currentScript : undefined,
"[project]/app/hooks/useAudioStreaming.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "useAudioStreaming",
    ()=>useAudioStreaming
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$polyfills$2f$process$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = /*#__PURE__*/ __turbopack_context__.i("[project]/node_modules/next/dist/build/polyfills/process.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var _s = __turbopack_context__.k.signature();
'use client';
;
// --- Constantes de configuración ---
/** Límite superior para el backoff exponencial en ms (30 segundos) */ const MAX_RECONNECT_DELAY = 30000;
/** Límite de buffer del WebSocket para control de backpressure. Si se supera, dejamos de enviar audio. */ const WEBSOCKET_BUFFER_THRESHOLD = 16384; // 16 KB
/** Umbral de RMS para la detección de silencio (VAD). Ajustar según sensibilidad del mic. */ const VAD_RMS_THRESHOLD = 0.02;
/** Duración en ms de silencio antes de considerar que el usuario ha terminado de hablar. */ const VAD_SILENCE_DURATION_MS = 800;
/** Intervalo para el throttling de actualizaciones de la UI para el texto de la IA (en ms). */ const AI_TEXT_THROTTLE_MS = 50;
const useAudioStreaming = (authToken)=>{
    _s();
    // --- Estados de React ---
    // Estados que, al cambiar, DEBEN provocar un re-render de la UI.
    const [conversationState, setConversationState] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])('idle');
    const [chatMessages, setChatMessages] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])([]);
    const [lastUserTranscript, setLastUserTranscript] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])('');
    const [currentVolume, setCurrentVolume] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(0);
    const [errorMessage, setErrorMessage] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])('');
    // --- Referencias de React ---
    // Se usan para almacenar valores que no deben disparar re-renders al cambiar.
    // Es clave para el rendimiento y para mantener instancias de objetos (WebSocket, etc.).
    const wsRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    const audioContextRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    const mediaRecorderRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    const mediaStreamRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    const analyserNodeRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    const animationFrameRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    // Referencias para la lógica de negocio
    const reconnectAttemptsRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(0);
    const silenceSinceRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    const aiResponseBufferRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])('');
    const lastUiUpdateTimeRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(0);
    /**
   * @description
   * Función centralizada de limpieza. Se asegura de que todos los recursos
   * (streams, sockets, timers) se liberen correctamente para evitar memory leaks.
   * Es idempotente, lo que significa que se puede llamar varias veces sin efectos secundarios.
   */ const cleanup = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "useAudioStreaming.useCallback[cleanup]": ()=>{
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
            mediaStreamRef.current?.getTracks().forEach({
                "useAudioStreaming.useCallback[cleanup]": (track)=>track.stop()
            }["useAudioStreaming.useCallback[cleanup]"]);
            // Cerrar AudioContext
            if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
                audioContextRef.current.close();
            }
            // Cerrar WebSocket de forma segura
            if (wsRef.current) {
                if (wsRef.current.readyState === WebSocket.OPEN) {
                    // Señal explícita de fin de sesión antes de cerrar
                    wsRef.current.send(JSON.stringify({
                        type: 'session_end'
                    }));
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
        }
    }["useAudioStreaming.useCallback[cleanup]"], []);
    /**
   * @description
   * Maneja los mensajes entrantes del servidor.
   * La lógica está contenida aquí para mantener limpio el manejador de `onmessage`.
   */ const handleServerMessage = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "useAudioStreaming.useCallback[handleServerMessage]": (event)=>{
            let message;
            try {
                message = JSON.parse(event.data);
            } catch (error) {
                console.error('[WebSocket] Error al parsear mensaje del servidor:', error);
                setConversationState('error');
                setErrorMessage('Mensaje inválido del servidor.');
                return;
            }
            switch(message.type){
                case 'user_interim':
                    setLastUserTranscript(message.text + '...');
                    break;
                case 'user_final':
                    setConversationState('processing');
                    setLastUserTranscript(message.text);
                    setChatMessages({
                        "useAudioStreaming.useCallback[handleServerMessage]": (prev)=>[
                                ...prev,
                                {
                                    sender: 'user',
                                    text: message.text
                                }
                            ]
                    }["useAudioStreaming.useCallback[handleServerMessage]"]);
                    break;
                case 'ai_delta':
                    if (conversationState !== 'ai_speaking') {
                        setConversationState('ai_speaking');
                        setChatMessages({
                            "useAudioStreaming.useCallback[handleServerMessage]": (prev)=>[
                                    ...prev,
                                    {
                                        sender: 'ai',
                                        text: ''
                                    }
                                ]
                        }["useAudioStreaming.useCallback[handleServerMessage]"]);
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
        }
    }["useAudioStreaming.useCallback[handleServerMessage]"], [
        cleanup,
        conversationState
    ]);
    /**
   * @description
   * Actualiza la UI con el texto acumulado de la IA de forma eficiente.
   * Utiliza throttling para evitar re-renders excesivos en cada token recibido,
   * lo cual es crucial para el rendimiento.
   */ const throttledUiUpdate = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "useAudioStreaming.useCallback[throttledUiUpdate]": ()=>{
            const now = Date.now();
            if (now - lastUiUpdateTimeRef.current > AI_TEXT_THROTTLE_MS && aiResponseBufferRef.current) {
                setChatMessages({
                    "useAudioStreaming.useCallback[throttledUiUpdate]": (prev)=>{
                        const newMessages = [
                            ...prev
                        ];
                        const lastMessage = newMessages[newMessages.length - 1];
                        if (lastMessage && lastMessage.sender === 'ai') {
                            lastMessage.text = aiResponseBufferRef.current;
                        }
                        return newMessages;
                    }
                }["useAudioStreaming.useCallback[throttledUiUpdate]"]);
                lastUiUpdateTimeRef.current = now;
            }
        }
    }["useAudioStreaming.useCallback[throttledUiUpdate]"], []);
    /**
   * @description
   * Bucle de análisis de audio que se ejecuta con requestAnimationFrame.
   * Calcula el volumen (RMS) y gestiona la detección de silencio (VAD).
   */ const analyseAudio = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "useAudioStreaming.useCallback[analyseAudio]": ()=>{
            if (!analyserNodeRef.current) {
                return;
            }
            const bufferLength = analyserNodeRef.current.fftSize;
            const dataArray = new Float32Array(bufferLength);
            analyserNodeRef.current.getFloatTimeDomainData(dataArray);
            // --- Cálculo de RMS (Root Mean Square) ---
            // Es una medida más precisa del "volumen" o "potencia" de la señal que un promedio simple.
            let sumOfSquares = 0;
            for(let i = 0; i < bufferLength; i++){
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
        }
    }["useAudioStreaming.useCallback[analyseAudio]"], [
        conversationState
    ]);
    /**
   * @description Inicializa el MediaRecorder para grabar el audio del micrófono.
   */ const initRecorder = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "useAudioStreaming.useCallback[initRecorder]": ()=>{
            if (!mediaStreamRef.current || !wsRef.current) return;
            mediaRecorderRef.current = new MediaRecorder(mediaStreamRef.current, {
                mimeType: 'audio/webm;codecs=opus'
            });
            mediaRecorderRef.current.ondataavailable = ({
                "useAudioStreaming.useCallback[initRecorder]": (event)=>{
                    // --- Control de Backpressure ---
                    // Si el buffer del WebSocket está lleno, no enviamos más datos para no saturar la conexión.
                    if (wsRef.current && wsRef.current.bufferedAmount > WEBSOCKET_BUFFER_THRESHOLD) {
                        console.warn('[Backpressure] Límite de buffer del WebSocket superado. Pausando envío.');
                        return;
                    }
                    if (event.data.size > 0 && wsRef.current?.readyState === WebSocket.OPEN) {
                        wsRef.current.send(event.data);
                    }
                }
            })["useAudioStreaming.useCallback[initRecorder]"];
            mediaRecorderRef.current.start(250); // Enviar chunks de audio cada 250ms
        }
    }["useAudioStreaming.useCallback[initRecorder]"], []);
    /**
   * @description Pide permiso al usuario e inicializa el stream del micrófono y el AudioContext.
   */ const initMicrophone = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "useAudioStreaming.useCallback[initMicrophone]": async ()=>{
            try {
                mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({
                    audio: true
                });
                // --- Manejo de AudioContext ---
                // Se crea una sola vez y se reutiliza. Se maneja el estado 'suspended' que
                // ocurre en algunos navegadores por políticas de autoplay.
                if (!audioContextRef.current) {
                    audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
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
            } catch (error) {
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
        }
    }["useAudioStreaming.useCallback[initMicrophone]"], [
        analyseAudio,
        cleanup,
        initRecorder
    ]);
    /**
   * @description Establece la conexión WebSocket y define sus manejadores de eventos.
   */ const connectWebSocket = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "useAudioStreaming.useCallback[connectWebSocket]": ()=>{
            if (!authToken) {
                console.error('[WebSocket] Token de autenticación no proporcionado.');
                setErrorMessage('Autenticación requerida.');
                setConversationState('error');
                return;
            }
            cleanup(); // Limpieza previa por si hay una conexión anterior.
            const url = `${("TURBOPACK compile-time value", "ws://localhost:8080")}?token=${authToken}`;
            const ws = new WebSocket(url);
            wsRef.current = ws;
            setConversationState('connecting');
            ws.onopen = ({
                "useAudioStreaming.useCallback[connectWebSocket]": ()=>{
                    console.log('[WebSocket] Conexión establecida.');
                    setConversationState('listening');
                    reconnectAttemptsRef.current = 0; // Reiniciar contador de reconexión
                    initMicrophone();
                }
            })["useAudioStreaming.useCallback[connectWebSocket]"];
            ws.onmessage = handleServerMessage;
            ws.onerror = ({
                "useAudioStreaming.useCallback[connectWebSocket]": (error)=>{
                    console.error('[WebSocket] Error en la conexión:', error);
                    setErrorMessage('Error de conexión.');
                    setConversationState('error');
                }
            })["useAudioStreaming.useCallback[connectWebSocket]"];
            ws.onclose = ({
                "useAudioStreaming.useCallback[connectWebSocket]": (event)=>{
                    // --- Lógica de Reconexión con Backoff Exponencial ---
                    // Si la conexión se cierra inesperadamente (código 1006), intentamos reconectar.
                    if (event.code === 1006) {
                        console.warn(`[WebSocket] Conexión cerrada inesperadamente. Intentando reconectar...`);
                        const delay = Math.min(MAX_RECONNECT_DELAY, 2 ** reconnectAttemptsRef.current * 1000);
                        setTimeout({
                            "useAudioStreaming.useCallback[connectWebSocket]": ()=>{
                                reconnectAttemptsRef.current++;
                                connectWebSocket();
                            }
                        }["useAudioStreaming.useCallback[connectWebSocket]"], delay);
                    } else {
                        console.log('[WebSocket] Conexión cerrada limpiamente.');
                        if (conversationState !== 'idle') {
                            setConversationState('idle');
                        }
                    }
                }
            })["useAudioStreaming.useCallback[connectWebSocket]"];
        }
    }["useAudioStreaming.useCallback[connectWebSocket]"], [
        authToken,
        cleanup,
        handleServerMessage,
        initMicrophone,
        conversationState
    ]);
    // --- Funciones de control expuestas por el hook ---
    /**
   * @description Inicia todo el proceso de la conversación.
   */ const startConversation = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "useAudioStreaming.useCallback[startConversation]": ()=>{
            if (conversationState === 'idle') {
                setChatMessages([]);
                setLastUserTranscript('');
                setErrorMessage('');
                connectWebSocket();
            }
        }
    }["useAudioStreaming.useCallback[startConversation]"], [
        conversationState,
        connectWebSocket
    ]);
    /**
   * @description Detiene la conversación y realiza una limpieza completa.
   */ const stopConversation = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "useAudioStreaming.useCallback[stopConversation]": ()=>{
            setConversationState('idle');
            cleanup();
        }
    }["useAudioStreaming.useCallback[stopConversation]"], [
        cleanup
    ]);
    // --- Efecto de limpieza ---
    // Se asegura de que todo se limpie cuando el componente que usa el hook se desmonte.
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "useAudioStreaming.useEffect": ()=>{
            return cleanup;
        }
    }["useAudioStreaming.useEffect"], [
        cleanup
    ]);
    // --- Efecto para el throttling de la UI ---
    // Este efecto gestiona el bucle de actualización para el texto de la IA.
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "useAudioStreaming.useEffect": ()=>{
            if (conversationState === 'ai_speaking') {
                const intervalId = setInterval(throttledUiUpdate, AI_TEXT_THROTTLE_MS);
                return ({
                    "useAudioStreaming.useEffect": ()=>clearInterval(intervalId)
                })["useAudioStreaming.useEffect"];
            }
        }
    }["useAudioStreaming.useEffect"], [
        conversationState,
        throttledUiUpdate
    ]);
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
        currentVolume
    };
};
_s(useAudioStreaming, "DQqhCoJzi8psLjHX0G7Eku5RZDc=");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/app/dashboard/components/ChatHistory.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "ChatHistory",
    ()=>ChatHistory
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
'use client';
;
const ChatHistory = ({ chatMessages })=>{
    _s();
    const messagesEndRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "ChatHistory.useEffect": ()=>{
            messagesEndRef.current?.scrollIntoView({
                behavior: 'smooth',
                block: 'end'
            });
        }
    }["ChatHistory.useEffect"], [
        chatMessages
    ]);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "mb-6 p-4 bg-white rounded-2xl shadow-lg border border-slate-100 h-96 overflow-y-auto flex flex-col-reverse",
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "space-y-4",
            ref: messagesEndRef,
            children: [
                ...chatMessages
            ].reverse().map((msg, index)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: `flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`,
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: `max-w-xs md:max-w-md lg:max-w-lg p-3 rounded-lg ${msg.sender === 'user' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-800'}`,
                        children: msg.text
                    }, void 0, false, {
                        fileName: "[project]/app/dashboard/components/ChatHistory.tsx",
                        lineNumber: 33,
                        columnNumber: 13
                    }, ("TURBOPACK compile-time value", void 0))
                }, index, false, {
                    fileName: "[project]/app/dashboard/components/ChatHistory.tsx",
                    lineNumber: 29,
                    columnNumber: 11
                }, ("TURBOPACK compile-time value", void 0)))
        }, void 0, false, {
            fileName: "[project]/app/dashboard/components/ChatHistory.tsx",
            lineNumber: 27,
            columnNumber: 7
        }, ("TURBOPACK compile-time value", void 0))
    }, void 0, false, {
        fileName: "[project]/app/dashboard/components/ChatHistory.tsx",
        lineNumber: 26,
        columnNumber: 5
    }, ("TURBOPACK compile-time value", void 0));
};
_s(ChatHistory, "0epSoi03NVSoD0I0FiLK4iVNXOA=");
_c = ChatHistory;
var _c;
__turbopack_context__.k.register(_c, "ChatHistory");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/app/dashboard/components/StatusDisplay.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "StatusDisplay",
    ()=>StatusDisplay
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
'use client';
;
const StatusDisplay = ({ conversationState, lastUserTranscript })=>{
    const getStatusText = ()=>{
        switch(conversationState){
            case 'idle':
                return "Haz clic en 'Empezar' para iniciar la conversación.";
            case 'connecting':
                return 'Conectando con el servidor...';
            case 'listening':
                return lastUserTranscript || 'Escuchando...';
            case 'processing':
                return lastUserTranscript || 'Procesando...';
            case 'ai_speaking':
                return 'IA está hablando...';
            case 'error':
                return 'Hubo un error en la conexión.';
            default:
                return 'Estado desconocido.';
        }
    };
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "mb-6 p-4 bg-white rounded-2xl shadow-inner border border-slate-200 min-h-[4rem] flex items-center justify-center",
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
            className: "text-slate-600 italic text-center",
            children: getStatusText()
        }, void 0, false, {
            fileName: "[project]/app/dashboard/components/StatusDisplay.tsx",
            lineNumber: 41,
            columnNumber: 7
        }, ("TURBOPACK compile-time value", void 0))
    }, void 0, false, {
        fileName: "[project]/app/dashboard/components/StatusDisplay.tsx",
        lineNumber: 40,
        columnNumber: 5
    }, ("TURBOPACK compile-time value", void 0));
};
_c = StatusDisplay;
var _c;
__turbopack_context__.k.register(_c, "StatusDisplay");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/app/dashboard/components/ActionControls.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "ActionControls",
    ()=>ActionControls
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
'use client';
;
const ActionControls = ({ conversationState, startConversation, stopConversation })=>{
    const isRecording = conversationState === 'listening' || conversationState === 'processing' || conversationState === 'ai_speaking';
    const isConnecting = conversationState === 'connecting';
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "flex items-center space-x-4",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                onClick: startConversation,
                disabled: isRecording || isConnecting,
                className: `px-6 py-3 rounded-full text-white font-semibold transition-colors duration-200
          ${isRecording || isConnecting ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`,
                children: isConnecting ? 'Conectando...' : 'Empezar a Hablar'
            }, void 0, false, {
                fileName: "[project]/app/dashboard/components/ActionControls.tsx",
                lineNumber: 28,
                columnNumber: 7
            }, ("TURBOPACK compile-time value", void 0)),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                onClick: stopConversation,
                disabled: !isRecording,
                className: `px-6 py-3 rounded-full text-white font-semibold transition-colors duration-200
          ${!isRecording ? 'bg-gray-400 cursor-not-allowed' : 'bg-red-600 hover:bg-red-700'}`,
                children: "Detener Conversación"
            }, void 0, false, {
                fileName: "[project]/app/dashboard/components/ActionControls.tsx",
                lineNumber: 36,
                columnNumber: 7
            }, ("TURBOPACK compile-time value", void 0))
        ]
    }, void 0, true, {
        fileName: "[project]/app/dashboard/components/ActionControls.tsx",
        lineNumber: 27,
        columnNumber: 5
    }, ("TURBOPACK compile-time value", void 0));
};
_c = ActionControls;
var _c;
__turbopack_context__.k.register(_c, "ActionControls");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/app/dashboard/components/VolumeVisualizer.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "VolumeVisualizer",
    ()=>VolumeVisualizer
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
'use client';
;
const VolumeVisualizer = ({ conversationState, currentVolume })=>{
    const isListening = conversationState === 'listening';
    // Normalizamos el volumen (RMS es un valor pequeño, ej. 0.0 a 0.2) y lo hacemos más sensible
    const volumeScale = Math.min(1, currentVolume * 10);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "relative flex items-center justify-center w-16 h-16",
        children: [
            isListening && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "absolute inset-0 bg-blue-400 opacity-50 rounded-full transition-transform duration-75 ease-out",
                        style: {
                            transform: `scale(${1 + volumeScale * 0.5})`
                        }
                    }, void 0, false, {
                        fileName: "[project]/app/dashboard/components/VolumeVisualizer.tsx",
                        lineNumber: 28,
                        columnNumber: 11
                    }, ("TURBOPACK compile-time value", void 0)),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "absolute text-blue-800",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("svg", {
                            xmlns: "http://www.w3.org/2000/svg",
                            width: "32",
                            height: "32",
                            viewBox: "0 0 24 24",
                            fill: "none",
                            stroke: "currentColor",
                            strokeWidth: "2",
                            strokeLinecap: "round",
                            strokeLinejoin: "round",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                                    d: "M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"
                                }, void 0, false, {
                                    fileName: "[project]/app/dashboard/components/VolumeVisualizer.tsx",
                                    lineNumber: 33,
                                    columnNumber: 192
                                }, ("TURBOPACK compile-time value", void 0)),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                                    d: "M19 10v2a7 7 0 0 1-14 0v-2"
                                }, void 0, false, {
                                    fileName: "[project]/app/dashboard/components/VolumeVisualizer.tsx",
                                    lineNumber: 33,
                                    columnNumber: 256
                                }, ("TURBOPACK compile-time value", void 0)),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("line", {
                                    x1: "12",
                                    x2: "12",
                                    y1: "19",
                                    y2: "22"
                                }, void 0, false, {
                                    fileName: "[project]/app/dashboard/components/VolumeVisualizer.tsx",
                                    lineNumber: 33,
                                    columnNumber: 294
                                }, ("TURBOPACK compile-time value", void 0))
                            ]
                        }, void 0, true, {
                            fileName: "[project]/app/dashboard/components/VolumeVisualizer.tsx",
                            lineNumber: 33,
                            columnNumber: 14
                        }, ("TURBOPACK compile-time value", void 0))
                    }, void 0, false, {
                        fileName: "[project]/app/dashboard/components/VolumeVisualizer.tsx",
                        lineNumber: 32,
                        columnNumber: 12
                    }, ("TURBOPACK compile-time value", void 0))
                ]
            }, void 0, true),
            conversationState !== 'listening' && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                className: "absolute text-slate-400",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("svg", {
                    xmlns: "http://www.w3.org/2000/svg",
                    width: "32",
                    height: "32",
                    viewBox: "0 0 24 24",
                    fill: "none",
                    stroke: "currentColor",
                    strokeWidth: "2",
                    strokeLinecap: "round",
                    strokeLinejoin: "round",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                            d: "M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"
                        }, void 0, false, {
                            fileName: "[project]/app/dashboard/components/VolumeVisualizer.tsx",
                            lineNumber: 39,
                            columnNumber: 190
                        }, ("TURBOPACK compile-time value", void 0)),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                            d: "M19 10v2a7 7 0 0 1-14 0v-2"
                        }, void 0, false, {
                            fileName: "[project]/app/dashboard/components/VolumeVisualizer.tsx",
                            lineNumber: 39,
                            columnNumber: 254
                        }, ("TURBOPACK compile-time value", void 0)),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("line", {
                            x1: "12",
                            x2: "12",
                            y1: "19",
                            y2: "22"
                        }, void 0, false, {
                            fileName: "[project]/app/dashboard/components/VolumeVisualizer.tsx",
                            lineNumber: 39,
                            columnNumber: 292
                        }, ("TURBOPACK compile-time value", void 0))
                    ]
                }, void 0, true, {
                    fileName: "[project]/app/dashboard/components/VolumeVisualizer.tsx",
                    lineNumber: 39,
                    columnNumber: 12
                }, ("TURBOPACK compile-time value", void 0))
            }, void 0, false, {
                fileName: "[project]/app/dashboard/components/VolumeVisualizer.tsx",
                lineNumber: 38,
                columnNumber: 10
            }, ("TURBOPACK compile-time value", void 0))
        ]
    }, void 0, true, {
        fileName: "[project]/app/dashboard/components/VolumeVisualizer.tsx",
        lineNumber: 25,
        columnNumber: 5
    }, ("TURBOPACK compile-time value", void 0));
};
_c = VolumeVisualizer;
var _c;
__turbopack_context__.k.register(_c, "VolumeVisualizer");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/app/dashboard/components/UserProgress.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "UserProgress",
    ()=>UserProgress
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
'use client';
;
const UserProgress = ({ data, isLoading })=>{
    if (isLoading) {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "text-center p-6 bg-white rounded-2xl shadow-sm border border-slate-100",
            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                className: "text-slate-500",
                children: "Actualizando datos..."
            }, void 0, false, {
                fileName: "[project]/app/dashboard/components/UserProgress.tsx",
                lineNumber: 35,
                columnNumber: 9
            }, ("TURBOPACK compile-time value", void 0))
        }, void 0, false, {
            fileName: "[project]/app/dashboard/components/UserProgress.tsx",
            lineNumber: 34,
            columnNumber: 7
        }, ("TURBOPACK compile-time value", void 0));
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "grid grid-cols-1 md:grid-cols-3 gap-6",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "bg-white p-6 rounded-2xl shadow-sm border border-slate-100",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                        className: "text-sm font-semibold text-slate-400 uppercase",
                        children: "Nivel Actual"
                    }, void 0, false, {
                        fileName: "[project]/app/dashboard/components/UserProgress.tsx",
                        lineNumber: 43,
                        columnNumber: 9
                    }, ("TURBOPACK compile-time value", void 0)),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "text-4xl font-black text-blue-600 mt-2",
                        children: data?.languageLevel || 'N/A'
                    }, void 0, false, {
                        fileName: "[project]/app/dashboard/components/UserProgress.tsx",
                        lineNumber: 46,
                        columnNumber: 9
                    }, ("TURBOPACK compile-time value", void 0))
                ]
            }, void 0, true, {
                fileName: "[project]/app/dashboard/components/UserProgress.tsx",
                lineNumber: 42,
                columnNumber: 7
            }, ("TURBOPACK compile-time value", void 0)),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "md:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-slate-100",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                        className: "text-sm font-semibold text-slate-400 uppercase mb-4",
                        children: "Habilidades Desbloqueadas"
                    }, void 0, false, {
                        fileName: "[project]/app/dashboard/components/UserProgress.tsx",
                        lineNumber: 51,
                        columnNumber: 9
                    }, ("TURBOPACK compile-time value", void 0)),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex flex-wrap gap-2",
                        children: data?.analytics?.masteredTopics && data.analytics.masteredTopics.length > 0 ? data.analytics.masteredTopics.map((topic)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium",
                                children: [
                                    "✓ ",
                                    topic
                                ]
                            }, topic, true, {
                                fileName: "[project]/app/dashboard/components/UserProgress.tsx",
                                lineNumber: 57,
                                columnNumber: 15
                            }, ("TURBOPACK compile-time value", void 0))) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "text-slate-500 text-sm",
                            children: "No hay temas dominados aún."
                        }, void 0, false, {
                            fileName: "[project]/app/dashboard/components/UserProgress.tsx",
                            lineNumber: 65,
                            columnNumber: 13
                        }, ("TURBOPACK compile-time value", void 0))
                    }, void 0, false, {
                        fileName: "[project]/app/dashboard/components/UserProgress.tsx",
                        lineNumber: 54,
                        columnNumber: 9
                    }, ("TURBOPACK compile-time value", void 0))
                ]
            }, void 0, true, {
                fileName: "[project]/app/dashboard/components/UserProgress.tsx",
                lineNumber: 50,
                columnNumber: 7
            }, ("TURBOPACK compile-time value", void 0)),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "md:col-span-3 bg-white p-6 rounded-2xl shadow-sm border border-slate-100",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                        className: "text-sm font-semibold text-slate-400 uppercase mb-4",
                        children: "Notas del Tutor IA"
                    }, void 0, false, {
                        fileName: "[project]/app/dashboard/components/UserProgress.tsx",
                        lineNumber: 72,
                        columnNumber: 9
                    }, ("TURBOPACK compile-time value", void 0)),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "space-y-4",
                        children: data?.lessons && data.lessons.length > 0 ? data.lessons.map((lesson)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "border-l-4 border-blue-500 pl-4 py-2",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        className: "text-slate-700 font-medium",
                                        children: lesson.topic
                                    }, void 0, false, {
                                        fileName: "[project]/app/dashboard/components/UserProgress.tsx",
                                        lineNumber: 82,
                                        columnNumber: 17
                                    }, ("TURBOPACK compile-time value", void 0)),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        className: "text-slate-500 text-sm italic",
                                        children: [
                                            '"',
                                            lesson.feedback,
                                            '"'
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/app/dashboard/components/UserProgress.tsx",
                                        lineNumber: 83,
                                        columnNumber: 17
                                    }, ("TURBOPACK compile-time value", void 0))
                                ]
                            }, lesson.id, true, {
                                fileName: "[project]/app/dashboard/components/UserProgress.tsx",
                                lineNumber: 78,
                                columnNumber: 15
                            }, ("TURBOPACK compile-time value", void 0))) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "text-slate-500 text-sm",
                            children: "No hay feedback reciente."
                        }, void 0, false, {
                            fileName: "[project]/app/dashboard/components/UserProgress.tsx",
                            lineNumber: 89,
                            columnNumber: 13
                        }, ("TURBOPACK compile-time value", void 0))
                    }, void 0, false, {
                        fileName: "[project]/app/dashboard/components/UserProgress.tsx",
                        lineNumber: 75,
                        columnNumber: 9
                    }, ("TURBOPACK compile-time value", void 0))
                ]
            }, void 0, true, {
                fileName: "[project]/app/dashboard/components/UserProgress.tsx",
                lineNumber: 71,
                columnNumber: 7
            }, ("TURBOPACK compile-time value", void 0))
        ]
    }, void 0, true, {
        fileName: "[project]/app/dashboard/components/UserProgress.tsx",
        lineNumber: 41,
        columnNumber: 5
    }, ("TURBOPACK compile-time value", void 0));
};
_c = UserProgress;
var _c;
__turbopack_context__.k.register(_c, "UserProgress");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/app/dashboard/DashboardClient.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>DashboardClient
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$auth$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next-auth/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$hooks$2f$useAudioStreaming$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/hooks/useAudioStreaming.ts [app-client] (ecmascript)");
// Importando los nuevos componentes con responsabilidades únicas
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$dashboard$2f$components$2f$ChatHistory$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/dashboard/components/ChatHistory.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$dashboard$2f$components$2f$StatusDisplay$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/dashboard/components/StatusDisplay.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$dashboard$2f$components$2f$ActionControls$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/dashboard/components/ActionControls.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$dashboard$2f$components$2f$VolumeVisualizer$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/dashboard/components/VolumeVisualizer.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$dashboard$2f$components$2f$UserProgress$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/dashboard/components/UserProgress.tsx [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
'use client';
;
;
;
;
;
;
;
;
function DashboardClient({ initialData }) {
    _s();
    const { data: session } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$auth$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useSession"])();
    const [userData, setUserData] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(initialData);
    const [isLoadingData, setIsLoadingData] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    // El token de autenticación para el WebSocket ahora se extrae de forma segura.
    const authToken = session?.wsToken;
    const { conversationState, chatMessages, lastUserTranscript, errorMessage, startConversation, stopConversation, currentVolume } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$hooks$2f$useAudioStreaming$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAudioStreaming"])(authToken);
    const refreshUserData = async ()=>{
        setIsLoadingData(true);
        try {
            const response = await fetch('/api/user');
            if (!response.ok) throw new Error('Failed to fetch user data');
            const newData = await response.json();
            setUserData(newData);
        } catch (error) {
            console.error('Error refreshing user data:', error);
        } finally{
            setIsLoadingData(false);
        }
    };
    // Efecto para refrescar los datos del usuario cuando la conversación termina.
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "DashboardClient.useEffect": ()=>{
            if (session?.user?.id && conversationState === 'idle') {
                refreshUserData();
            }
        }
    }["DashboardClient.useEffect"], [
        conversationState,
        session?.user?.id
    ]); // eslint-disable-line react-hooks/exhaustive-deps
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "min-h-screen bg-slate-50 p-4 sm:p-8",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("header", {
                className: "flex justify-between items-center mb-8",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h1", {
                                className: "text-2xl sm:text-3xl font-bold text-slate-900",
                                children: [
                                    "¡Hola, ",
                                    userData?.name || 'usuario',
                                    "!"
                                ]
                            }, void 0, true, {
                                fileName: "[project]/app/dashboard/DashboardClient.tsx",
                                lineNumber: 71,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                className: "text-slate-500 text-sm sm:text-base",
                                children: "Tu sesión de práctica de español."
                            }, void 0, false, {
                                fileName: "[project]/app/dashboard/DashboardClient.tsx",
                                lineNumber: 74,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/app/dashboard/DashboardClient.tsx",
                        lineNumber: 70,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        onClick: ()=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$auth$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["signOut"])(),
                        className: "px-4 py-2 bg-red-500 text-white rounded-lg text-sm",
                        children: "Cerrar Sesión"
                    }, void 0, false, {
                        fileName: "[project]/app/dashboard/DashboardClient.tsx",
                        lineNumber: 78,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/app/dashboard/DashboardClient.tsx",
                lineNumber: 69,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "space-y-6",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$app$2f$dashboard$2f$components$2f$ChatHistory$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["ChatHistory"], {
                        chatMessages: chatMessages
                    }, void 0, false, {
                        fileName: "[project]/app/dashboard/DashboardClient.tsx",
                        lineNumber: 88,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$app$2f$dashboard$2f$components$2f$StatusDisplay$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["StatusDisplay"], {
                        conversationState: conversationState,
                        lastUserTranscript: lastUserTranscript
                    }, void 0, false, {
                        fileName: "[project]/app/dashboard/DashboardClient.tsx",
                        lineNumber: 89,
                        columnNumber: 9
                    }, this),
                    errorMessage && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "text-red-500 text-center",
                        children: errorMessage
                    }, void 0, false, {
                        fileName: "[project]/app/dashboard/DashboardClient.tsx",
                        lineNumber: 93,
                        columnNumber: 26
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex items-center justify-center space-x-4 p-4 bg-white rounded-2xl shadow-sm border border-slate-100",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$app$2f$dashboard$2f$components$2f$ActionControls$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["ActionControls"], {
                                conversationState: conversationState,
                                startConversation: startConversation,
                                stopConversation: stopConversation
                            }, void 0, false, {
                                fileName: "[project]/app/dashboard/DashboardClient.tsx",
                                lineNumber: 96,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$app$2f$dashboard$2f$components$2f$VolumeVisualizer$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["VolumeVisualizer"], {
                                conversationState: conversationState,
                                currentVolume: currentVolume
                            }, void 0, false, {
                                fileName: "[project]/app/dashboard/DashboardClient.tsx",
                                lineNumber: 101,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/app/dashboard/DashboardClient.tsx",
                        lineNumber: 95,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/app/dashboard/DashboardClient.tsx",
                lineNumber: 87,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("hr", {
                className: "my-10 border-slate-200"
            }, void 0, false, {
                fileName: "[project]/app/dashboard/DashboardClient.tsx",
                lineNumber: 109,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$app$2f$dashboard$2f$components$2f$UserProgress$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["UserProgress"], {
                data: userData,
                isLoading: isLoadingData
            }, void 0, false, {
                fileName: "[project]/app/dashboard/DashboardClient.tsx",
                lineNumber: 112,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/app/dashboard/DashboardClient.tsx",
        lineNumber: 68,
        columnNumber: 5
    }, this);
}
_s(DashboardClient, "Wv8/cjoU/Hg4j/G4ShLZuQP8QD4=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$auth$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useSession"],
        __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$hooks$2f$useAudioStreaming$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAudioStreaming"]
    ];
});
_c = DashboardClient;
var _c;
__turbopack_context__.k.register(_c, "DashboardClient");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
]);

//# sourceMappingURL=app_fb8f67d4._.js.map
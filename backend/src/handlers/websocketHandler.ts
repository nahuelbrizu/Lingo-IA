// backend/src/handlers/websocketHandler.ts
import { WebSocket } from 'ws';
import { createHash, randomUUID } from 'crypto';
import { IncomingMessage } from 'http';
import Anthropic from '@anthropic-ai/sdk';
import { TextToSpeechClient } from '@google-cloud/text-to-speech';
import { prisma } from '../services/prismaService';
import { conversationTools, summaryTool } from '../config';
import jwt from 'jsonwebtoken';
import url from 'url';

interface AuthTokenPayload {
  id: string;
  iat: number;
  exp: number;
}

type ClientMessage =
  | { type: 'user_final'; text: string }
  | { type: 'translate'; text: string; targetLanguageCode: string; messageIndex: number };

const CLAUDE_MODEL = 'claude-sonnet-5';
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const ttsClient = new TextToSpeechClient({ apiKey: process.env.GOOGLE_CLOUD_API_KEY });

/**
 * Quita marcado de Markdown antes de mandar el texto a síntesis de voz.
 * El texto que se muestra en el chat SÍ conserva el markdown (el frontend lo
 * renderiza como énfasis), pero Google TTS lee los símbolos literalmente si
 * se los mandamos tal cual ("asterisco asterisco mi nombre...").
 */
// Rango amplio de pictogramas/emoji (incluye modificadores de tono de piel,
// variation selectors y el Zero Width Joiner usado en emoji compuestos como
// 👨‍👩‍👧). Google TTS no los ignora en silencio: muchos los lee en voz alta
// (el nombre del símbolo), y como el chat de texto SÍ puede llegar a
// mostrarlos "invisibles" según la fuente, el resultado es una voz que
// menciona algo que el usuario ni ve escrito.
const EMOJI_PATTERN =
  /[\u{1F1E6}-\u{1F1FF}\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu;

function stripMarkdownForSpeech(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')   // **negrita**
    .replace(/\*(.+?)\*/g, '$1')       // *cursiva*
    .replace(/`(.+?)`/g, '$1')         // `código`
    .replace(/^#{1,6}\s+/gm, '')       // # títulos
    .replace(/^[-*]\s+/gm, '')         // - listas
    .replace(EMOJI_PATTERN, '')        // emojis (ver EMOJI_PATTERN)
    .replace(/[ \t]{2,}/g, ' ')        // colapsa espacios que deja el emoji removido
    .trim();
}

/**
 * Synthesizes text to speech using Google Cloud TTS. Returns the audio as a
 * base64-encoded MP3 (decodable by the browser's Web Audio API directly), or
 * null if synthesis fails — callers should treat that as "no audio this turn"
 * rather than a fatal error.
 */
async function synthesizeSpeech(text: string, languageCode: string): Promise<string | null> {
  try {
    const [response] = await ttsClient.synthesizeSpeech({
      input: { text },
      voice: { languageCode },
      audioConfig: { audioEncoding: 'MP3' },
    });
    if (!response.audioContent) return null;
    return typeof response.audioContent === 'string'
      ? response.audioContent
      : Buffer.from(response.audioContent).toString('base64');
  } catch (error) {
    console.error('[TTS] Error generando audio:', error);
    return null;
  }
}

// Debe reflejar SUPPORTED_LANGUAGES en frontend/app/config.ts. Se valida contra
// esta whitelist en vez de confiar en el query param crudo (va directo al
// system prompt de Claude).
const SUPPORTED_LANGUAGES: Record<string, string> = {
  'en-US': 'English',
  'es-ES': 'Spanish',
  'fr-FR': 'French',
  'de-DE': 'German',
  'it-IT': 'Italian',
  'pt-BR': 'Portuguese',
  'ja-JP': 'Japanese',
  'zh-CN': 'Mandarin Chinese',
};
const DEFAULT_LANGUAGE_CODE = 'en-US';
const DEFAULT_SOURCE_LANGUAGE_CODE = 'es-ES';

export const handleConnection = async (ws: WebSocket, req: IncomingMessage) => {
  console.info('Attempting to establish a new WebSocket connection...');
  let userId: string = 'unknown';
  let chatHistory: string[] = [];
  let currentStream: ReturnType<typeof anthropic.messages.stream> | null = null;

  try {
    // 1. Authenticate the user from the token in the URL
    const { search } = url.parse(req.url!);
    const queryParams = new URLSearchParams(search || '');
    const token = queryParams.get('token');
    if (!token) {
      console.warn('Authentication token missing. Closing connection.');
      ws.close(1008, 'Authentication token missing.');
      return;
    }

    const requestedLangCode = queryParams.get('lang') ?? DEFAULT_LANGUAGE_CODE;
    const languageCode = requestedLangCode in SUPPORTED_LANGUAGES ? requestedLangCode : DEFAULT_LANGUAGE_CODE;
    const languageName = SUPPORTED_LANGUAGES[languageCode];

    const requestedSourceLangCode = queryParams.get('sourceLang') ?? DEFAULT_SOURCE_LANGUAGE_CODE;
    const sourceLanguageName = SUPPORTED_LANGUAGES[requestedSourceLangCode] ?? SUPPORTED_LANGUAGES[DEFAULT_SOURCE_LANGUAGE_CODE];

    let decoded: AuthTokenPayload;
    try {
      decoded = jwt.verify(token, process.env.NEXTAUTH_SECRET!) as AuthTokenPayload;
    } catch (jwtError: any) {
      // Código en el rango 4000-4999 (uso privado de la app) para que el
      // frontend distinga "hay que volver a loguearse" de un error genérico.
      console.warn(`Authentication failed: ${jwtError.message}`);
      ws.close(4001, 'auth_expired');
      return;
    }
    userId = decoded.id;
    console.info(`Client authenticated and connected. User ID: ${userId}`);

    // 2. Setup Claude conversation state
    const TUTOR_SYSTEM_PROMPT =
      `You are a friendly and helpful ${languageName} language tutor. Speak primarily in ${languageName}, at a level appropriate for a learner. The student's native language is ${sourceLanguageName} — think pedagogically: if they seem confused or completely lost, briefly clarify in ${sourceLanguageName} before continuing in ${languageName}, so they can actually follow along. Your goal is to have a natural conversation with the user. Keep your responses concise and natural. This is a spoken, voice-based conversation: never use emojis or other pictographic symbols in your responses.`;
    const messages: Anthropic.MessageParam[] = [];
    console.info(`[Claude] Sesión de User ID ${userId} configurada para practicar: ${languageName} (${languageCode}), idioma nativo: ${sourceLanguageName}.`);

    const send = (message: object) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify(message));
      }
    };

    // 3. Handle transcripts sent by the client (speech-to-text now runs in the
    // browser via the Web Speech API, so the server only receives already-transcribed text).
    ws.on('message', async (raw: Buffer) => {
      let payload: ClientMessage;
      try {
        payload = JSON.parse(raw.toString());
      } catch {
        console.warn(`[WebSocket] Mensaje no-JSON ignorado de User ID ${userId}.`);
        return;
      }

      if (payload.type === 'translate') {
        const textToTranslate = payload.text?.trim();
        if (!textToTranslate || typeof payload.messageIndex !== 'number') return;

        const translateToCode = payload.targetLanguageCode in SUPPORTED_LANGUAGES
          ? payload.targetLanguageCode
          : DEFAULT_SOURCE_LANGUAGE_CODE;
        const translateToName = SUPPORTED_LANGUAGES[translateToCode];

        try {
          const result = await anthropic.messages.create({
            model: CLAUDE_MODEL,
            max_tokens: 512,
            system: `Translate the text the user sends into ${translateToName}. Respond with ONLY the translation — no explanations, no quotes, no extra commentary.`,
            messages: [{ role: 'user', content: textToTranslate }],
          });
          const translatedText = result.content.find(
            (block): block is Anthropic.TextBlock => block.type === 'text'
          )?.text ?? '';
          send({ type: 'translation', messageIndex: payload.messageIndex, translatedText });
        } catch (translateError) {
          console.error(`[Translate] Error for User ID ${userId}:`, translateError);
          send({ type: 'translation', messageIndex: payload.messageIndex, translatedText: '' });
        }
        return;
      }

      if (payload.type !== 'user_final' || !payload.text?.trim()) return;
      const transcript = payload.text.trim();

      console.log(`[Transcript] Final transcript received for User ID ${userId} (${transcript.length} chars).`);

      try {
        messages.push({ role: 'user', content: transcript });

        const generationId = randomUUID();
        const stream = anthropic.messages.stream({
          model: CLAUDE_MODEL,
          max_tokens: 1024,
          system: TUTOR_SYSTEM_PROMPT,
          tools: conversationTools,
          messages,
        });
        currentStream = stream;

        // Sintetizamos oración por oración a medida que Claude va escribiendo, en vez
        // de esperar la respuesta completa: así el audio empieza a sonar mucho antes.
        // Las llamadas a TTS se encadenan (ttsQueue) para mandar los chunks en orden.
        let fullResponseText = '';
        let unspokenText = '';
        let ttsQueue: Promise<void> = Promise.resolve();

        const queueSpeech = (text: string) => {
          ttsQueue = ttsQueue.then(async () => {
            if (stream.aborted) return;
            const audioBase64 = await synthesizeSpeech(stripMarkdownForSpeech(text), languageCode);
            if (audioBase64 && !stream.aborted && ws.readyState === ws.OPEN) {
              send({ type: 'ai_audio_chunk', chunk: audioBase64, generationId });
            }
          });
        };

        // Límite de oración para cortar y mandar a sintetizar en cuanto está lista,
        // sin esperar el resto de la respuesta. Dos variantes:
        // - Punto (".") seguido de espacio: solo en ese caso exigimos el espacio,
        //   para no cortar en medio de un número (3.14) o abreviatura (Mr.).
        // - Signos de exclamación/interrogación, ASCII o de ancho completo
        //   (!?。！？): son inequívocos como fin de oración, así que no hace falta
        //   que los siga un espacio. Esto es clave para japonés y chino, que no
        //   separan oraciones con espacios — exigir uno (como hacíamos antes)
        //   hacía que la regex nunca matcheara en esos idiomas y toda la
        //   respuesta se mandara a hablar de una sola vez al final, sin
        //   streaming oración por oración. El "+" junta signos repetidos
        //   ("?!", "！？") en un solo corte en vez de trocearlos.
        const SENTENCE_BOUNDARY = /^([\s\S]*?(?:[.]\s+|[!?。！？]+\s*))/;

        stream.on('text', (textDelta) => {
          send({ type: 'ai_delta', text: textDelta });
          fullResponseText += textDelta;
          unspokenText += textDelta;

          let match;
          while ((match = unspokenText.match(SENTENCE_BOUNDARY))) {
            unspokenText = unspokenText.slice(match[0].length);
            queueSpeech(match[1].trim());
          }
        });

        const finalMessage = await stream.finalMessage();

        if (unspokenText.trim()) {
          queueSpeech(unspokenText.trim());
        }
        await ttsQueue;

        send({ type: 'ai_final', generationId });

        messages.push({ role: 'assistant', content: finalMessage.content });
        chatHistory.push(`user: ${transcript}`);
        chatHistory.push(`model: ${fullResponseText}`);
        console.log(`[Claude] Turn saved to history for User ID ${userId}.`);

      } catch (claudeError) {
        if (claudeError instanceof Anthropic.APIUserAbortError) {
          console.log(`[Claude] Generación abortada (conexión cerrada) para User ID ${userId}.`);
        } else {
          console.error(`[Claude] Error for User ID ${userId}:`, claudeError);
          send({ type: 'error', message: 'Error procesando la respuesta de la IA.' });
        }
      } finally {
        currentStream = null;
      }
    });

    // 4. Handle WebSocket closure
    ws.on('close', () => {
      console.info(`Connection closed for User ID: ${userId}.`);
      currentStream?.abort();
      handleClose(userId, chatHistory); // Proceder con la sumarización
    });

    ws.on('error', (error) => {
      console.error(`[WebSocket] Error for User ID ${userId}:`, error);
    });

  } catch (error: any) {
    console.error(`[WebSocket] Overall connection error for User ID ${userId}: ${error.message}`);
    if (ws.readyState === ws.OPEN) {
      ws.close(1011, 'Internal server error');
    }
  }
};


async function handleClose(userId: string, chatHistory: string[]) {
  if (chatHistory.length === 0) {
    console.info(`Client ${userId} disconnected. No conversation to summarize.`);
    return;
  }

  const historyString = chatHistory.join('\n');
  const chatHistoryHash = createHash('sha256').update(historyString).digest('hex');

  let summary;

  // 1. Check for a cached summary
  try {
    const cachedSummary = await prisma.sessionSummary.findUnique({
      where: { chatHistoryHash },
    });

    if (cachedSummary) {
      console.info(`[Cache] HIT for User ID ${userId}. Using cached summary.`);
      summary = cachedSummary.summary as any; // Assuming the summary is valid JSON
    }
  } catch (error: any) {
    console.error(`[Cache] Error looking up summary for ${userId}: ${error.message}`);
    // Don't return, proceed to generate a new one
  }

  // 2. If no cache, generate a new summary
  if (!summary) {
    console.info(`[Cache] MISS for User ID ${userId}. Generating new pedagogical summary...`);

    const SUMMARIZER_SYSTEM_PROMPT = `Eres un Analista Pedagógico de Datos. Tu tarea es recibir la transcripción de una sesión de aprendizaje de idiomas y generar un objeto JSON estrictamente formateado.\n\nCRITERIOS DE ANÁLISIS:\n- Dificultades: Identifica 3 palabras o reglas gramaticales que el usuario usó mal.\n- Logros: Identifica qué tema manejó con fluidez.\n- Feedback: Escribe una frase de 10 palabras animando al usuario basándote en su desempeño real.\n\nFORMATO DE SALIDA (JSON ÚNICAMENTE):\n{\n  "topic": "Resumen de la temática tratada",\n  "masteredTopics": ["tema1", "tema2"],\n  "commonMistakes": ["error1", "error2"],\n  "suggestedNextLesson": "Sugerencia para mañana",\n  "feedback": "Frase de aliento"\n}`; // Corregido el template literal

    try {
      const result = await anthropic.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 1024,
        system: SUMMARIZER_SYSTEM_PROMPT,
        tools: [summaryTool],
        tool_choice: { type: 'tool', name: summaryTool.name },
        messages: [{ role: 'user', content: `Transcripción:\n${historyString}` }],
      });

      const toolUse = result.content.find(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
      );
      if (!toolUse) {
        throw new Error('Claude no devolvió un resumen estructurado.');
      }
      summary = toolUse.input as any;

      // 3. Save the new summary to the cache
      await prisma.sessionSummary.create({
        data: {
          userId,
          chatHistoryHash,
          summary,
        },
      });
      console.info(`[Cache] Stored new summary for User ID ${userId}.`);

    } catch (error: any) {
      console.error(`Error generating pedagogical summary for ${userId}: ${error.message}`);
      return;
    }
  }

  // 4. Save the summary data to the respective tables
  if (!summary) {
    console.warn(`No summary available for ${userId}, skipping database update.`);
    return;
  }

  try {
    await prisma.$transaction([
      prisma.lesson.create({
        data: { userId, topic: summary.topic, feedback: summary.feedback },
      }),
      prisma.analytic.upsert({
        where: { userId },
        update: {
          masteredTopics: { push: summary.masteredTopics },
          commonMistakes: { push: summary.commonMistakes },
        },
        create: {
          userId,
          masteredTopics: summary.masteredTopics,
          commonMistakes: summary.commonMistakes,
        },
      }),
    ]);
    console.info(`✅ Pedagogical summary saved for ${userId}.`);
  } catch (error: any) {
    console.error(`Error saving structured summary to DB for ${userId}: ${error.message}`);
  }
}

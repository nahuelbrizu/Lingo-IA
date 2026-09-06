// backend/src/handlers/websocketHandler.ts
import { WebSocket } from 'ws';
import { createHash } from 'crypto';
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
  | { type: 'barge_in' };

const CLAUDE_MODEL = 'claude-sonnet-5';
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const ttsClient = new TextToSpeechClient({ apiKey: process.env.GOOGLE_CLOUD_API_KEY });

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

    console.log(`[AUTH DEBUG] Received token: ${token ? token.substring(0, 30) + '...' : 'No token'}`);
    console.log(`[AUTH DEBUG] NEXTAUTH_SECRET used (partial): ${process.env.NEXTAUTH_SECRET ? process.env.NEXTAUTH_SECRET.substring(0, 5) + '...' + process.env.NEXTAUTH_SECRET.substring(process.env.NEXTAUTH_SECRET.length - 5) : 'MISSING'}`);

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
      `You are a friendly and helpful ${languageName} language tutor. Speak primarily in ${languageName}, at a level appropriate for a learner, and only switch to the student's native language briefly if they seem completely lost. Your goal is to have a natural conversation with the user. Keep your responses concise and natural.`;
    const messages: Anthropic.MessageParam[] = [];
    console.info(`[Claude] Sesión de User ID ${userId} configurada para practicar: ${languageName} (${languageCode}).`);

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

      if (payload.type === 'barge_in') {
        console.log(`[Claude] Barge-in recibido para User ID ${userId}. Abortando generación en curso.`);
        currentStream?.abort();
        return;
      }

      if (payload.type !== 'user_final' || !payload.text?.trim()) return;
      const transcript = payload.text.trim();

      console.log(`[Transcript] Final transcript for User ID ${userId}: "${transcript}"`);

      try {
        messages.push({ role: 'user', content: transcript });

        const stream = anthropic.messages.stream({
          model: CLAUDE_MODEL,
          max_tokens: 1024,
          system: TUTOR_SYSTEM_PROMPT,
          tools: conversationTools,
          messages,
        });
        currentStream = stream;

        let fullResponseText = '';
        stream.on('text', (textDelta) => {
          send({ type: 'ai_delta', text: textDelta });
          fullResponseText += textDelta;
        });

        const finalMessage = await stream.finalMessage();
        const generationId = createHash('sha256').update(fullResponseText).digest('hex');

        if (fullResponseText.trim()) {
          const audioBase64 = await synthesizeSpeech(fullResponseText, languageCode);
          if (audioBase64) {
            send({ type: 'ai_audio_chunk', chunk: audioBase64, generationId });
          }
        }
        send({ type: 'ai_final', generationId });

        messages.push({ role: 'assistant', content: finalMessage.content });
        chatHistory.push(`user: ${transcript}`);
        chatHistory.push(`model: ${fullResponseText}`);
        console.log(`[Claude] Turn saved to history for User ID ${userId}.`);

      } catch (claudeError) {
        if (claudeError instanceof Anthropic.APIUserAbortError) {
          console.log(`[Claude] Generación abortada por barge-in para User ID ${userId}.`);
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

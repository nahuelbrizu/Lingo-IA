// backend/src/handlers/websocketHandler.ts
import { WebSocket } from 'ws';
import { createHash } from 'crypto';
import { IncomingMessage } from 'http';
import { GoogleGenerativeAI, Tool } from '@google/generative-ai';
import { prisma } from '../services/prismaService';
import { declarationTools } from '../config';
import jwt from 'jsonwebtoken';
import url from 'url';
import { SpeechClient } from '@google-cloud/speech';
import { google } from '@google-cloud/speech/build/protos/protos';

interface AuthTokenPayload {
  id: string;
  iat: number;
  exp: number;
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
console.log(`[GEMINI DEBUG] GEMINI_API_KEY used (partial): ${process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.substring(0, 5) + '...' + process.env.GEMINI_API_KEY.substring(process.env.GEMINI_API_KEY.length - 5) : 'MISSING'}`); // TEMPORARY DEBUG LOG

const speechClient = new SpeechClient({
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS, // Opcional: si usas Service Account
  // O directamente la API Key si no hay archivo de credenciales
  credentials: { client_email: 'unused', private_key: 'unused' }, // Placeholder si no usas SA
  projectId: process.env.GOOGLE_CLOUD_PROJECT_ID, // Tu ID de proyecto de Google Cloud
  key: process.env.GEMINI_API_KEY, // Usa la misma API Key para Speech-to-Text
});

/**
 * Simula la generación de Text-to-Speech (TTS) y envía los chunks de audio al cliente.
 * En una implementación real, aquí se llamaría a una API de TTS como Google Cloud Text-to-Speech.
 */
async function generateAndStreamAudio(ws: WebSocket, text: string, generationId: string) {
  if (ws.readyState !== ws.OPEN) return;

  const send = (message: object) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(message));
    }
  };

  console.log(`[TTS] Iniciando generación de audio para: "${text}"`);

  // --- LÓGICA DE TTS SIMULADA ---
  const words = text.split(' ');
  for (const word of words) {
    // Simular la latencia de generación de cada chunk de audio
    await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 100));

    if (ws.readyState !== ws.OPEN) {
      console.log('[TTS] Conexión cerrada a mitad de streaming de audio.');
      return;
    }

    // Simular un chunk de audio (ArrayBuffer) y enviarlo en base64
    const fakeAudioChunk = new Uint8Array(1024 + Math.random() * 2048).buffer;
    const base64Chunk = Buffer.from(fakeAudioChunk).toString('base64');
    
    send({ type: 'ai_audio_chunk', chunk: base64Chunk, generationId });
  }

  send({ type: 'ai_final', generationId });
  console.log(`[TTS] Finalizada la generación de audio para la generación ${generationId}.`);
}

export const handleConnection = async (ws: WebSocket, req: IncomingMessage) => {
  console.info('Attempting to establish a new WebSocket connection...');
  let userId: string = 'unknown';
  let chatHistory: string[] = [];
  let isSpeechStreamActive = false; // Nuevo estado para el stream de voz

  // Función para destruir el stream de voz de forma segura
  const destroySpeechStream = () => {
    if (isSpeechStreamActive) {
      console.info(`[SpeechStream] Destroying stream for User ID ${userId}.`);
      recognizeStream.destroy();
      isSpeechStreamActive = false;
    }
  };

  try {
    // 1. Authenticate the user from the token in the URL
    const { search } = url.parse(req.url!);
    const token = new URLSearchParams(search || '').get('token');
    if (!token) {
      console.warn('Authentication token missing. Closing connection.');
      ws.close(1008, 'Authentication token missing.');
      return;
    }

    console.log(`[AUTH DEBUG] Received token: ${token ? token.substring(0, 30) + '...' : 'No token'}`);
    console.log(`[AUTH DEBUG] NEXTAUTH_SECRET used (partial): ${process.env.NEXTAUTH_SECRET ? process.env.NEXTAUTH_SECRET.substring(0, 5) + '...' + process.env.NEXTAUTH_SECRET.substring(process.env.NEXTAUTH_SECRET.length - 5) : 'MISSING'}`);

    const decoded = jwt.verify(token, process.env.NEXTAUTH_SECRET!) as AuthTokenPayload;
    userId = decoded.id;
    console.info(`Client authenticated and connected. User ID: ${userId}`);

    // 2. Setup Gemini Chat Model
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction:
        'You are a friendly and helpful Spanish language tutor. Your goal is to have a natural conversation with the user. Keep your responses concise and natural.',
    });
    const chat = model.startChat({ tools: declarationTools as Tool[] });

    // 3. Setup Google Cloud Speech-to-Text Streaming Recognition
    const recognizeStream = speechClient
      .streamingRecognize({
        config: {
          encoding: 'WEBM_OPUS',
          sampleRateHertz: 48000,
          languageCode: 'es-ES',
        },
        interimResults: true,
      });
    
    isSpeechStreamActive = true; // El stream se ha inicializado

    recognizeStream.on('error', (error) => {
        console.error(`[SpeechStream] Error for User ID ${userId}:`, error);
        destroySpeechStream(); // Destruir el stream al detectar un error
      })
      .on('data', async (data) => {
        const transcript = data.results[0]?.alternatives[0]?.transcript;
        if (!transcript) return;

        const send = (message: object) => {
          if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify(message));
          }
        };

        if (data.results[0].isFinal) {
          console.log(`[SpeechStream] Final transcript for User ID ${userId}: "${transcript}"`);
          send({ type: 'user_final', text: transcript });

          try {
            const result = await chat.sendMessageStream(transcript);
            let fullResponseText = '';

            for await (const chunk of result.stream) {
              const part = chunk.candidates?.[0]?.content?.parts?.[0];
              if (part?.text) {
                send({ type: 'ai_delta', text: part.text });
                fullResponseText += part.text;
              }
            }
            send({ type: 'ai_final' });

            const generationId = createHash('sha256').update(fullResponseText).digest('hex');
            await generateAndStreamAudio(ws, fullResponseText, generationId);

            chatHistory.push(`user: ${transcript}`);
            chatHistory.push(`model: ${fullResponseText}`);
            console.log(`[Gemini] Turn saved to history for User ID ${userId}.`);

          } catch (geminiError) {
            console.error(`[Gemini] Error for User ID ${userId}:`, geminiError);
            send({ type: 'error', message: 'Error procesando la respuesta de la IA.' });
          }
        } else {
          send({ type: 'user_interim', text: transcript });
        }
      });

    // 4. Pipe WebSocket messages to the Speech-to-Text stream
    ws.on('message', (message: Buffer) => {
      // console.log(`[WebSocket] Received audio chunk, size: ${message.length}`);
      if (isSpeechStreamActive && recognizeStream.writable) { // Solo escribir si el stream está activo
        recognizeStream.write(message);
      }
    });

    // 5. Handle WebSocket closure
    ws.on('close', () => {
      console.info(`Connection closed for User ID: ${userId}.`);
      destroySpeechStream(); // Destruir el stream de forma segura
      handleClose(userId, chatHistory); // Proceder con la sumarización
    });

    ws.on('error', (error) => {
      console.error(`[WebSocket] Error for User ID ${userId}:`, error);
      destroySpeechStream(); // Destruir el stream de forma segura
    });

  } catch (error: any) {
    console.error(`[WebSocket] Overall connection error for User ID ${userId}: ${error.message}`);
    if (ws.readyState === ws.OPEN) {
      ws.close(1011, 'Internal server error');
    }
    destroySpeechStream(); // Asegurarse de limpiar el stream en caso de error general
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
      const summarizer = genAI.getGenerativeModel({
        model: 'gemini-1.5-flash-latest',
        generationConfig: { responseMimeType: 'application/json' },
      });
      const fullPrompt = `${SUMMARIZER_SYSTEM_PROMPT}\n\nTranscripción:\n${historyString}`; // Corregido el template literal
      const result = await summarizer.generateContent(fullPrompt);
      summary = JSON.parse(result.response.text());

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

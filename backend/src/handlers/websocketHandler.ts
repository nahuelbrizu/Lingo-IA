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
const speechClient = new SpeechClient();

export const handleConnection = async (ws: WebSocket, req: IncomingMessage) => {
  console.info('Attempting to establish a new WebSocket connection...');
  let userId: string = 'unknown';
  let chatHistory: string[] = [];

  try {
    // 1. Authenticate the user from the token in the URL
    const { search } = url.parse(req.url!);
    const token = new URLSearchParams(search || '').get('token');
    if (!token) {
      console.warn('Authentication token missing. Closing connection.');
      ws.close(1008, 'Authentication token missing.');
      return;
    }

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
        interimResults: true, // Get intermediate results
      })
      .on('error', (error) => {
        console.error(`[SpeechStream] Error for User ID ${userId}:`, error);
      })
      .on('data', async (data) => {
        const transcript = data.results[0]?.alternatives[0]?.transcript;
        if (!transcript) return;

        // Helper para enviar mensajes con formato JSON seguro
        const send = (message: object) => {
          if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify(message));
          }
        };

        if (data.results[0].isFinal) {
          console.log(`[SpeechStream] Final transcript for User ID ${userId}: "${transcript}"`);
          send({ type: 'user_final', text: transcript });

          // 4. Send the final transcript to Gemini
          try {
            const result = await chat.sendMessageStream(transcript);
            let fullResponseText = '';

            for await (const chunk of result.stream) {
              const part = chunk.candidates?.[0]?.content?.parts?.[0];
              if (part?.text) {
                // Envía solo el nuevo fragmento (el delta)
                send({ type: 'ai_delta', text: part.text });
                fullResponseText += part.text;
              }
            }
            // Señaliza el final del stream de la IA
            send({ type: 'ai_final' });

            // 5. Save the complete turn to chat history for summarization
            chatHistory.push(`user: ${transcript}`);
            chatHistory.push(`model: ${fullResponseText}`);
            console.log(`[Gemini] Turn saved to history for User ID ${userId}.`);

          } catch (geminiError) {
            console.error(`[Gemini] Error for User ID ${userId}:`, geminiError);
            send({ type: 'error', message: 'Error procesando la respuesta de la IA.' });
          }
        } else {
          // Send interim transcript to the client for real-time feedback
          send({ type: 'user_interim', text: transcript });
        }
      });

    // 6. Pipe WebSocket messages to the Speech-to-Text stream
    ws.on('message', (message: Buffer) => {
      // console.log(`[WebSocket] Received audio chunk, size: ${message.length}`);
      if (recognizeStream.writable) {
        recognizeStream.write(message);
      }
    });

    // 7. Handle WebSocket closure
    ws.on('close', () => {
      console.info(`Connection closed for User ID: ${userId}. Destroying speech stream.`);
      recognizeStream.destroy(); // Clean up the stream
      handleClose(userId, chatHistory); // Proceed with summarization
    });

    ws.on('error', (error) => {
      console.error(`[WebSocket] Error for User ID ${userId}:`, error);
      recognizeStream.destroy();
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

    const SUMMARIZER_SYSTEM_PROMPT = `Eres un Analista Pedagógico de Datos. Tu tarea es recibir la transcripción de una sesión de aprendizaje de idiomas y generar un objeto JSON estrictamente formateado.

CRITERIOS DE ANÁLISIS:
- Dificultades: Identifica 3 palabras o reglas gramaticales que el usuario usó mal.
- Logros: Identifica qué tema manejó con fluidez.
- Feedback: Escribe una frase de 10 palabras animando al usuario basándote en su desempeño real.

FORMATO DE SALIDA (JSON ÚNICAMENTE):
{
  "topic": "Resumen de la temática tratada",
  "masteredTopics": ["tema1", "tema2"],
  "commonMistakes": ["error1", "error2"],
  "suggestedNextLesson": "Sugerencia para mañana",
  "feedback": "Frase de aliento"
}`;

    try {
      const summarizer = genAI.getGenerativeModel({
        model: 'gemini-1.5-flash-latest',
        generationConfig: { responseMimeType: 'application/json' },
      });
      const fullPrompt = `${SUMMARIZER_SYSTEM_PROMPT}\n\nTranscripción:\n${historyString}`;
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

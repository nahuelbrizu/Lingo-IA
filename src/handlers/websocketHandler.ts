// src/handlers/websocketHandler.ts
import { WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { prisma } from '../services/prismaService';
import { declarationTools } from '../config';
import jwt from 'jsonwebtoken';
import url from 'url';

interface AuthTokenPayload {
  id: string;
  iat: number;
  exp: number;
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// ... (executeDatabaseLogic remains the same)

export const handleConnection = async (ws: WebSocket, req: IncomingMessage) => {
    const { search } = url.parse(req.url!);
    const token = new URLSearchParams(search || '').get('token');

    if (!token) {
        ws.close(1008, "Authentication token missing.");
        return;
    }

    let userId: string;
    try {
        const decoded = jwt.verify(token, process.env.NEXTAUTH_SECRET!) as AuthTokenPayload;
        userId = decoded.id;
    } catch (error) {
        ws.close(1008, "Invalid authentication token.");
        return;
    }

    let chatHistory: string[] = [];
    console.log(`Client authenticated and connected. User ID: ${userId}`);

    // ... (the rest of the try...catch block for Gemini communication remains the same,
    // just ensure it uses the `userId` variable from the token)
};
async function handleClose(userId: string, chatHistory: string[]) {
    if (chatHistory.length === 0) {
        console.log(`Client ${userId} disconnected. No conversation to summarize.`);
        return;
    }

    console.log(`Session ended for ${userId}. Generating pedagogical summary...`);
    
    // ... (rest of the summary logic)
    const summarizerSystemPrompt = `Eres un Analista Pedagógico de Datos. Tu tarea es recibir la transcripción de una sesión de aprendizaje de idiomas y generar un objeto JSON estrictamente formateado.

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
            model: "gemini-1.5-flash-latest",
            generationConfig: { responseMimeType: "application/json" }
        });

        const fullPrompt = `${summarizerSystemPrompt}

Transcripción:
${chatHistory.join('
')}`;
        const result = await summarizer.generateContent(fullPrompt);
        const summary = JSON.parse(result.response.text());

        await prisma.$transaction([
            prisma.lesson.create({
                data: { userId, topic: summary.topic, feedback: summary.feedback }
            }),
            prisma.analytic.update({
                where: { userId },
                data: {
                    masteredTopics: { push: summary.masteredTopics },
                    commonMistakes: { push: summary.commonMistakes }
                }
            })
        ]);
        console.log(`✅ Pedagogical summary saved for ${userId}.`);
    } catch (error) {
        console.error("Error generating or saving structured summary:", error);
    }
}

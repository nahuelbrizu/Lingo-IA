// src/index.ts
import 'dotenv/config'; // Carga las variables de entorno al inicio
import http from 'http';
import { WebSocketServer } from 'ws';
import { handleConnection } from './handlers/websocketHandler';
import { prisma } from './services/prismaService';

const PORT = process.env.PORT || 8080;

// Crear un servidor HTTP simple
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('WebSocket Audio Server for Lingo-IA is active.');
});

// Adjuntar el servidor WebSocket al servidor HTTP
const wss = new WebSocketServer({ server });

wss.on('connection', handleConnection);

// Función para crear un usuario de demostración si la base de datos está vacía
async function createDemoUserIfNotExist() {
    try {
        const userCount = await prisma.user.count();
        if (userCount === 0) {
            console.log("No users found. Creating demo user...");
            await prisma.user.create({
                data: {
                    id: "a4b8f0b0-5c6a-4f2d-8e1c-7a9b0d1f2e3d",
                    name: "Nahue",
                    languageLevel: "B1",
                    analytics: {
                        create: {
                            commonMistakes: ["Pronunciación de la 'rr'"],
                            masteredTopics: ["Presente Simple"]
                        }
                    }
                }
            });
            console.log("✅ Demo user created successfully.");
        }
    } catch (e) {
        console.error("Error checking/creating demo user:", e);
    }
}

// Iniciar el servidor
server.listen(PORT, () => {
    console.log(`🚀 Server is listening on http://localhost:${PORT}`);
    createDemoUserIfNotExist();
});
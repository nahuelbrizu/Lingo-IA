// src/config.ts
import { ToolConfig } from '@google/generative-ai';

// Las "manos" de la IA: herramientas que puede usar.
export const declarationTools: ToolConfig[] = [{
    functionDeclarations: [
        {
            name: "actualizar_progreso_usuario",
            description: "Guarda el progreso del usuario cuando demuestra dominio de un tema gramatical o vocabulario.",
            parameters: {
                type: "OBJECT",
                properties: {
                    tema: { type: "STRING", description: "El tema dominado (ej: 'presente_simple', 'verbos_irregulares')" },
                    score: { type: "NUMBER", description: "Puntaje del 1 al 100 basado en la precisión del audio" },
                    errores_comunes: { type: "ARRAY", items: { type: "STRING" }, description: "Lista de errores que repite" }
                },
                required: ["tema", "score"]
            }
        },
        {
            name: "cambiar_dificultad",
            description: "Ajusta el nivel de la conversación si el usuario está muy frustrado o le resulta muy fácil.",
            parameters: {
                type: "OBJECT",
                properties: {
                    nuevo_nivel: { type: "STRING", enum: ["principiante", "intermedio", "avanzado"] }
                }
            }
        }
    ]
}];

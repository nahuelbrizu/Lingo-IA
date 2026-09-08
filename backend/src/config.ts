// src/config.ts
import Anthropic from '@anthropic-ai/sdk';

// Las "manos" de la IA: herramientas que puede usar durante la conversación.
// (Antes también existía "cambiar_dificultad" acá, pero ningún código en todo
// el proyecto procesaba esa tool_use ni le devolvía un tool_result — ni
// siquiera hubiera tenido efecto en el prompt si se hubiera llamado. En vez
// de simular que "funciona" con un tool_result vacío, se sacó directamente:
// ajustar la dificultad real es una función aparte, no construida todavía.)
export const conversationTools: Anthropic.Tool[] = [
  {
    name: 'actualizar_progreso_usuario',
    description: 'Guarda el progreso del usuario cuando demuestra dominio de un tema gramatical o vocabulario.',
    input_schema: {
      type: 'object',
      properties: {
        tema: { type: 'string', description: "El tema dominado (ej: 'presente_simple', 'verbos_irregulares')" },
        score: { type: 'number', description: 'Puntaje del 1 al 100 basado en la precisión del audio' },
        errores_comunes: { type: 'array', items: { type: 'string' }, description: 'Lista de errores que repite' },
      },
      required: ['tema', 'score'],
    },
  },
];

// Tool usada para forzar a Claude a devolver el resumen pedagógico como JSON estructurado.
export const summaryTool: Anthropic.Tool = {
  name: 'registrar_resumen_pedagogico',
  description: 'Registra el resumen pedagógico estructurado de la sesión de aprendizaje.',
  input_schema: {
    type: 'object',
    properties: {
      topic: { type: 'string', description: 'Resumen de la temática tratada' },
      masteredTopics: { type: 'array', items: { type: 'string' } },
      commonMistakes: { type: 'array', items: { type: 'string' } },
      suggestedNextLesson: { type: 'string', description: 'Sugerencia para mañana' },
      feedback: { type: 'string', description: 'Frase de 10 palabras animando al usuario basándote en su desempeño real' },
    },
    required: ['topic', 'masteredTopics', 'commonMistakes', 'suggestedNextLesson', 'feedback'],
  },
};

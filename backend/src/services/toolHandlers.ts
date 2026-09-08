// backend/src/services/toolHandlers.ts
import Anthropic from '@anthropic-ai/sdk';
import { prisma } from './prismaService';
import { mergeAnalyticProgress } from '../utils/progress';

/** Puntaje mínimo (1-100) para considerar un tema "dominado". Arbitrario, ajustable. */
export const MASTERY_SCORE_THRESHOLD = 70;

interface ActualizarProgresoInput {
  tema: string;
  score: number;
  errores_comunes?: string[];
}

/**
 * Procesa un bloque `tool_use` que Claude emitió durante la conversación en
 * vivo y devuelve el string que va como contenido del `tool_result`
 * correspondiente. Nunca lanza: cualquier error se atrapa y se devuelve como
 * texto, porque la API exige un tool_result para CADA tool_use sin importar
 * si el manejo salió bien — si esto lanzara, el loop de la conversación
 * quedaría sin poder responder y se rompería el turno.
 */
export async function handleToolUse(toolUse: Anthropic.ToolUseBlock, userId: string): Promise<string> {
  try {
    if (toolUse.name === 'actualizar_progreso_usuario') {
      const { tema, score, errores_comunes } = toolUse.input as ActualizarProgresoInput;

      const existing = await prisma.analytic.findUnique({ where: { userId } });
      const { masteredTopics, commonMistakes } = mergeAnalyticProgress(
        {
          masteredTopics: existing?.masteredTopics ?? [],
          commonMistakes: existing?.commonMistakes ?? [],
        },
        score >= MASTERY_SCORE_THRESHOLD ? [tema] : [],
        errores_comunes ?? []
      );

      await prisma.analytic.upsert({
        where: { userId },
        update: { masteredTopics: { set: masteredTopics }, commonMistakes: { set: commonMistakes } },
        create: { userId, masteredTopics, commonMistakes },
      });

      return 'Progreso registrado.';
    }

    return 'ok';
  } catch (error) {
    console.error(`[Tools] Error handling ${toolUse.name} for User ID ${userId}:`, error);
    return 'Hubo un error registrando el progreso, pero la conversación puede seguir.';
  }
}

interface ToolResultInput {
  tool_use_id: string;
  content: string;
}

/**
 * Construye el par de mensajes que exige la API de Anthropic después de un
 * turno con tool_use: el mensaje del assistant con sus bloques de contenido
 * TAL CUAL los devolvió Claude (incluyendo el/los tool_use, no solo el
 * texto — si se pierden esos bloques, el próximo turno no tiene forma de
 * saber a qué tool_use responde el tool_result), seguido de un único mensaje
 * de usuario con un tool_result por cada tool_use recibido.
 */
export function buildToolRoundTrip(
  assistantContent: Anthropic.ContentBlock[],
  toolResults: ToolResultInput[]
): Anthropic.MessageParam[] {
  return [
    { role: 'assistant', content: assistantContent },
    {
      role: 'user',
      content: toolResults.map((r) => ({
        type: 'tool_result' as const,
        tool_use_id: r.tool_use_id,
        content: r.content,
      })),
    },
  ];
}

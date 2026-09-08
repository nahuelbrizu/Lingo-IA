import Anthropic from '@anthropic-ai/sdk';

jest.mock('../prismaService', () => ({
  prisma: {
    analytic: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
  },
}));

import { prisma } from '../prismaService';
import { handleToolUse, buildToolRoundTrip, MASTERY_SCORE_THRESHOLD } from '../toolHandlers';

const mockFindUnique = prisma.analytic.findUnique as jest.Mock;
const mockUpsert = prisma.analytic.upsert as jest.Mock;

function toolUse(name: string, input: unknown, id = 'toolu_1'): Anthropic.ToolUseBlock {
  return { type: 'tool_use', id, name, input } as Anthropic.ToolUseBlock;
}

describe('handleToolUse', () => {
  beforeEach(() => {
    mockFindUnique.mockReset();
    mockUpsert.mockReset();
  });

  it('does not add the topic to masteredTopics when score is below the threshold', async () => {
    mockFindUnique.mockResolvedValue({ masteredTopics: [], commonMistakes: [] });
    mockUpsert.mockResolvedValue({});

    await handleToolUse(
      toolUse('actualizar_progreso_usuario', { tema: 'presente_simple', score: MASTERY_SCORE_THRESHOLD - 1 }),
      'user-1'
    );

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ masteredTopics: { set: [] } }),
      })
    );
  });

  it('adds the topic to masteredTopics when score equals the threshold', async () => {
    mockFindUnique.mockResolvedValue({ masteredTopics: [], commonMistakes: [] });
    mockUpsert.mockResolvedValue({});

    await handleToolUse(
      toolUse('actualizar_progreso_usuario', { tema: 'presente_simple', score: MASTERY_SCORE_THRESHOLD }),
      'user-1'
    );

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ masteredTopics: { set: ['presente_simple'] } }),
      })
    );
  });

  it('sends the already-deduplicated lists to upsert, merged with existing data', async () => {
    mockFindUnique.mockResolvedValue({ masteredTopics: ['Presente Simple'], commonMistakes: ['confunde ser/estar'] });
    mockUpsert.mockResolvedValue({});

    await handleToolUse(
      toolUse('actualizar_progreso_usuario', {
        tema: 'presente simple', // same topic, different casing than what's already stored
        score: 100,
        errores_comunes: ['confunde ser/estar', 'orden de adjetivos'],
      }),
      'user-1'
    );

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: {
          masteredTopics: { set: ['Presente Simple'] },
          commonMistakes: { set: ['confunde ser/estar', 'orden de adjetivos'] },
        },
      })
    );
  });

  it('returns a result string and does not touch the DB for an unknown tool name', async () => {
    const result = await handleToolUse(toolUse('cambiar_dificultad', { nuevo_nivel: 'avanzado' }), 'user-1');

    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it('catches a Prisma error and still returns a tool_result string instead of throwing', async () => {
    mockFindUnique.mockRejectedValue(new Error('DB is down'));

    const result = await handleToolUse(
      toolUse('actualizar_progreso_usuario', { tema: 'presente_simple', score: 100 }),
      'user-1'
    );

    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
    expect(mockUpsert).not.toHaveBeenCalled();
  });
});

describe('buildToolRoundTrip', () => {
  it('pushes the raw assistant content blocks (including the tool_use block, not just text) followed by one tool_result message', () => {
    const assistantContent = [
      { type: 'text', text: 'Genial, vamos a practicar eso.' },
      toolUse('actualizar_progreso_usuario', { tema: 'presente_simple', score: 90 }, 'toolu_abc'),
    ] as unknown as Anthropic.ContentBlock[];

    const roundTrip = buildToolRoundTrip(assistantContent, [
      { tool_use_id: 'toolu_abc', content: 'Progreso registrado.' },
    ]);

    expect(roundTrip).toEqual([
      { role: 'assistant', content: assistantContent },
      {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: 'toolu_abc', content: 'Progreso registrado.' }],
      },
    ]);
  });

  it('supports multiple tool_use blocks answered by multiple tool_result blocks in one message', () => {
    const assistantContent = [
      toolUse('actualizar_progreso_usuario', { tema: 'a', score: 90 }, 'toolu_1'),
      toolUse('actualizar_progreso_usuario', { tema: 'b', score: 90 }, 'toolu_2'),
    ] as unknown as Anthropic.ContentBlock[];

    const roundTrip = buildToolRoundTrip(assistantContent, [
      { tool_use_id: 'toolu_1', content: 'ok1' },
      { tool_use_id: 'toolu_2', content: 'ok2' },
    ]);

    expect(roundTrip[1]).toEqual({
      role: 'user',
      content: [
        { type: 'tool_result', tool_use_id: 'toolu_1', content: 'ok1' },
        { type: 'tool_result', tool_use_id: 'toolu_2', content: 'ok2' },
      ],
    });
  });
});

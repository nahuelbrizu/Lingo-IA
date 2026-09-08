import { mergeUnique, mergeAnalyticProgress, MAX_ITEMS_PER_LIST } from '../progress';

describe('mergeUnique', () => {
  it('keeps all items when there are no duplicates', () => {
    expect(mergeUnique(['a', 'b'], ['c'])).toEqual(['a', 'b', 'c']);
  });

  it('dedupes case-insensitively, keeping the first occurrence', () => {
    expect(mergeUnique(['Presente Simple'], ['presente simple', 'Pasado Simple'])).toEqual([
      'Presente Simple',
      'Pasado Simple',
    ]);
  });

  it('preserves stable order: existing items first, then new items in their given order', () => {
    expect(mergeUnique(['b', 'a'], ['d', 'c'])).toEqual(['b', 'a', 'd', 'c']);
  });

  it('returns the other list unchanged when one side is empty', () => {
    expect(mergeUnique([], ['a', 'b'])).toEqual(['a', 'b']);
    expect(mergeUnique(['a', 'b'], [])).toEqual(['a', 'b']);
    expect(mergeUnique([], [])).toEqual([]);
  });

  it('collapses duplicate entries within the same input list', () => {
    expect(mergeUnique(['a', 'A', 'a'], ['b', 'B'])).toEqual(['a', 'b']);
  });
});

describe('mergeAnalyticProgress', () => {
  it('merges both fields additively when under the cap', () => {
    const result = mergeAnalyticProgress(
      { masteredTopics: ['a'], commonMistakes: ['x'] },
      ['b'],
      ['y']
    );
    expect(result).toEqual({ masteredTopics: ['a', 'b'], commonMistakes: ['x', 'y'] });
  });

  it('caps each list at MAX_ITEMS_PER_LIST, keeping the most recently added items', () => {
    const existing = Array.from({ length: MAX_ITEMS_PER_LIST }, (_, i) => `old-${i}`);

    const result = mergeAnalyticProgress(
      { masteredTopics: existing, commonMistakes: [] },
      ['brand-new'],
      []
    );

    expect(result.masteredTopics).toHaveLength(MAX_ITEMS_PER_LIST);
    // El más viejo ("old-0") se cae para hacerle lugar al nuevo; el resto de
    // los viejos y el nuevo sobreviven.
    expect(result.masteredTopics).not.toContain('old-0');
    expect(result.masteredTopics).toContain('old-1');
    expect(result.masteredTopics).toContain('brand-new');
    expect(result.masteredTopics[result.masteredTopics.length - 1]).toBe('brand-new');
  });

  it('does not cap when the merged list is exactly at the limit', () => {
    const existing = Array.from({ length: MAX_ITEMS_PER_LIST - 1 }, (_, i) => `old-${i}`);

    const result = mergeAnalyticProgress({ masteredTopics: existing, commonMistakes: [] }, ['new'], []);

    expect(result.masteredTopics).toHaveLength(MAX_ITEMS_PER_LIST);
    expect(result.masteredTopics).toContain('old-0');
    expect(result.masteredTopics).toContain('new');
  });
});

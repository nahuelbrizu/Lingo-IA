import { mergeUnique } from '../progress';

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

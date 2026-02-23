import { truncate } from '../utils/formatters';

describe('truncate', () => {
  it('should not truncate text if it is shorter than or equal to the length', () => {
    expect(truncate('hello', 10)).toBe('hello');
    expect(truncate('hello', 5)).toBe('hello');
  });

  it('should truncate text if it is longer than the length', () => {
    expect(truncate('hello world', 5)).toBe('hello...');
  });

  it('should handle empty strings', () => {
    expect(truncate('', 5)).toBe('');
  });
});

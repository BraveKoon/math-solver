import { describe, it, expect } from 'vitest';
import { normalizeRepo, toBase64, suggestPath } from '../src/github.js';

describe('github helpers', () => {
  it('normalizes repo input', () => {
    expect(normalizeRepo('bravekoon/math-solver')).toBe('bravekoon/math-solver');
    expect(normalizeRepo('https://github.com/bravekoon/math-solver.git')).toBe('bravekoon/math-solver');
    expect(normalizeRepo('git@github.com:a/b')).toBe('a/b');
    expect(normalizeRepo('nope')).toBe('');
  });
  it('base64-encodes UTF-8', () => {
    expect(toBase64('안녕 x²')).toBe(Buffer.from('안녕 x²', 'utf8').toString('base64'));
  });
  it('suggests a path from a filename hint or the language', () => {
    expect(suggestPath('python', '`src/solve.py`:')).toBe('src/solve.py');
    expect(suggestPath('python', '다음 코드를 실행하세요.')).toMatch(/^euler\/snippet-\d{8}-\d{4}\.py$/);
    expect(suggestPath('', '')).toMatch(/\.txt$/);
  });
});

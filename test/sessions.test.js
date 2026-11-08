// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { loadSessions, saveSessions, titleFrom, relativeDay } from '../src/sessions.js';

describe('sessions', () => {
  beforeEach(() => localStorage.clear());
  it('migrates the old single history into a session', () => {
    localStorage.setItem('history', JSON.stringify([{ role: 'user', content: '이차방정식 풀어줘' }]));
    const list = loadSessions();
    expect(list).toHaveLength(1);
    expect(list[0].title).toBe('이차방정식 풀어줘');
  });
  it('saves newest first and survives reload', () => {
    saveSessions([{ id: 'a', title: 'a', updated: 1, messages: [] }, { id: 'b', title: 'b', updated: 2, messages: [] }]);
    expect(loadSessions().map((s) => s.id)).toEqual(['b', 'a']);
  });
  it('makes short titles and day groups', () => {
    expect(titleFrom('a'.repeat(40))).toHaveLength(29);
    expect(titleFrom('')).toBe('새 세션');
    expect(relativeDay(Date.now())).toBe('오늘');
  });
});

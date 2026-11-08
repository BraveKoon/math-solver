// 대화 세션 저장소(localStorage). 이미지 원본은 저장하지 않고 썸네일만 보관.
const KEY = 'euler.sessions.v1';
const CUR = 'euler.current';
const MAX_SESSIONS = 60;

const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export function loadSessions() {
  let list = read(KEY, null);
  if (!list) {
    // 이전 버전(단일 대화 'history')에서 옮겨오기
    const old = read('history', []);
    list = old.length ? [{ id: uid(), title: titleFrom(old[0]?.content), updated: Date.now(), messages: old }] : [];
    write(KEY, list);
  }
  return list;
}

export function saveSessions(list) {
  list.sort((a, b) => b.updated - a.updated);
  let trimmed = list.slice(0, MAX_SESSIONS);
  // 용량 초과 시 오래된 세션부터 정리
  while (!write(KEY, trimmed) && trimmed.length > 1) trimmed = trimmed.slice(0, -1);
  return trimmed;
}

export const currentId = () => read(CUR, null);
export const setCurrentId = (id) => write(CUR, id);

export function titleFrom(text = '') {
  const t = text.replace(/\s+/g, ' ').trim();
  return t ? (t.length > 28 ? t.slice(0, 28) + '…' : t) : '새 세션';
}

export function relativeDay(ts) {
  const d = new Date(ts), now = new Date();
  const days = Math.floor((new Date(now.toDateString()) - new Date(d.toDateString())) / 864e5);
  if (days === 0) return '오늘';
  if (days === 1) return '어제';
  if (days < 7) return '지난 7일';
  if (days < 30) return '지난 30일';
  return '이전';
}

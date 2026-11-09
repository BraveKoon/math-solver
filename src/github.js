// GitHub 연동: 답변 속 코드 블록을 사용자의 저장소에 커밋한다.
// 토큰은 iPhone 키체인(네이티브)에 보관하고, 저장소·브랜치는 기기 설정(localStorage)에 둔다.
// 사용자가 '저장'을 누를 때만 api.github.com으로 통신한다(그 외에는 완전 오프라인).
import { Capacitor, registerPlugin } from '@capacitor/core';

const Llama = registerPlugin('Llama');
const native = () => Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('Llama');
const TOKEN_KEY = 'github.token';
const CFG_KEY = 'github.cfg';
const API = 'https://api.github.com';

export async function getToken() {
  if (native()) return (await Llama.secureGet({ key: TOKEN_KEY })).value || '';
  try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
}

export async function setToken(value) {
  if (native()) return Llama.secureSet({ key: TOKEN_KEY, value: value || '' });
  try { value ? sessionStorage.setItem(TOKEN_KEY, value) : sessionStorage.removeItem(TOKEN_KEY); } catch {}
}

export function getConfig() {
  try { return { repo: '', branch: '', ...JSON.parse(localStorage.getItem(CFG_KEY) || '{}') }; } catch { return { repo: '', branch: '' }; }
}

export function setConfig(cfg) {
  try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch {}
}

/** "https://github.com/owner/name(.git)" 이나 "owner/name" → "owner/name" */
export function normalizeRepo(s) {
  const m = String(s || '').trim().replace(/\.git$/, '').match(/(?:github\.com[/:])?([\w.-]+)\/([\w.-]+)\/?$/);
  return m ? `${m[1]}/${m[2]}` : '';
}

/** UTF-8 문자열 → base64 (GitHub contents API 형식) */
export function toBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

const encPath = (p) => p.split('/').map(encodeURIComponent).join('/');

async function api(token, path, init = {}) {
  const r = await fetch(API + path, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data };
}

function explain(status, data) {
  if (status === 401) return '토큰이 올바르지 않거나 만료됐어요.';
  if (status === 403) return '이 토큰으로는 저장소에 쓸 수 없어요. Contents 쓰기 권한을 확인하세요.';
  if (status === 404) return '저장소나 브랜치를 찾을 수 없어요(비공개 저장소는 토큰 권한이 필요해요).';
  if (status === 409 || status === 422) return `저장하지 못했어요: ${data?.message || status}`;
  return `GitHub 오류(${status})${data?.message ? ': ' + data.message : ''}`;
}

/** 연결 확인: 저장소 정보(기본 브랜치, 쓰기 권한) */
export async function checkConnection() {
  const token = await getToken();
  const { repo } = getConfig();
  if (!token || !repo) throw new Error('토큰과 저장소를 입력하세요.');
  let r;
  try { r = await api(token, `/repos/${repo}`); } catch { throw new Error('GitHub에 연결할 수 없어요. 인터넷 연결을 확인하세요.'); }
  if (!r.ok) throw new Error(explain(r.status, r.data));
  return { fullName: r.data.full_name, defaultBranch: r.data.default_branch, canPush: !!r.data.permissions?.push };
}

/** 파일 하나를 커밋(있으면 덮어쓰기). 반환: 파일 웹 주소 */
export async function saveFile(path, content, message) {
  const token = await getToken();
  const cfg = getConfig();
  if (!token || !cfg.repo) throw new Error('설정에서 GitHub를 먼저 연결하세요.');
  path = path.replace(/^\/+/, '');
  const ref = cfg.branch ? `?ref=${encodeURIComponent(cfg.branch)}` : '';
  try {
    const cur = await api(token, `/repos/${cfg.repo}/contents/${encPath(path)}${ref}`);
    if (!cur.ok && cur.status !== 404) throw new Error(explain(cur.status, cur.data));
    const body = { message, content: toBase64(content) };
    if (cfg.branch) body.branch = cfg.branch;
    if (cur.ok && cur.data?.sha) body.sha = cur.data.sha;
    const r = await api(token, `/repos/${cfg.repo}/contents/${encPath(path)}`, { method: 'PUT', body: JSON.stringify(body) });
    if (!r.ok) throw new Error(explain(r.status, r.data));
    return r.data?.content?.html_url || `https://github.com/${cfg.repo}`;
  } catch (e) {
    if (e instanceof TypeError) throw new Error('GitHub에 연결할 수 없어요. 인터넷 연결을 확인하세요.');
    throw e;
  }
}

const EXT = {
  python: 'py', py: 'py', javascript: 'js', js: 'js', typescript: 'ts', ts: 'ts', swift: 'swift', kotlin: 'kt',
  java: 'java', c: 'c', cpp: 'cpp', 'c++': 'cpp', csharp: 'cs', cs: 'cs', go: 'go', rust: 'rs', rb: 'rb', ruby: 'rb',
  html: 'html', css: 'css', json: 'json', yaml: 'yml', yml: 'yml', bash: 'sh', sh: 'sh', shell: 'sh', sql: 'sql',
  markdown: 'md', md: 'md', tex: 'tex', latex: 'tex',
};

/** 코드 블록의 기본 파일 경로: 블록 바로 앞 줄의 파일명 → 없으면 euler/snippet-날짜.확장자 */
export function suggestPath(lang, hint) {
  const named = String(hint || '').match(/([\w.-]+\/)*[\w.-]+\.[A-Za-z0-9]{1,8}(?=[`*\s:)]*$)/);
  if (named) return named[0];
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
  return `euler/snippet-${stamp}.${EXT[String(lang || '').toLowerCase()] || 'txt'}`;
}

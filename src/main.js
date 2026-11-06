import './style.css';
import { MODELS, DEFAULT_SYSTEM } from './models.js';
import { BrowserEngine, OllamaEngine, hasWebGPU } from './engine.js';
import { renderAnswer } from './render.js';

const $ = (id) => document.getElementById(id);
const store = {
  get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

let engine = null;
let busy = false;
let history = store.get('history', []); // [{role, content}]

// ---------- UI 초기화 ----------
MODELS.forEach((m) => $('model').add(new Option(m.label, m.id)));
$('model').value = store.get('model', MODELS[0].id);
$('backend').value = store.get('backend', 'browser');
$('ollamaUrl').value = store.get('ollamaUrl', $('ollamaUrl').value);
$('ollamaModel').value = store.get('ollamaModel', $('ollamaModel').value);
$('sys').value = store.get('sys', DEFAULT_SYSTEM);
$('thinking').checked = store.get('thinking', true);
$('temp').value = store.get('temp', 0.3); $('tempOut').textContent = $('temp').value;
$('maxTokens').value = store.get('maxTokens', 4096);

function syncBackendUI() {
  const b = $('backend').value === 'browser';
  $('modelRow').hidden = !b; $('ollamaRow').hidden = b;
}
syncBackendUI();
if (!hasWebGPU() && $('backend').value === 'browser')
  $('progressText').textContent = '⚠ 이 브라우저는 WebGPU 미지원입니다. Chrome 최신 버전을 쓰거나 Ollama 방식을 선택하세요.';

$('backend').onchange = () => { syncBackendUI(); store.set('backend', $('backend').value); };
$('settingsBtn').onclick = () => $('settings').showModal();
$('temp').oninput = () => { $('tempOut').textContent = $('temp').value; };
$('settings').addEventListener('close', () => {
  store.set('sys', $('sys').value); store.set('thinking', $('thinking').checked);
  store.set('temp', +$('temp').value); store.set('maxTokens', +$('maxTokens').value);
});
$('clearBtn').onclick = () => { history = []; store.set('history', []); $('chat').innerHTML = ''; };
$('clearCacheBtn').onclick = async () => {
  if (!confirm('내려받은 모델을 삭제할까요? 다시 쓰려면 인터넷이 필요합니다.')) return;
  await new BrowserEngine().clearCache($('model').value).catch(() => {});
  alert('삭제했습니다.');
};

// ---------- 채팅 렌더링 ----------
function addMsg(role, content) {
  const el = document.createElement('div');
  el.className = `msg ${role}`;
  if (role === 'user') el.textContent = content; else el.innerHTML = renderAnswer(content);
  $('chat').append(el);
  $('chat').scrollTop = $('chat').scrollHeight;
  return el;
}
history.forEach((m) => addMsg(m.role === 'user' ? 'user' : 'bot', m.content));

// ---------- 모델 로딩 ----------
$('loadBtn').onclick = async () => {
  const kind = $('backend').value;
  $('loadBtn').disabled = true; $('progress').hidden = false; $('progress').value = 0;
  $('status').textContent = '불러오는 중'; $('status').className = 'badge';
  try {
    engine = kind === 'browser' ? new BrowserEngine() : new OllamaEngine();
    const cfg = kind === 'browser'
      ? { modelId: $('model').value }
      : { url: $('ollamaUrl').value, model: $('ollamaModel').value };
    await engine.load(cfg, (p, t) => { $('progress').value = p; $('progressText').textContent = t; });
    store.set('model', $('model').value); store.set('ollamaUrl', $('ollamaUrl').value); store.set('ollamaModel', $('ollamaModel').value);
    $('status').textContent = '준비됨'; $('status').className = 'badge ok';
    $('setup').hidden = true; $('sendBtn').disabled = false; $('input').focus();
  } catch (e) {
    engine = null;
    $('progressText').textContent = '오류: ' + (e.message || e);
    $('status').textContent = '오류';
  } finally { $('loadBtn').disabled = false; }
};
$('status').onclick = () => { $('setup').hidden = false; };

// ---------- 풀이 ----------
async function solve(question) {
  if (busy || !engine || !question.trim()) return;
  busy = true; $('sendBtn').hidden = true; $('stopBtn').hidden = false;
  history.push({ role: 'user', content: question });
  addMsg('user', question);
  const el = addMsg('bot', '');
  el.textContent = '…';
  let raw = '', pending = false;
  const paint = () => {
    pending = false;
    el.innerHTML = renderAnswer(raw);
    $('chat').scrollTop = $('chat').scrollHeight;
  };
  try {
    const messages = [{ role: 'system', content: $('sys').value }, ...history.slice(-12)];
    await engine.stream(messages,
      { temperature: +$('temp').value, maxTokens: +$('maxTokens').value, thinking: $('thinking').checked },
      (t) => { raw += t; if (!pending) { pending = true; requestAnimationFrame(paint); } });
    paint();
    history.push({ role: 'assistant', content: raw.replace(/<think>[\s\S]*?<\/think>/g, '').trim() });
    store.set('history', history.slice(-40));
  } catch (e) {
    el.textContent = '오류: ' + (e.message || e);
    history.pop();
  } finally { busy = false; $('sendBtn').hidden = false; $('stopBtn').hidden = true; }
}

$('form').onsubmit = (e) => {
  e.preventDefault();
  const q = $('input').value; $('input').value = '';
  solve(q);
};
$('input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); $('form').requestSubmit(); }
});
$('stopBtn').onclick = () => engine?.stop();

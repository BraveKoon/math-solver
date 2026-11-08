import './style.css';
import { MODELS, DEFAULT_SYSTEM, IS_IOS } from './models.js';
import { BrowserEngine, OllamaEngine, hasWebGPU } from './engine.js';
import { renderAnswer } from './render.js';

const $ = (id) => document.getElementById(id);
const store = {
  get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

const setStatus = (text, ok = false) => { $('status').textContent = text; $('statusBtn').classList.toggle('ok', ok); };
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
$('maxTokens').value = store.get('maxTokens', IS_IOS ? 2048 : 4096);
if (IS_IOS) { $('backend').querySelector('[value=ollama]').remove(); $('backend').value = 'browser'; }

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
const clearChat = () => { history = []; store.set('history', []); $('chat').innerHTML = ''; syncEmpty(); };
$('clearBtn').onclick = () => { clearChat(); $('settings').close(); };
$('newBtn').onclick = clearChat;
$('clearCacheBtn').onclick = async () => {
  if (!confirm('내려받은 모델을 삭제할까요? 다시 쓰려면 인터넷이 필요합니다.')) return;
  await new BrowserEngine().clearCache($('model').value).catch(() => {});
  alert('삭제했습니다.');
};

// ---------- 빈 화면 / 입력창 ----------
function syncEmpty() { $('app').classList.toggle('has-msgs', $('chat').children.length > 0); }
function updateModelChip() {
  const m = MODELS.find((x) => x.id === $('model').value);
  $('modelChip').textContent = $('backend').value === 'browser' ? (m?.name ?? '모델') : $('ollamaModel').value;
}
function refreshSend() { $('sendBtn').disabled = busy || !engine || !$('input').value.trim(); }
function autoGrow() { const t = $('input'); t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 152) + 'px'; }
$('input').addEventListener('input', () => { autoGrow(); refreshSend(); });
document.querySelectorAll('.chip[data-q]').forEach((c) => (c.onclick = () => {
  $('input').value = c.dataset.q; autoGrow(); refreshSend(); $('input').focus();
  if (!engine) $('setup').scrollIntoView({ block: 'start' });
}));
$('model').addEventListener('change', updateModelChip);
updateModelChip();

// ---------- 채팅 렌더링 ----------
function addMsg(role, content) {
  const el = document.createElement('div');
  el.className = `msg ${role}`;
  if (role === 'user') el.textContent = content; else el.innerHTML = renderAnswer(content);
  $('chat').append(el);
  syncEmpty();
  $('chat').scrollTop = $('chat').scrollHeight;
  return el;
}
history.forEach((m) => addMsg(m.role === 'user' ? 'user' : 'bot', m.content));
syncEmpty();

// ---------- 저장소: 모델 캐시가 iOS에 의해 지워지지 않도록 영구 저장 요청 + 용량 점검 ----------
async function ensureStorage() {
  try { await navigator.storage?.persist?.(); } catch {}
  try {
    const { quota, usage } = (await navigator.storage?.estimate?.()) ?? {};
    const need = (MODELS.find((m) => m.id === $('model').value)?.sizeMB ?? 2500) * 1024 * 1024;
    if (quota && usage != null && quota - usage < need)
      throw new Error(`저장 공간이 부족합니다. 필요 약 ${Math.round(need / 2 ** 20)}MB, 남은 공간 ${Math.round((quota - usage) / 2 ** 20)}MB. 더 작은 모델을 고르세요.`);
  } catch (e) { if (/저장 공간/.test(e.message)) throw e; }
}

// ---------- 모델 로딩 ----------
$('loadBtn').onclick = async () => {
  const kind = $('backend').value;
  $('loadBtn').disabled = true; $('progress').hidden = false; $('progress').value = 0;
  setStatus('불러오는 중');
  try {
    if (kind === 'browser') await ensureStorage();
    engine = kind === 'browser' ? new BrowserEngine() : new OllamaEngine();
    const cfg = kind === 'browser'
      ? { modelId: $('model').value }
      : { url: $('ollamaUrl').value, model: $('ollamaModel').value };
    await engine.load(cfg, (p, t) => { $('progress').value = p; $('progressText').textContent = t; });
    store.set('model', $('model').value); store.set('ollamaUrl', $('ollamaUrl').value); store.set('ollamaModel', $('ollamaModel').value);
    setStatus('준비됨', true); updateModelChip();
    $('setup').hidden = true; refreshSend(); $('input').focus();
  } catch (e) {
    engine = null;
    $('progressText').textContent = '오류: ' + (e.message || e);
    setStatus('오류');
  } finally { $('loadBtn').disabled = false; }
};
$('statusBtn').onclick = $('modelChip').onclick = () => { $('setup').hidden = false; $('setup').scrollIntoView({ block: 'start' }); };

// ---------- 풀이 ----------
async function solve(question) {
  if (busy || !engine || !question.trim()) return;
  busy = true; $('sendBtn').hidden = true; $('stopBtn').hidden = false; refreshSend();
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
  } finally { busy = false; $('sendBtn').hidden = false; $('stopBtn').hidden = true; refreshSend(); }
}

$('form').onsubmit = (e) => {
  e.preventDefault();
  const q = $('input').value; $('input').value = ''; autoGrow(); refreshSend();
  solve(q);
};
$('input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !IS_IOS && matchMedia('(pointer:fine)').matches) { e.preventDefault(); if (!$('sendBtn').disabled) $('form').requestSubmit(); }
});
$('stopBtn').onclick = () => engine?.stop();

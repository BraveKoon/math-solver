import './style.css';
import { modelsFor, defaultModel, DEFAULT_SYSTEM, CODER_SYSTEM } from './models.js';
import { NativeEngine, MockEngine, UnsupportedEngine, nativeAvailable } from './engine.js';
import { renderAnswer } from './render.js';
import { loadSessions, saveSessions, currentId, setCurrentId, uid, titleFrom, relativeDay } from './sessions.js';
import { prepareImage } from './images.js';
import * as gh from './github.js';
import { Keyboard } from '@capacitor/keyboard';

const $ = (id) => document.getElementById(id);
const pref = {
  get: (k, d) => { try { return JSON.parse(localStorage.getItem('euler.' + k)) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem('euler.' + k, JSON.stringify(v)); } catch {} },
};

// ---------------------------------------------------------------- 엔진/모델
const useMock = import.meta.env.DEV && new URLSearchParams(location.search).has('mock');
// 실행 엔진은 llama.cpp(iPhone 앱) 하나. 브라우저에서 열면 안내만 표시(개발용 ?mock 제외).
const engine = useMock ? new MockEngine() : nativeAvailable() ? new NativeEngine() : new UnsupportedEngine();
const MODELS = modelsFor();
const byId = (id) => MODELS.find((m) => m.id === id);

let selected = byId(pref.get('model')) ?? defaultModel(MODELS);
let loadedId = null;
let loadingInfo = null;          // { id, progress }
const modelState = {};           // id -> { downloaded, downloading, progress }
let busy = false;
let pending = [];                // 첨부 이미지 [{ send, thumb }]

// 모델을 불러오다 iOS가 앱을 강제 종료(메모리 부족)하면 'loading' 표시가 남는다 → 다음 실행 때 감지
const crashed = new Set(pref.get('crashed', []));
const stale = pref.get('loading', null);
if (stale) {
  crashed.add(stale);
  pref.set('crashed', [...crashed]);
  pref.set('loading', null);
  if (selected.id === stale) selected = defaultModel(MODELS);
}

// ---------------------------------------------------------------- 세션
let sessions = loadSessions();
let session = sessions.find((s) => s.id === currentId()) ?? null;

function persist() {
  if (session) session.updated = Date.now();
  sessions = saveSessions(sessions);
}

function openSession(s) {
  if (busy) return toast('답변이 끝난 뒤에 이동할 수 있어요.');
  session = s;
  setCurrentId(s?.id ?? null);
  pending = [];
  renderAttachments();
  renderChat();
  renderSessions();
  closeDrawer();
}

function renderSessions() {
  const q = $('search').value.trim().toLowerCase();
  const list = $('sessionList');
  list.textContent = '';
  const shown = sessions.filter((s) => !q || s.title.toLowerCase().includes(q) ||
    s.messages.some((m) => m.content?.toLowerCase().includes(q)));
  if (!shown.length) {
    list.innerHTML = `<p class="session-empty">${q ? '검색 결과가 없어요.' : '아직 대화가 없어요.'}</p>`;
    return;
  }
  let group = '';
  for (const s of shown) {
    const g = relativeDay(s.updated);
    if (g !== group) {
      group = g;
      const h = document.createElement('p');
      h.className = 'session-group';
      h.textContent = g;
      list.append(h);
    }
    const row = document.createElement('div');
    row.className = 'session' + (s.id === session?.id ? ' active' : '');
    const open = document.createElement('button');
    open.className = 'open';
    open.textContent = s.title;
    open.onclick = () => openSession(s);
    const del = document.createElement('button');
    del.className = 'del';
    del.setAttribute('aria-label', '삭제');
    del.innerHTML = '<svg viewBox="0 0 24 24"><path d="M5 7h14M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>';
    del.onclick = () => {
      if (!confirm(`'${s.title}' 세션을 삭제할까요?`)) return;
      sessions = sessions.filter((x) => x !== s);
      if (session === s) { session = null; setCurrentId(null); renderChat(); }
      persist();
      renderSessions();
    };
    row.append(open, del);
    list.append(row);
  }
}

// ---------------------------------------------------------------- 대화 렌더링
function msgEl(m) {
  const el = document.createElement('div');
  if (m.role === 'user') {
    el.className = 'msg user';
    if (m.images?.length) {
      const box = document.createElement('div');
      box.className = 'imgs';
      for (const src of m.images) {
        const img = document.createElement('img');
        img.src = src;
        img.alt = '첨부 이미지';
        box.append(img);
      }
      el.append(box);
    }
    el.append(document.createTextNode(m.content));
  } else {
    el.className = 'msg bot';
    el.innerHTML = renderAnswer(m.content);
    decorateCode(el);
  }
  return el;
}

/** 답변 속 코드 블록에 '복사', 'GitHub에 저장' 버튼을 붙인다(추론 과정 안의 코드는 제외). */
function decorateCode(el) {
  for (const pre of el.querySelectorAll('pre')) {
    if (pre.closest('details.think') || pre.previousElementSibling?.classList.contains('code-bar')) continue;
    const lang = (pre.querySelector('code')?.className.match(/language-([\w+#-]+)/) || [])[1] || '';
    const bar = document.createElement('div');
    bar.className = 'code-bar';
    bar.innerHTML = `<span>${lang.replace(/[<>&"]/g, '') || 'code'}</span><button type="button" data-act="copy">복사</button><button type="button" data-act="gh">GitHub에 저장</button>`;
    pre.before(bar);
  }
}

$('chat').addEventListener('click', async (e) => {
  const btn = e.target.closest('.code-bar button');
  if (!btn) return;
  const bar = btn.parentElement;
  const pre = bar.nextElementSibling;
  const code = pre?.innerText.replace(/\n$/, '') ?? '';
  if (btn.dataset.act === 'copy') {
    try { await navigator.clipboard.writeText(code); toast('복사했어요.'); } catch { toast('복사하지 못했어요.'); }
    return;
  }
  const cfg = gh.getConfig();
  if (!cfg.repo || !(await gh.getToken())) {
    toast('설정에서 GitHub 저장소와 토큰을 먼저 연결하세요.');
    return $('settings').showModal();
  }
  const hint = bar.previousElementSibling?.textContent.trim().split('\n').pop() ?? '';
  const path = prompt(`${cfg.repo}${cfg.branch ? ' (' + cfg.branch + ')' : ''}에 저장할 파일 경로`, gh.suggestPath(bar.firstElementChild.textContent, hint));
  if (!path) return;
  btn.disabled = true;
  btn.textContent = '저장 중…';
  try {
    await gh.saveFile(path.trim(), code + '\n', `오일러에서 저장: ${path.trim()}`);
    btn.textContent = '저장됨 ✓';
    toast(`${cfg.repo}/${path.trim()}에 커밋했어요.`);
  } catch (err) {
    btn.textContent = 'GitHub에 저장';
    toast(errText(err));
  } finally {
    btn.disabled = false;
  }
});

function addMsg(m) {
  const el = msgEl(m);
  $('chat').append(el);
  syncEmpty();
  scrollDown();
  return el;
}

function renderChat() {
  $('chat').textContent = '';
  for (const m of session?.messages ?? []) $('chat').append(msgEl(m));
  $('title').textContent = session?.title ?? '새 세션';
  syncEmpty();
  scrollDown();
}

const syncEmpty = () => $('app').classList.toggle('has-msgs', $('chat').children.length > 0);
const scrollDown = () => { $('chat').scrollTop = $('chat').scrollHeight; };

// ---------------------------------------------------------------- 모델 시트
async function refreshStatus() {
  try {
    const st = await engine.status(MODELS);
    for (const m of MODELS) modelState[m.id] = { ...modelState[m.id], ...st[m.id] };
  } catch (e) {
    console.warn('status failed', e);
  }
  renderModels();
  updateChip();
}

const fmtSize = (mb) => (mb >= 1000 ? (mb / 1000).toFixed(1) + 'GB' : mb + 'MB');
const CHECK = '<svg class="check" viewBox="0 0 24 24"><path d="m5 12 5 5 9-10"/></svg>';

function modelRow(m) {
  const st = modelState[m.id] ?? {};
  const li = document.createElement('li');
  li.className = 'model-row';
  li.dataset.id = m.id;
  const tags = [m.vision ? '<span class="tag">이미지</span>' : '', crashed.has(m.id) ? '<span class="tag">⚠ 종료 이력</span>' : ''].join('');
  let meta = `${m.detail} · ${fmtSize(m.sizeMB)}`;
  let action = '';
  if (st.downloading) {
    meta += ` · 내려받는 중 ${Math.round((st.progress ?? 0) * 100)}%`;
    action = '<button class="get" data-act="cancel">취소</button>';
  } else if (st.downloaded && (st.bundled || m.bundled && engine.kind === 'mock')) {
    meta += ' · 앱에 내장';
    if (m.id === selected.id) action = CHECK;
  } else if (st.downloaded) {
    meta += ' · 다운로드됨 <button class="link" data-act="delete">삭제</button>';
    if (m.id === selected.id) action = CHECK;
  } else {
    action = '<button class="get" data-act="get">받기</button>';
  }
  li.innerHTML = `<div class="mtext"><div class="mname">${m.name}${tags}</div><div class="mdesc">${m.desc}</div>
    <div class="mmeta">${meta}</div>${st.downloading ? `<progress max="1" value="${st.progress ?? 0}"></progress>` : ''}</div>
    <div class="maction">${action}</div>`;
  li.onclick = (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'cancel') return engine.cancel(m);
    if (act === 'delete') return deleteModel(m);
    if (st.downloading) return;
    if (st.downloaded) return chooseModel(m);
    startDownload(m);
  };
  return li;
}

function renderModels() {
  const main = MODELS.filter((m) => !m.more);
  const more = MODELS.filter((m) => m.more);
  $('modelList').replaceChildren(...main.map(modelRow));
  $('moreList').replaceChildren(...more.map(modelRow));
  $('moreToggle').hidden = !more.length;
  const t = selected.thinking;
  $('thinking').checked = t === 'always' ? true : t === 'none' ? false : pref.get('thinking', false);
  $('thinking').disabled = t !== 'toggle';
  const gb = engine.freeBytes ? ` · 남은 저장 공간 ${(engine.freeBytes / 1e9).toFixed(1)}GB` : '';
  $('storageInfo').textContent = '모델은 처음 한 번만 내려받고 이후에는 인터넷 없이 동작해요. Wi-Fi에서 받으세요.' + gb;
}

async function startDownload(m) {
  if (Object.values(modelState).some((s) => s.downloading)) return toast('한 번에 하나씩 받을 수 있어요.');
  if (engine.freeBytes && engine.freeBytes < m.sizeMB * 1.1e6) return toast(`저장 공간이 부족해요. ${fmtSize(m.sizeMB)}가 필요해요.`);
  modelState[m.id] = { ...modelState[m.id], downloading: true, progress: 0 };
  renderModels();
  let last = 0;
  try {
    await engine.download(m, (p) => {
      modelState[m.id].progress = p;
      if (Date.now() - last > 300) { last = Date.now(); renderModels(); }
    });
    modelState[m.id] = { downloaded: true, downloading: false };
    toast(`'${m.name}' 준비 완료`);
    chooseModel(m, { keepOpen: true });
  } catch (e) {
    modelState[m.id] = { ...modelState[m.id], downloading: false };
    toast(errText(e));
  }
  renderModels();
}

async function deleteModel(m) {
  if (busy && m.id === selected.id) return toast('답변 중에는 삭제할 수 없어요.');
  if (!confirm(`'${m.name}' 모델(${fmtSize(m.sizeMB)})을 삭제할까요? 다시 쓰려면 인터넷이 필요해요.`)) return;
  try {
    await engine.remove(m);
    if (loadedId === m.id) loadedId = null;
    modelState[m.id] = { downloaded: false, downloading: false };
    crashed.delete(m.id);
    pref.set('crashed', [...crashed]);
  } catch (e) {
    toast(errText(e));
  }
  renderModels();
  updateChip();
}

function chooseModel(m, { keepOpen = false } = {}) {
  selected = m;
  pref.set('model', m.id);
  renderModels();
  updateChip();
  if (!keepOpen) $('modelSheet').close();
  ensureLoaded(m).catch((e) => toast(errText(e)));
}

async function ensureLoaded(m) {
  if (loadedId === m.id) return;
  loadingInfo = { id: m.id, progress: 0 };
  updateChip();
  pref.set('loading', m.id);
  try {
    await engine.load(m, (p) => { loadingInfo = { id: m.id, progress: p }; updateChip(); });
    loadedId = m.id;
    crashed.delete(m.id);
    pref.set('crashed', [...crashed]);
  } finally {
    pref.set('loading', null);
    loadingInfo = null;
    updateChip();
  }
}

function updateChip() {
  let label = selected.name;
  if (loadingInfo?.id === selected.id) {
    label += loadingInfo.progress > 0 && loadingInfo.progress < 1 ? ` · 불러오는 중 ${Math.round(loadingInfo.progress * 100)}%` : ' · 불러오는 중…';
  } else if (!modelState[selected.id]?.downloaded) {
    label += ' · 받기 필요';
  }
  $('modelChipName').textContent = label;
  $('input').placeholder = `${selected.name}에게 물어보기`;
  refreshSend();
}

function openSheet() {
  renderModels();
  $('modelSheet').showModal();
  refreshStatus();
}

// ---------------------------------------------------------------- 첨부 이미지
function renderAttachments() {
  const box = $('attachments');
  box.hidden = !pending.length;
  box.replaceChildren(...pending.map((p, i) => {
    const d = document.createElement('div');
    d.className = 'att';
    d.innerHTML = `<img src="${p.thumb}" alt="첨부 이미지"><button type="button" aria-label="첨부 삭제">✕</button>`;
    d.querySelector('button').onclick = () => { pending.splice(i, 1); renderAttachments(); refreshSend(); };
    return d;
  }));
  refreshSend();
}

$('attachBtn').onclick = () => {
  if (!engine.supportsImages) return toast('브라우저에서는 사진을 읽을 수 없어요. iPhone 앱을 사용하세요.');
  $('fileInput').click();
};

$('fileInput').onchange = async (e) => {
  const files = [...e.target.files].slice(0, Math.max(0, 3 - pending.length));
  e.target.value = '';
  for (const f of files) {
    try { pending.push(await prepareImage(f)); } catch { toast('이미지를 열 수 없어요.'); }
  }
  renderAttachments();
  if (pending.length && !selected.vision) {
    const vision = MODELS.find((m) => m.vision);
    if (vision) toast(`'${selected.name}'은(는) 사진 속 글자를 읽어 풀어요. 그래프·도형 문제는 '${vision.name}'이 더 정확해요.`);
  }
};

// ---------------------------------------------------------------- 보내기
function refreshSend() {
  const hasInput = $('input').value.trim() || pending.length;
  $('sendBtn').disabled = busy || !hasInput;
}

function autoGrow() {
  const t = $('input');
  t.style.height = 'auto';
  t.style.height = Math.min(t.scrollHeight, 152) + 'px';
}

const stripThink = (s) => s.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/^[\s\S]*<\/think>/, '').trim();
const withOcr = (content, ocr) => (ocr
  ? `${content}\n\n[첨부한 사진에서 기기 글자 인식으로 읽은 내용 — 수식 기호가 틀렸을 수 있으니 문맥으로 바로잡아 풀어줘]\n${ocr}`
  : content);
const errText = (e) => (e?.message || String(e)).replace(/^Error:\s*/, '');

async function send() {
  const text = $('input').value.trim();
  if (busy || (!text && !pending.length)) return;
  const m = selected;
  if (!modelState[m.id]?.downloaded) {
    toast(`'${m.name}' 모델을 먼저 받아 주세요.`);
    return openSheet();
  }

  busy = true;
  $('sendBtn').hidden = true;
  $('stopBtn').hidden = false;
  refreshSend();

  if (!session) {
    session = { id: uid(), title: titleFrom(text || '사진 속 문제'), updated: Date.now(), messages: [] };
    sessions.unshift(session);
    setCurrentId(session.id);
    $('title').textContent = session.title;
  }
  const images = pending;
  pending = [];
  renderAttachments();
  const userMsg = { role: 'user', content: text || '이 사진 속 문제를 풀어줘.' };
  if (images.length) userMsg.images = images.map((i) => i.thumb);
  session.messages.push(userMsg);
  persist();
  renderSessions();
  addMsg(userMsg);
  $('input').value = '';
  autoGrow();

  const el = addMsg({ role: 'assistant', content: '' });
  el.innerHTML = '<span class="meta">생각하는 중…</span>';
  let raw = '';
  let scheduled = false;
  const paint = () => {
    scheduled = false;
    const open = [...el.querySelectorAll('details.think')].map((d) => d.open);
    el.innerHTML = renderAnswer(raw);
    el.querySelectorAll('details.think').forEach((d, i) => { d.open = !!open[i]; });
    scrollDown();
  };

  try {
    // 비전 모델이 아니면 사진 대신 기기 내장 글자 인식(OCR) 결과를 문제 글로 넘긴다
    if (images.length && !m.vision) {
      el.innerHTML = '<span class="meta">사진 속 글자를 읽는 중…</span>';
      const texts = [];
      for (const img of images) texts.push(await engine.ocr(img.send));
      if (!texts.some(Boolean)) {
        const vision = MODELS.find((x) => x.vision);
        throw new Error('사진에서 글자를 찾지 못했어요.' + (vision ? ` 그림·도형 문제는 '${vision.name}' 모델을 써 보세요.` : ''));
      }
      userMsg.ocr = texts.map((t, i) => (texts.length > 1 ? `(사진 ${i + 1})\n` : '') + t).join('\n\n');
      persist();
      el.innerHTML = '<span class="meta">생각하는 중…</span>';
    }
    await ensureLoaded(m);
    const history = session.messages.slice(-12).map(({ role, content, ocr }) =>
      ({ role, content: role === 'assistant' ? stripThink(content) : withOcr(content, ocr) }));
    const reason = await engine.generate({
      model: m,
      messages: [{ role: 'system', content: m.coder ? CODER_SYSTEM : pref.get('sys', DEFAULT_SYSTEM) }, ...history],
      images: m.vision ? images.map((i) => i.send) : [],
      temperature: pref.get('temp', 0.6),
      maxTokens: pref.get('maxTokens', 2048),
      thinking: m.thinking === 'always' || (m.thinking === 'toggle' && pref.get('thinking', false)),
    }, (t) => { raw += t; if (!scheduled) { scheduled = true; requestAnimationFrame(paint); } });
    paint();
    decorateCode(el);
    const note = reason === 'length' ? '답변이 길어 중간에 멈췄어요. 설정에서 최대 답변 길이를 늘릴 수 있어요.'
      : reason === 'context' ? '대화가 길어져 멈췄어요. 새 세션을 시작하세요.' : '';
    if (note) el.insertAdjacentHTML('beforeend', `<p class="meta">${note}</p>`);
    if (raw.trim()) session.messages.push({ role: 'assistant', content: raw });
  } catch (e) {
    el.className = 'msg error';
    el.textContent = '오류: ' + errText(e);
  } finally {
    busy = false;
    $('sendBtn').hidden = false;
    $('stopBtn').hidden = true;
    persist();
    renderSessions();
    refreshSend();
  }
}

// ---------------------------------------------------------------- 서랍/시트/설정
function openDrawer() { $('app').classList.add('drawer-open'); $('scrim').hidden = false; renderSessions(); }
function closeDrawer() { $('app').classList.remove('drawer-open'); $('scrim').hidden = true; }

let toastTimer;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 3200);
}

$('menuBtn').onclick = openDrawer;
$('scrim').onclick = closeDrawer;
$('newBtn').onclick = $('newSession').onclick = () => openSession(null);
$('searchBtn').onclick = () => { $('search').hidden = !$('search').hidden; if (!$('search').hidden) $('search').focus(); };
$('search').oninput = renderSessions;
$('menuModels').onclick = () => { closeDrawer(); openSheet(); };
$('menuSettings').onclick = () => { closeDrawer(); $('settings').showModal(); };
$('modelChip').onclick = openSheet;
$('moreToggle').onclick = () => { $('moreList').hidden = !$('moreList').hidden; $('moreToggle').classList.toggle('open', !$('moreList').hidden); };
$('thinking').onchange = () => pref.set('thinking', $('thinking').checked);

for (const d of document.querySelectorAll('dialog')) {
  d.addEventListener('click', (e) => { if (e.target === d || e.target.closest('[data-close]')) d.close(); });
}

$('temp').value = pref.get('temp', 0.6);
$('tempOut').textContent = $('temp').value;
$('maxTokens').value = pref.get('maxTokens', 2048);
$('sys').value = pref.get('sys', DEFAULT_SYSTEM);
$('temp').oninput = () => { $('tempOut').textContent = $('temp').value; pref.set('temp', +$('temp').value); };
$('maxTokens').onchange = () => pref.set('maxTokens', Math.max(256, +$('maxTokens').value || 2048));
$('sys').onchange = () => pref.set('sys', $('sys').value);
$('resetSys').onclick = () => { $('sys').value = DEFAULT_SYSTEM; pref.set('sys', DEFAULT_SYSTEM); toast('기본값으로 되돌렸어요.'); };
// GitHub 연결 설정
{
  const cfg = gh.getConfig();
  $('ghRepo').value = cfg.repo;
  $('ghBranch').value = cfg.branch;
  gh.getToken().then((t) => { $('ghToken').placeholder = t ? '저장됨 (바꾸려면 새로 입력)' : 'github_pat_…'; }).catch(() => {});
  const saveCfg = () => {
    const repo = gh.normalizeRepo($('ghRepo').value);
    if ($('ghRepo').value.trim() && !repo) return toast('저장소는 owner/name 형식으로 입력하세요.');
    $('ghRepo').value = repo;
    gh.setConfig({ repo, branch: $('ghBranch').value.trim() });
  };
  $('ghRepo').onchange = saveCfg;
  $('ghBranch').onchange = saveCfg;
  $('ghToken').onchange = async () => {
    const t = $('ghToken').value.trim();
    if (!t) return;
    try { await gh.setToken(t); $('ghToken').value = ''; $('ghToken').placeholder = '저장됨 (바꾸려면 새로 입력)'; toast('토큰을 키체인에 저장했어요.'); }
    catch (e) { toast(errText(e)); }
  };
  $('ghCheck').onclick = async () => {
    saveCfg();
    if ($('ghToken').value.trim()) await $('ghToken').onchange();
    $('ghStatus').textContent = '확인 중…';
    try {
      const r = await gh.checkConnection();
      $('ghStatus').textContent = r.canPush ? `연결됨: ${r.fullName} (기본 브랜치 ${r.defaultBranch})` : `${r.fullName}에 쓰기 권한이 없어요. 토큰 권한을 확인하세요.`;
    } catch (e) { $('ghStatus').textContent = errText(e); }
  };
  $('ghDisconnect').onclick = async () => {
    await gh.setToken('');
    gh.setConfig({ repo: '', branch: '' });
    $('ghRepo').value = ''; $('ghBranch').value = ''; $('ghToken').value = '';
    $('ghToken').placeholder = 'github_pat_…';
    $('ghStatus').textContent = '연결을 해제했어요.';
  };
}
$('clearAll').onclick = () => {
  if (!confirm('모든 세션을 삭제할까요?')) return;
  sessions = [];
  persist();
  openSession(null);
  $('settings').close();
};
$('aboutInfo').textContent = engine.kind === 'native' ? '실행 엔진: llama.cpp (Metal, 기기 내 실행)'
  : engine.kind === 'mock' ? '개발 모드(가짜 엔진)' : '브라우저에서는 실행할 수 없어요. iPhone 앱을 사용하세요.';
$('engineBadge').textContent = engine.kind === 'native' ? 'llama.cpp · 기기 내 실행' : engine.kind === 'mock' ? '개발 모드' : 'iPhone 앱 전용';

document.querySelectorAll('.chip[data-q]').forEach((c) => (c.onclick = () => {
  $('input').value = c.dataset.q;
  autoGrow();
  refreshSend();
  $('input').focus();
}));
$('input').addEventListener('input', () => { autoGrow(); refreshSend(); });
$('input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && matchMedia('(pointer:fine)').matches) {
    e.preventDefault();
    if (!$('sendBtn').disabled) send();
  }
});
$('form').onsubmit = (e) => { e.preventDefault(); send(); };
$('stopBtn').onclick = () => engine.stop();

// ---------------------------------------------------------------- 키보드(iOS 앱)
if (engine.kind === 'native') {
  Keyboard.setAccessoryBarVisible({ isVisible: false }).catch(() => {});
  Keyboard.addListener('keyboardDidShow', () => scrollDown()).catch?.(() => {});
}

// ---------------------------------------------------------------- 시작
renderChat();
renderSessions();
updateChip();
if (engine.kind === 'unsupported') toast('이 앱은 iPhone 앱에서 실행돼요. 브라우저에서는 화면만 볼 수 있어요.');
else if (stale) toast(`'${byId(stale)?.name ?? stale}'을 불러오다 앱이 종료됐어요(메모리 부족 추정). 더 작은 모델을 쓰세요.`);
refreshStatus().then(() => {
  // 앱(네이티브)에서는 받아 둔 모델을 미리 올려 첫 답변을 빠르게
  if (engine.kind === 'native' && modelState[selected.id]?.downloaded && !crashed.has(selected.id)) {
    ensureLoaded(selected).catch((e) => toast(errText(e)));
  }
});

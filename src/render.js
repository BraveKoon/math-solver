import { marked } from 'marked';
import DOMPurify from 'dompurify';
import katex from 'katex';
import 'katex/dist/katex.min.css';

const MATH_RE = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|(?<![\\$])\$(?!\s)([^$\n]+?)(?<!\s)\$(?!\d)/g;

function renderMath(tex, display) {
  try { return katex.renderToString(tex.trim(), { displayMode: display, throwOnError: false, output: 'htmlAndMathml' }); }
  catch { return `<code>${tex.replace(/</g, '&lt;')}</code>`; }
}

/** Markdown + LaTeX → 안전한 HTML. 수식은 marked가 건드리지 않도록 자리표시자로 치환. */
export function renderMarkdown(src) {
  const store = [];
  const text = src.replace(MATH_RE, (_, a, b, c, d) => {
    const display = a !== undefined || b !== undefined;
    store.push(renderMath(a ?? b ?? c ?? d, display));
    return `@@MATH${store.length - 1}@@`;
  });
  let html = marked.parse(text, { breaks: true, gfm: true });
  html = html.replace(/@@MATH(\d+)@@/g, (_, i) => store[+i]);
  return DOMPurify.sanitize(html, { ADD_TAGS: ['semantics', 'annotation'], ADD_ATTR: ['encoding'] });
}

/** <think>…</think> 를 접이식 블록으로 분리해 렌더링. 스트리밍 중 닫히지 않은 블록도 처리. */
export function renderAnswer(raw) {
  // 생각 모델이 여는 태그 없이 '</think>'만 출력하는 경우 보정
  if (raw.includes('</think>') && !raw.includes('<think>')) raw = '<think>' + raw;
  let out = '';
  let rest = raw;
  for (;;) {
    const s = rest.indexOf('<think>');
    if (s < 0) break;
    out += renderMarkdown(rest.slice(0, s));
    const e = rest.indexOf('</think>', s);
    const body = rest.slice(s + 7, e < 0 ? undefined : e);
    out += `<details class="think${e < 0 ? ' live' : ''}"><summary>${e < 0 ? '생각하는 중…' : '추론 과정 보기'}</summary>${renderMarkdown(body)}</details>`;
    if (e < 0) return out;
    rest = rest.slice(e + 8);
  }
  return out + renderMarkdown(rest);
}

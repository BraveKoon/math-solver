// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderAnswer } from '../src/render.js';

describe('renderAnswer', () => {
  it('renders inline and display LaTeX with KaTeX', () => {
    const h = renderAnswer('답: $x^2$ 그리고 $$\\frac{a}{b}$$ 와 \\(y\\) \\[z\\]');
    expect((h.match(/class="katex"/g) || []).length).toBe(4);
  });
  it('does not treat currency as math', () => {
    expect(renderAnswer('가격은 $5 와 $7 입니다')).not.toContain('katex');
  });
  it('wraps think blocks, including unclosed streaming ones', () => {
    expect(renderAnswer('<think>a</think>b')).toContain('<details class="think">');
    expect(renderAnswer('<think>partial')).toContain('open');
  });
  it('repairs a missing opening think tag', () => {
    const h = renderAnswer('reasoning here</think>answer');
    expect(h).toContain('<details class="think">');
    expect(h).toContain('answer');
  });
  it('sanitizes scripts and handlers', () => {
    const h = renderAnswer('<script>alert(1)</script><img src=x onerror=alert(1)>');
    expect(h).not.toContain('<script');
    expect(h).not.toContain('onerror');
  });
  it('keeps markdown structure', () => {
    expect(renderAnswer('- a\n- b')).toContain('<li>');
  });
});

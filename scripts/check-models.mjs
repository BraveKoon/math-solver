// 카탈로그의 GGUF 다운로드 주소가 실제로 존재하는지 확인(CI에서 실행).
// 실패하면 해당 저장소의 .gguf 파일 목록을 출력해 올바른 파일명을 찾기 쉽게 한다.
import { CATALOG, ggufFiles } from '../src/models.js';

let failed = 0;
for (const m of CATALOG.filter((x) => x.gguf)) {
  for (const f of ggufFiles(m)) {
    const r = await fetch(f.url, { method: 'HEAD', redirect: 'follow' });
    const size = Number(r.headers.get('content-length') || r.headers.get('x-linked-size') || 0);
    const ok = r.ok;
    console.log(`${ok ? 'OK  ' : 'FAIL'} ${r.status} ${m.id.padEnd(14)} ${(size / 1e6).toFixed(0).padStart(5)}MB  ${m.gguf.repo}/${f.name}`);
    if (!ok) {
      failed++;
      try {
        const info = await (await fetch(`https://huggingface.co/api/models/${m.gguf.repo}`)).json();
        const names = (info.siblings ?? []).map((s) => s.rfilename).filter((n) => n.endsWith('.gguf'));
        console.log(`     files in ${m.gguf.repo}: ${names.join(', ') || '(repo not found)'}`);
        if (!names.length) {
          // 저장소가 없으면 같은 모델명의 GGUF 저장소 후보와 파일 목록을 보여준다
          const q = m.gguf.repo.split('/')[1];
          const found = await (await fetch(`https://huggingface.co/api/models?search=${encodeURIComponent(q)}&limit=8`)).json();
          for (const r of found) {
            const d = await (await fetch(`https://huggingface.co/api/models/${r.id}`)).json();
            const g = (d.siblings ?? []).map((s) => s.rfilename).filter((n) => n.endsWith('.gguf'));
            console.log(`     candidate ${r.id}: ${g.join(', ')}`);
          }
        }
      } catch (e) {
        console.log(`     could not list repo: ${e.message}`);
      }
    }
  }
}
if (failed) { console.error(`${failed} model file(s) missing`); process.exit(1); }

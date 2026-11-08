// 앱에 내장할 기본 모델(GGUF)을 ios/App/App/BundledModels/<id>/ 로 내려받는다(TestFlight 빌드, `npm run ios`).
import { createWriteStream, existsSync, mkdirSync, statSync, renameSync } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { CATALOG, ggufFiles } from '../src/models.js';

const root = new URL('../ios/App/App/BundledModels/', import.meta.url).pathname;
for (const m of CATALOG.filter((x) => x.bundled)) {
  const dir = `${root}${m.id}/`;
  mkdirSync(dir, { recursive: true });
  for (const f of ggufFiles(m)) {
    const dest = dir + f.name;
    const head = await fetch(f.url, { method: 'HEAD', redirect: 'follow' });
    if (!head.ok) throw new Error(`${f.name}: HTTP ${head.status}`);
    const size = Number(head.headers.get('content-length') || head.headers.get('x-linked-size') || 0);
    if (existsSync(dest) && size && statSync(dest).size === size) {
      console.log(`cached  ${m.id}/${f.name} (${(size / 1e6).toFixed(0)}MB)`);
      continue;
    }
    console.log(`fetch   ${m.id}/${f.name} (${(size / 1e6).toFixed(0)}MB)`);
    const r = await fetch(f.url, { redirect: 'follow' });
    if (!r.ok) throw new Error(`${f.name}: HTTP ${r.status}`);
    await pipeline(Readable.fromWeb(r.body), createWriteStream(dest + '.part'));
    if (size && statSync(dest + '.part').size !== size) throw new Error(`${f.name}: size mismatch`);
    renameSync(dest + '.part', dest);
  }
}

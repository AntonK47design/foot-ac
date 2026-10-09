/* npm run size: sizes of everything loaded before gameplayStart (entry JS + static imports + CSS + CSS assets + index.html). */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { brotliCompressSync, gzipSync, constants } from 'node:zlib';

const DIST = process.argv[2] ?? 'dist';
const KB = 1024;
const BUDGET = { initialGzip: 3 * 1024 * KB, initialHardRaw: 5 * 1024 * KB, jsBrotli: 400 * KB, files: 1500, total: 250 * 1024 * KB };

interface ManifestChunk {
  file: string;
  css?: string[];
  assets?: string[];
  imports?: string[];
  dynamicImports?: string[];
  isEntry?: boolean;
}

const manifestPath = join(DIST, '.vite', 'manifest.json');
if (!existsSync(manifestPath)) {
  console.error('manifest missing — run vite build first');
  process.exit(1);
}
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, ManifestChunk>;
const initial = new Set<string>(['index.html']);
const visit = (key: string): void => {
  const c = manifest[key];
  if (!c) return;
  initial.add(c.file);
  for (const css of c.css ?? []) initial.add(css);
  for (const a of c.assets ?? []) initial.add(a);
  for (const i of c.imports ?? []) visit(i);
};
for (const [k, c] of Object.entries(manifest)) if (c.isEntry) visit(k);
// assets referenced from CSS (fonts)
for (const f of [...initial]) {
  if (!f.endsWith('.css')) continue;
  const css = readFileSync(join(DIST, f), 'utf8');
  for (const m of css.matchAll(/url\(([^)]+)\)/g)) {
    const ref = (m[1] ?? '').replace(/["']/g, '');
    if (ref.startsWith('data:')) continue;
    initial.add(relative(DIST, join(DIST, dirname(f), ref)));
  }
}

let raw = 0;
let gz = 0;
let jsBr = 0;
const rows: string[] = [];
for (const f of [...initial].sort()) {
  const p = join(DIST, f);
  if (!existsSync(p)) continue;
  const buf = readFileSync(p);
  const g = gzipSync(buf, { level: 9 }).length;
  const b = brotliCompressSync(buf, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length;
  const compressible = /\.(js|css|html|json|svg)$/.test(f);
  raw += buf.length;
  gz += compressible ? g : buf.length;
  if (f.endsWith('.js')) jsBr += b;
  rows.push(`  ${f.padEnd(44)} ${(buf.length / KB).toFixed(1).padStart(8)} KB raw ${(g / KB).toFixed(1).padStart(7)} KB gz ${(b / KB).toFixed(1).padStart(7)} KB br`);
}

let files = 0;
let total = 0;
const walk = (d: string): void => {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    const s = statSync(p);
    if (s.isDirectory()) {
      if (n === '.vite') continue;
      walk(p);
    } else {
      files++;
      total += s.size;
    }
  }
};
walk(DIST);

console.log('Initial load (before gameplayStart):');
console.log(rows.join('\n'));
console.log(`  total: ${(raw / KB).toFixed(1)} KB raw · ${(gz / KB).toFixed(1)} KB transferred (gzip) · JS ${(jsBr / KB).toFixed(1)} KB brotli`);
console.log(`Bundle: ${files} files, ${(total / KB).toFixed(1)} KB total`);
const fails: string[] = [];
if (gz > BUDGET.initialGzip) fails.push(`initial transfer ${(gz / KB).toFixed(0)} KB > 3 MB`);
if (raw > BUDGET.initialHardRaw) fails.push(`initial raw ${(raw / KB).toFixed(0)} KB > 5 MB hard cap`);
if (jsBr > BUDGET.jsBrotli) fails.push(`JS ${(jsBr / KB).toFixed(0)} KB brotli > 400 KB`);
if (files > BUDGET.files) fails.push(`${files} files > 1500`);
if (total > BUDGET.total) fails.push('bundle > 250 MB');
const html = readFileSync(join(DIST, 'index.html'), 'utf8');
if (/(src|href)="\/(?!\/)/.test(html)) fails.push('absolute path in index.html (must be relative)');
if (fails.length) {
  console.error('SIZE FAILED:\n  ' + fails.join('\n  '));
  process.exit(1);
}
console.log('SIZE OK');

/* npm run zip: dist/ → kickoff-academy-2.zip (deflate), relative paths only, file-count check. */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { crc32, deflateRawSync } from 'node:zlib';

const DIST = 'dist';
const OUT = 'kickoff-academy-2.zip';
const files: string[] = [];
const walk = (d: string): void => {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) {
      if (n === '.vite') continue;
      walk(p);
    } else files.push(p);
  }
};
walk(DIST);
if (files.length > 1500) {
  console.error(`too many files: ${files.length}`);
  process.exit(1);
}
const local: Buffer[] = [];
const central: Buffer[] = [];
let offset = 0;
const dosTime = (): [number, number] => {
  const d = new Date();
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return [time, date];
};
const [tm, dt] = dosTime();
for (const f of files) {
  const name = Buffer.from(relative(DIST, f).split(sep).join('/'));
  const data = readFileSync(f);
  const comp = deflateRawSync(data, { level: 9 });
  const useDeflate = comp.length < data.length;
  const body = useDeflate ? comp : data;
  const crc = crc32(data) >>> 0;
  const h = Buffer.alloc(30);
  h.writeUInt32LE(0x04034b50, 0);
  h.writeUInt16LE(20, 4);
  h.writeUInt16LE(0x0800, 6);
  h.writeUInt16LE(useDeflate ? 8 : 0, 8);
  h.writeUInt16LE(tm, 10);
  h.writeUInt16LE(dt, 12);
  h.writeUInt32LE(crc, 14);
  h.writeUInt32LE(body.length, 18);
  h.writeUInt32LE(data.length, 22);
  h.writeUInt16LE(name.length, 26);
  h.writeUInt16LE(0, 28);
  local.push(h, name, body);
  const c = Buffer.alloc(46);
  c.writeUInt32LE(0x02014b50, 0);
  c.writeUInt16LE(20, 4);
  c.writeUInt16LE(20, 6);
  c.writeUInt16LE(0x0800, 8);
  c.writeUInt16LE(useDeflate ? 8 : 0, 10);
  c.writeUInt16LE(tm, 12);
  c.writeUInt16LE(dt, 14);
  c.writeUInt32LE(crc, 16);
  c.writeUInt32LE(body.length, 20);
  c.writeUInt32LE(data.length, 24);
  c.writeUInt16LE(name.length, 28);
  c.writeUInt32LE(offset, 42);
  central.push(c, name);
  offset += h.length + name.length + body.length;
}
const cd = Buffer.concat(central);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(cd.length, 12);
end.writeUInt32LE(offset, 16);
writeFileSync(OUT, Buffer.concat([...local, cd, end]));
console.log(`${OUT}: ${files.length} files, ${(statSync(OUT).size / 1024).toFixed(1)} KB`);

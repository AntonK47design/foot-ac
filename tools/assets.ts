/* npm run assets: assets-src/ (CC0 packs) → public/assets/<group>.glb + manifest.json + CREDITS.md
 * prune, dedupe, weld, resample animations, WebP textures ≤ 512 px, meshopt compression. */
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Document, NodeIO, type Node } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, resample, textureCompress, weld, mergeDocuments, unpartition } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
import { GROUPS, PACKS, type AssetGroup } from './assets.config';
import { KIT_CELLS, mergeHead, remapKit } from './kit-remap';

const SRC = 'assets-src';
const OUT = 'public/assets';

async function main(): Promise<void> {
  await MeshoptEncoder.ready;
  await MeshoptDecoder.ready;
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
  mkdirSync(OUT, { recursive: true });
  const manifest: Record<string, { file: string; area1: boolean; bytes: number; models: string[] }> = {};
  const usedPacks = new Set<string>();

  for (const g of GROUPS) {
    if (g.characters) {
      const r = await packCharacters(io, g);
      manifest[g.id] = r;
      for (const src of Object.values(g.models)) usedPacks.add(src.pack);
      continue;
    }
    const doc = new Document();
    doc.createBuffer();
    const scene = doc.createScene(g.id);
    for (const [key, src] of Object.entries(g.models)) {
      usedPacks.add(src.pack);
      const part = await io.read(join(SRC, src.file));
      const before = new Set(doc.getRoot().listScenes());
      mergeDocuments(doc, part);
      // wrap the merged scene's roots in one named node and move it into our scene
      const holder: Node = doc.createNode(key);
      for (const s of doc.getRoot().listScenes()) {
        if (before.has(s) || s === scene) continue;
        for (const n of s.listChildren()) holder.addChild(n);
        s.dispose();
      }
      scene.addChild(holder);
    }
    doc.getRoot().setDefaultScene(scene);
    await doc.transform(
      unpartition(),
      dedup(),
      weld(),
      prune({ keepLeaves: false, keepAttributes: false }),
      textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [512, 512] }),
      meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
    );
    const file = `${g.id}.glb`;
    await io.write(join(OUT, file), doc);
    const bytes = statSync(join(OUT, file)).size;
    manifest[g.id] = { file, area1: g.area1, bytes, models: Object.keys(g.models) };
    console.log(`${file}: ${Object.keys(g.models).length} models, ${(bytes / 1024).toFixed(1)} KB`);
  }
  writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));

  // CREDITS.md (generated)
  const base = readFileSync('tools/credits.base.md', 'utf8');
  const lines = [...usedPacks].sort().map((id) => {
    const p = PACKS[id];
    return p ? `- **${p.title}** by ${p.author}, ${p.license} — ${p.url} (licence: \`assets-src/${p.licenseFile}\`)` : `- ${id}`;
  });
  writeFileSync('CREDITS.md', base.replace('{{MODELS}}', lines.join('\n')));
  console.log('manifest + CREDITS.md written');
}

/** Paints the kit cells white so the runtime material can tint them. */
async function whitenKitCells(doc: Document): Promise<void> {
  for (const tex of doc.getRoot().listTextures()) {
    const img = tex.getImage();
    if (!img) continue;
    const meta = await sharp(img).metadata();
    const w = meta.width ?? 512;
    const h = meta.height ?? 512;
    const cw = w / 16;
    const ch = h / 4;
    const rects = Object.values(KIT_CELLS).map(([c, r]) => ({
      input: { create: { width: Math.round(cw), height: Math.round(ch), channels: 4 as const, background: { r: 255, g: 255, b: 255, alpha: 1 } } },
      left: Math.round(c * cw),
      top: Math.round(r * ch),
    }));
    const out = await sharp(img).composite(rects).png().toBuffer();
    tex.setImage(new Uint8Array(out)).setMimeType('image/png');
  }
}

async function packCharacters(io: NodeIO, g: AssetGroup): Promise<{ file: string; area1: boolean; bytes: number; models: string[] }> {
  const cfg = g.characters as NonNullable<AssetGroup['characters']>;
  const dir = join(OUT, g.id);
  mkdirSync(dir, { recursive: true });
  let total = 0;
  for (const [key, src] of Object.entries(g.models)) {
    const doc = await io.read(join(SRC, src.file));
    remapKit(doc);
    mergeHead(doc);
    await whitenKitCells(doc);
    for (const a of doc.getRoot().listAnimations()) {
      if (key !== cfg.clipSource || !cfg.clips.includes(a.getName())) a.dispose();
    }
    await doc.transform(
      resample(),
      dedup(),
      prune({ keepLeaves: true, keepAttributes: true }),
      textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [512, 512] }),
      meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
    );
    const file = join(dir, `${key}.glb`);
    await io.write(file, doc);
    total += statSync(file).size;
  }
  console.log(`${g.id}/: ${Object.keys(g.models).length} characters, ${(total / 1024).toFixed(1)} KB`);
  return { file: `${g.id}/`, area1: g.area1, bytes: total, models: Object.keys(g.models) };
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});

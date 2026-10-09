/* npm run assets: assets-src/ (CC0 packs) → public/assets/<group>.glb + manifest.json + CREDITS.md
 * prune, dedupe, weld, resample animations, WebP textures ≤ 512 px, meshopt compression. */
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Document, NodeIO, type Node } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, resample, textureCompress, weld, mergeDocuments, unpartition } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
import { GROUPS, PACKS } from './assets.config';

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
      ...(g.animations ? [resample()] : []),
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

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});

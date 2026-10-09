/* Prints bounding-box sizes of packed props (helps choose scales). */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { getBounds } from '@gltf-transform/core';
import { MeshoptDecoder } from 'meshoptimizer';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
async function main(): Promise<void> {
  await MeshoptDecoder.ready;
  const doc = await io.read(process.argv[2] ?? 'public/assets/props-area1.glb');
  for (const n of doc.getRoot().getDefaultScene()?.listChildren() ?? []) {
    const b = getBounds(n);
    console.log(n.getName().padEnd(28), b.max.map((v, i) => (v - (b.min[i] ?? 0)).toFixed(2)).join(' x '));
  }
}
void main();

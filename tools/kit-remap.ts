/**
 * Character kit remap (build time). Moves shirt/shorts/socks UVs of Kenney Mini Characters into dedicated
 * white palette cells so the runtime material can tint them per role (academy kit, staff bib, coach tracksuit, casual).
 * Skin (hands, knees, face), shoes and hair keep their original palette colours.
 */
import type { Document, Node, Primitive } from '@gltf-transform/core';
import { joinPrimitives } from '@gltf-transform/functions';

/** Palette cells (16 × 4 grid, glTF v grows downwards). Rows 0–1 are unused in the pack. */
export const KIT_CELLS = { shirt: [4, 1], shorts: [6, 1], socks: [8, 1], trim: [10, 1] } as const;
const cellUv = (c: readonly [number, number]): [number, number] => [(c[0] + 0.5) / 16, (c[1] + 0.5) / 4];
const cellOf = (u: number, v: number): string => `${Math.floor(u * 16)}:${Math.floor(v * 4)}`;

function dominant(j: number[], w: number[]): number {
  let bi = 0;
  for (let k = 1; k < 4; k++) if ((w[k] ?? 0) > (w[bi] ?? 0)) bi = k;
  return j[bi] ?? 0;
}

export function remapKit(doc: Document): void {
  const root = doc.getRoot();
  const nodes = root.listNodes();
  const meshNode = (name: string): Node | undefined => nodes.find((n) => n.getMesh()?.getName() === name);
  // skin colour = most used cell on the head mesh (the face)
  const head = meshNode('head-mesh')?.getMesh()?.listPrimitives()[0];
  const counts = new Map<string, number>();
  const a: number[] = [];
  if (head) {
    const uv = head.getAttribute('TEXCOORD_0');
    for (let i = 0; uv && i < uv.getCount(); i++) {
      uv.getElement(i, a);
      const k = cellOf(a[0] ?? 0, a[1] ?? 0);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
  }
  const skinCell = [...counts.entries()].sort((x, y) => y[1] - x[1])[0]?.[0];
  const bodyNode = meshNode('body-mesh');
  const body = bodyNode?.getMesh()?.listPrimitives()[0];
  const joints = bodyNode?.getSkin()?.listJoints().map((j) => j.getName()) ?? [];
  if (!body) return;
  remapBody(body, joints, skinCell);
}

function remapBody(p: Primitive, joints: string[], skinCell: string | undefined): void {
  const uv = p.getAttribute('TEXCOORD_0');
  const pos = p.getAttribute('POSITION');
  const J = p.getAttribute('JOINTS_0');
  const W = p.getAttribute('WEIGHTS_0');
  if (!uv || !pos || !J || !W) return;
  const n = uv.getCount();
  const t: number[] = [];
  const j: number[] = [];
  const w: number[] = [];
  const y: number[] = [];
  // leg height range
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < n; i++) {
    J.getElement(i, j);
    W.getElement(i, w);
    const bone = joints[dominant(j, w)] ?? '';
    if (!bone.startsWith('leg')) continue;
    pos.getElement(i, y);
    lo = Math.min(lo, y[1] ?? 0);
    hi = Math.max(hi, y[1] ?? 0);
  }
  const span = hi - lo || 1;
  const shirt = cellUv(KIT_CELLS.shirt);
  const shorts = cellUv(KIT_CELLS.shorts);
  const socks = cellUv(KIT_CELLS.socks);
  // remap per triangle so faces never straddle two cells
  const idx = p.getIndices();
  const tri = idx ? idx.getCount() / 3 : n / 3;
  const target = new Array<[number, number] | null>(n).fill(null);
  for (let f = 0; f < tri; f++) {
    const vs = [0, 1, 2].map((k) => (idx ? (idx.getScalar(f * 3 + k) as number) : f * 3 + k));
    const v0 = vs[0] as number;
    uv.getElement(v0, t);
    const cell = cellOf(t[0] ?? 0, t[1] ?? 0);
    if (cell === skinCell) continue;
    J.getElement(v0, j);
    W.getElement(v0, w);
    const bone = joints[dominant(j, w)] ?? '';
    let dest: [number, number] | null = null;
    if (bone === 'torso' || bone.startsWith('arm')) dest = shirt;
    else if (bone.startsWith('leg')) {
      let my = 0;
      for (const v of vs) {
        pos.getElement(v, y);
        my += (y[1] ?? 0) / 3;
      }
      const k = (my - lo) / span;
      if (k < 0.22) dest = null; // shoes
      else if (k < 0.55) dest = socks;
      else dest = shorts;
    }
    if (dest) for (const v of vs) target[v] = dest;
  }
  for (let i = 0; i < n; i++) {
    const d = target[i];
    if (d) uv.setElement(i, d);
  }
}

/** Joins head-mesh into body-mesh (identical skins) → one skinned draw call per character. */
export function mergeHead(doc: Document): void {
  const nodes = doc.getRoot().listNodes();
  const bodyNode = nodes.find((n) => n.getMesh()?.getName() === 'body-mesh');
  const headNode = nodes.find((n) => n.getMesh()?.getName() === 'head-mesh');
  const bodyMesh = bodyNode?.getMesh();
  const headMesh = headNode?.getMesh();
  const bp = bodyMesh?.listPrimitives()[0];
  const hp = headMesh?.listPrimitives()[0];
  if (!bodyNode || !headNode || !bodyMesh || !bp || !hp) return;
  for (const sem of ['TANGENT', 'TEXCOORD_1']) {
    bp.setAttribute(sem, null);
    hp.setAttribute(sem, null);
  }
  const joined = joinPrimitives([bp, hp]);
  bodyMesh.removePrimitive(bp);
  bodyMesh.addPrimitive(joined);
  headNode.dispose();
  headMesh?.dispose();
}

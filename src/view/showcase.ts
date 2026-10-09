/* ?showcase=1 (dev only): Area 1 fully built and populated at the gameplay camera, with HUD and world UI.
 * Never shipped: main.ts only imports this behind import.meta.env.DEV. */
import {
  ACESFilmicToneMapping,
  Color,
  DirectionalLight,
  DoubleSide,
  Group,
  HemisphereLight,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  PCFShadowMap,
  RingGeometry,
  SRGBColorSpace,
  Scene,
  Timer,
  WebGLRenderer,
  type BufferAttribute,
} from 'three';
import { AREA1_LAYOUT as L } from '../data/areas/area1-layout';
import { formatCash, setLocale, t } from '../core/i18n';
import { Hud } from '../ui/hud';
import { icon } from '../ui/icons';
import { LabelLayer, Projector } from '../ui/labels';
import { Batch } from './batch';
import { CHARACTER_KEYS, loadArea1Assets, type CharacterKey } from './assets';
import { ballGeometry } from './builders/ball';
import { buildFullDiorama, type UnlockGeo } from './builders/diorama';
import { AREA1 } from '../data/areas/area1';
import { WorldGeo } from '../sim/world';
import { DecalBatch } from './builders/decals';
import { PropKit } from './builders/football';
import { CameraRig } from './camera';
import { Character, KITS, casualKit, type CharAnim, type Kit } from './characters';
import { G } from './geo';
import { IconRenderer } from './icon-render';
import { makePad } from './pads';

const RARITY = { common: 0xa7b0be, rare: 0x3d8bff, epic: 0xa35cff, wonderkid: 0xffc83d } as const;
type Rarity = keyof typeof RARITY;

interface Actor {
  c: Character;
  label?: () => string;
  rarity?: Rarity;
  headY: number;
  path?: (t: number) => { x: number; z: number; ry: number };
}

declare global {
  interface Window {
    __showcaseReady?: boolean;
    __showcaseStats?: Record<string, number>;
  }
}

export async function runShowcase(root: HTMLElement): Promise<void> {
  setLocale('en');
  const params = new URLSearchParams(location.search);
  const canvas = document.createElement('canvas');
  root.appendChild(canvas);
  const vignette = document.createElement('div');
  vignette.className = 'vignette';
  root.appendChild(vignette);
  const renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  const scene = new Scene();
  scene.background = new Color(0x241e33);
  const hemi = new HemisphereLight(0xeef4ff, 0x5a4c66, 1.45);
  scene.add(hemi);
  const sun = new DirectionalLight(0xfff0d6, 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18, near: 1, far: 60 });
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.025;
  scene.add(sun, sun.target);

  const assets = await loadArea1Assets();
  const mat = new MeshLambertMaterial({ vertexColors: true });
  const wg = new WorldGeo(AREA1);
  const geos: Record<string, UnlockGeo> = {};
  for (const [id, st] of wg.stations) geos[id] = { center: st.def.center, lanes: st.lanes, basket: st.basket };
  const dio = buildFullDiorama(assets, L, mat, geos);
  scene.add(dio.root);
  const A = dio.anchors;
  const anchor = (k: string): { x: number; z: number; ry?: number } => {
    const a = A[k];
    if (!a) throw new Error('anchor ' + k);
    return a;
  };

  // ── characters
  const actors: Actor[] = [];
  const kids = CHARACTER_KEYS.filter((k) => k !== 'male-b' && k !== 'male-c' && k !== 'male-d' && k !== 'female-a');
  let kidI = 0;
  const nextKid = (): CharacterKey => kids[kidI++ % kids.length] as CharacterKey;
  const add = (key: CharacterKey, kit: Kit, x: number, z: number, ry: number, anim: CharAnim, scale: number, extra: Partial<Actor> = {}): Actor => {
    const c = new Character(assets, key, kit, scale);
    c.root.position.set(x, 0, z);
    c.root.rotation.y = ry;
    c.play(anim, 0);
    c.seek((x * 7 + z * 3) % 1.5);
    scene.add(c.root);
    const a: Actor = { c, headY: 1.35 * (scale / 1.6), ...extra };
    actors.push(a);
    return a;
  };
  const KID = 1.6;
  const ADULT = 1.85;
  const spawn = L.coachSpawn;
  const coach = add('male-c', KITS.coach, spawn.x + 0.2, spawn.z + 0.2, 0.25, 'cheer', ADULT);
  // reception: kids waiting on the benches (casual clothes), one at the desk
  const wb = anchor('waitBench');
  for (let i = 0; i < 3; i++) add(nextKid(), casualKit(i + 2), wb.x + 0.05, wb.z - 0.8 + i * 0.8, Math.PI / 2 - 0.5, 'sit', KID, { rarity: (['common', 'rare', 'common'] as Rarity[])[i], label: () => '' });
  const wb2 = { x: -11.0, z: -3.25 };
  add(nextKid(), casualKit(7), wb2.x - 0.5, wb2.z + 0.05, 0, 'sit', KID, { rarity: 'epic' });
  const desk = anchor('desk');
  add('male-d', KITS.staff, desk.x, desk.z - 0.75, 0, 'idle', ADULT);
  add(nextKid(), casualKit(4), desk.x - 0.2, desk.z + 1.05, Math.PI, 'idle', KID, { rarity: 'rare', label: () => 'card' });
  // changing room
  const lb = anchor('lockerBench');
  add(nextKid(), KITS.academy, lb.x - 0.8, lb.z + 0.05, 0, 'sit', KID, { rarity: 'common' });
  add(nextKid(), KITS.academy, lb.x + 0.9, lb.z + 0.9, -0.5, 'cheer', KID, { rarity: 'rare' });
  // shooting lane: shooter + queue
  const ss = anchor('shootSpot');
  const shooter = add(nextKid(), KITS.academy, ss.x, ss.z, Math.PI, 'kick', KID, { rarity: 'wonderkid' });
  add(nextKid(), KITS.academy, ss.x + 0.2, ss.z + 1.3, 0.4, 'idle', KID, { rarity: 'common' });
  add(nextKid(), KITS.academy, ss.x + 0.3, ss.z + 2.3, -0.3, 'idle', KID, { rarity: 'rare', label: () => 'need' });
  // dribble: running down the strip
  const dsA = anchor('dribbleStart');
  add(nextKid(), KITS.academy, dsA.x, dsA.z - 2.2, Math.PI, 'run', KID, {
    rarity: 'epic',
    path: (tt) => {
      const k = (Math.sin(tt * 0.7) + 1) / 2;
      const z = dsA.z - 0.6 - k * 4.4;
      return { x: dsA.x + Math.sin(z * 3.4) * 0.35, z, ry: Math.cos(tt * 0.7) > 0 ? Math.PI : 0 };
    },
  });
  // passing deck
  const pa = anchor('passSpotA');
  const pb = anchor('passSpotB');
  add(nextKid(), KITS.academy, pa.x, pa.z, Math.PI, 'kick', KID, { rarity: 'common' });
  add(nextKid(), KITS.academy, pb.x, pb.z, Math.PI, 'idle', KID, { rarity: 'rare' });
  // track: sprinting
  const ts = anchor('trackStart');
  for (let l = 0; l < 2; l++)
    add(nextKid(), KITS.academy, ts.x - 2 - l * 3, ts.z + l * 1.05, -Math.PI / 2, 'run', KID, {
      rarity: l ? 'common' : 'rare',
      path: (tt) => {
        const len = 13;
        const k = ((tt * 0.35 + l * 0.4) % 1) * len;
        return { x: ts.x - k, z: ts.z + l * 1.05, ry: -Math.PI / 2 };
      },
    });
  // kids arriving from the bus, walking past the office site
  add(nextKid(), casualKit(14), -2.4, 2.4, -1.2, 'walk', KID, {
    rarity: 'rare',
    path: (tt) => ({ x: 1.5 - ((tt * 0.8) % 7), z: 2.3, ry: -Math.PI / 2 }),
  });
  add(nextKid(), casualKit(15), -11.2, 4.6, Math.PI / 2, 'sit', KID, { rarity: 'common' });
  // outside bench: two more kids waiting
  const ob = anchor('outsideBench');
  add(nextKid(), casualKit(11), ob.x - 0.5, ob.z + 0.05, 0, 'sit', KID, { rarity: 'common' });
  add(nextKid(), casualKit(12), ob.x + 0.5, ob.z + 0.05, 0, 'sit', KID, { rarity: 'rare', label: () => '' });
  // plaza: ball boy carrying a stack, kid cheering, kid walking to the reception
  const ballBoy = add('male-b', KITS.staff, 0.4, -0.2, -2.0, 'carry', ADULT);
  add(nextKid(), KITS.academy, 6.8, 2.6, 0.4, 'cheer', KID, { rarity: 'wonderkid' });
  add(nextKid(), casualKit(9), 9.6, 1.4, 1.4, 'walk', KID, {
    rarity: 'common',
    path: (tt) => ({ x: 11 - ((tt * 0.9) % 8), z: 1.5 + Math.sin(tt) * 0.05, ry: -Math.PI / 2 }),
  });

  // rarity rings under trainees
  const ringGeo = new RingGeometry(0.34, 0.45, 32);
  ringGeo.rotateX(-Math.PI / 2);
  const ringed = actors.filter((a) => a.rarity);
  const rings = new InstancedMesh(ringGeo, new MeshBasicMaterial({ transparent: true, opacity: 0.95, depthWrite: false }), ringed.length);
  rings.renderOrder = 3;
  rings.frustumCulled = false;
  ringed.forEach((a, i) => rings.setColorAt(i, new Color(RARITY[a.rarity as Rarity])));
  scene.add(rings);

  // balls: ball boy stack, shooter's flying ball, a few loose balls
  const ballMat = new MeshLambertMaterial({ vertexColors: true });
  const balls: Object3D[] = [];
  const ballIm = new InstancedMesh(ballGeometry(), ballMat, 16);
  ballIm.castShadow = true;
  ballIm.frustumCulled = false;
  scene.add(ballIm);
  const mkBall = (x: number, y: number, z: number, s = 0.24): Object3D => {
    const m = new Object3D();
    m.scale.setScalar(s);
    m.position.set(x, y, z);
    balls.push(m);
    return m;
  };
  const stack: Object3D[] = [];
  for (let i = 0; i < 4; i++) stack.push(mkBall(0, 0, 0, 0.28));
  const shot = mkBall(ss.x, 0.12, ss.z - 0.3, 0.24);
  mkBall(pa.x + 0.1, 0.12, pa.z - 1.4);
  mkBall(-0.2, 0.12, 4.6);

  // cash piles
  const bill = new Batch();
  bill.at(G.rbox(0.25), 0x3ddc84, 0, 0, 0, 0, 0.72, 0.09, 0.4);
  bill.at(G.box(), 0xb9ffd6, 0, 0.047, 0, 0, 0.26, 0.004, 0.26);
  bill.at(G.box(), 0x23a862, 0, 0.047, 0, 0, 0.66, 0.003, 0.05);
  const billGeo = bill.geometry();
  const billMat = new MeshLambertMaterial({ vertexColors: true });
  const piles: Array<{ x: number; z: number; n: number; v: number }> = [
    { x: ss.x - 2.0, z: ss.z + 1.0, n: 10, v: 45 },
    { x: dsA.x - 1.6, z: dsA.z + 0.9, n: 6, v: 24 },
    { x: desk.x + 1.6, z: desk.z + 1.6, n: 14, v: 60 },
    { x: spawn.x + 3.6, z: spawn.z + 2.8, n: 8, v: 30 },
  ];
  const billIm = new InstancedMesh(billGeo, billMat, 64);
  billIm.castShadow = true;
  let bn = 0;
  const dummy = new Object3D();
  for (const p of piles)
    for (let i = 0; i < p.n; i++) {
      const layer = Math.floor(i / 4);
      const q = i % 4;
      dummy.position.set(p.x + (q % 2 ? 0.38 : -0.38), 0.05 + layer * 0.095, p.z + (q < 2 ? -0.22 : 0.22));
      dummy.rotation.set(0, ((i * 37) % 10) * 0.03 - 0.15, 0);
      dummy.updateMatrix();
      billIm.setMatrixAt(bn++, dummy.matrix);
    }
  billIm.count = bn;
  scene.add(billIm);

  // ── unlock pads with hologram ghosts
  const ghostMat = new MeshBasicMaterial({ color: 0x5ab4ff, transparent: true, opacity: 0.38, depthWrite: false, side: DoubleSide });
  const pads: Array<{ x: number; z: number; price: number; name: string; icon: string; ghost: Object3D; fill: number }> = [];
  const mkGhost = (build: (k: PropKit) => void): Group => {
    const b = new Batch();
    const k = new PropKit(b, new DecalBatch());
    build(k);
    const g = new Group();
    const m = b.build(ghostMat);
    m.renderOrder = 6;
    g.add(m);
    return g;
  };
  const addPad = (x: number, z: number, price: number, name: string, ic: string, fill: number, build: (k: PropKit) => void): void => {
    const pad = makePad(0x3ddc84, 0x1d2433, 0.42, 0.62);
    pad.position.set(x, 0.035, z);
    pad.material.uniforms.uProgress!.value = fill;
    pad.material.uniforms.uGlow!.value = 1;
    scene.add(pad);
    const ghost = mkGhost(build);
    ghost.position.set(x, 0.4, z);
    ghost.scale.setScalar(0.55);
    scene.add(ghost);
    pads.push({ x, z, price, name, icon: ic, ghost, fill });
  };
  addPad(-6.6, 0.15, 120, t('staff.ball_boy'), 'staff', 0.35, (k) => k.place(0, 0).ballCart());
  addPad(-9.5, 0.15, 75, t('obj.chairs'), 'bench', 0, (k) => k.place(0, 0).bench(2.2));

  // ── HUD + world UI
  const hud = new Hud(root);
  const icons = new IconRenderer(128);
  const coachIcon = new Character(assets, 'male-c', KITS.coach, 1);
  coachIcon.play('idle', 0);
  coachIcon.seek(0);
  hud.setPortrait(icons.render('coach', coachIcon.root, { yaw: 0.35, pitch: 0.15, zoom: 2.2, focusY: 0.78 }));
  const ballIcon = new Mesh(ballGeometry(), ballMat);
  const ballUrl = icons.render('ball', ballIcon, { yaw: 0.4, pitch: 0.4 });
  hud.setCash(1240, true);
  hud.setStars(9, 20);
  hud.setLevel(4, 0.62);
  hud.setObjective({ key: 'obj.bring_balls', icon: 'ball', x: 0, z: 0, targetId: 'x', radius: 1 }, ballUrl);
  const rig = new CameraRig();
  const projector = new Projector(rig.camera);
  const labels = new LabelLayer(root, projector);
  labels.root.style.zIndex = '1';
  hud.root.style.zIndex = '2';

  const resize = (): void => {
    const w = root.clientWidth;
    const h = root.clientHeight;
    renderer.setPixelRatio(Math.min(2, devicePixelRatio));
    renderer.setSize(w, h, false);
    rig.resize(w, h);
    projector.resize(w, h);
  };
  resize();
  window.addEventListener('resize', resize);
  const focus = { x: spawn.x + Number(params.get('fx') ?? 1.6), z: spawn.z + Number(params.get('fz') ?? -1.4) };
  rig.snap(focus.x, focus.z);
  sun.position.set(focus.x - 8, 20, focus.z + 10);
  sun.target.position.set(focus.x, 0, focus.z);
  sun.target.updateMatrixWorld();

  const timer = new Timer();
  let time = 0;
  const net = dio.nets[0];
  const netRest = net ? Float32Array.from((net.geometry.attributes.position as BufferAttribute).array as Float32Array) : null;
  const frame = (): void => {
    timer.update();
    const dt = Math.min(0.05, timer.getDelta());
    time += dt;
    for (const a of actors) {
      if (a.path) {
        const p = a.path(time);
        a.c.root.position.set(p.x, 0, p.z);
        a.c.root.rotation.y = p.ry;
      }
      if (a === shooter && !a.c.busy && Math.floor(time * 10) % 30 === 0) a.c.play('kick', 0.1);
      a.c.update(dt);
    }
    // ball boy stack (on the back)
    const bb = ballBoy.c.root;
    const fx = Math.sin(bb.rotation.y);
    const fz = Math.cos(bb.rotation.y);
    stack.forEach((m, i) => m.position.set(bb.position.x + fx * (0.42 + i * 0.015), 0.72 + i * 0.3 + Math.sin(time * 6 + i) * 0.012, bb.position.z + fz * (0.42 + i * 0.015)));
    // shot towards the goal + net ripple
    const g = anchor('goal');
    const k = (time * 0.6) % 1;
    shot.position.set(ss.x + (g.x - 0.9 - ss.x) * k, 0.15 + Math.sin(k * Math.PI) * 1.2, ss.z - 0.3 + (g.z - 0.6 - ss.z) * k);
    if (net && netRest) {
      const pos = net.geometry.attributes.position as BufferAttribute;
      const arr = pos.array as Float32Array;
      const amp = Math.max(0, 1 - ((time * 0.6) % 1) * 2) * 0.3;
      for (let i = 0; i < pos.count; i++) {
        const x = netRest[i * 3] as number;
        const y = netRest[i * 3 + 1] as number;
        const d = Math.hypot(x + 0.9, y + 0.2);
        arr[i * 3 + 2] = (netRest[i * 3 + 2] as number) - amp * Math.exp(-d) * Math.cos(time * 14 - d * 5);
      }
      pos.needsUpdate = true;
    }
    for (const p of pads) {
      p.ghost.position.y = 0.45 + Math.sin(time * 2.2) * 0.08;
      p.ghost.rotation.y = Math.sin(time * 0.8) * 0.3;
    }
    ringed.forEach((a, i) => {
      dummy.position.set(a.c.root.position.x, 0.035, a.c.root.position.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      rings.setMatrixAt(i, dummy.matrix);
    });
    rings.instanceMatrix.needsUpdate = true;
    balls.forEach((b, i) => {
      b.rotation.x = time * 3 + i;
      b.updateMatrix();
      ballIm.setMatrixAt(i, b.matrix);
    });
    ballIm.count = balls.length;
    ballIm.instanceMatrix.needsUpdate = true;
    rig.update(dt, focus.x, focus.z, 0, 0);
    // world UI
    labels.begin();
    for (const [i, a] of actors.entries()) {
      if (!a.rarity) continue;
      const p = a.c.root.position;
      const ovr = 40 + ((i * 17) % 35);
      const cls = 'r-' + a.rarity;
      if (a.label?.() === 'card') labels.place('a' + i, p.x, a.headY + 0.25, p.z, '', `<div class="card"><span class="nm">Leo</span><span class="pos">FW</span><span class="ovr ${cls}">${ovr}</span></div>`);
      else if (a.label?.() === 'need') labels.place('a' + i, p.x, a.headY + 0.3, p.z, '', `<div class="bubble need">${icon('ball')}<span class="emo">😟</span></div>`);
      else if (a.c.state === 'sit' && i % 2) labels.place('a' + i, p.x, a.headY + 0.1, p.z, '', `<div class="bubble">⏳<span class="emo">🙂</span></div>`);
      else labels.place('a' + i, p.x, a.headY + 0.1, p.z, '', `<span class="ovr ${cls}">${ovr}</span>`);
    }
    for (const [i, p] of pads.entries())
      labels.place('pad' + i, p.x, 0.05, p.z + 0.75, '', `<div class="pad2"><div class="pad2-price">${icon('cash')}<b>${formatCash(Math.ceil(p.price * (1 - p.fill)))}</b></div><div class="pad2-name">${icon(p.icon)}<i>${t('pad.unlock')}</i>${p.name}</div></div>`);
    labels.place('chipGoal', ss.x - 1.6, 1.15, ss.z - 0.2, '', `<div class="chip-supply">${icon('ball')}<b>3/8</b></div>`);
    labels.place('chipDribble', dsA.x + 1.4, 0.9, dsA.z + 0.2, '', `<div class="chip-supply low">${icon('ball')}<b>0/8</b></div>`);
    for (const [i, pl] of piles.entries()) labels.place('pile' + i, pl.x, 1.1 + Math.sin(time * 3 + i) * 0.08, pl.z, '', `<div class="floater">+${formatCash(pl.v)}</div>`);
    for (const gh of L.ghosts) {
      const s = anchor('ghostSign:' + gh.id);
      labels.place('gh' + gh.id, s.x, 2.2, s.z, '', `<div class="lock-sign">${icon('lock')}<span>${gh.label}</span><b>${formatCash(gh.price)}</b></div>`);
    }
    labels.end();
    renderer.render(scene, rig.camera);
    requestAnimationFrame(frame);
  };
  frame();
  void coach;
  window.__showcaseStats = { calls: renderer.info.render.calls, tris: renderer.info.render.triangles, characters: actors.length };
  window.setTimeout(() => {
    window.__showcaseStats = { calls: renderer.info.render.calls, tris: renderer.info.render.triangles, characters: actors.length };
    window.__showcaseReady = true;
  }, 600);
}

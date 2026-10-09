import { BufferGeometry, CanvasTexture, Float32BufferAttribute, Mesh, MeshLambertMaterial, PlaneGeometry, SRGBColorSpace, type Matrix4 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** One canvas atlas (4×2 cells of 256 px) for printed surfaces: scoreboard, tactics board, posters, banners. */
export type DecalId = 'scoreboard' | 'tactics' | 'posterA' | 'posterB' | 'posterC' | 'posterD' | 'banner' | 'shirt';
const ORDER: DecalId[] = ['scoreboard', 'tactics', 'posterA', 'posterB', 'posterC', 'posterD', 'banner', 'shirt'];
const CELL = 256;

let atlas: CanvasTexture | null = null;

function crest(g: CanvasRenderingContext2D, x: number, y: number, r: number, a: string, b: string, shape: number): void {
  g.save();
  g.translate(x, y);
  g.fillStyle = a;
  g.strokeStyle = '#1D2433';
  g.lineWidth = 6;
  g.beginPath();
  if (shape === 0) {
    g.moveTo(-r, -r);
    g.lineTo(r, -r);
    g.lineTo(r, r * 0.2);
    g.quadraticCurveTo(r * 0.6, r, 0, r * 1.2);
    g.quadraticCurveTo(-r * 0.6, r, -r, r * 0.2);
    g.closePath();
  } else if (shape === 1) g.arc(0, 0, r, 0, Math.PI * 2);
  else {
    for (let i = 0; i < 6; i++) {
      const t = (i / 6) * Math.PI * 2 - Math.PI / 2;
      g.lineTo(Math.cos(t) * r, Math.sin(t) * r);
    }
    g.closePath();
  }
  g.fill();
  g.stroke();
  g.fillStyle = b;
  g.beginPath();
  if (shape === 1) g.arc(0, 0, r * 0.5, 0, Math.PI * 2);
  else g.fillRect(-r * 0.25, -r * 0.8, r * 0.5, r * 1.6);
  g.fill();
  g.restore();
}

function draw(g: CanvasRenderingContext2D, id: DecalId): void {
  const S = CELL;
  const text = (t: string, x: number, y: number, size: number, color: string, stroke = '#1D2433'): void => {
    g.font = `900 ${size}px "WKDisplay", "Trebuchet MS", sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = Math.max(3, size / 7);
    g.strokeStyle = stroke;
    g.strokeText(t, x, y);
    g.fillStyle = color;
    g.fillText(t, x, y);
  };
  switch (id) {
    case 'scoreboard': {
      g.fillStyle = '#1B1830';
      g.fillRect(0, 0, S, S);
      g.fillStyle = '#2F6BFF';
      g.fillRect(0, 0, S, 46);
      text('HOME', 64, 23, 26, '#fff');
      text('GUEST', 192, 23, 26, '#fff');
      text('3', 64, 140, 120, '#FFC83D', '#7a4a00');
      text(':', 128, 135, 90, '#FFC83D', '#7a4a00');
      text('1', 192, 140, 120, '#FFC83D', '#7a4a00');
      g.fillStyle = '#3DDC84';
      g.fillRect(70, 220, 116, 20);
      break;
    }
    case 'tactics': {
      g.fillStyle = '#FFFFFF';
      g.fillRect(0, 0, S, S);
      g.strokeStyle = '#2E9E5B';
      g.lineWidth = 6;
      g.strokeRect(16, 16, S - 32, S - 32);
      g.beginPath();
      g.moveTo(S / 2, 16);
      g.lineTo(S / 2, S - 16);
      g.stroke();
      g.beginPath();
      g.arc(S / 2, S / 2, 34, 0, Math.PI * 2);
      g.stroke();
      g.lineWidth = 8;
      g.strokeStyle = '#2F6BFF';
      for (const [x, y] of [
        [70, 70],
        [70, 186],
        [110, 128],
      ]) {
        g.beginPath();
        g.moveTo((x as number) - 12, (y as number) - 12);
        g.lineTo((x as number) + 12, (y as number) + 12);
        g.moveTo((x as number) + 12, (y as number) - 12);
        g.lineTo((x as number) - 12, (y as number) + 12);
        g.stroke();
      }
      g.strokeStyle = '#E2583E';
      for (const [x, y] of [
        [180, 90],
        [190, 170],
      ]) {
        g.beginPath();
        g.arc(x as number, y as number, 13, 0, Math.PI * 2);
        g.stroke();
      }
      g.strokeStyle = '#1D2433';
      g.lineWidth = 5;
      g.setLineDash([10, 8]);
      g.beginPath();
      g.moveTo(112, 128);
      g.quadraticCurveTo(150, 60, 196, 120);
      g.stroke();
      g.setLineDash([]);
      break;
    }
    case 'posterA':
    case 'posterB':
    case 'posterC':
    case 'posterD': {
      const k = ['posterA', 'posterB', 'posterC', 'posterD'].indexOf(id);
      const bg = ['#E2583E', '#2F6BFF', '#2E9E5B', '#7C4DDB'][k] as string;
      const acc = ['#FFFFFF', '#FFD23F', '#FFFFFF', '#FFC83D'][k] as string;
      const name = [['RIVERSIDE', 'ROVERS'], ['NORTHGATE', 'FC'], ['HARBOUR', 'CITY'], ['MAPLE', 'ATHLETIC']][k] as string[];
      g.fillStyle = '#F5EFE3';
      g.fillRect(0, 0, S, S);
      g.fillStyle = bg;
      g.fillRect(14, 14, S - 28, S - 28);
      crest(g, S / 2, 100, 52, acc, bg, k % 3);
      text(name[0] as string, S / 2, 186, 30, '#fff');
      text(name[1] as string, S / 2, 218, 26, acc);
      break;
    }
    case 'banner': {
      g.fillStyle = '#2F6BFF';
      g.fillRect(0, 0, S, S);
      g.fillStyle = '#FFD23F';
      g.fillRect(0, S * 0.72, S, S * 0.12);
      g.fillStyle = '#FFFFFF';
      g.fillRect(0, S * 0.84, S, S * 0.05);
      // star
      g.fillStyle = '#FFC83D';
      g.strokeStyle = '#1D2433';
      g.lineWidth = 6;
      g.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? 26 : 58;
        const t = (i / 10) * Math.PI * 2 - Math.PI / 2;
        g.lineTo(S / 2 + Math.cos(t) * r, 92 + Math.sin(t) * r);
      }
      g.closePath();
      g.fill();
      g.stroke();
      text('WK', S / 2, 172, 46, '#fff');
      break;
    }
    case 'shirt': {
      g.clearRect(0, 0, S, S);
      g.fillStyle = '#2F6BFF';
      g.strokeStyle = '#1D2433';
      g.lineWidth = 6;
      g.beginPath();
      g.moveTo(70, 30);
      g.lineTo(100, 20);
      g.quadraticCurveTo(128, 46, 156, 20);
      g.lineTo(186, 30);
      g.lineTo(236, 80);
      g.lineTo(206, 110);
      g.lineTo(186, 92);
      g.lineTo(186, 236);
      g.lineTo(70, 236);
      g.lineTo(70, 92);
      g.lineTo(50, 110);
      g.lineTo(20, 80);
      g.closePath();
      g.fill();
      g.stroke();
      g.fillStyle = '#FFD23F';
      g.fillRect(70, 200, 116, 14);
      text('10', 128, 140, 70, '#FFFFFF');
      break;
    }
  }
}

export function decalAtlas(): CanvasTexture {
  if (atlas) return atlas;
  const c = document.createElement('canvas');
  c.width = CELL * 4;
  c.height = CELL * 2;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  ORDER.forEach((id, i) => {
    g.save();
    g.translate((i % 4) * CELL, Math.floor(i / 4) * CELL);
    g.beginPath();
    g.rect(0, 0, CELL, CELL);
    g.clip();
    draw(g, id);
    g.restore();
  });
  atlas = new CanvasTexture(c);
  atlas.colorSpace = SRGBColorSpace;
  atlas.anisotropy = 4;
  return atlas;
}

/** Collects decal quads (plane w×h facing +z in local space) and merges them into one mesh. */
export class DecalBatch {
  private readonly parts: BufferGeometry[] = [];
  add(id: DecalId, w: number, h: number, m: Matrix4): void {
    const i = ORDER.indexOf(id);
    const u0 = (i % 4) / 4;
    const v1 = 1 - Math.floor(i / 4) / 2;
    const g = new PlaneGeometry(w, h);
    const uv = g.attributes.uv as Float32BufferAttribute;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, u0 + uv.getX(k) / 4, v1 - 0.5 + uv.getY(k) / 2);
    g.applyMatrix4(m);
    this.parts.push(g);
  }
  build(): Mesh | null {
    if (!this.parts.length) return null;
    const mat = new MeshLambertMaterial({ map: decalAtlas(), transparent: true, alphaTest: 0.3 });
    const mesh = new Mesh(mergeGeometries(this.parts, false), mat);
    mesh.receiveShadow = true;
    return mesh;
  }
}

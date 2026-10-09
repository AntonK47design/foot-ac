import { PerspectiveCamera, Vector3 } from 'three';
import { BALANCE } from '../data/balance';

const FOV = 35;
const PITCH = (52 * Math.PI) / 180;

/**
 * Fixed 3/4 follow camera. Distance is derived from the aspect ratio so roughly the same
 * world area is visible in portrait and landscape (portrait shows more vertically).
 */
export class CameraRig {
  readonly camera: PerspectiveCamera;
  private readonly target = new Vector3();
  private readonly desired = new Vector3();
  private dist = 20;
  private view: number = BALANCE.camera.baseView;
  private shakeT = 0;
  private shakeAmp = 0;
  private pan: { x: number; z: number; t: number } | null = null;
  aspect = 16 / 9;

  constructor() {
    this.camera = new PerspectiveCamera(FOV, 16 / 9, 1, 260);
  }

  resize(w: number, h: number): void {
    this.aspect = w / Math.max(1, h);
    this.camera.aspect = this.aspect;
    this.camera.updateProjectionMatrix();
    this.updateDistance();
  }

  setView(v: number): void {
    this.view = Math.min(BALANCE.camera.maxView, v);
    this.updateDistance();
  }

  private updateDistance(): void {
    const tanH = Math.tan(((FOV / 2) * Math.PI) / 180);
    const a = this.aspect;
    // narrower world width in portrait so characters stay readable; more height instead
    const wk = Math.min(1, Math.max(0.6, 0.6 + (a - 0.5) * 0.5));
    const W = this.view * wk;
    const H = this.view * 0.7;
    const dW = W / (tanH * a);
    const dH = (H * Math.sin(PITCH)) / tanH;
    this.dist = Math.max(dW, dH);
  }

  snap(x: number, z: number): void {
    this.target.set(x, 0, z);
    this.apply(0);
  }

  /** Pans to a point for ~1 s (skippable by moving). */
  panTo(x: number, z: number): void {
    this.pan = { x, z, t: 1.1 };
  }

  cancelPan(): void {
    this.pan = null;
  }

  get panning(): boolean {
    return this.pan !== null;
  }

  shake(amount: number): void {
    this.shakeAmp = Math.max(this.shakeAmp, amount);
    this.shakeT = 0.3;
  }

  update(dt: number, fx: number, fz: number, vx: number, vz: number): void {
    let tx = fx + vx * 0.22;
    let tz = fz + vz * 0.22;
    let k = 1 - Math.exp(-dt * 6);
    if (this.pan) {
      this.pan.t -= dt;
      tx = this.pan.x;
      tz = this.pan.z;
      k = 1 - Math.exp(-dt * 4);
      if (this.pan.t <= 0) this.pan = null;
    }
    this.desired.set(tx, 0, tz);
    this.target.lerp(this.desired, k);
    this.apply(dt);
  }

  private apply(dt: number): void {
    const c = this.camera;
    const d = this.dist;
    let ox = 0;
    let oy = 0;
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const a = this.shakeAmp * Math.max(0, this.shakeT / 0.3);
      ox = (Math.random() - 0.5) * a;
      oy = (Math.random() - 0.5) * a;
      if (this.shakeT <= 0) this.shakeAmp = 0;
    }
    c.position.set(this.target.x + ox, d * Math.sin(PITCH) + oy, this.target.z + d * Math.cos(PITCH));
    c.lookAt(this.target.x + ox, oy, this.target.z);
    c.updateMatrixWorld();
  }

  get focus(): Vector3 {
    return this.target;
  }
}

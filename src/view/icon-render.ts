import { AmbientLight, Box3, SRGBColorSpace, DirectionalLight, OrthographicCamera, Scene, Vector3, WebGLRenderTarget, type Object3D, type WebGLRenderer } from 'three';

/**
 * Renders 3D models into small transparent icons (data URLs) using the main renderer,
 * so HUD / objective icons show the real objects (ART_BIBLE §8).
 */
export class IconRenderer {
  private readonly scene = new Scene();
  private readonly cam = new OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  private readonly rt: WebGLRenderTarget;
  private readonly cache = new Map<string, string>();
  constructor(
    private readonly renderer: WebGLRenderer,
    private readonly size = 128,
  ) {
    this.rt = new WebGLRenderTarget(size, size);
    this.rt.texture.colorSpace = SRGBColorSpace;
    this.scene.add(new AmbientLight(0xffffff, 1.6));
    const d = new DirectionalLight(0xffffff, 2.2);
    d.position.set(-2, 4, 3);
    this.scene.add(d);
  }

  /** `yaw`/`pitch` set the viewing angle; `zoom` > 1 crops tighter (e.g. portraits). */
  render(key: string, obj: Object3D, opts: { yaw?: number; pitch?: number; zoom?: number; focusY?: number } = {}): string {
    const hit = this.cache.get(key);
    if (hit) return hit;
    const holder = obj;
    this.scene.add(holder);
    holder.updateMatrixWorld(true);
    const box = new Box3().setFromObject(holder);
    const c = box.getCenter(new Vector3());
    if (opts.focusY !== undefined) c.y = box.min.y + (box.max.y - box.min.y) * opts.focusY;
    const r = box.getSize(new Vector3()).length() / 2 / (opts.zoom ?? 1);
    const yaw = opts.yaw ?? 0.6;
    const pitch = opts.pitch ?? 0.5;
    this.cam.left = -r;
    this.cam.right = r;
    this.cam.top = r;
    this.cam.bottom = -r;
    this.cam.position.set(c.x + Math.sin(yaw) * Math.cos(pitch) * 10, c.y + Math.sin(pitch) * 10, c.z + Math.cos(yaw) * Math.cos(pitch) * 10);
    this.cam.lookAt(c);
    this.cam.updateProjectionMatrix();
    const prevTarget = this.renderer.getRenderTarget();
    const prevClear = this.renderer.getClearAlpha();
    this.renderer.setRenderTarget(this.rt);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.clear();
    this.renderer.render(this.scene, this.cam);
    const px = new Uint8Array(this.size * this.size * 4);
    this.renderer.readRenderTargetPixels(this.rt, 0, 0, this.size, this.size, px);
    this.renderer.setRenderTarget(prevTarget);
    this.renderer.setClearAlpha(prevClear);
    this.scene.remove(holder);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = this.size;
    const g = canvas.getContext('2d') as CanvasRenderingContext2D;
    const img = g.createImageData(this.size, this.size);
    // flip Y (GL origin is bottom-left)
    for (let y = 0; y < this.size; y++) img.data.set(px.subarray((this.size - 1 - y) * this.size * 4, (this.size - y) * this.size * 4), y * this.size * 4);
    g.putImageData(img, 0, 0);
    const url = canvas.toDataURL('image/png');
    this.cache.set(key, url);
    return url;
  }
}

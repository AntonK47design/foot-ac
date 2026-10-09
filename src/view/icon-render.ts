import { AmbientLight, Box3, DirectionalLight, OrthographicCamera, SRGBColorSpace, Scene, Vector3, WebGLRenderer, type Object3D } from 'three';

/**
 * Renders 3D models into small transparent icons (data URLs) so HUD / objective icons show the real objects
 * (ART_BIBLE §8). Uses a short-lived offscreen renderer (no readPixels stall on the main context);
 * call dispose() once the icon atlas is built.
 */
export class IconRenderer {
  private readonly scene = new Scene();
  private readonly cam = new OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  private renderer: WebGLRenderer | null = null;
  private readonly cache = new Map<string, string>();

  constructor(private readonly size = 128) {
    this.scene.add(new AmbientLight(0xffffff, 1.6));
    const d = new DirectionalLight(0xffffff, 2.2);
    d.position.set(-2, 4, 3);
    this.scene.add(d);
  }

  private gl(): WebGLRenderer {
    if (!this.renderer) {
      const canvas = document.createElement('canvas');
      this.renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
      this.renderer.outputColorSpace = SRGBColorSpace;
      this.renderer.setPixelRatio(1);
      this.renderer.setSize(this.size, this.size, false);
      this.renderer.setClearColor(0x000000, 0);
    }
    return this.renderer;
  }

  get(key: string): string | undefined {
    return this.cache.get(key);
  }

  /** `yaw`/`pitch` set the viewing angle; `zoom` > 1 crops tighter (e.g. portraits). */
  render(key: string, obj: Object3D, opts: { yaw?: number; pitch?: number; zoom?: number; focusY?: number } = {}): string {
    const hit = this.cache.get(key);
    if (hit) return hit;
    const r0 = this.gl();
    this.scene.add(obj);
    obj.updateMatrixWorld(true);
    const box = new Box3().setFromObject(obj);
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
    r0.clear();
    r0.render(this.scene, this.cam);
    const url = r0.domElement.toDataURL('image/png');
    this.scene.remove(obj);
    this.cache.set(key, url);
    return url;
  }

  /** Frees the offscreen GL context; cached icons stay available. */
  dispose(): void {
    if (!this.renderer) return;
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer = null;
  }
}

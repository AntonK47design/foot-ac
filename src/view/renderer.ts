import {
  ACESFilmicToneMapping,
  DirectionalLight,
  Color,
  Fog,
  HemisphereLight,
  MeshLambertMaterial,
  PCFShadowMap,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
} from 'three';
import { TIERS, type Tier } from './quality';

/** Renderer, scene, lights and the shared vertex-colour material. */
export class RenderCore {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly sun: DirectionalLight;
  readonly hemi: HemisphereLight;
  /** Shared material for all merged static meshes (vertex colours). */
  readonly mat = new MeshLambertMaterial({ vertexColors: true });
  /** Humanoid parts use instance colours. */
  readonly charMat = new MeshLambertMaterial({ color: 0xffffff });
  tier: Tier;
  width = 1;
  height = 1;

  constructor(
    readonly canvas: HTMLCanvasElement,
    tier: Tier,
  ) {
    this.tier = tier;
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: TIERS[tier].antialias,
      powerPreference: 'high-performance',
      alpha: false,
      stencil: false,
      preserveDrawingBuffer: false,
    });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.type = PCFShadowMap;
    // ART_BIBLE: dark desaturated void around a bright plot; hemisphere ground tinted towards the void
    this.scene.background = new Color(0x241e33);
    this.scene.fog = new Fog(0x241e33, 60, 140);
    this.hemi = new HemisphereLight(0xeef4ff, 0x5a4c66, 1.45);
    this.scene.add(this.hemi);
    this.sun = new DirectionalLight(0xfff0d6, 2.4);
    this.sun.position.set(-10, 22, 12);
    this.sun.shadow.mapSize.set(1024, 1024);
    const sc = this.sun.shadow.camera;
    sc.left = -16;
    sc.right = 16;
    sc.top = 16;
    sc.bottom = -16;
    sc.near = 1;
    sc.far = 70;
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    this.applyTier(tier);
  }

  applyTier(tier: Tier): void {
    this.tier = tier;
    const spec = TIERS[tier];
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, spec.dprCap));
    this.renderer.shadowMap.enabled = spec.shadows;
    this.sun.castShadow = spec.shadows;
    this.sun.shadow.mapSize.set(spec.shadowMap, spec.shadowMap);
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null;
    this.renderer.setSize(this.width, this.height, false);
    // materials need a recompile when shadows toggle
    this.mat.needsUpdate = true;
    this.charMat.needsUpdate = true;
  }

  resize(w: number, h: number): void {
    this.width = Math.max(1, Math.floor(w));
    this.height = Math.max(1, Math.floor(h));
    this.renderer.setSize(this.width, this.height, false);
  }

  /** Keeps the shadow frustum centred on the action. */
  followSun(x: number, z: number): void {
    this.sun.position.set(x - 8, 20, z + 10);
    this.sun.target.position.set(x, 0, z);
    this.sun.target.updateMatrixWorld();
  }
}

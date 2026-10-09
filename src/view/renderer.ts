import {
  ACESFilmicToneMapping,
  DirectionalLight,
  Fog,
  HemisphereLight,
  MeshLambertMaterial,
  PCFShadowMap,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
} from 'three';
import { makeSkyTexture } from './builders/world';
import { PALETTE } from './palette';
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
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.type = PCFShadowMap;
    this.scene.background = makeSkyTexture();
    this.scene.fog = new Fog(PALETTE.skyBottom, 70, 200);
    this.hemi = new HemisphereLight(0xe8f6ff, 0x6fcf5a, 1.25);
    this.scene.add(this.hemi);
    this.sun = new DirectionalLight(0xfff2dc, 2.3);
    this.sun.position.set(-10, 22, 12);
    this.sun.shadow.mapSize.set(1024, 1024);
    const sc = this.sun.shadow.camera;
    sc.left = -22;
    sc.right = 22;
    sc.top = 22;
    sc.bottom = -22;
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
    this.sun.position.set(x - 10, 22, z + 12);
    this.sun.target.position.set(x, 0, z);
    this.sun.target.updateMatrixWorld();
  }
}

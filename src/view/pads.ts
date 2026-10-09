import { Color, Mesh, PlaneGeometry, ShaderMaterial } from 'three';

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAG = /* glsl */ `
varying vec2 vUv;
uniform float uProgress;
uniform vec3 uFill;
uniform vec3 uBase;
uniform float uTime;
uniform float uGlow;
uniform float uRound;
float sdRoundBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float d = sdRoundBox(p, vec2(0.92), uRound);
  if (d > 0.0) discard;
  float edge = smoothstep(-0.16, -0.11, d);
  float ang = atan(p.x, p.y) / 6.2831853 + 0.5;
  float filled = step(1.0 - ang, uProgress);
  vec3 col = mix(uBase, uFill, filled * 0.9);
  float dash = step(0.45, fract(atan(p.y, p.x) / 6.2831853 * 18.0 - uTime * 0.6));
  vec3 rim = mix(vec3(1.0), uFill, uGlow * (0.5 + 0.5 * sin(uTime * 6.0)));
  col = mix(col, rim, edge * (0.6 + 0.4 * dash));
  float a = mix(0.78, 1.0, max(edge, filled));
  gl_FragColor = vec4(col, a);
  #include <colorspace_fragment>
}`;

export interface PadMesh extends Mesh {
  material: ShaderMaterial;
}

const geo = new PlaneGeometry(2.2, 2.2);
geo.rotateX(-Math.PI / 2);

/** Ground pad with a radial fill (unlock pads, sign-up desk ring). */
export function makePad(fill: number, base: number, round = 0.38, size = 1): PadMesh {
  const mat = new ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uProgress: { value: 0 },
      uFill: { value: new Color(fill) },
      uBase: { value: new Color(base) },
      uTime: { value: 0 },
      uGlow: { value: 0 },
      uRound: { value: round },
    },
  });
  const m = new Mesh(geo, mat) as PadMesh;
  m.scale.setScalar(size);
  m.position.y = 0.03;
  m.renderOrder = 1;
  return m;
}

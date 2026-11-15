import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/** GTAO that also skips sprites and transparent meshes (smoke, decals, clouds). */
class GameGTAOPass extends GTAOPass {
  overrideVisibility() {
    super.overrideVisibility();
    this.scene.traverse((o) => {
      if (o.isSprite || (o.isMesh && o.material && o.material.transparent)) o.visible = false;
    });
  }
}

/** Color grade in linear HDR before tone mapping: split toning, saturation, vignette. */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    saturation: { value: 1.1 },
    vignette: { value: 0.32 },
    shadowTint: { value: new THREE.Vector3(0.94, 0.98, 1.06) },
    highlightTint: { value: new THREE.Vector3(1.05, 1.0, 0.94) },
    exposure: { value: 1.0 },
    contrast: { value: 1.12 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float saturation, vignette, exposure, contrast;
    uniform vec3 shadowTint, highlightTint;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 col = c.rgb * exposure;
      col = pow(max(col, 0.0) / 0.18, vec3(contrast)) * 0.18;
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, saturation);
      float t = smoothstep(0.05, 0.8, l);
      col *= mix(shadowTint, highlightTint, t);
      vec2 d = vUv - 0.5;
      float v = 1.0 - vignette * smoothstep(0.25, 0.85, dot(d, d) * 2.2);
      gl_FragColor = vec4(col * v, c.a);
    }`,
};

export const QUALITY = {
  low: { label: 'Bajo', pixelRatio: 1.0, shadowMap: 1024, softShadows: false, post: false, bloom: false, ao: false, msaa: 0 },
  medium: { label: 'Medio', pixelRatio: 1.25, shadowMap: 2048, softShadows: true, post: true, bloom: true, ao: false, msaa: 4 },
  high: { label: 'Alto', pixelRatio: 1.5, shadowMap: 4096, softShadows: true, post: true, bloom: true, ao: true, msaa: 4 },
};

/**
 * Post-processing chain: scene → (GTAO) → (bloom) → grade → tone mapping/sRGB.
 * The first-person weapon is drawn afterwards straight to the screen.
 */
export class PostFX {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.enabled = false;
    this.composer = null;
    this.preset = null;
  }

  configure(preset) {
    this.preset = preset;
    this.dispose();
    this.enabled = preset.post;
    if (!preset.post) return;
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: preset.msaa });
    this.composer = new EffectComposer(this.renderer, target);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    if (preset.ao) {
      this.ao = new GameGTAOPass(this.scene, this.camera, size.x, size.y);
      this.ao.updateGtaoMaterial({ radius: 1.8, distanceExponent: 1.3, thickness: 2.5, scale: 2.2, samples: 12, distanceFallOff: 1.0 });
      this.ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
      this.ao.blendIntensity = 1.0;
      this.composer.addPass(this.ao);
    }
    if (preset.bloom) {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.32, 0.45, 1.05);
      this.composer.addPass(this.bloom);
    }
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());
  }

  setSize(w, h) {
    if (!this.composer) return;
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
  }

  render(dt) {
    if (this.enabled && this.composer) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    if (this.composer) {
      for (const p of this.composer.passes) p.dispose?.();
      this.composer.renderTarget1.dispose();
      this.composer.renderTarget2.dispose();
    }
    this.composer = null; this.ao = null; this.bloom = null; this.grade = null;
  }
}

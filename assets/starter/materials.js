/**
 * Material and lighting helpers.
 *
 * The effects with the best quality-per-kilobyte ratio in web 3D, as working code.
 * Everything here is deliberately cheap: no post-processing passes, no extra
 * downloads, nothing that breaks the mobile frame budget.
 */

import * as THREE from 'three';

/**
 * Procedural environment map.
 *
 * An environment map is what makes a material read as a real material — without one,
 * metal looks like grey plastic. This generates a usable one from a gradient and two
 * emissive area lights, for zero bytes downloaded.
 *
 * Use a real HDRI when you need a specific studio look; use this as the default.
 */
export function createStudioEnvironment(renderer, options = {}) {
  return bakeStudio(renderer, buildStudioScene(options));
}

/**
 * The same environment, without the synchronous shader compile.
 *
 * The bake compiles the backdrop's programs the moment it first renders them, on the
 * main thread, inside one task — on a throttled phone that task alone sits around the
 * 50ms long-task budget. This compiles them first with compileAsync, which lets the
 * driver work in parallel (KHR_parallel_shader_compile) while the page stays responsive,
 * so the bake that follows only renders. Prefer it whenever init can be async.
 */
export async function createStudioEnvironmentAsync(renderer, options = {}) {
  const scene = buildStudioScene(options);

  // Compile for the state the bake renders in — into a render target, untonemapped —
  // or the programs won't match and the bake compiles its own anyway.
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
  const camera = new THREE.PerspectiveCamera(90, 1, 0.1, 100);
  const previousTarget = renderer.getRenderTarget();
  const previousToneMapping = renderer.toneMapping;
  renderer.setRenderTarget(target);
  renderer.toneMapping = THREE.NoToneMapping;
  const compiled = renderer.compileAsync(scene, camera);   // issues the compile synchronously
  renderer.setRenderTarget(previousTarget);
  renderer.toneMapping = previousToneMapping;
  await compiled;
  target.dispose();

  return bakeStudio(renderer, scene);
}

function buildStudioScene({
  top = '#2a2d34',
  bottom = '#08090b',
  keyColor = '#ffffff',
  keyIntensity = 3.2,
  fillColor = '#8fb3ff',
  fillIntensity = 0.9,
} = {}) {
  const scene = new THREE.Scene();

  // Gradient backdrop as an inverted sphere — becomes the ambient response.
  const gradient = new THREE.Mesh(
    new THREE.SphereGeometry(50, 32, 32),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {
        topColor: { value: new THREE.Color(top) },
        bottomColor: { value: new THREE.Color(bottom) },
      },
      vertexShader: `
        varying vec3 vWorldPos;
        void main() {
          vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        varying vec3 vWorldPos;
        void main() {
          float h = normalize(vWorldPos).y * 0.5 + 0.5;
          gl_FragColor = vec4(mix(bottomColor, topColor, smoothstep(0.0, 1.0, h)), 1.0);
        }`,
    })
  );
  scene.add(gradient);

  const softbox = (color, intensity, position, scale) => {
    const light = new THREE.Mesh(
      new THREE.PlaneGeometry(...scale),
      new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide })
    );
    light.material.color.multiplyScalar(intensity);
    light.position.set(...position);
    light.lookAt(0, 0, 0);
    return light;
  };

  scene.add(softbox(keyColor, keyIntensity, [-6, 8, 6], [12, 12]));
  scene.add(softbox(fillColor, fillIntensity, [8, 2, -4], [10, 8]));
  return scene;
}

function bakeStudio(renderer, scene) {
  // No compileEquirectangularShader() here: fromScene() never uses that shader, and
  // compiling it anyway adds a synchronous compile to a task that already sits close
  // to the 50ms long-task budget.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromScene(scene, 0.04);
  pmrem.dispose();

  // The source scene has served its purpose; free all of it, softboxes included.
  scene.traverse((obj) => {
    obj.geometry?.dispose();
    obj.material?.dispose();
  });

  return target.texture;
}

/**
 * Three-point light rig as data.
 *
 * Keeping the rig in one object rather than scattered through the scene graph means
 * art-direction changes are one edit instead of a scavenger hunt.
 */
export function createLightRig(scene, tier, {
  keyColor = '#fff6ec',
  keyIntensity = 2.4,
  fillColor = '#cddcff',
  fillIntensity = 0.55,
  rimColor = '#7fd4ff',
  rimIntensity = 1.6,
} = {}) {
  const key = new THREE.DirectionalLight(keyColor, keyIntensity);
  key.position.set(-4, 6, 4);

  if (tier.shadows) {
    key.castShadow = true;
    key.shadow.mapSize.setScalar(tier.shadowMapSize);
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 24;
    key.shadow.bias = -0.0008;      // stops shadow acne on curved surfaces
    key.shadow.normalBias = 0.02;
  }

  const fill = new THREE.DirectionalLight(fillColor, fillIntensity);
  fill.position.set(5, 1.5, 3);

  const rim = new THREE.DirectionalLight(rimColor, rimIntensity);
  rim.position.set(2, 3, -6);

  scene.add(key, fill, rim);

  return {
    key, fill, rim,
    dispose() { scene.remove(key, fill, rim); },
  };
}

/**
 * Fresnel rim, injected into any standard material.
 *
 * A bright edge where the surface turns away from the camera. Separates the subject
 * from the background better than any post-processing effect, for a few lines of
 * shader and no extra render pass.
 */
export function addFresnelRim(material, {
  color = '#7fd4ff',
  power = 2.6,
  intensity = 0.7,
} = {}) {
  const uniforms = {
    uRimColor: { value: new THREE.Color(color) },
    uRimPower: { value: power },
    uRimIntensity: { value: intensity },
  };

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `
        #include <common>
        varying vec3 vRimNormal;
        varying vec3 vRimViewDir;
      `)
      .replace('#include <fog_vertex>', `
        #include <fog_vertex>
        vRimNormal = normalize(normalMatrix * normal);
        vRimViewDir = normalize(-(modelViewMatrix * vec4(position, 1.0)).xyz);
      `);

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `
        #include <common>
        uniform vec3 uRimColor;
        uniform float uRimPower;
        uniform float uRimIntensity;
        varying vec3 vRimNormal;
        varying vec3 vRimViewDir;
      `)
      .replace('#include <dithering_fragment>', `
        #include <dithering_fragment>
        float rim = 1.0 - clamp(dot(normalize(vRimNormal), normalize(vRimViewDir)), 0.0, 1.0);
        rim = pow(rim, uRimPower) * uRimIntensity;
        gl_FragColor.rgb += uRimColor * rim;
      `);
  };

  // Force a recompile if the material was already in use.
  material.needsUpdate = true;
  return uniforms;
}

/**
 * Film grain overlay.
 *
 * Hides colour banding in gradients, unifies the image, and makes a render read as
 * photographed rather than computed. Costs one transparent full-screen quad.
 */
export function createGrainOverlay({ intensity = 0.045, scale = 1.4 } = {}) {
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    uniforms: {
      uTime: { value: 0 },
      uIntensity: { value: intensity },
      uScale: { value: scale },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }`,
    fragmentShader: `
      uniform float uTime;
      uniform float uIntensity;
      uniform float uScale;
      varying vec2 vUv;
      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }
      void main() {
        float n = hash(vUv * (800.0 * uScale) + fract(uTime) * 100.0);
        gl_FragColor = vec4(vec3(n - 0.5), uIntensity);
      }`,
  });

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 999;
  return mesh;
}

/**
 * Baked-feel contact shadow.
 *
 * A radial-gradient plane under the object. Not physically correct, but it does the
 * single most important job of a shadow — grounding the object — at a fraction of the
 * cost of a real shadow map. Use this on the low tier where shadows are disabled.
 */
export function createContactShadow({ size = 4, opacity = 0.55, softness = 0.55 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');

  const gradient = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  gradient.addColorStop(0, `rgba(0,0,0,${opacity})`);
  gradient.addColorStop(softness, `rgba(0,0,0,${opacity * 0.35})`);
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 256);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
    })
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.001;   // avoid z-fighting with a ground plane
  return mesh;
}

/**
 * Damped pointer tracking.
 *
 * Raw pointer values always feel cheap. Small ranges and heavy damping are most of
 * what separates a hero that feels considered from one that feels like a toy.
 * Returns null-safe values on touch devices, where hover doesn't exist.
 */
export function createPointerTracker({
  rangeX = 0.24,        // radians — about 14 degrees total
  rangeY = 0.14,
  damping = 0.045,
} = {}) {
  const target = { x: 0, y: 0 };
  const current = { x: 0, y: 0 };
  const isTouch = window.matchMedia('(pointer: coarse)').matches;

  const onMove = (e) => {
    target.x = (e.clientX / window.innerWidth - 0.5) * rangeX;
    target.y = (e.clientY / window.innerHeight - 0.5) * rangeY;
  };

  if (!isTouch) window.addEventListener('pointermove', onMove, { passive: true });

  return {
    isTouch,
    update(elapsed = 0) {
      if (isTouch) {
        // Autonomous drift instead — touch devices have no hover to track.
        target.x = Math.sin(elapsed * 0.28) * rangeX * 0.4;
        target.y = Math.cos(elapsed * 0.21) * rangeY * 0.4;
      }
      current.x += (target.x - current.x) * damping;
      current.y += (target.y - current.y) * damping;
      return current;
    },
    dispose() { window.removeEventListener('pointermove', onMove); },
  };
}

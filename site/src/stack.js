/**
 * The stack — five plates, one per layer of a 3D site, in the order the skill builds
 * them: content, poster, scene, interaction, polish.
 *
 * Every drawing on the plates is generated on a 2D canvas at load. Zero bytes of model
 * or texture are downloaded, which is how the whole scene stays inside the brand-hero
 * budget even though this page is a narrative site (references/asset-pipeline.md,
 * "procedural routes").
 *
 * The drawings are decorative. Everything they depict is written out in the DOM; the
 * canvas is aria-hidden.
 */

import * as THREE from 'three';

export const PLATE = { w: 3.2, d: 2.0, h: 0.045, r: 0.13 };
export const BASE_Y = 0.36;
export const GAP = 0.44;

const INK = 'rgba(200, 236, 255, ';        // hairline colour, alpha appended
const ACCENT = 'rgba(127, 212, 255, ';

// ---------------------------------------------------------------------------
// Etched drawings. Each plate shows what that layer actually is.
// ---------------------------------------------------------------------------

function frame(ctx, W, H, label, tag) {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = INK + '0.32)';
  ctx.lineWidth = 2;
  roundRect(ctx, 16, 16, W - 32, H - 32, 26);
  ctx.stroke();

  ctx.font = '500 21px "JetBrains Mono", ui-monospace, monospace';
  ctx.fillStyle = INK + '0.85)';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 52, 58);
  ctx.textAlign = 'right';
  ctx.fillStyle = INK + '0.45)';
  ctx.fillText(tag, W - 52, 58);
  ctx.textAlign = 'left';

  ctx.strokeStyle = INK + '0.16)';
  ctx.beginPath();
  ctx.moveTo(52, 90); ctx.lineTo(W - 52, 90);
  ctx.stroke();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function bar(ctx, x, y, w, h, a) {
  ctx.fillStyle = INK + a + ')';
  roundRect(ctx, x, y, w, h, Math.min(h / 2, 6));
  ctx.fill();
}

// Deterministic noise so the poster capture and the live scene match exactly.
function rng(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const DRAW = {
  // 01 — the page itself. Headings, copy, a call to action. Everything else sits on this.
  content(ctx, W, H) {
    frame(ctx, W, H, '01 · CONTENT', '<html>  works with JS off');
    bar(ctx, 52, 124, 46, 14, 0.7);
    for (let i = 0; i < 4; i++) bar(ctx, W - 320 + i * 70, 126, 48, 10, 0.4);
    bar(ctx, 52, 196, 500, 40, 0.92);
    bar(ctx, 52, 250, 360, 40, 0.92);
    const widths = [560, 530, 548, 470, 510];
    widths.forEach((w, i) => bar(ctx, 52, 322 + i * 28, w, 9, 0.38));
    ctx.fillStyle = ACCENT + '0.95)';
    roundRect(ctx, 52, 486, 176, 50, 25);
    ctx.fill();
    ctx.strokeStyle = INK + '0.3)';
    ctx.setLineDash([10, 8]);
    roundRect(ctx, 650, 190, 322, 250, 14);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = '400 18px "JetBrains Mono", ui-monospace, monospace';
    ctx.fillStyle = INK + '0.5)';
    ctx.fillText('<h1> <p> <a> <picture>', 668, 470);
    for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = INK + '0.22)';
      roundRect(ctx, 52 + i * 312, 566, 290, 30, 8);
      ctx.stroke();
    }
  },

  // 02 — the poster. The LCP element, and what everyone without WebGL sees.
  poster(ctx, W, H) {
    frame(ctx, W, H, '02 · POSTER', 'fetchpriority=high  LCP');
    const x = 52, y = 118, w = W - 104, h = H - 170;
    const g = ctx.createRadialGradient(x + w * 0.66, y + h * 0.5, 10, x + w * 0.66, y + h * 0.5, w * 0.55);
    g.addColorStop(0, ACCENT + '0.62)');
    g.addColorStop(0.45, ACCENT + '0.16)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    roundRect(ctx, x, y, w, h, 14);
    ctx.fill();
    ctx.strokeStyle = INK + '0.35)';
    ctx.stroke();
    // LCP corner brackets
    ctx.strokeStyle = ACCENT + '1)';
    ctx.lineWidth = 4;
    const c = 34;
    for (const [px, py, dx, dy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]]) {
      ctx.beginPath();
      ctx.moveTo(px + dx * c, py); ctx.lineTo(px, py); ctx.lineTo(px, py + dy * c);
      ctx.stroke();
    }
    ctx.lineWidth = 2;
    ctx.font = '500 19px "JetBrains Mono", ui-monospace, monospace';
    ctx.fillStyle = INK + '0.75)';
    ctx.fillText('poster.avif', x + 28, y + h - 34);
    ctx.fillStyle = INK + '0.45)';
    ctx.fillText('rendered from the scene, at build', x + 200, y + h - 34);
  },

  // 03 — the canvas. A mesh in perspective, marked decorative.
  scene(ctx, W, H) {
    frame(ctx, W, H, '03 · SCENE', '<canvas aria-hidden>  lazy');
    const cols = 26, rows = 13;
    const pt = (i, j) => {
      const z = j / (rows - 1);                   // 0 far, 1 near
      const persp = 0.42 + z * 0.78;
      const u = (i / (cols - 1) - 0.5) * 1.5;
      const hgt = Math.sin(i * 0.55 + j * 0.35) * Math.cos(j * 0.42 - i * 0.18) * 34;
      return [W / 2 + u * W * 0.62 * persp, 150 + z * 380 - hgt * persp];
    };
    for (let j = 0; j < rows; j++) {
      ctx.strokeStyle = INK + (0.12 + (j / rows) * 0.5).toFixed(2) + ')';
      ctx.beginPath();
      for (let i = 0; i < cols; i++) {
        const [px, py] = pt(i, j);
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.stroke();
    }
    for (let i = 0; i < cols; i++) {
      ctx.strokeStyle = INK + '0.22)';
      ctx.beginPath();
      for (let j = 0; j < rows; j++) {
        const [px, py] = pt(i, j);
        j ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.stroke();
    }
  },

  // 04 — interaction. A damped response curve and a pointer.
  interaction(ctx, W, H) {
    frame(ctx, W, H, '04 · INTERACTION', 'damped · ±14°  no free orbit');
    const gx = 70, gy = 150, gw = 470, gh = 380;
    ctx.strokeStyle = INK + '0.3)';
    ctx.beginPath();
    ctx.moveTo(gx, gy); ctx.lineTo(gx, gy + gh); ctx.lineTo(gx + gw, gy + gh);
    ctx.stroke();
    ctx.strokeStyle = INK + '0.18)';
    ctx.setLineDash([6, 8]);
    ctx.beginPath();
    ctx.moveTo(gx, gy + 20); ctx.lineTo(gx + gw, gy + 20);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = ACCENT + '1)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    for (let i = 0; i <= 80; i++) {
      const t = i / 80;
      const v = 1 - Math.pow(1 - 0.045, t * 110);   // what createPointerTracker's lerp does
      const px = gx + t * gw, py = gy + gh - v * (gh - 20);
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.stroke();
    ctx.lineWidth = 2;
    // Pointer
    const cx = 760, cy = 300;
    for (let r = 1; r <= 4; r++) {
      ctx.strokeStyle = INK + (0.42 - r * 0.08).toFixed(2) + ')';
      ctx.beginPath();
      ctx.arc(cx, cy, r * 46, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = INK + '0.95)';
    ctx.beginPath();
    ctx.moveTo(cx, cy); ctx.lineTo(cx, cy + 62); ctx.lineTo(cx + 16, cy + 48);
    ctx.lineTo(cx + 28, cy + 74); ctx.lineTo(cx + 38, cy + 69); ctx.lineTo(cx + 26, cy + 44);
    ctx.lineTo(cx + 46, cy + 44);
    ctx.closePath();
    ctx.fill();
  },

  // 05 — polish, last and first to go. Grain, a rim, a highlight.
  polish(ctx, W, H) {
    frame(ctx, W, H, '05 · POLISH', 'first thing cut  if over budget');
    const rand = rng(7);
    for (let i = 0; i < 2600; i++) {
      const a = rand() * 0.5;
      ctx.fillStyle = INK + a.toFixed(2) + ')';
      ctx.fillRect(52 + rand() * (W - 104), 110 + rand() * (H - 140), 2, 2);
    }
    const cx = W * 0.62, cy = H * 0.55;
    const g = ctx.createRadialGradient(cx, cy, 60, cx, cy, 190);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.82, ACCENT + '0.0)');
    g.addColorStop(0.93, ACCENT + '0.85)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, 190, 0, Math.PI * 2);
    ctx.fill();
    for (const [sx, sy, sz] of [[210, 230, 26], [330, 460, 16], [880, 170, 20]]) {
      ctx.fillStyle = INK + '0.9)';
      ctx.beginPath();
      ctx.moveTo(sx, sy - sz); ctx.quadraticCurveTo(sx, sy, sx + sz, sy);
      ctx.quadraticCurveTo(sx, sy, sx, sy + sz); ctx.quadraticCurveTo(sx, sy, sx - sz, sy);
      ctx.quadraticCurveTo(sx, sy, sx, sy - sz);
      ctx.fill();
    }
  },
};

export const LAYERS = ['content', 'poster', 'scene', 'interaction', 'polish'];

/** Plate drawing resolution per tier. */
export const textureSize = (tier) => (tier.name === 'high' ? 1024 : tier.name === 'medium' ? 768 : 512);

export function makeTexture(name, tier) {
  const size = textureSize(tier);
  const anisotropy = tier.name === 'low' ? 1 : 4;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = Math.round(size * PLATE.d / PLATE.w);
  const ctx = canvas.getContext('2d');
  // Draw in a fixed 1024-wide coordinate space and let the tier pick the resolution.
  ctx.scale(size / 1024, size / 1024);
  DRAW[name](ctx, 1024, 640);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;
  return tex;
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

function roundedRectShape(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

function plateGeometry() {
  const shape = roundedRectShape(PLATE.w, PLATE.d, PLATE.r);
  const bevel = 0.012;
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: PLATE.h - bevel * 2,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 3,
    curveSegments: 8,
  });

  // ExtrudeGeometry gives cap UVs in shape units. Normalise the caps (group 0) to 0..1
  // so the etched drawing maps edge to edge.
  const uv = geo.attributes.uv;
  const caps = geo.groups.find((g) => g.materialIndex === 0);
  for (let i = caps.start; i < caps.start + caps.count; i++) {
    uv.setXY(i, (uv.getX(i) + PLATE.w / 2) / PLATE.w, (uv.getY(i) + PLATE.d / 2) / PLATE.d);
  }

  geo.translate(0, 0, -(PLATE.h - bevel * 2) / 2);
  geo.rotateX(-Math.PI / 2);           // lie flat, drawing facing up, top edge away from camera
  return { geo, shape };
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

export function createStack({ rim, maps }) {
  const group = new THREE.Group();
  const { geo, shape } = plateGeometry();

  // One outline shared by every plate: a single hairline around the top face.
  const outlinePts = shape.getPoints(10).map((p) => new THREE.Vector3(p.x, PLATE.h / 2 + 0.002, -p.y));
  const outlineGeo = new THREE.BufferGeometry().setFromPoints(outlinePts);

  // Side material is shared — one program, one set of uniforms for all five plates.
  const sideMaterial = new THREE.MeshStandardMaterial({
    color: 0x1b2029,
    metalness: 0.92,
    roughness: 0.3,
    envMapIntensity: 1.7,
    transparent: true,
  });
  rim(sideMaterial, { color: '#7fd4ff', power: 2.2, intensity: 0.55 });

  const plates = LAYERS.map((name, i) => {
    const map = maps[i];
    const cap = new THREE.MeshPhysicalMaterial({
      color: 0x0a0d12,
      metalness: 0.15,
      roughness: 0.24,
      clearcoat: 1,
      clearcoatRoughness: 0.1,
      emissive: 0xffffff,
      emissiveMap: map,
      emissiveIntensity: 0.6,
      envMapIntensity: 1.1,
      transparent: true,
    });
    // Per-plate side material so fades stay independent; clones share the compiled program.
    const side = sideMaterial.clone();
    side.onBeforeCompile = sideMaterial.onBeforeCompile;
    const mesh = new THREE.Mesh(geo, [cap, side]);
    mesh.renderOrder = i;

    const outline = new THREE.LineLoop(outlineGeo, new THREE.LineBasicMaterial({
      color: 0x7fd4ff, transparent: true, opacity: 0.5, depthWrite: false,
    }));
    mesh.add(outline);
    group.add(mesh);
    return { mesh, cap, side, outline, map };
  });

  // Leader lines — the vertical hairlines of an exploded axonometric drawing, one at
  // each corner, running the height of the stack.
  const inset = 0.05;
  const cx = PLATE.w / 2 - inset, cz = PLATE.d / 2 - inset;
  const corners = [[-cx, -cz], [cx, -cz], [cx, cz], [-cx, cz]];
  const leaderGeo = new THREE.BufferGeometry().setFromPoints(
    corners.flatMap(([x, z]) => [new THREE.Vector3(x, 0, z), new THREE.Vector3(x, 1, z)])
  );
  const leaders = new THREE.LineSegments(leaderGeo, new THREE.LineDashedMaterial({
    color: 0x9fb8c8, transparent: true, opacity: 0.28, dashSize: 0.05, gapSize: 0.05, scale: 1,
  }));
  leaders.computeLineDistances();
  group.add(leaders);

  // Dimension line for the budgets phase: a measured drawing, off to the side.
  const dimX = PLATE.w / 2 + 0.42;
  const dimPts = [];
  const tick = 0.09;
  dimPts.push(new THREE.Vector3(dimX, 0, 0), new THREE.Vector3(dimX, 1, 0));
  const dimGeo = new THREE.BufferGeometry().setFromPoints(dimPts);
  const dims = new THREE.LineSegments(dimGeo, new THREE.LineBasicMaterial({
    color: 0x7fd4ff, transparent: true, opacity: 0, depthWrite: false,
  }));
  group.add(dims);
  // Ticks, one per plate, repositioned every frame with the plates.
  const tickGeo = new THREE.BufferGeometry();
  tickGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(LAYERS.length * 2 * 3), 3));
  const ticks = new THREE.LineSegments(tickGeo, dims.material);
  group.add(ticks);

  return {
    group,
    plates,
    /** Position everything from an interpolated station state. No allocation. */
    apply(state, t) {
      let top = BASE_Y;
      for (let i = 0; i < plates.length; i++) {
        const p = plates[i];
        const show = state.show[i];
        const y = BASE_Y + i * GAP * state.spread + state.lift[i] + Math.sin(t * 0.6 + i * 0.9) * 0.012 * state.spread;
        p.mesh.position.y = y;
        p.mesh.visible = show > 0.01;
        p.cap.opacity = show * 0.94;
        p.side.opacity = show;
        p.outline.material.opacity = show * (0.28 + state.glow[i] * 0.35);
        p.cap.emissiveIntensity = state.glow[i];
        if (show > 0.5) top = Math.max(top, y);

        const a = ticks.geometry.attributes.position.array;
        const o = i * 6;
        a[o] = dimX - tick; a[o + 1] = y; a[o + 2] = 0;
        a[o + 3] = dimX + tick; a[o + 4] = y; a[o + 5] = 0;
      }
      ticks.geometry.attributes.position.needsUpdate = true;

      leaders.position.y = BASE_Y;
      leaders.scale.y = Math.max(0.001, top - BASE_Y);
      leaders.material.opacity = 0.3 * Math.min(1, state.spread * 1.6);
      leaders.visible = state.spread > 0.02;

      dims.position.y = BASE_Y;
      dims.scale.y = Math.max(0.001, top - BASE_Y);
      dims.material.opacity = state.dims * 0.85;
      dims.visible = ticks.visible = state.dims > 0.01;

      group.rotation.y = state.yaw;
    },
    dispose() {
      for (const p of plates) p.map.dispose();
      sideMaterial.dispose();
    },
  };
}

// ---------------------------------------------------------------------------
// Ground — a hairline grid that fades out, the 3D cousin of the page's rules.
// ---------------------------------------------------------------------------

export function createGround() {
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uFade: { value: 1 } },
    vertexShader: `
      varying vec2 vPos;
      void main() {
        vPos = position.xy;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform float uFade;
      varying vec2 vPos;
      float grid(vec2 p, float size) {
        vec2 g = abs(fract(p / size - 0.5) - 0.5) / fwidth(p / size);
        return 1.0 - min(min(g.x, g.y), 1.0);
      }
      void main() {
        float d = length(vPos);
        float fade = (1.0 - smoothstep(2.5, 13.0, d)) * uFade;
        float fine = grid(vPos, 0.5) * 0.07;
        float major = grid(vPos, 2.0) * 0.13;
        vec3 col = mix(vec3(0.78, 0.86, 0.92), vec3(0.5, 0.83, 1.0), major / 0.2);
        gl_FragColor = vec4(col, (fine + major) * fade);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(34, 34), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = -1;
  return mesh;
}

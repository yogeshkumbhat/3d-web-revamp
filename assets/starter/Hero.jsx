/**
 * Reference hero scene — React Three Fiber.
 *
 * The same patterns as scene-vanilla.js, expressed for a React codebase. The modules
 * this imports (quality, mount, materials, lifecycle) are framework-agnostic on
 * purpose, so the rules live in one place rather than being reimplemented per stack.
 *
 * Usage:
 *   <Hero />   — renders the poster, then mounts the canvas over it when worthwhile
 *
 * Install: npm i three @react-three/fiber @react-three/drei
 */

import { useEffect, useMemo, useRef, useState, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

import { detectTier, tierOverride, TIERS, createTierProbe } from './quality.js';
import { prefersReducedMotion, supportsWebGL } from './mount.js';
import {
  createStudioEnvironment,
  addFresnelRim,
  createContactShadow,
  createPointerTracker,
} from './materials.js';

/**
 * Decides whether the canvas mounts at all. Same gate as the vanilla path: WebGL,
 * reduced motion, device tier, and proximity to the viewport.
 */
function useSceneGate(containerRef) {
  const [state, setState] = useState({ mount: false, tier: null, reason: 'pending' });

  useEffect(() => {
    if (!supportsWebGL()) return setState({ mount: false, tier: null, reason: 'no-webgl' });
    if (prefersReducedMotion()) return setState({ mount: false, tier: null, reason: 'reduced-motion' });

    const tier = tierOverride() ?? detectTier();
    if (tier === TIERS.floor) return setState({ mount: false, tier: null, reason: 'floor-tier' });

    const el = containerRef.current;
    if (!el) return;

    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        io.disconnect();
        setState({ mount: true, tier, reason: 'mounted' });
      }
    }, { rootMargin: '200px' });

    io.observe(el);

    // People toggle reduced motion mid-session. Honour it immediately.
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (e) => {
      if (e.matches) setState({ mount: false, tier: null, reason: 'reduced-motion' });
    };
    mq.addEventListener('change', onChange);

    return () => { io.disconnect(); mq.removeEventListener('change', onChange); };
  }, [containerRef]);

  return state;
}

/**
 * Environment, generated once per renderer rather than downloaded. Disposed on
 * unmount — R3F cleans up the scene graph, not resources you created imperatively.
 */
function StudioEnvironment() {
  const { gl, scene } = useThree();

  useEffect(() => {
    const texture = createStudioEnvironment(gl, {
      top: '#3a3f4a', bottom: '#0a0b0e', keyIntensity: 4.4, fillIntensity: 1.3,
    });
    scene.environment = texture;
    return () => { scene.environment = null; texture.dispose(); };
  }, [gl, scene]);

  return null;
}

function Subject({ tier }) {
  const meshRef = useRef();
  const { camera, size } = useThree();
  const pointer = useMemo(() => createPointerTracker(), []);

  const material = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      color: 0x2b2d33, roughness: 0.28, metalness: 0.9, envMapIntensity: 2.1,
    });
    addFresnelRim(m, { color: '#7fd4ff', power: 2.8, intensity: 0.6 });
    return m;
  }, []);

  // Narrow viewports have no room for a side-by-side composition.
  const narrow = size.width < 720;
  const subjectX = narrow ? 0 : 0.95;
  const lookAt = useMemo(
    () => new THREE.Vector3(narrow ? 0 : 0.62, narrow ? 1.25 : 1.0, 0),
    [narrow]
  );

  useEffect(() => () => {
    material.dispose();
    pointer.dispose();
  }, [material, pointer]);

  useFrame((state, delta) => {
    const p = pointer.update(state.clock.elapsedTime);
    const mesh = meshRef.current;
    if (!mesh) return;

    mesh.rotation.y += delta * 0.16;
    mesh.rotation.x = p.y * 1.4;

    camera.position.x = (narrow ? 0 : -1.15) + p.x * 1.5;
    camera.position.y = 1.15 - p.y * 0.45;
    camera.lookAt(lookAt);
  });

  return (
    <mesh ref={meshRef} position={[subjectX, 1.12, 0]} castShadow={tier.shadows} material={material}>
      <torusKnotGeometry args={[0.72, 0.24, 180, 32]} />
    </mesh>
  );
}

function Ground({ tier, x }) {
  const contact = useMemo(
    () => (tier.shadows ? null : createContactShadow({ size: 3.4, opacity: 0.5 })),
    [tier.shadows]
  );

  useEffect(() => () => {
    contact?.geometry.dispose();
    contact?.material.map?.dispose();
    contact?.material.dispose();
  }, [contact]);

  if (contact) {
    contact.position.x = x;
    return <primitive object={contact} />;
  }

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[30, 30]} />
      <shadowMaterial opacity={0.42} />
    </mesh>
  );
}

/**
 * Watches real frame time and steps the tier down when the initial guess was
 * optimistic. Static detection is a starting point; this is the arbiter.
 */
function TierProbe({ tier, onDowngrade }) {
  const { gl } = useThree();
  const probe = useMemo(
    () => createTierProbe(tier, (next, p95) => {
      gl.setPixelRatio(Math.min(window.devicePixelRatio, next.dpr ?? 1));
      gl.shadowMap.enabled = !!next.shadows;
      onDowngrade(next, p95);
    }),
    [tier, gl, onDowngrade]
  );

  useFrame((_, delta) => probe.tick(delta * 1000));
  useEffect(() => () => probe.stop(), [probe]);
  return null;
}

export default function Hero({
  headline = 'Everything meaningful lives in the DOM.',
  lede = 'The scene is an enhancement over a page that already works.',
  cta = { label: 'See how it holds up', href: '#work' },
  poster = { avif: '/poster.avif', webp: '/poster.webp', jpg: '/poster.jpg' },
}) {
  const containerRef = useRef(null);
  const { mount, tier, reason } = useSceneGate(containerRef);
  const [activeTier, setActiveTier] = useState(null);
  const [firstFrame, setFirstFrame] = useState(false);

  useEffect(() => { if (tier) setActiveTier(tier); }, [tier]);
  const current = activeTier ?? tier ?? TIERS.medium;

  return (
    <section className="hero" style={{ position: 'relative', minHeight: '100svh', background: '#08090b' }}>
      <div ref={containerRef} className="scene-container" style={{ position: 'absolute', inset: 0 }}>
        {/* LCP element. Stays mounted so context loss has somewhere to fall back to. */}
        <picture
          data-poster
          style={{
            position: 'absolute', inset: 0,
            opacity: firstFrame ? 0 : 1,
            transition: 'opacity 700ms ease',
          }}
        >
          <source srcSet={poster.avif} type="image/avif" />
          <source srcSet={poster.webp} type="image/webp" />
          <img src={poster.jpg} alt="" width={1600} height={900} fetchpriority="high"
               style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </picture>

        {mount && (
          <Canvas
            aria-hidden="true"
            style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
            dpr={[1, current.dpr]}
            gl={{ antialias: current.antialias, alpha: true, powerPreference: 'high-performance' }}
            shadows={current.shadows}
            camera={{ fov: 35, position: [-1.15, 1.15, 5.0], near: 0.1, far: 100 }}
            onCreated={({ gl }) => {
              gl.outputColorSpace = THREE.SRGBColorSpace;
              gl.toneMapping = THREE.ACESFilmicToneMapping;
              gl.toneMappingExposure = 1.05;
              // Reveal only after something has actually been drawn.
              requestAnimationFrame(() => requestAnimationFrame(() => setFirstFrame(true)));
            }}
          >
            <fogExp2 attach="fog" args={[0x08090b, 0.055]} />
            <StudioEnvironment />

            <directionalLight
              position={[-4, 6, 4]} intensity={2.4} color="#fff6ec"
              castShadow={current.shadows}
              shadow-mapSize={[current.shadowMapSize || 1024, current.shadowMapSize || 1024]}
              shadow-bias={-0.0008} shadow-normalBias={0.02}
            />
            <directionalLight position={[5, 1.5, 3]} intensity={0.55} color="#cddcff" />
            <directionalLight position={[2, 3, -6]} intensity={1.6} color="#7fd4ff" />

            <Suspense fallback={null}>
              <Subject tier={current} />
              <Ground tier={current} x={0.95} />
            </Suspense>

            <TierProbe tier={current} onDowngrade={setActiveTier} />
          </Canvas>
        )}
      </div>

      {/* Content is real DOM and does not depend on the canvas existing. */}
      <div className="hero-content" style={{ position: 'relative', zIndex: 1 }}>
        <h1>{headline}</h1>
        <p className="lede">{lede}</p>
        <a className="cta" href={cta.href}>{cta.label}</a>
      </div>

      {process.env.NODE_ENV !== 'production' && (
        <span hidden data-scene-state={reason} data-scene-tier={current?.name} />
      )}
    </section>
  );
}

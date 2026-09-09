/**
 * Device tiering.
 *
 * Static capability detection is frequently wrong — a flagship phone reports the
 * same deviceMemory as a mid-range one, and a laptop on integrated graphics looks
 * like a desktop. So detect a starting tier from signals, then verify it against
 * measured frame time and step down if reality disagrees.
 *
 * Never step back up. Oscillating quality is more noticeable than low quality.
 */

export const TIERS = {
  high: {
    name: 'high',
    dpr: 2,
    shadows: true,
    shadowMapSize: 2048,
    environment: 'hdr-2k',
    postprocessing: true,
    antialias: true,
    particles: 40000,
  },
  medium: {
    name: 'medium',
    dpr: 1.5,
    shadows: true,
    shadowMapSize: 1024,
    environment: 'hdr-1k',
    postprocessing: false,
    antialias: true,
    particles: 12000,
  },
  low: {
    name: 'low',
    dpr: 1,
    shadows: false,
    shadowMapSize: 0,
    environment: 'gradient',
    postprocessing: false,
    antialias: false,
    particles: 3000,
  },
  // Not a render tier — the signal to show the static path instead.
  floor: { name: 'floor' },
};

const ORDER = ['high', 'medium', 'low', 'floor'];

/**
 * QA override. `?tier=high` forces a tier so the scene can be tested on hardware that
 * would normally take the static path — including CI and headless browsers. Never
 * reachable without the query parameter, so it can't affect real users.
 */
export function tierOverride() {
  if (typeof location === 'undefined') return null;
  const requested = new URLSearchParams(location.search).get('tier');
  return requested && TIERS[requested] ? TIERS[requested] : null;
}

/**
 * Detect a software (CPU) renderer.
 *
 * SwiftShader, llvmpipe and Mesa's software paths report a WebGL context that works
 * but renders on the CPU at single-digit frame rates. This is the case that genuinely
 * should take the static path, and it's invisible to memory and core-count checks.
 */
export function isSoftwareRenderer() {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return true;

    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (!ext) return false;                    // can't tell — let the frame probe decide

    const renderer = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '');
    return /swiftshader|llvmpipe|software|basic render|microsoft basic/i.test(renderer);
  } catch {
    return true;
  }
}

/**
 * Best guess before anything has rendered.
 *
 * Deliberately conservative about what it claims to know. `navigator.deviceMemory` is
 * Chromium-only — Safari and Firefox return undefined — so treating a missing value as
 * "low" would permanently lock a third of desktop users out of the high tier. Missing
 * signals mean *unknown*, not *bad*, and the frame probe is the real arbiter.
 */
export function detectTier() {
  if (typeof navigator === 'undefined') return TIERS.floor;

  const forced = tierOverride();
  if (forced) return forced;

  // Explicit user preference beats every capability signal.
  const saveData = navigator.connection?.saveData ?? false;
  const slowNet = /^(slow-)?2g$/.test(navigator.connection?.effectiveType ?? '');
  if (saveData || slowNet) return TIERS.floor;

  // A CPU renderer cannot do this at any tier.
  if (isSoftwareRenderer()) return TIERS.floor;

  const mem = navigator.deviceMemory;            // undefined outside Chromium
  const cores = navigator.hardwareConcurrency;   // undefined on very old browsers
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;

  // Only floor on hardware signals when they're actually present and genuinely low.
  // A single-core report usually means a VM or a locked-down browser, not a phone.
  if (mem !== undefined && mem <= 2) return TIERS.floor;
  if (cores !== undefined && cores <= 2 && coarse) return TIERS.floor;

  if (coarse) {
    // Touch device. Assume mid unless memory says otherwise.
    if (mem !== undefined && mem <= 4) return TIERS.low;
    return TIERS.medium;
  }

  // Desktop. Start high when signals are strong or absent; the probe will correct us
  // within two seconds if that was optimistic, which costs far less than the reverse.
  const strong = (mem === undefined || mem >= 8) && (cores === undefined || cores >= 8);
  return strong ? TIERS.high : TIERS.medium;
}

/**
 * Watch real frame time and step the tier down when the guess was optimistic.
 *
 * Ignores the first `warmupFrames` because shader compilation, texture upload and
 * layout all land in the opening frames and would trigger a false downgrade.
 *
 * @param {(tier: object) => void} onDowngrade  called with the new tier
 * @returns {{ tick: (dt:number) => void, stop: () => void, p95: () => number }}
 */
export function createTierProbe(startTier, onDowngrade, {
  warmupFrames = 60,
  sampleSize = 120,
  budgetMs = 22,
  maxDowngrades = 2,
} = {}) {
  let tier = startTier;
  let frames = 0;
  let downgrades = 0;
  let stopped = false;
  const samples = [];

  const percentile = (arr, p) => {
    if (!arr.length) return 0;
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.floor(s.length * p))];
  };

  return {
    tick(deltaMs) {
      if (stopped) return;
      if (++frames <= warmupFrames) return;

      samples.push(deltaMs);
      if (samples.length < sampleSize) return;

      const p95 = percentile(samples, 0.95);
      samples.length = 0;

      if (p95 <= budgetMs) return;

      const next = ORDER[Math.min(ORDER.indexOf(tier.name) + 1, ORDER.length - 1)];
      tier = TIERS[next];
      onDowngrade(tier, p95);

      if (++downgrades >= maxDowngrades || next === 'floor') stopped = true;
    },
    stop() { stopped = true; },
    p95: () => percentile(samples, 0.95),
  };
}

/**
 * The mount gate.
 *
 * The 3D layer is an enhancement over a page that already works. This module is the
 * single place that decides whether it loads, so the decision can't drift across a
 * codebase and quietly stop honouring reduced-motion.
 *
 * Rules encoded here:
 *   - never mount during hydration (it blocks the main thread while INP is measured)
 *   - never mount without WebGL
 *   - never mount under prefers-reduced-motion
 *   - never mount on the floor tier or Save-Data
 *   - never mount until the container is near the viewport
 *   - unmount when the tab is hidden, remount when it returns
 */

import { detectTier, TIERS, tierOverride } from './quality.js';

export function supportsWebGL() {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return false;
    // A context that reports no max texture size is a software stub — treat as absent.
    return gl.getParameter(gl.MAX_TEXTURE_SIZE) >= 2048;
  } catch {
    return false;
  }
}

export function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/**
 * @param {object} opts
 * @param {HTMLElement} opts.container   element holding the poster and canvas
 * @param {() => Promise<{destroy:()=>void, pause?:()=>void, resume?:()=>void}>} opts.load
 *        dynamic import + scene init; resolves once the first frame has rendered
 * @param {(reason:string) => void} [opts.onSkip]  called when the static path is used
 * @returns {{ destroy: () => void }}
 */
export function mountWhenWorthwhile({ container, load, onSkip = () => {}, rootMargin = '200px' }) {
  let instance = null;
  let observer = null;
  let disposed = false;

  const skip = (reason) => { onSkip(reason); return { destroy() {} }; };

  const forced = tierOverride();

  if (!supportsWebGL()) return skip('no-webgl');
  // The QA override forces a tier, not the motion preference — reduced motion is a
  // stated accessibility need and is never overridden.
  if (prefersReducedMotion()) return skip('reduced-motion');

  const tier = forced ?? detectTier();
  if (tier === TIERS.floor) return skip('floor-tier');

  const start = async () => {
    if (instance || disposed) return;
    try {
      const loaded = await load(tier);
      // destroy() can run while the scene is still downloading — a visitor toggling
      // motion off, or an SPA route change. Without this check the late instance is
      // kept, and renders forever behind a page that thinks it was torn down.
      if (disposed) { loaded?.destroy?.(); return; }
      instance = loaded;
    } catch (err) {
      console.warn('[3d] scene failed to load, staying on the static path', err);
      onSkip('load-error');
    }
  };

  // Wait for idle *and* proximity. requestIdleCallback keeps it off the critical path;
  // IntersectionObserver keeps it off the network for below-fold scenes.
  let scheduled = false;
  const scheduleOnce = () => {
    if (scheduled || disposed) return;
    scheduled = true;
    schedule();
  };

  const schedule = () => {
    observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        observer.disconnect();
        observer = null;
        start();
      }
    }, { rootMargin });
    observer.observe(container);
  };

  // requestIdleCallback is deferred indefinitely while a tab is hidden, and Chrome
  // does not honour its timeout there. A page opened in a background tab — cmd-click,
  // "open link in new tab", session restore — would otherwise sit on the poster
  // forever, silently: no error, no skip reason, and the visibilitychange handler
  // below only pauses an instance that was never created. Wait for the tab to be
  // visible, then schedule.
  const scheduleWhenVisible = () => {
    if (disposed) return;
    if (document.hidden) {
      document.addEventListener('visibilitychange', onVisibleOnce);
      return;
    }
    // Race idle against a wall-clock deadline. requestIdleCallback's own timeout is
    // not honoured in every state Chrome can put a tab in, and a scene that silently
    // never mounts is the worst failure mode here: no error, no skip reason, just a
    // poster forever. scheduleOnce() makes the double-fire harmless.
    if ('requestIdleCallback' in window) {
      requestIdleCallback(scheduleOnce, { timeout: 2000 });
    }
    setTimeout(scheduleOnce, 2000);
  };

  function onVisibleOnce() {
    if (document.hidden) return;
    document.removeEventListener('visibilitychange', onVisibleOnce);
    scheduleWhenVisible();
  }

  scheduleWhenVisible();

  // Don't burn battery rendering a scene nobody is looking at.
  const onVisibility = () => {
    if (!instance) return;
    document.hidden ? instance.pause?.() : instance.resume?.();
  };
  document.addEventListener('visibilitychange', onVisibility);

  // People toggle reduced-motion mid-session. Honour it immediately.
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const onMotionChange = (e) => {
    if (e.matches && instance) {
      instance.destroy();
      instance = null;
      onSkip('reduced-motion');
    }
  };
  motionQuery.addEventListener('change', onMotionChange);

  return {
    destroy() {
      disposed = true;
      observer?.disconnect();
      document.removeEventListener('visibilitychange', onVisibleOnce);
      document.removeEventListener('visibilitychange', onVisibility);
      motionQuery.removeEventListener('change', onMotionChange);
      instance?.destroy();
      instance = null;
    },
  };
}

/**
 * Poster crossfade.
 *
 * The poster is the LCP element and the fallback for every user who never gets a
 * scene. The canvas replaces it only after the first frame has actually rendered —
 * not when the module loads, and not when assets finish downloading. Revealing early
 * shows a flash of empty canvas, which is worse than a slightly later reveal.
 */

export function createPosterReveal(container, { duration = 700 } = {}) {
  const poster = container.querySelector('[data-poster]');
  const canvas = container.querySelector('canvas');

  if (canvas) {
    canvas.style.opacity = '0';
    canvas.style.transition = `opacity ${duration}ms ease`;
  }

  return {
    /** Call after renderer.render() has run at least once. */
    reveal() {
      if (!canvas) return;
      // Two rAFs: the first lets the frame present, the second lets the style land.
      requestAnimationFrame(() => requestAnimationFrame(() => {
        canvas.style.opacity = '1';
        if (poster) {
          poster.style.transition = `opacity ${duration}ms ease`;
          poster.style.opacity = '0';
          // Keep it in the DOM — context loss needs somewhere to fall back to.
          setTimeout(() => { poster.style.visibility = 'hidden'; }, duration);
        }
      }));
    },

    /** Called on context loss. The poster is the safety net. */
    restore() {
      if (poster) {
        poster.style.visibility = 'visible';
        poster.style.opacity = '1';
      }
      if (canvas) canvas.style.opacity = '0';
    },
  };
}

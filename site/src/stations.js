/**
 * Camera stations — the choreography as data.
 *
 * Every element in the page carrying `data-station="<name>"` pins one of these. Scroll
 * position interpolates between adjacent stations, so editing copy never means
 * re-choreographing the scene (references/scroll-scene.md, "Structure").
 *
 * Deliberately free of any Three.js import: the static path reads `poster` from here to
 * pick which still to show, and it must never pull the 3D runtime to do that.
 *
 *   cam     camera position
 *   aim     the point on the stack the camera looks at
 *   shift   world units to slide the stack right of centre, leaving the left of the
 *           frame quiet for type. Scaled to zero on narrow viewports.
 *   spread  gap between plates: 0 is a single slab, 1 is the exploded view
 *   show    per-plate visibility, bottom (content) to top (polish)
 *   glow    per-plate emission of the etched drawing
 *   lift    per-plate extra height, for layers leaving the stack
 *   yaw     rotation of the whole stack
 *   key     key-light sweep, 0..1 of a half orbit
 *   dims    visibility of the dimension line
 *   poster  which pre-rendered still the static path shows here
 */

const ALL = [1, 1, 1, 1, 1];
const NONE = [0, 0, 0, 0, 0];

const base = {
  cam: [5.1, 3.9, 6.9],
  aim: [0, 1.05, 0],
  shift: 1.55,
  spread: 1,
  show: ALL,
  glow: [0.9, 0.9, 0.9, 0.9, 0.9],
  lift: NONE,
  yaw: -0.32,
  key: 0,
  dims: 0,
  poster: 'hero',
};

const s = (over) => ({ ...base, ...over });

export const STATIONS = {
  hero: s({}),

  // The canvas-only site: one dark slab, nothing etched on it. The "blank div".
  problem: s({
    cam: [4.0, 2.9, 6.4], aim: [0, 0.45, 0], shift: 1.2,
    spread: 0, show: [0, 0, 1, 0, 0], glow: [0, 0, 0.04, 0, 0], yaw: -0.18,
    poster: 'problem',
  }),

  // Content first. The foundation alone.
  modes: s({
    cam: [4.2, 3.6, 6.6], aim: [0, 0.5, 0], shift: 1.6,
    show: [1, 0, 0, 0, 0], glow: [0.95, 0, 0, 0, 0], yaw: -0.5,
    poster: 'audit',
  }),

  // Phase 00 — reading the page from above, like an inventory.
  audit: s({
    cam: [0, 8.4, 3.4], aim: [0, 0.35, 0.05], shift: 1.95,
    show: [1, 0, 0, 0, 0], glow: [1.15, 0, 0, 0, 0], yaw: 0,
    poster: 'audit',
  }),

  // Phase 01 — the layers to come, as ghosts. Which of them this site earns is the decision.
  route: s({
    cam: [5.4, 3.6, 7.6], aim: [0, 1.1, 0], shift: 1.7,
    show: [1, 0.45, 0.45, 0.45, 0.45], glow: [1, 0.3, 0.3, 0.3, 0.3], yaw: -0.3,
    poster: 'route',
  }),

  // Phase 02 — nothing is built; the light is decided. The key swings round.
  direction: s({
    cam: [3.2, 2.2, 7.4], aim: [0, 0.9, 0], shift: 1.7,
    show: [1, 0.45, 0.45, 0.45, 0.45], glow: [0.8, 0.28, 0.28, 0.28, 0.28], yaw: -0.1,
    key: 1, poster: 'route',
  }),

  // Phase 03 — the build order, one layer per step, bottom up.
  'build-1': s({ cam: [5.3, 3.0, 6.4], show: [1, 0, 0, 0, 0], glow: [1, 0, 0, 0, 0], poster: 'route' }),
  'build-2': s({ cam: [5.3, 3.25, 6.5], show: [1, 1, 0, 0, 0], glow: [0.55, 1, 0, 0, 0], poster: 'route' }),
  'build-3': s({ cam: [5.2, 3.5, 6.6], show: [1, 1, 1, 0, 0], glow: [0.5, 0.5, 1, 0, 0], poster: 'hero' }),
  'build-4': s({ cam: [5.1, 3.75, 6.8], show: [1, 1, 1, 1, 0], glow: [0.5, 0.5, 0.5, 1, 0], poster: 'hero' }),
  'build-5': s({ cam: [5.0, 4.0, 6.9], show: ALL, glow: [0.5, 0.5, 0.5, 0.5, 1], poster: 'hero' }),

  // Phase 04 — elevation view. The stack read as a measured drawing.
  budgets: s({
    cam: [0.6, 1.75, 9.8], aim: [0, 1.05, 0], shift: 2.25,
    glow: [0.45, 0.45, 0.45, 0.45, 0.45], yaw: 0, dims: 1,
    poster: 'budgets',
  }),

  // Phase 05 — everything above the poster leaves. The page still stands.
  fallback: s({
    cam: [4.9, 3.7, 6.6], aim: [0, 1.25, 0], shift: 1.5,
    show: [1, 1, 0, 0, 0], glow: [1, 0.9, 0, 0, 0], lift: [0, 0, 1.1, 1.35, 1.6],
    poster: 'fallback',
  }),

  // Phase 06 — assembled tight, everything lit. Shipped.
  ship: s({
    cam: [5.6, 4.7, 6.1], aim: [0, 0.8, 0], shift: 1.4,
    spread: 0.42, glow: [0.9, 0.9, 0.9, 0.9, 0.9], yaw: -0.55,
    poster: 'ship',
  }),

  try: s({ cam: [5.2, 3.8, 7.0] }),

  measured: s({
    cam: [7.4, 5.6, 10.4], aim: [0, 1.0, 0], shift: 2.9, yaw: -0.2,
    glow: [0.5, 0.5, 0.5, 0.5, 0.5], poster: 'hero',
  }),

  toolkit: s({
    cam: [7.2, 2.6, 7.6], aim: [0, 1.1, 0], shift: 2.15, yaw: 0.5,
    glow: [0.75, 0.75, 0.75, 0.75, 0.75],
    poster: 'ship',
  }),

  install: s({ spread: 0.78, glow: [0.75, 0.75, 0.75, 0.75, 0.75], yaw: -0.4 }),
};

/** Stills rendered from the scene at build time, one per distinct composition. */
export const POSTERS = ['hero', 'problem', 'audit', 'route', 'budgets', 'fallback', 'ship'];

export const stationFor = (name) => STATIONS[name] ?? STATIONS.hero;

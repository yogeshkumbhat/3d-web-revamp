/**
 * Context loss and disposal.
 *
 * Two unglamorous modules that decide whether a 3D site survives contact with real
 * users. Context loss produces a black rectangle if unhandled; missed disposal
 * produces a site that gets slower every time someone navigates back to it.
 */

/**
 * WebGL contexts get dropped — backgrounded tabs on mobile, GPU driver resets,
 * too many live contexts on the page. Calling preventDefault() is what allows the
 * browser to restore it; without that call the context is gone permanently.
 *
 * All GPU resources are invalid after loss. Rebuild; never reuse.
 */
export function handleContextLoss(canvas, { onLost, onRestored }) {
  const lost = (event) => {
    event.preventDefault();
    onLost?.();
  };
  const restored = () => onRestored?.();

  canvas.addEventListener('webglcontextlost', lost, false);
  canvas.addEventListener('webglcontextrestored', restored, false);

  return () => {
    canvas.removeEventListener('webglcontextlost', lost);
    canvas.removeEventListener('webglcontextrestored', restored);
  };
}

/**
 * Force a context loss to test the recovery path. Call from the console during QA —
 * this is the only practical way to verify the fallback before real users find it.
 */
export function simulateContextLoss(renderer) {
  const ext = renderer.getContext().getExtension('WEBGL_lose_context');
  if (!ext) return console.warn('WEBGL_lose_context unavailable in this browser');
  ext.loseContext();
  setTimeout(() => ext.restoreContext(), 1500);
}

/**
 * Deep-dispose a scene graph.
 *
 * Three.js does not free GPU memory when you remove an object — geometries,
 * materials, textures and render targets each hold VRAM until disposed. In a SPA
 * this is the difference between a site that stays fast and one that degrades.
 */
export function disposeScene(root, renderer) {
  const textures = new Set();

  const collectTextures = (material) => {
    for (const value of Object.values(material)) {
      if (value && value.isTexture) textures.add(value);
    }
    // Textures can also hide inside uniforms on custom shader materials.
    if (material.uniforms) {
      for (const uniform of Object.values(material.uniforms)) {
        if (uniform?.value?.isTexture) textures.add(uniform.value);
      }
    }
  };

  root.traverse((obj) => {
    obj.geometry?.dispose();

    const materials = Array.isArray(obj.material)
      ? obj.material
      : obj.material ? [obj.material] : [];

    for (const material of materials) {
      collectTextures(material);
      material.dispose();
    }
  });

  for (const texture of textures) texture.dispose();

  root.clear?.();

  if (renderer) {
    renderer.dispose();
    // renderForceContextLoss frees the GPU context immediately rather than waiting
    // for GC — important when a SPA creates and destroys scenes repeatedly.
    renderer.forceContextLoss?.();
    renderer.domElement?.remove();
  }
}

/**
 * Leak detector for development. Log this periodically; if the counts climb during a
 * session where the scene isn't growing, something isn't being disposed.
 */
export function memoryReport(renderer) {
  const { memory, render, programs } = renderer.info;
  return {
    geometries: memory.geometries,
    textures: memory.textures,
    programs: programs?.length ?? 0,
    drawCalls: render.calls,
    triangles: render.triangles,
  };
}

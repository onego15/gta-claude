// Loads a .glb model. Builds for hosts that only serve web media types (VITE_GLB_B64)
// ship each model as base64 text next to the original path.
export async function loadGLB(loader, url) {
  if (!import.meta.env.VITE_GLB_B64) return loader.loadAsync(url);
  const b64 = await (await fetch(`${url}.txt`)).text();
  const bin = Uint8Array.from(atob(b64.trim()), (c) => c.charCodeAt(0));
  return loader.parseAsync(bin.buffer, '');
}

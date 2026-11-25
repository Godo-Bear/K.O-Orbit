/** Painted stage backdrops (public/stages/<id>.webp). Stages without one use the procedural layers. */
export const PAINTED = ['canopy', 'nebula', 'abyss', 'ruins'];
const imgs = new Map<string, HTMLImageElement>();

export function loadStageArt(): Promise<void> {
  return Promise.all(PAINTED.map((id) => new Promise<void>((res) => {
    const i = new Image(); i.decoding = 'async';
    i.onload = () => { imgs.set(id, i); res(); }; i.onerror = () => res();
    i.src = `${import.meta.env.BASE_URL}stages/${id}.webp`;
  }))).then(() => undefined);
}

export const stageArt = (id: string) => imgs.get(id);

/**
 * Draw a painting to cover the view with gentle parallax, then push it back with a depth tint so the
 * playable platforms on top read clearly.
 */
export function drawPainting(ctx: CanvasRenderingContext2D, img: HTMLImageElement, W: number, H: number, cx: number, cy: number, zoom: number, dim = true, reset = true) {
  const margin = 1.16;
  const s = Math.max(W / img.naturalWidth, H / img.naturalHeight) * margin;
  const dw = img.naturalWidth * s, dh = img.naturalHeight * s;
  const maxX = (dw - W) / 2, maxY = (dh - H) / 2;
  const ox = Math.max(-maxX, Math.min(maxX, -cx * 0.05 * zoom));
  const oy = Math.max(-maxY, Math.min(maxY, -cy * 0.05 * zoom));
  if (reset) ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = reset ? 'low' : 'high';
  ctx.drawImage(img, (W - dw) / 2 + ox, (H - dh) / 2 + oy, dw, dh);
  if (dim) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(8,6,24,0.12)'); g.addColorStop(0.55, 'rgba(8,6,24,0.22)'); g.addColorStop(1, 'rgba(8,6,24,0.5)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
}

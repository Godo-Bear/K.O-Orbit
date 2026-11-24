/**
 * Illustrated character art (cut from the reference sheets by scripts/cutout.py).
 * Loads public/art/manifest.json, builds a small mip chain for smooth down-scaling and
 * a white silhouette for hit flashes. Fighters without art fall back to the vector rig.
 */
type Src = HTMLImageElement | HTMLCanvasElement;
export interface ArtImage { levels: Src[]; w: number; h: number; flash: HTMLCanvasElement; ink?: HTMLCanvasElement; inkPad: number }
export interface RigPart { name: 'armF' | 'armB' | 'legF' | 'legB'; layer: 'front' | 'back'; pivot: [number, number]; end: [number, number]; joint?: [number, number]; off: [number, number]; img: ArtImage; upper?: ArtImage; lower?: ArtImage; offU?: [number, number]; offL?: [number, number] }
export interface CharRig { w: number; h: number; body: ArtImage; parts: RigPart[] }
export interface CharArt { full?: ArtImage; head?: ArtImage; rig?: CharRig }

/** Per-fighter framing: sprite height relative to hurtbox, head sprite size & neck anchor. */
export const ART_FRAMING: Record<string, { height: number; headH: number; headY: number; faces: number }> = {
  nova: { height: 1.12, headH: 36, headY: 0.86, faces: 1 },
  glacia: { height: 1.2, headH: 44, headY: 0.92, faces: 1 },
  rook: { height: 1.18, headH: 42, headY: 0.92, faces: 1 },
  omega: { height: 1.12, headH: 40, headY: 0.94, faces: 1 },
  volt: { height: 1.16, headH: 40, headY: 0.9, faces: 1 },
  brick: { height: 1.02, headH: 34, headY: 0.92, faces: 1 },
  ember: { height: 1.12, headH: 42, headY: 0.9, faces: 1 },
  zephyr: { height: 1.14, headH: 38, headY: 0.92, faces: 1 },
};

const art = new Map<string, CharArt>();

function makeCanvas(w: number, h: number) { const c = document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h); return c; }

function build(img: HTMLImageElement): ArtImage {
  const levels: Src[] = [img];
  let src: Src = img, w = img.naturalWidth, h = img.naturalHeight;
  while (h > 96) { // halve repeatedly with high-quality filtering
    w = Math.round(w / 2); h = Math.round(h / 2);
    const c = makeCanvas(w, h), g = c.getContext('2d')!;
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(src, 0, 0, w, h);
    levels.push(c); src = c;
  }
  const flash = makeCanvas(img.naturalWidth, img.naturalHeight), fg = flash.getContext('2d')!;
  fg.drawImage(img, 0, 0); fg.globalCompositeOperation = 'source-in'; fg.fillStyle = '#ffffff'; fg.fillRect(0, 0, flash.width, flash.height);
  // ink outline: the silhouette dilated by a few px, filled near-black (drawn behind the art for readability)
  const pad = Math.max(3, Math.round(img.naturalHeight / 140));
  const ink = makeCanvas(img.naturalWidth + pad * 2, img.naturalHeight + pad * 2), ig = ink.getContext('2d')!;
  for (let a = 0; a < 12; a++) ig.drawImage(flash, pad + Math.cos((a / 12) * Math.PI * 2) * pad, pad + Math.sin((a / 12) * Math.PI * 2) * pad);
  ig.globalCompositeOperation = 'source-in'; ig.fillStyle = '#07060f'; ig.fillRect(0, 0, ink.width, ink.height);
  return { levels, w: img.naturalWidth, h: img.naturalHeight, flash, ink, inkPad: pad };
}

const loadImg = (url: string) => new Promise<HTMLImageElement | null>((res) => { const i = new Image(); i.decoding = 'async'; i.onload = () => res(i); i.onerror = () => res(null); i.src = url; });

/** Load all available art (resolves even if some files are missing). */
export async function loadArt(): Promise<void> {
  try {
    const r = await fetch(`${import.meta.env.BASE_URL}art/manifest.json`, { cache: 'no-cache' });
    if (!r.ok) return;
    const manifest = await r.json() as Record<string, { rig?: { size: [number, number]; parts: { name: RigPart['name']; layer: RigPart['layer']; pivot: [number, number]; end: [number, number]; joint?: [number, number]; off: [number, number]; offU?: [number, number]; offL?: [number, number] }[] } }>;
    const base = `${import.meta.env.BASE_URL}art/`;
    await Promise.all(Object.entries(manifest).map(async ([id, m]) => {
      const [full, head] = await Promise.all([loadImg(`${base}${id}_full.webp`), loadImg(`${base}${id}_head.webp`)]);
      const entry: CharArt = { full: full ? build(full) : undefined, head: head ? build(head) : undefined };
      if (m.rig) {
        const parts = m.rig.parts;
        const imgs = await Promise.all([loadImg(`${base}${id}_rig_body.webp`), ...parts.map((p) => loadImg(`${base}${id}_rig_${p.name}.webp`))]);
        const segs = await Promise.all(parts.map((p) => p.joint ? Promise.all([loadImg(`${base}${id}_rig_${p.name}_u.webp`), loadImg(`${base}${id}_rig_${p.name}_l.webp`)]) : Promise.resolve([null, null])));
        if (imgs.every(Boolean)) {
          entry.rig = {
            w: m.rig.size[0], h: m.rig.size[1], body: build(imgs[0]!),
            parts: parts.map((p, i) => {
              const [u, l] = segs[i];
              return { ...p, img: build(imgs[i + 1]!), upper: u && l ? build(u) : undefined, lower: u && l ? build(l) : undefined };
            }),
          };
        }
      }
      art.set(id, entry);
    }));
  } catch { /* offline / missing — vector rigs are used */ }
}

export const getArt = (id: string): CharArt | undefined => art.get(id);
export const hasArt = (id: string) => !!art.get(id)?.full;

/** Pick the smallest mip level that is still ≥ the on-screen pixel height. */
export function pickLevel(a: ArtImage, screenH: number): Src {
  let best = a.levels[0];
  for (const l of a.levels) { if (l.height >= screenH) best = l; else break; }
  return best;
}

/** Draw an art image so its bottom-centre sits at (x, y) with height h (current transform units). */
/** Draw an art image with its top-left at (x, y) and size (w, h) — used for rig pieces. */
/** Draw just the ink outline of an art image (call for all pieces first, then the art, so outlines merge). */
export function drawInkRect(ctx: CanvasRenderingContext2D, a: ArtImage, x: number, y: number, w: number, h: number) {
  if (!a.ink) return;
  const p = a.inkPad * (w / a.w);
  ctx.drawImage(a.ink, x - p, y - p, w + p * 2, h + p * 2);
}

export function drawArtRect(ctx: CanvasRenderingContext2D, a: ArtImage, x: number, y: number, w: number, h: number, flash = 0) {
  const m = ctx.getTransform();
  const scale = Math.hypot(m.a, m.b) || 1;
  const src = pickLevel(a, h * scale);
  ctx.drawImage(src, x, y, w, h);
  if (flash > 0) { const ga = ctx.globalAlpha; ctx.globalAlpha = ga * Math.min(1, flash); ctx.drawImage(a.flash, x, y, w, h); ctx.globalAlpha = ga; }
}

export function drawArt(ctx: CanvasRenderingContext2D, a: ArtImage, x: number, y: number, h: number, flash = 0, anchorY = 1, ink = false) {
  const m = ctx.getTransform();
  const scale = Math.hypot(m.a, m.b) || 1;
  const w = (a.w / a.h) * h;
  const src = pickLevel(a, h * scale * Math.abs(Math.hypot(m.c, m.d) / scale || 1));
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  if (ink) drawInkRect(ctx, a, x - w / 2, y - h * anchorY, w, h);
  ctx.drawImage(src, x - w / 2, y - h * anchorY, w, h);
  if (flash > 0) { const ga = ctx.globalAlpha; ctx.globalAlpha = ga * Math.min(1, flash); ctx.drawImage(a.flash, x - w / 2, y - h * anchorY, w, h); ctx.globalAlpha = ga; }
}

#!/usr/bin/env python3
"""Cut character art out of the reference sheets in art-src/ into transparent PNGs in public/art/.

For each fighter we export:
  <id>_full.png  — the main full-body figure (character select / results / story / practice cards)
  <id>_head.png  — a head from the expression sheet (HUD portraits & in-game head sprite)
and public/art/manifest.json with sizes. Re-run after adding sheets:  python3 scripts/cutout.py
"""
import json, os
from PIL import Image, ImageDraw, ImageFilter

SRC, OUT = 'art-src', 'public/art'
MAGENTA = (255, 0, 255)

# crop boxes (x0, y0, x1, y1) in the 1024px sheets; seed = a point inside the figure (crop-relative)
SHEETS = {
    'nova':   {'file': 'nova-sheet.jpg',   'full': (60, 160, 536, 960), 'head': (550, 76, 678, 216), 'flip_full': True},
    'glacia': {'file': 'glacia-sheet.jpg', 'full': (280, 116, 668, 1010), 'head': (36, 122, 152, 270), 'holes': 18, 'erase': [(26, 728, 168, 870)]},
    'rook':   {'file': 'rook-sheet.jpg',   'full': (24, 186, 464, 912), 'head': (656, 66, 826, 224), 'thresh': 16, 'holes': 10},
    'omega':  {'file': 'omega-sheet.jpg',  'full': (82, 136, 606, 892), 'head': (562, 380, 678, 510), 'holes': 22, 'minhole': 6},
}

def cut(img: Image.Image, box, thresh=42, holes=0, minhole=60, erase=()):
    im = img.crop(box).convert('RGB')
    w, h = im.size
    work = im.copy()
    # flood the background from every border pixel (every 3px)
    for x in range(0, w, 3):
        for y in (0, h - 1):
            if work.getpixel((x, y)) != MAGENTA: ImageDraw.floodfill(work, (x, y), MAGENTA, thresh=thresh)
    for y in range(0, h, 3):
        for x in (0, w - 1):
            if work.getpixel((x, y)) != MAGENTA: ImageDraw.floodfill(work, (x, y), MAGENTA, thresh=thresh)
    # alpha = not background
    alpha = Image.new('L', (w, h), 0)
    ap, wp = alpha.load(), work.load()
    for y in range(h):
        for x in range(w):
            if wp[x, y] != MAGENTA: ap[x, y] = 255
    # enclosed background holes (gaps inside capes / between limbs): near-background colour regions of real size
    if holes:
        bg = im.getpixel((0, 0))
        ip = im.load()
        near = Image.new('L', (w, h), 0); npx = near.load()
        for y in range(h):
            for x in range(w):
                c = ip[x, y]
                if abs(c[0] - bg[0]) + abs(c[1] - bg[1]) + abs(c[2] - bg[2]) <= holes * 3: npx[x, y] = 255
        for y in range(0, h, 4):
            for x in range(0, w, 4):
                if npx[x, y] == 255:
                    ImageDraw.floodfill(near, (x, y), 100)
                    cnt = near.histogram()[100]
                    near = near.point(lambda v, big=cnt > minhole: (50 if big else 10) if v == 100 else v); npx = near.load()
        hp = near.load()
        for y in range(h):
            for x in range(w):
                if hp[x, y] == 50: ap[x, y] = 0
    # keep the main figure: every connected shape at least 2% the size of the largest
    comps = []
    probe = alpha.copy(); pp = probe.load(); label = 1
    for y in range(0, h, 4):
        for x in range(0, w, 4):
            if pp[x, y] == 255 and label < 250:
                ImageDraw.floodfill(probe, (x, y), label)
                comps.append((probe.histogram()[label], label)); label += 1; pp = probe.load()
    if comps:
        big = max(c for c, _ in comps)
        keep = {l for c, l in comps if c >= big * 0.02}
        alpha = probe.point(lambda v: 255 if v in keep else 0)
    if erase:
        d = ImageDraw.Draw(alpha)
        for b in erase: d.rectangle(b, fill=0)
    # tidy the edge: 1px erosion + soft feather
    alpha = alpha.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.6))
    out = im.convert('RGBA'); out.putalpha(alpha)
    bbox = alpha.getbbox()
    return out.crop(bbox) if bbox else out

def main():
    os.makedirs(OUT, exist_ok=True)
    manifest = {}
    for cid, s in SHEETS.items():
        path = os.path.join(SRC, s['file'])
        if not os.path.exists(path): continue
        img = Image.open(path)
        full = cut(img, s['full'], s.get('thresh', 42), s.get('holes', 0), s.get('minhole', 60), s.get('erase', ()))
        head = cut(img, s['head'], s.get('thresh', 42), s.get('holes', 0))
        if s.get('flip_full'): full = full.transpose(Image.FLIP_LEFT_RIGHT)
        full.save(os.path.join(OUT, f'{cid}_full.png'), optimize=True)
        head.save(os.path.join(OUT, f'{cid}_head.png'), optimize=True)
        manifest[cid] = {'full': list(full.size), 'head': list(head.size)}
        print(cid, 'full', full.size, 'head', head.size)
    with open(os.path.join(OUT, 'manifest.json'), 'w') as f: json.dump(manifest, f, indent=1)

if __name__ == '__main__':
    main()

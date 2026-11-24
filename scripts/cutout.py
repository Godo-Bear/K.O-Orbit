#!/usr/bin/env python3
"""Cut character art out of the reference sheets in art-src/ into transparent PNGs in public/art/.

For each fighter we export:
  <id>_full.png  — the main full-body figure (character select / results / story / practice cards)
  <id>_head.png  — a head from the expression sheet (HUD portraits & in-game head sprite)
and public/art/manifest.json with sizes. Re-run after adding sheets:  python3 scripts/cutout.py
"""
import json, os
from PIL import Image, ImageDraw, ImageFilter, ImageChops

SRC, OUT = 'art-src', 'public/art'
MAGENTA = (255, 0, 255)

# crop boxes (x0, y0, x1, y1) in the 1024px sheets; seed = a point inside the figure (crop-relative)
SHEETS = {
    'nova':   {'file': 'nova-sheet.jpg',   'full': (60, 160, 536, 960), 'head': (550, 76, 678, 216)},
    'glacia': {'file': 'glacia-sheet.jpg', 'full': (280, 116, 668, 1010), 'head': (36, 122, 152, 270), 'holes': 18, 'erase': [(26, 728, 168, 870)]},
    'rook':   {'file': 'rook-sheet.jpg',   'full': (24, 186, 464, 912), 'head': (656, 66, 826, 224), 'thresh': 16, 'holes': 10},
    'zephyr': {'file': 'zephyr-sheet.jpg', 'full': (176, 158, 764, 970), 'head': (52, 204, 192, 334), 'flip_full': True, 'flip_head': True, 'holes': 5, 'minhole': 250, 'erase': [(432, 408, 570, 618)]},
    'ember':  {'file': 'ember-sheet.jpg',  'full': (330, 52, 656, 652), 'head': (190, 188, 302, 334)},
    'brick':  {'file': 'granite-sheet.jpg', 'full': (20, 195, 680, 866), 'head': (710, 386, 802, 478), 'holes': 18, 'erase': [(560, 0, 658, 110), (70, 50, 92, 105), (40, 415, 65, 470), (430, 55, 460, 90), (565, 215, 585, 248), (492, 555, 540, 577), (5, 490, 105, 540), (25, 5, 125, 55), (435, 33, 520, 97), (525, 173, 615, 215), (520, 543, 620, 585)]},
    'volt':   {'file': 'volt-sheet.jpg',   'full': (36, 100, 500, 975), 'head': (518, 128, 660, 283)},
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
    for fn in os.listdir(OUT):
        if fn.endswith('.png') or fn.endswith('.webp'): os.remove(os.path.join(OUT, fn))
    manifest = {}
    for cid, s in SHEETS.items():
        path = os.path.join(SRC, s['file'])
        if not os.path.exists(path): continue
        img = Image.open(path)
        full = cut(img, s['full'], s.get('thresh', 42), s.get('holes', 0), s.get('minhole', 60), s.get('erase', ()))
        head = cut(img, s['head'], s.get('thresh', 42), 0 if s.get('flip_head') else s.get('holes', 0))
        if s.get('flip_full'): full = full.transpose(Image.FLIP_LEFT_RIGHT)
        if s.get('flip_head'): head = head.transpose(Image.FLIP_LEFT_RIGHT)
        full.save(os.path.join(OUT, f'{cid}_full.webp'), 'WEBP', quality=90, method=4)
        head.save(os.path.join(OUT, f'{cid}_head.webp'), 'WEBP', quality=90, method=4)
        manifest[cid] = {'full': list(full.size), 'head': list(head.size)}
        print(cid, 'full', full.size, 'head', head.size)
    for cid in list(manifest): build_rig(cid, manifest)
    with open(os.path.join(OUT, 'manifest.json'), 'w') as f: json.dump(manifest, f, indent=1)


# ----------------------------------------------------------------------------- puppet rigs
# Limb pieces cut from the full-body art (coords in <id>_full.png). pivot = shoulder/hip joint,
# end = hand/foot. Pieces are cut in order (earlier pieces claim overlapping pixels).
RIGS = {
    'nova': [
        ('armF', 'front', (285, 235), (378, 236), [(262, 222), (300, 205), (345, 196), (412, 208), (412, 282), (378, 300), (352, 348), (318, 348), (290, 312), (268, 272)]),
        ('armB', 'back', (130, 240), (155, 350), [(92, 212), (142, 204), (168, 240), (152, 290), (198, 328), (198, 388), (150, 394), (108, 372), (62, 332), (58, 298), (84, 258)]),
        ('legF', 'front', (258, 432), (372, 728), [(228, 418), (302, 398), (344, 448), (404, 498), (408, 562), (374, 582), (384, 698), (432, 718), (432, 760), (318, 760), (318, 690), (330, 582), (290, 522), (238, 470)]),
        ('legB', 'back', (182, 432), (42, 742), [(146, 418), (218, 418), (204, 472), (142, 562), (112, 622), (64, 794), (0, 794), (18, 700), (58, 590), (88, 540), (118, 470)]),
    ],
    'glacia': [
        ('armF', 'front', (270, 250), (316, 465), [(252, 232), (292, 222), (302, 290), (318, 380), (334, 430), (340, 488), (298, 490), (288, 442), (268, 382), (252, 300)]),
        ('armB', 'back', (113, 250), (60, 455), [(92, 232), (136, 238), (132, 300), (112, 382), (88, 442), (82, 486), (32, 480), (42, 430), (68, 380), (88, 300)]),
        ('legF', 'front', (226, 522), (240, 800), [(202, 506), (256, 506), (264, 600), (252, 700), (266, 790), (268, 814), (222, 816), (208, 720), (204, 600)]),
        ('legB', 'back', (184, 522), (190, 830), [(158, 506), (204, 506), (212, 600), (210, 720), (214, 846), (168, 846), (170, 720), (158, 600)]),
    ],
    'rook': [
        ('armF', 'front', (115, 215), (110, 425), [(74, 203), (136, 198), (152, 260), (134, 330), (130, 392), (166, 428), (302, 514), (438, 604), (424, 652), (384, 648), (280, 562), (150, 472), (100, 458), (60, 402), (24, 352), (44, 334), (80, 378), (74, 320), (78, 260)]),
        ('armB', 'back', (310, 212), (345, 392), [(284, 194), (332, 192), (348, 250), (358, 330), (378, 382), (362, 414), (318, 414), (308, 350), (294, 280)]),
        ('legF', 'front', (275, 442), (300, 690), [(238, 428), (302, 428), (318, 500), (322, 560), (338, 640), (348, 700), (268, 706), (268, 640), (258, 560), (244, 500)]),
        ('legB', 'back', (175, 442), (120, 700), [(146, 428), (216, 428), (212, 500), (176, 572), (152, 642), (152, 712), (82, 712), (94, 640), (118, 560), (138, 490)]),
    ],
    'zephyr': [
        ('armF', 'front', (430, 200), (512, 302), [(408, 182), (452, 176), (472, 238), (492, 276), (538, 270), (544, 328), (500, 334), (468, 312), (438, 262), (418, 232)]),
        ('armB', 'back', (340, 200), (195, 366), [(320, 178), (362, 184), (352, 216), (302, 252), (262, 300), (228, 330), (232, 382), (185, 412), (152, 396), (172, 344), (194, 308), (238, 258), (288, 214)]),
        ('legF', 'front', (400, 410), (440, 652), [(368, 394), (432, 388), (482, 438), (562, 472), (568, 528), (522, 538), (476, 576), (472, 610), (494, 674), (398, 694), (392, 640), (418, 590), (438, 540), (398, 470)]),
        ('legB', 'back', (335, 400), (160, 770), [(298, 378), (372, 384), (362, 442), (312, 502), (272, 562), (242, 622), (204, 690), (198, 790), (122, 796), (126, 700), (158, 640), (192, 560), (238, 478), (278, 418)]),
    ],
    'ember': [
        ('armF', 'front', (230, 238), (272, 268), [(215, 225), (245, 215), (300, 222), (320, 270), (302, 325), (270, 342), (240, 332), (225, 292), (212, 255)]),
        ('armB', 'back', (100, 240), (45, 290), [(110, 228), (90, 215), (20, 248), (0, 280), (8, 332), (55, 347), (86, 336), (106, 300), (120, 262)]),
        ('legF', 'front', (190, 400), (262, 560), [(160, 390), (226, 385), (240, 430), (250, 470), (300, 500), (320, 597), (196, 597), (194, 530), (175, 470), (158, 430)]),
        ('legB', 'back', (128, 400), (75, 560), [(95, 385), (160, 390), (150, 432), (122, 482), (116, 540), (120, 582), (28, 582), (48, 520), (74, 470), (90, 420)]),
    ],
    'brick': [
        ('armF', 'front', (440, 150), (580, 330), [(400, 120), (470, 110), (490, 190), (500, 258), (560, 248), (642, 280), (652, 382), (590, 412), (520, 396), (440, 332), (428, 260), (400, 190)]),
        ('armB', 'back', (150, 150), (110, 370), [(110, 100), (190, 90), (215, 170), (200, 240), (210, 320), (195, 402), (140, 472), (68, 462), (28, 410), (0, 320), (10, 258), (60, 230), (80, 170)]),
        ('legF', 'front', (380, 430), (460, 620), [(330, 410), (420, 400), (472, 440), (482, 500), (472, 550), (502, 600), (522, 645), (378, 652), (368, 590), (380, 530), (350, 470)]),
        ('legB', 'back', (240, 430), (170, 620), [(200, 400), (290, 410), (285, 470), (250, 530), (230, 580), (240, 645), (98, 652), (118, 600), (140, 540), (160, 480), (180, 430)]),
    ],
    'volt': [
        ('armF', 'front', (310, 250), (415, 330), [(290, 235), (330, 225), (350, 280), (340, 320), (380, 308), (400, 288), (446, 308), (456, 372), (420, 412), (370, 422), (330, 410), (300, 360), (285, 300)]),
        ('armB', 'back', (140, 250), (35, 330), [(160, 235), (120, 225), (100, 250), (65, 288), (15, 298), (0, 340), (20, 402), (80, 422), (115, 406), (130, 360), (150, 300)]),
        ('legF', 'front', (280, 500), (360, 800), [(240, 480), (320, 470), (330, 540), (342, 580), (380, 600), (395, 700), (459, 760), (459, 863), (298, 863), (290, 760), (284, 680), (270, 600), (250, 540)]),
        ('legB', 'back', (175, 500), (75, 800), [(145, 470), (235, 480), (230, 540), (190, 600), (170, 640), (145, 720), (110, 780), (102, 863), (0, 863), (20, 800), (60, 720), (85, 640), (110, 580), (130, 520)]),
    ],
    'omega': [
        ('armF', 'front', (345, 192), (390, 422), [(318, 168), (382, 148), (404, 200), (398, 280), (424, 330), (446, 422), (412, 474), (358, 458), (344, 400), (344, 300), (324, 240)]),
        ('armB', 'back', (115, 192), (68, 422), [(78, 148), (142, 168), (152, 240), (142, 300), (122, 352), (116, 432), (86, 474), (26, 454), (26, 400), (54, 330), (64, 260), (58, 200)]),
        ('legF', 'front', (290, 472), (340, 702), [(254, 458), (328, 458), (348, 540), (348, 600), (398, 660), (404, 714), (298, 718), (288, 650), (274, 560)]),
        ('legB', 'back', (190, 472), (108, 722), [(158, 458), (232, 458), (216, 540), (182, 602), (152, 672), (152, 744), (52, 744), (78, 670), (118, 590), (144, 520)]),
    ],
}

def _inpaint(rgba, fill_mask, shade=0.82, iters=400):
    """Diffuse surrounding colours into fill_mask (numpy), then shade it (reads as shadow behind a limb)."""
    import numpy as np
    a = np.asarray(rgba).astype(np.float32)
    known = (a[..., 3] > 200) & ~fill_mask
    col = a[..., :3].copy()
    col[~known] = 0
    todo = fill_mask.copy()
    for _ in range(iters):
        if not todo.any(): break
        acc = np.zeros_like(col); cnt = np.zeros(known.shape, np.float32)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, -1), (1, -1), (-1, 1)):
            kk = np.roll(np.roll(known, dy, 0), dx, 1)
            cc = np.roll(np.roll(col, dy, 0), dx, 1)
            acc += cc * kk[..., None]; cnt += kk
        grow = todo & (cnt > 0)
        col[grow] = acc[grow] / cnt[grow][:, None]
        known = known | grow; todo = todo & ~grow
    out = a.copy()
    out[fill_mask, :3] = col[fill_mask] * shade
    out[fill_mask, 3] = 255
    return Image.fromarray(out.clip(0, 255).astype('uint8'), 'RGBA')

def _close(mask_img, radius):
    m = mask_img
    for _ in range(radius // 2): m = m.filter(ImageFilter.MaxFilter(5))
    for _ in range(radius // 2): m = m.filter(ImageFilter.MinFilter(5))
    return m

def build_rig(cid, manifest):
    import numpy as np
    path = os.path.join(OUT, f'{cid}_full.webp')
    if cid not in RIGS or not os.path.exists(path): return
    full = Image.open(path).convert('RGBA')
    W, H = full.size
    alpha = np.asarray(full)[..., 3] > 40
    claimed = np.zeros((H, W), bool)
    parts = []
    joint_fill = np.zeros((H, W), bool)
    for name, layer, pivot, end, poly in RIGS[cid]:
        pm = Image.new('L', (W, H), 0); ImageDraw.Draw(pm).polygon(poly, fill=255)
        polym = np.asarray(pm) > 0
        take = polym & alpha & ~claimed
        # holes inside this limb where an earlier piece (e.g. a sword) covered it: inpaint from the limb itself
        holes = polym & alpha & claimed
        claimed |= take
        # joint region (top ~third of the limb) gets repainted on the body so swinging limbs never open holes
        L = max(1.0, ((end[0] - pivot[0]) ** 2 + (end[1] - pivot[1]) ** 2) ** 0.5)
        frac = 0.42 if name.startswith('leg') else 0.3
        jm = Image.new('L', (W, H), 0)
        ImageDraw.Draw(jm).ellipse([pivot[0] - L * 0.28, pivot[1] - L * 0.2, pivot[0] + L * 0.28, pivot[1] + L * frac], fill=255)
        joint_fill |= (np.asarray(jm) > 0) & polym
        piece = np.asarray(full).copy()
        piece[~take, 3] = 0
        pimg = Image.fromarray(piece, 'RGBA')
        if holes.any(): pimg = _inpaint(pimg, holes, shade=0.9)
        pa = pimg.getchannel('A')
        pimg.putalpha(ImageChops.multiply(pa, pa.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(5)).point(lambda v: 255 if v > 0 else 0)))
        # split into upper (shoulder->elbow / hip->knee) and lower segments with a small overlap at the joint
        arr = np.asarray(pimg).copy()
        yy, xx = np.mgrid[0:H, 0:W]
        vx, vy = end[0] - pivot[0], end[1] - pivot[1]
        tproj = ((xx - pivot[0]) * vx + (yy - pivot[1]) * vy) / (L * L)
        jt = 0.5
        joint = [pivot[0] + vx * jt, pivot[1] + vy * jt]
        segs = {}
        for seg, m in (('u', tproj < jt + 0.07), ('l', tproj > jt - 0.05)):
            a2 = arr.copy(); a2[~m, 3] = 0
            si = Image.fromarray(a2, 'RGBA'); bb = si.getbbox()
            if not bb: bb = (0, 0, 1, 1)
            si = si.crop(bb); si.save(os.path.join(OUT, f'{cid}_rig_{name}_{seg}.webp'), 'WEBP', quality=90, method=4)
            segs[seg] = [bb[0], bb[1]]
        bbox = pimg.getbbox()
        pimg = pimg.crop(bbox)
        pimg.save(os.path.join(OUT, f'{cid}_rig_{name}.webp'), 'WEBP', quality=90, method=4)
        parts.append({'name': name, 'layer': layer, 'pivot': pivot, 'end': end, 'joint': [round(joint[0], 1), round(joint[1], 1)], 'off': [bbox[0], bbox[1]], 'size': list(pimg.size), 'offU': segs['u'], 'offL': segs['l']})
    # body = everything else, with the area the limbs used to cover repainted
    body = np.asarray(full).copy()
    body[claimed, 3] = 0
    bimg = Image.fromarray(body, 'RGBA')
    bmask = Image.fromarray(((body[..., 3] > 40) * 255).astype('uint8'), 'L')
    closed = np.asarray(_close(bmask, 26)) > 0
    fill = ((closed & alpha) | joint_fill) & claimed
    bimg = _inpaint(bimg, fill, shade=0.78)
    # remove thin slivers left along cut edges (they'd show as stray lines once outlined)
    ba = bimg.getchannel('A')
    opened = ba.filter(ImageFilter.MinFilter(5)).filter(ImageFilter.MaxFilter(5))
    bimg.putalpha(ImageChops.multiply(ba, opened.point(lambda v: 255 if v > 0 else 0)))
    bimg.save(os.path.join(OUT, f'{cid}_rig_body.webp'), 'WEBP', quality=90, method=4)
    manifest[cid]['rig'] = {'size': [W, H], 'parts': parts}
    print(cid, 'rig', [p['name'] for p in parts])


if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""Découpe une planche 4x4 générée (gouttières noires) en 16 icônes 128 px,
puis régénère src/ui/painted.js (data URI webp) à partir de assets/icons/.
usage : python3 tools/slice_sheet.py planche.png nom1,nom2,...   (16 noms = grille 4x4, 25 = 5x5 ; « - » = case ignorée)
        python3 tools/slice_sheet.py planche.png gear07   (noms lus dans assets/sheets/*names.json)"""
import sys, os, base64, io
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'icons')
SIZE = 128

def bands(prof, n=4, thr=22):
    """Trouve n bandes claires séparées par des gouttières sombres."""
    L = len(prof); step = L / n; res = []
    for k in range(n):
        lo, hi = int(k * step), int((k + 1) * step)
        seg = prof[lo:hi] > thr
        idx = np.where(seg)[0]
        if len(idx) == 0: res.append((lo, hi)); continue
        # plus longue suite claire
        best, s, cur = (idx[0], idx[0]), idx[0], idx[0]
        for i in idx[1:]:
            if i == cur + 1: cur = i
            else:
                if cur - s > best[1] - best[0]: best = (s, cur)
                s = cur = i
        if cur - s > best[1] - best[0]: best = (s, cur)
        res.append((lo + best[0], lo + best[1] + 1))
    return res

def slice_sheet(path, names):
    n = int(round(len(names) ** 0.5))
    assert n * n == len(names), 'nombre de noms : 16 ou 25'
    im = Image.open(path).convert('RGB')
    g = np.asarray(im.convert('L')).astype(float)
    cols = bands(g.mean(axis=0), n); rows = bands(g.mean(axis=1), n)
    os.makedirs(OUT, exist_ok=True)
    i = 0
    for (y0, y1) in rows:
        for (x0, x1) in cols:
            name = names[i]; i += 1
            if not name or name == '-': continue
            w, h = x1 - x0, y1 - y0; s = min(w, h)
            m = max(2, int(s * 0.012))  # rogne le liseré sombre
            cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
            box = (cx - s // 2 + m, cy - s // 2 + m, cx + s // 2 - m, cy + s // 2 - m)
            im.crop(box).resize((SIZE, SIZE), Image.LANCZOS).save(os.path.join(OUT, name + '.webp'), 'WEBP', quality=86, method=6)
    regen()

def regen():
    lines = ['// Généré par tools/slice_sheet.py — icônes peintes (planches ChatGPT découpées).',
             '// glyphe -> data URI webp 128 px. Ne pas éditer à la main.', 'export const PAINTED = {']
    for f in sorted(os.listdir(OUT)):
        if not f.endswith('.webp'): continue
        b = base64.b64encode(open(os.path.join(OUT, f), 'rb').read()).decode()
        lines.append(f"  '{f[:-5]}': 'data:image/webp;base64,{b}',")
    lines.append('};\n')
    open(os.path.join(ROOT, 'src', 'ui', 'painted.js'), 'w').write('\n'.join(lines))

if __name__ == '__main__':
    if len(sys.argv) == 1: regen()
    else:
        arg = sys.argv[2]
        if ',' not in arg:
            import json, glob
            table = {}
            for f in glob.glob(os.path.join(ROOT, 'assets', 'sheets', '*names.json')): table.update(json.load(open(f)))
            arg = table[arg]
        names = arg.split(',')
        slice_sheet(sys.argv[1], names)

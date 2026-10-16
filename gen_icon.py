# -*- coding: utf-8 -*-
"""生成 PWA 图标：深色渐变圆角方块 + 金色 349 + 绿色对勾"""
import os
from PIL import Image, ImageDraw, ImageFont

OUT = os.path.dirname(os.path.abspath(__file__))
C1 = (59, 43, 107)    # #3b2b6b
C2 = (14, 74, 82)     # #0e4a52
GOLD = (255, 209, 102)
GREEN = (74, 222, 128)

def font(sz):
    for p, i in [("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 0),
                 ("/Library/Fonts/Arial Bold.ttf", 0),
                 ("/System/Library/Fonts/Helvetica.ttc", 1),
                 ("/System/Library/Fonts/SFNS.ttf", 0)]:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, sz, index=i)
            except Exception:
                continue
    return ImageFont.load_default()

def make(size, pad_ratio=0.0, name=None):
    S = size * 4  # 4x 超采样再缩小，边缘干净
    im = Image.new("RGB", (S, S), C1)
    d = ImageDraw.Draw(im)
    for y in range(S):  # 对角渐变
        t = y / (S - 1)
        d.line([(0, y), (S, y)], fill=tuple(int(C1[i] + (C2[i] - C1[i]) * t) for i in range(3)))

    # 圆角遮罩（iOS 会自己再加圆角，这里留全幅更安全）
    if pad_ratio > 0:
        inset = int(S * pad_ratio)
        mask = Image.new("L", (S, S), 0)
        ImageDraw.Draw(mask).rounded_rectangle([inset, inset, S - inset, S - inset],
                                               radius=int(S * 0.22), fill=255)
        bg = Image.new("RGB", (S, S), (18, 16, 28))
        im = Image.composite(im, bg, mask)

    d = ImageDraw.Draw(im)
    f = font(int(S * 0.40))
    txt = "349"
    bb = d.textbbox((0, 0), txt, font=f)
    d.text(((S - (bb[2] - bb[0])) / 2 - bb[0], (S - (bb[3] - bb[1])) / 2 - bb[1] - S * 0.055),
           txt, font=f, fill=GOLD)

    # 对勾
    w = max(2, int(S * 0.035))
    cx, cy, r = S * 0.5, S * 0.735, S * 0.075
    d.line([(cx - r, cy), (cx - r * 0.25, cy + r * 0.8)], fill=GREEN, width=w, joint="curve")
    d.line([(cx - r * 0.25, cy + r * 0.8), (cx + r, cy - r * 0.7)], fill=GREEN, width=w, joint="curve")

    im = im.resize((size, size), Image.LANCZOS)
    fn = name or f"icon-{size}.png"
    im.save(os.path.join(OUT, fn), "PNG", optimize=True)
    print("  ", fn, os.path.getsize(os.path.join(OUT, fn)), "B")

if __name__ == "__main__":
    make(180)
    make(192)
    make(512)
    make(1024, pad_ratio=0.02, name="icon-1024.png")

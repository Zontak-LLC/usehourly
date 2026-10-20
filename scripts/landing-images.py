#!/usr/bin/env python3
"""Turns the pictures made by `LANDING_SHOTS=1 npx playwright test e2e/landing-shots.spec.ts --project=desktop`
(e2e/report/landing/*.png, whole content columns at 2x) into the cropped webp files the landing page uses
(public/landing/*.webp), and prints the width and height to put in src/app/(main)/page.tsx.
Needs Pillow and cwebp (brew install webp). Crops keep the top of each page, where the story is."""
import os
import subprocess
import sys

from PIL import Image, ImageOps

# Next caches optimised images by file name, so every retake needs a NEW name (bump this) and the page must point at it.
VERSION = os.environ.get("LANDING_VERSION", "v2")

# name -> pixel height to keep from the top (None = the whole picture)
CROPS = {"today": None, "week": 1230, "month": 1010, "report": 1150}

for name, keep in CROPS.items():
    im = Image.open(f"e2e/report/landing/{name}.png").convert("RGB")
    w, h = im.size
    if keep:
        im = im.crop((0, 0, w, min(h, keep)))
    # breathing room inside the browser-window frame, in the page's own cream (taken from the corner pixel)
    im = ImageOps.expand(im, border=(48, 48, 48, 32), fill=im.getpixel((0, 0)))
    tmp = f"e2e/report/landing/{name}-cropped.png"
    im.save(tmp)
    subprocess.run(["cwebp", "-quiet", "-q", "82", tmp, "-o", f"public/landing/{name}-{VERSION}.webp"], check=True)
    print(f"{name}-{VERSION}.webp: width={im.size[0]} height={im.size[1]}")
sys.exit(0)

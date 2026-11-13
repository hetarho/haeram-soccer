"""Replays the draw calls check.mts recorded (scenes.json) into one 2x2 PNG per scene.

    python3 -I render.py <viewer>/check/scenes.json
"""
import json
import os
import re
import sys

from PIL import Image, ImageDraw, ImageFont

S = 2  # pixels per CSS px
src = sys.argv[1]
out_dir = os.path.dirname(src)
scenes = json.load(open(src))


def font(px):
    return ImageFont.load_default(size=max(6, int(px * S)))


def replay(draw, ops, ox=0.0, oy=0.0, sx=1.0, sy=1.0):
    def pt(p):
        return ((ox + p[0] * sx) * S, (oy + p[1] * sy) * S)

    for op in ops:
        kind = op["op"]
        if kind == "image":
            # The ground surface was painted at its own size; drawImage maps it onto (x, y, w, h).
            replay(draw, op["ops"], ox + op["x"] * sx, oy + op["y"] * sy, sx, sy)
        elif kind == "fill":
            for sub in op["path"]:
                if len(sub) >= 3:
                    draw.polygon([pt(p) for p in sub], fill=tuple(op["color"]))
        elif kind == "stroke":
            width = max(1, round(op["width"] * S * sx))
            for sub in op["path"]:
                if len(sub) >= 2:
                    draw.line([pt(p) for p in sub], fill=tuple(op["color"]), width=width, joint="curve")
        elif kind == "text":
            size = float(re.search(r"([\d.]+)px", op["font"]).group(1))
            anchor = "mm" if op["align"] == "center" and op["baseline"] == "middle" else "ls"
            draw.text(pt((op["x"], op["y"])), op["text"], fill=tuple(op["color"]), font=font(size * sx), anchor=anchor)


for scene in scenes:
    panels = scene["panels"]
    w, h = panels[0]["w"], panels[0]["h"]
    head, gap = 22, 10
    cols = 2
    rows = (len(panels) + 1) // 2
    sheet = Image.new("RGB", ((w * cols + gap * (cols + 1)) * S, (30 + rows * (h + head + gap) + gap) * S), (238, 241, 238))
    d = ImageDraw.Draw(sheet, "RGBA")
    d.text((gap * S, 8 * S), scene["title"], fill=(22, 32, 27), font=font(14))
    for k, panel in enumerate(panels):
        col, row = k % 2, k // 2
        x0 = gap + col * (w + gap)
        y0 = 30 + row * (h + head + gap)
        d.text((x0 * S, (y0 + 3) * S), panel["header"], fill=(22, 32, 27), font=font(12))
        tile = Image.new("RGBA", (w * S, h * S), (0, 0, 0, 255))
        replay(ImageDraw.Draw(tile, "RGBA"), panel["ops"])
        sheet.paste(tile.convert("RGB"), (x0 * S, (y0 + head) * S))
    path = os.path.join(out_dir, f"{scene['name']}.png")
    sheet.save(path)
    print(path)

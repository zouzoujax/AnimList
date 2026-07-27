"""Generate build/icon.ico + icon.png from the app's in-UI logo mark."""
import os
from PIL import Image, ImageDraw

OUT = r"C:\Users\willi\Documents\dev\animelist\build"
S = 1024
A = (0x7C, 0x5C, 0xFF)   # accent violet
B = (0x22, 0xD3, 0xEE)   # accent cyan
INK = (0x07, 0x08, 0x0F)

os.makedirs(OUT, exist_ok=True)

# Diagonal gradient, built small then upscaled (no numpy needed).
g = Image.new("RGB", (64, 64))
gp = g.load()
for y in range(64):
    for x in range(64):
        # Biased so the violet end holds most of the tile instead of washing
        # out to flat blue across the middle.
        t = ((x + y) / 126) ** 1.7
        gp[x, y] = tuple(round(A[i] + (B[i] - A[i]) * t) for i in range(3))
tile = g.resize((S, S), Image.BICUBIC).convert("RGBA")

# Squircle mask — Windows 11 app tiles sit around a 22% corner radius.
mask = Image.new("L", (S, S), 0)
ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.225), fill=255)

icon = Image.new("RGBA", (S, S), (0, 0, 0, 0))
icon.paste(tile, (0, 0), mask)

# The mark: two angled bars, same geometry as the <Logo/> SVG (32-unit viewBox).
k = S / 32
glyph = Image.new("RGBA", (S, S), (0, 0, 0, 0))
gd = ImageDraw.Draw(glyph)
gd.polygon([(11 * k, 9.0 * k), (11 * k, 23.0 * k), (16.6 * k, 19.55 * k), (16.6 * k, 12.45 * k)],
           fill=INK + (255,))
gd.polygon([(18.6 * k, 12.6 * k), (18.6 * k, 23.4 * k), (23.4 * k, 20.45 * k), (23.4 * k, 15.55 * k)],
           fill=(255, 255, 255, 108))
icon = Image.alpha_composite(icon, glyph)

icon.save(os.path.join(OUT, "icon.png"))
icon.save(
    os.path.join(OUT, "icon.ico"),
    sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
)
print("wrote", os.path.join(OUT, "icon.ico"), "and icon.png")

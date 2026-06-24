from PIL import Image, ImageDraw, ImageFilter

SZ = 1024
# ---- background: vertical gradient (dark "space") + soft glow ----
top, bot = (33, 41, 75), (11, 13, 21)      # #21294b -> #0b0d15
bg = Image.new("RGB", (SZ, SZ))
bd = ImageDraw.Draw(bg)
for y in range(SZ):
    t = (y / (SZ - 1)) ** 0.9
    bd.line([(0, y), (SZ, y)], fill=tuple(round(top[i] + (bot[i] - top[i]) * t) for i in range(3)))
base = bg.convert("RGBA")

# warm-cool glow behind the cluster
glow = Image.new("RGBA", (SZ, SZ), (0, 0, 0, 0))
ImageDraw.Draw(glow).ellipse([SZ*0.16, SZ*0.18, SZ*0.84, SZ*0.86], fill=(110, 110, 190, 95))
base.alpha_composite(glow.filter(ImageFilter.GaussianBlur(120)))

S, R, G = 300, 66, 24
bx_l = (SZ - (2*S + G)) // 2          # bottom-left blue
bx_r = bx_l + S + G                   # bottom-right blue
by = 560
tx = (SZ - S) // 2                    # top-center gold (landed on the stack)
ty = by - S - G

# soft drop shadows under the tiles (depth)
shadow = Image.new("RGBA", (SZ, SZ), (0, 0, 0, 0))
sd = ImageDraw.Draw(shadow)
for (x, y) in [(bx_l, by), (bx_r, by), (tx, ty)]:
    sd.rounded_rectangle([x, y + 20, x + S, y + S + 20], radius=R, fill=(0, 0, 0, 160))
base.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(24)))

# tiles (match the in-game look: flat fill + top sheen; gold target has a white diamond)
tiles = Image.new("RGBA", (SZ, SZ), (0, 0, 0, 0))
detail = Image.new("RGBA", (SZ, SZ), (0, 0, 0, 0))   # gloss + diamond blend OVER opaque tiles
td = ImageDraw.Draw(tiles)
dt = ImageDraw.Draw(detail)
def tile(x, y, color, target=False):
    td.rounded_rectangle([x, y, x + S, y + S], radius=R, fill=color)            # opaque fill
    sx, sy = x + S*0.12, y + S*0.10
    dt.rounded_rectangle([sx, sy, sx + S*0.76, sy + S*0.28], radius=int(S*0.14), fill=(255, 255, 255, 32))  # subtle gloss
    if target:
        cx, cy, d = x + S/2, y + S/2, S*0.17
        dt.polygon([(cx, cy - d), (cx + d, cy), (cx, cy + d), (cx - d, cy)], fill=(255, 255, 255, 240))
tile(bx_l, by, (91, 108, 255, 255))
tile(bx_r, by, (91, 108, 255, 255))
tile(tx, ty, (255, 194, 74, 255), target=True)
base.alpha_composite(tiles)
base.alpha_composite(detail)

out = "/tmp/moraine_icon.png"
base.convert("RGB").save(out)   # RGB = no alpha channel (App Store requirement)
print("saved", out)

from PIL import Image, ImageDraw, ImageFilter
SZ = 1024
# richer dark background: vertical gradient (brighter top)
top, bot = (38, 47, 86), (10, 12, 20)
bg = Image.new("RGB", (SZ, SZ)); bd = ImageDraw.Draw(bg)
for y in range(SZ):
    t = (y / (SZ - 1)) ** 0.85
    bd.line([(0, y), (SZ, y)], fill=tuple(round(top[i] + (bot[i]-top[i])*t) for i in range(3)))
base = bg.convert("RGBA")

S, R, G = 318, 72, 26
bx_l = (SZ - (2*S + G)) // 2
bx_r = bx_l + S + G
by = 560
tx = (SZ - S) // 2
ty = by - S - G

def glow(cx, cy, rx, ry, color, blur):
    g = Image.new("RGBA", (SZ, SZ), (0,0,0,0))
    ImageDraw.Draw(g).ellipse([cx-rx, cy-ry, cx+rx, cy+ry], fill=color)
    return g.filter(ImageFilter.GaussianBlur(blur))

# luminous halos: warm gold behind the target, cool blue behind the blocks
base.alpha_composite(glow(SZ/2, by + S/2, S*1.45, S*0.85, (95, 115, 255, 95), 105))
base.alpha_composite(glow(tx + S/2, ty + S/2, S*0.95, S*0.95, (255, 180, 70, 130), 85))

# drop shadows for depth/separation
shadow = Image.new("RGBA", (SZ, SZ), (0,0,0,0)); sd = ImageDraw.Draw(shadow)
for (x, y) in [(bx_l, by), (bx_r, by), (tx, ty)]:
    sd.rounded_rectangle([x, y+26, x+S, y+S+26], radius=R, fill=(0,0,0,175))
base.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(30)))

# gradient-filled rounded tiles (3D: lighter top -> darker bottom)
def grad_tile(x, y, c_top, c_bot):
    g = Image.new("RGB", (S, S)); gd = ImageDraw.Draw(g)
    for i in range(S):
        t = i / (S - 1)
        gd.line([(0, i), (S, i)], fill=tuple(round(c_top[k] + (c_bot[k]-c_top[k])*t) for k in range(3)))
    m = Image.new("L", (S, S), 0); ImageDraw.Draw(m).rounded_rectangle([0, 0, S-1, S-1], radius=R, fill=255)
    base.paste(g, (x, y), m)
grad_tile(bx_l, by, (112, 127, 255), (66, 78, 226))
grad_tile(bx_r, by, (112, 127, 255), (66, 78, 226))
grad_tile(tx, ty, (255, 214, 120), (245, 167, 52))

# detail layer (blends over opaque tiles): glossy top highlight + white diamond
detail = Image.new("RGBA", (SZ, SZ), (0,0,0,0)); dt = ImageDraw.Draw(detail)
def detail_for(x, y, target=False):
    sx, sy = x + S*0.12, y + S*0.09
    dt.rounded_rectangle([sx, sy, sx + S*0.76, sy + S*0.26], radius=int(S*0.13), fill=(255,255,255,60))
    if target:
        cx, cy, d = x + S/2, y + S/2, S*0.16
        dt.polygon([(cx, cy-d), (cx+d, cy), (cx, cy+d), (cx-d, cy)], fill=(255,255,255,250))
detail_for(bx_l, by); detail_for(bx_r, by); detail_for(tx, ty, target=True)
base.alpha_composite(detail)

base.convert("RGB").save("/tmp/moraine_icon2.png")
print("saved /tmp/moraine_icon2.png")

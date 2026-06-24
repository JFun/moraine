from PIL import Image, ImageDraw, ImageFilter
SZ = 1024
# background = the in-app gradient: #232a49 -> #141829 (40%) -> #0c0e17 (continuity icon<->app)
stops = [(0.0,(35,42,73)), (0.40,(20,24,41)), (1.0,(12,14,23))]
def lerp(a,b,u): return tuple(round(a[i]+(b[i]-a[i])*u) for i in range(3))
bg = Image.new("RGB",(SZ,SZ)); bd = ImageDraw.Draw(bg)
for y in range(SZ):
    t = y/(SZ-1); col = stops[-1][1]
    for j in range(len(stops)-1):
        t0,c0 = stops[j]; t1,c1 = stops[j+1]
        if t <= t1: u = (t-t0)/(t1-t0) if t1>t0 else 0; col = lerp(c0,c1,max(0,min(1,u))); break
    bd.line([(0,y),(SZ,y)], fill=col)
base = bg.convert("RGBA")

S, R, G = 318, 72, 26
bx_l = (SZ-(2*S+G))//2; bx_r = bx_l+S+G
by = 525; tx = (SZ-S)//2; ty = by-S-G
def glow(cx,cy,rx,ry,color,blur):
    g = Image.new("RGBA",(SZ,SZ),(0,0,0,0)); ImageDraw.Draw(g).ellipse([cx-rx,cy-ry,cx+rx,cy+ry],fill=color)
    base.alpha_composite(g.filter(ImageFilter.GaussianBlur(blur)))
glow(SZ/2, by+S/2, S*1.45, S*0.85, (95,115,255,90), 105)
glow(tx+S/2, ty+S/2, S*0.95, S*0.95, (255,180,70,135), 85)
sh = Image.new("RGBA",(SZ,SZ),(0,0,0,0)); sd = ImageDraw.Draw(sh)
for (x,y) in [(bx_l,by),(bx_r,by),(tx,ty)]:
    sd.rounded_rectangle([x,y+26,x+S,y+S+26],radius=R,fill=(0,0,0,175))
base.alpha_composite(sh.filter(ImageFilter.GaussianBlur(30)))
def gt(x,y,ct,cb):
    g=Image.new("RGB",(S,S)); gd=ImageDraw.Draw(g)
    for i in range(S):
        t=i/(S-1); gd.line([(0,i),(S,i)],fill=tuple(round(ct[k]+(cb[k]-ct[k])*t) for k in range(3)))
    m=Image.new("L",(S,S),0); ImageDraw.Draw(m).rounded_rectangle([0,0,S-1,S-1],radius=R,fill=255); base.paste(g,(x,y),m)
gt(bx_l,by,(112,127,255),(66,78,226)); gt(bx_r,by,(112,127,255),(66,78,226)); gt(tx,ty,(255,214,120),(245,167,52))
det=Image.new("RGBA",(SZ,SZ),(0,0,0,0)); dt=ImageDraw.Draw(det)
def dd(x,y,target=False):
    sx,sy=x+S*0.12,y+S*0.09
    dt.rounded_rectangle([sx,sy,sx+S*0.76,sy+S*0.26],radius=int(S*0.13),fill=(255,255,255,68))
    if target:
        cx,cy,d=x+S/2,y+S/2,S*0.16; dt.polygon([(cx,cy-d),(cx+d,cy),(cx,cy+d),(cx-d,cy)],fill=(255,255,255,250))
dd(bx_l,by); dd(bx_r,by); dd(tx,ty,target=True)
base.alpha_composite(det)
base.convert("RGB").save("/tmp/moraine_icon4.png"); print("saved")

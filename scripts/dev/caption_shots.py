import sys, glob, os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

def load_font(size):
    try:
        f = ImageFont.truetype("/System/Library/Fonts/SFNS.ttf", size)
        try: f.set_variation_by_name("Bold")
        except Exception:
            try: f.set_variation_by_axes([700])
            except Exception: pass
        return f
    except Exception:
        return ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", size)

CAPTIONS = {
  "01-play": "Swipe to set gravity",
  "02-perfect": "Solve it in the fewest moves",
  "03-levels": "30 hand-crafted levels",
  "04-challenge": "Clear every line",
  "05-howto": "Easy to learn, hard to master",
}
def wrap(d, text, font, maxw):
    out, cur = [], ""
    for w in text.split():
        t=(cur+" "+w).strip()
        if d.textlength(t, font=font) <= maxw: cur=t
        else: out.append(cur); cur=w
    if cur: out.append(cur)
    return out
def grad_bg(W,H):
    st=[(0.0,(35,42,73)),(0.45,(20,24,41)),(1.0,(12,14,23))]
    def lp(a,b,u): return tuple(round(a[i]+(b[i]-a[i])*u) for i in range(3))
    im=Image.new("RGB",(W,H)); d=ImageDraw.Draw(im)
    for y in range(H):
        t=y/(H-1); c=st[-1][1]
        for j in range(len(st)-1):
            t0,c0=st[j]; t1,c1=st[j+1]
            if t<=t1: c=lp(c0,c1,max(0,min(1,(t-t0)/(t1-t0) if t1>t0 else 0))); break
        d.line([(0,y),(W,y)],fill=c)
    return im

indir=sys.argv[1]; outdir=os.path.join(indir,"captioned"); os.makedirs(outdir,exist_ok=True)
for path in sorted(glob.glob(os.path.join(indir,"*.png"))):
    name=os.path.splitext(os.path.basename(path))[0]
    if name not in CAPTIONS: continue
    base=Image.open(path).convert("RGB"); W,H=base.size
    cv=grad_bg(W,H).convert("RGBA")
    sw=round(W*0.80); sh=round(H*0.80); shot=base.resize((sw,sh)); rad=round(sw*0.05)
    m=Image.new("L",(sw,sh),0); ImageDraw.Draw(m).rounded_rectangle([0,0,sw-1,sh-1],radius=rad,fill=255)
    bm=round(H*0.035); sx=(W-sw)//2; sy=H-bm-sh
    sd=Image.new("RGBA",(W,H),(0,0,0,0))
    ImageDraw.Draw(sd).rounded_rectangle([sx,sy+round(H*0.006),sx+sw,sy+sh+round(H*0.006)],radius=rad,fill=(0,0,0,150))
    cv.alpha_composite(sd.filter(ImageFilter.GaussianBlur(round(W*0.02))))
    cv.paste(shot,(sx,sy),m)
    ImageDraw.Draw(cv).rounded_rectangle([sx,sy,sx+sw,sy+sh],radius=rad,outline=(255,255,255,38),width=2)
    d=ImageDraw.Draw(cv); fs=round(W*0.060); font=load_font(fs)
    lines=wrap(d,CAPTIONS[name],font,W*0.86); lh=fs*1.2; cyc=sy/2; start=cyc-(len(lines)-1)*lh/2
    for i,ln in enumerate(lines):
        d.text((W/2,start+i*lh),ln,font=font,fill=(255,255,255,255),anchor="mm")
    cv.convert("RGB").save(os.path.join(outdir,name+".png")); print("  ",name)
print("done",outdir)

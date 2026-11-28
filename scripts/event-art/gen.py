import base64, math
D=open('defs.svg').read()
def svg(w,h,body): return f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="{w}" height="{h}" viewBox="0 0 {w} {h}">{D}{body}</svg>'
def platform(cx,cy,rx,ry):
    return (f'<ellipse cx="{cx}" cy="{cy+10}" rx="{rx}" ry="{ry}" fill="#2f8a52"/>'
            f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="url(#rPlat)"/>'
            f'<ellipse cx="{cx-rx*.25}" cy="{cy-ry*.35}" rx="{rx*.45}" ry="{ry*.25}" fill="#fff" opacity=".18"/>')
def balloon(cx,cy,r,g):
    return (f'<path d="M{cx} {cy+r} q -4 14 3 26" stroke="#9fb3a9" stroke-width="1.5" fill="none"/>'
            f'<ellipse cx="{cx}" cy="{cy}" rx="{r}" ry="{r*1.12}" fill="url(#{g})"/>'
            f'<path d="M{cx-4} {cy+r*1.1} l4 6 l4 -6z" fill="#0b6a37" opacity=".5"/>'
            f'<ellipse cx="{cx-r*.35}" cy="{cy-r*.45}" rx="{r*.25}" ry="{r*.35}" fill="#fff" opacity=".55"/>')
def bush(cx,cy,s):
    return ''.join(f'<circle cx="{cx+dx*s}" cy="{cy+dy*s}" r="{rr*s}" fill="url(#rGreen)"/>' for dx,dy,rr in [(-14,4,14),(10,2,16),(-2,-10,15)])
def confetti(pts):
    cols=['#1fa35a','#f2c14e','#6fd39b','#0e7a40']
    return ''.join(f'<rect x="{x}" y="{y}" width="7" height="12" rx="2" fill="{cols[i%4]}" transform="rotate({(i*47)%90-45} {x} {y})"/>' for i,(x,y) in enumerate(pts))
def stage(x,y,w):
    # x,y = top-left of stage floor; w width
    h=w*.55
    s=''
    # backdrop
    s+=f'<rect x="{x+w*.08}" y="{y-h}" width="{w*.84}" height="{h}" rx="14" fill="url(#gWhite)" filter="url(#sh)"/>'
    s+=f'<rect x="{x+w*.08}" y="{y-h}" width="{w*.84}" height="{h*.16}" rx="14" fill="url(#gGreen)"/>'
    s+=f'<rect x="{x+w*.08}" y="{y-h+h*.1}" width="{w*.84}" height="{h*.06}" fill="url(#gGreen)"/>'
    # string lights
    for i in range(9):
        lx=x+w*.12+i*(w*.76/8); ly=y-h+h*.25+8*math.sin(i/8*math.pi)
        s+=f'<circle cx="{lx}" cy="{ly}" r="5" fill="url(#rGold)"/>'
    s+=f'<path d="M{x+w*.12} {y-h+h*.25} Q {x+w*.5} {y-h+h*.25+16} {x+w*.88} {y-h+h*.25}" stroke="#5f6f68" stroke-width="1.5" fill="none"/>'
    # balloon arch
    pts=[(.14,.62),(.17,.45),(.24,.33),(.33,.27),(.67,.27),(.76,.33),(.83,.45),(.86,.62)]
    for i,(px,py) in enumerate(pts):
        s+=balloon(x+w*px, y-h+h*py, w*.055, ['rGreen','rWhite','rGold'][i%3])
    # mic stand
    mx=x+w*.5
    s+=f'<rect x="{mx-2}" y="{y-h*.55}" width="4" height="{h*.55}" fill="url(#gGrey)"/>'
    s+=f'<ellipse cx="{mx}" cy="{y}" rx="16" ry="5" fill="#46524d"/>'
    s+=f'<rect x="{mx-7}" y="{y-h*.62}" width="14" height="22" rx="7" fill="#2b3531"/>'
    s+=f'<rect x="{mx-4}" y="{y-h*.6}" width="4" height="10" rx="2" fill="#8a9893"/>'
    # stage floor block
    s+=f'<path d="M{x} {y} h{w} l-{w*.04} {w*.06} h-{w*.92} z" fill="url(#gGreen)"/>'
    s+=f'<rect x="{x+w*.04}" y="{y+w*.06}" width="{w*.92}" height="{w*.1}" rx="6" fill="url(#gGreenSide)"/>'
    s+=f'<rect x="{x+w*.04}" y="{y+w*.075}" width="{w*.92}" height="{w*.018}" fill="#fff" opacity=".35"/>'
    return s
def spotlight(x,y,flip=1):
    s=f'<g transform="translate({x} {y}) scale({flip} 1)">'
    s+='<path d="M8 -6 L120 -120 L150 -95 Z" fill="url(#gBeam)" opacity=".7" transform="rotate(10)"/>'
    s+='<rect x="-6" y="0" width="12" height="38" rx="4" fill="url(#gGrey)"/>'
    s+='<rect x="-18" y="-22" width="36" height="28" rx="9" fill="#2e3a35" transform="rotate(-35)"/>'
    s+='<ellipse cx="9" cy="-14" rx="9" ry="7" fill="url(#rGold)" transform="rotate(-35)"/>'
    s+='</g>'
    return s
def check(cx,cy,r):
    return (f'<circle cx="{cx}" cy="{cy+4}" r="{r}" fill="#0b6a37"/><circle cx="{cx}" cy="{cy}" r="{r}" fill="url(#rGreen)" filter="url(#shs)"/>'
            f'<path d="M{cx-r*.45} {cy} l{r*.3} {r*.32} l{r*.6} -{r*.62}" stroke="#fff" stroke-width="{r*.22}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>')
def person(cx,cy,r):
    return (f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="url(#rGreen)"/>'
            f'<circle cx="{cx}" cy="{cy-r*.22}" r="{r*.26}" fill="#eafff2"/>'
            f'<path d="M{cx-r*.48} {cy+r*.55} q {r*.48} -{r*.62} {r*.96} 0" fill="#eafff2"/>')
def calendar(x,y,w,h,hl=(3,2)):
    s=f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="18" fill="url(#gWhite)" filter="url(#sh)"/>'
    s+=f'<path d="M{x} {y+18} a18 18 0 0 1 18 -18 h{w-36} a18 18 0 0 1 18 18 v{h*.2-18} h-{w} z" fill="url(#gGreen)"/>'
    for i in range(2):
        rx=x+w*(.3+.4*i)
        s+=f'<rect x="{rx-5}" y="{y-12}" width="10" height="26" rx="5" fill="url(#gGrey)"/>'
    cw=(w-36)/5; ch=(h*.8-30)/4
    for r in range(4):
        for c in range(5):
            cx=x+18+c*cw; cy=y+h*.2+12+r*ch
            on=(c,r)==hl
            s+=f'<rect x="{cx+3}" y="{cy+3}" width="{cw-6}" height="{ch-6}" rx="6" fill="{"url(#gGreen)" if on else "#dcebe2"}"/>'
    return s
# ---- A: panggung event (Event / Kegiatan)
A=platform(320,365,260,40)+bush(95,345,1)+bush(545,345,1.1)+stage(140,330,360)+spotlight(120,340)+spotlight(520,340,-1)+confetti([(210,60),(260,40),(380,52),(430,70),(330,30),(470,40),(170,90)])
open('event-kegiatan.svg','w').write(svg(640,440,A))
# ---- B: booking (kalender + tiket + centang)
tk=('<g transform="translate(300 215) rotate(-12)" filter="url(#sh)">'
    '<path d="M0 0 h240 v34 a18 18 0 0 0 0 36 v34 h-240 v-34 a18 18 0 0 0 0 -36 z" fill="url(#gGold)"/>'
    '<line x1="178" y1="10" x2="178" y2="94" stroke="#fff" stroke-width="3" stroke-dasharray="7 6" opacity=".8"/>'
    '<rect x="22" y="22" width="120" height="14" rx="7" fill="#fff" opacity=".85"/><rect x="22" y="46" width="90" height="11" rx="5.5" fill="#fff" opacity=".6"/>'
    '<rect x="22" y="66" width="60" height="11" rx="5.5" fill="#fff" opacity=".6"/>'
    '<path d="M208 38 l6 12 13 2 -9 9 2 13 -12 -6 -12 6 2 -13 -9 -9 13 -2z" fill="#fff"/></g>')
B=platform(320,375,250,38)+calendar(110,70,300,270)+tk+check(500,330,42)+bush(90,355,.9)
open('event-booking.svg','w').write(svg(640,440,B))
# ---- C: jadwal & tim (kalender + jam + orang)
clock=('<g filter="url(#sh)"><circle cx="200" cy="230" r="98" fill="url(#gGreen)"/><circle cx="200" cy="230" r="80" fill="url(#gWhite)"/>'
       + ''.join(f'<circle cx="{200+66*math.cos(a*math.pi/6)}" cy="{230+66*math.sin(a*math.pi/6)}" r="5" fill="#1a8f4d"/>' for a in range(12))
       + '<path d="M200 230 L200 178" stroke="#0e5c33" stroke-width="10" stroke-linecap="round"/><path d="M200 230 L238 252" stroke="#1fa35a" stroke-width="8" stroke-linecap="round"/>'
       '<circle cx="200" cy="230" r="10" fill="url(#rGold)"/><ellipse cx="168" cy="186" rx="30" ry="14" fill="#fff" opacity=".5"/></g>')
team='<g filter="url(#shs)">'+person(470,300,34)+person(530,300,34)+person(500,252,34)+'</g>'
C=platform(330,375,260,38)+calendar(290,60,250,220,(1,1))+clock+team+confetti([(120,80),(560,110),(90,150)])
open('event-jadwal.svg','w').write(svg(640,440,C))
# ---- D: vendor (stan / tenda + clipboard + kardus)
stripes=''.join(f'<path d="M{150+i*42} 110 h42 v46 a21 18 0 0 1 -42 0 z" fill="{"url(#gGreen)" if i%2==0 else "url(#gWhite)"}"/>' for i in range(8))
booth=(f'<g filter="url(#sh)"><rect x="160" y="150" width="316" height="190" rx="10" fill="url(#gWhite)"/>'
       f'<rect x="186" y="186" width="264" height="70" rx="8" fill="url(#gMint)"/>'
       f'<rect x="150" y="250" width="336" height="90" rx="10" fill="url(#gGreen)"/>'
       f'<rect x="150" y="262" width="336" height="8" fill="#fff" opacity=".3"/>'
       f'<rect x="140" y="92" width="356" height="24" rx="10" fill="url(#gGreenSide)"/>{stripes}</g>')
clip=('<g transform="translate(430 160) rotate(8)" filter="url(#sh)"><rect x="0" y="0" width="140" height="180" rx="14" fill="url(#gGreen)"/>'
      '<rect x="12" y="22" width="116" height="148" rx="8" fill="url(#gWhite)"/><rect x="44" y="-10" width="52" height="24" rx="8" fill="url(#gGrey)"/>'
      + ''.join(f'<path d="M26 {58+i*40} l8 9 l16 -18" stroke="#1fa35a" stroke-width="7" fill="none" stroke-linecap="round"/><rect x="60" y="{52+i*40}" width="54" height="9" rx="4.5" fill="#c9d8cf"/>' for i in range(3))
      + '</g>')
box=('<g filter="url(#shs)"><rect x="96" y="268" width="110" height="88" rx="8" fill="url(#gKraft)"/><rect x="140" y="268" width="22" height="30" fill="#f4dcbc"/>'
     '<rect x="96" y="268" width="110" height="14" rx="6" fill="#d9a56b"/></g>')
Dd=platform(320,375,270,40)+booth+clip+box+bush(560,350,.9)
open('event-vendor.svg','w').write(svg(640,440,Dd))
# ---- E: maskot + panggung (Beranda Event)
rb=base64.b64encode(open('robot.png','rb').read()).decode()
gift=('<g filter="url(#shs)"><rect x="276" y="262" width="74" height="62" rx="8" fill="url(#gGreen)"/><rect x="270" y="252" width="86" height="20" rx="6" fill="url(#gGreenSide)"/>'
      '<rect x="306" y="252" width="14" height="72" fill="url(#gGold)"/><path d="M313 252 q-22 -22 -30 -6 q8 10 30 6 q22 -22 30 -6 q-8 10 -30 6z" fill="url(#gGold)"/></g>')
bunch=''.join(balloon(x,y,24,g) for x,y,g in [(296,150,'rGreen'),(330,128,'rWhite'),(300,104,'rGold'),(334,82,'rGreen'),(302,60,'rWhite')])
strings=''.join(f'<path d="M{x} {y+28} Q {x+8} {200} 313 254" stroke="#8aa197" stroke-width="1.6" fill="none"/>' for x,y in [(296,150),(330,128),(300,104),(334,82),(302,60)])
E=(platform(330,345,290,42)+bush(585,330,.9)+stage(372,312,250)+spotlight(600,322,-1)
   + confetti([(400,40),(460,28),(540,46),(500,64),(580,80)])
   + f'<image x="18" y="0" width="288" height="326" xlink:href="data:image/png;base64,{rb}"/>'
   + strings + bunch + gift)
open('event-maskot.svg','w').write(svg(640,420,E))
print('ok')

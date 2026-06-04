# 从 room-bg.png 扣右侧大盆绿植 → plant-cutout.png
from PIL import Image, ImageDraw, ImageFilter

SRC = r'D:\AI music radio\apps\pwa\public\scene\room-bg.png'
DST = r'D:\AI music radio\apps\pwa\public\preview\plant-cutout.png'

img = Image.open(SRC).convert('RGBA')
W, H = img.size

# 右盆植物 bbox: 85-98% 宽 × 53-90% 高
left = int(W * 0.83); right = int(W * 0.99)
top = int(H * 0.5);   bottom = int(H * 0.95)
crop = img.crop((left, top, right, bottom))
cw, ch = crop.size

# 软椭圆 alpha 羽化
alpha = Image.new('L', (cw, ch), 0)
ad = ImageDraw.Draw(alpha)
ad.ellipse([cw*0.02, ch*0.02, cw*0.98, ch*0.98], fill=255)
alpha = alpha.filter(ImageFilter.GaussianBlur(radius=cw*0.06))
crop.putalpha(alpha)
crop.save(DST)
print(f'saved {DST} {cw}x{ch}')

# 从 room-bg.png 扣杯子区域 → mug-cutout.png (带 alpha 羽化)
from PIL import Image, ImageDraw, ImageFilter

SRC = r'D:\AI music radio\apps\pwa\public\scene\room-bg.png'
DST = r'D:\AI music radio\apps\pwa\public\preview\mug-cutout.png'

img = Image.open(SRC).convert('RGBA')
W, H = img.size
print(f'src {W}x{H}')

# 杯子 bbox: 看网格定位, 12-22% 宽 × 75-92% 高
left = int(W * 0.12); right = int(W * 0.22)
top = int(H * 0.75);  bottom = int(H * 0.92)
crop = img.crop((left, top, right, bottom))
cw, ch = crop.size
print(f'crop {cw}x{ch}')

# 椭圆 + 羽化 alpha 让边缘自然过渡
alpha = Image.new('L', (cw, ch), 0)
ad = ImageDraw.Draw(alpha)
ad.ellipse([cw*0.05, ch*0.05, cw*0.95, ch*0.95], fill=255)
alpha = alpha.filter(ImageFilter.GaussianBlur(radius=cw*0.05))
crop.putalpha(alpha)
crop.save(DST)
print(f'saved {DST}')

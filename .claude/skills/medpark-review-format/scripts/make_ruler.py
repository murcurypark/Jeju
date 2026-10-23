#!/usr/bin/env python3
"""문서 페이지 이미지에 y/x 눈금자를 그려 마커 좌표(px)를 읽기 위한 보조 이미지를 만든다.

사용: python3 make_ruler.py page.png outdir [parts=3]
  - outdir/page.png            : PNG 로 변환한 원본 (spec 의 img 로 사용)
  - outdir/page_ruler0..N.png  : 2배 확대 + 50px 간격 가로선(y 라벨) / 100px 세로선(x 라벨)
눈금자 이미지를 Read 로 열어, 강조할 문구의 (x, y, w, h) 를 원본 픽셀 기준으로 읽는다.
각 조각은 원본 y 를 parts 등분한 구간이며 확대율이 2배이므로 원본 좌표 = 화면 좌표 / 2 + 조각 시작 y.
"""
import sys, os
from PIL import Image, ImageDraw

src, out = sys.argv[1], sys.argv[2]
parts = int(sys.argv[3]) if len(sys.argv) > 3 else 3
os.makedirs(out, exist_ok=True)
stem = os.path.splitext(os.path.basename(src))[0]
im = Image.open(src).convert("RGB")
im.save(os.path.join(out, stem + ".png"))
r = im.resize((im.width * 2, im.height * 2), Image.LANCZOS)
d = ImageDraw.Draw(r)
for y in range(0, im.height, 50):
    d.line([(0, y * 2), (r.width, y * 2)], fill=(255, 0, 255), width=1)
    d.text((2, y * 2 + 1), str(y), fill=(255, 0, 255))
    d.text((r.width // 2 - 10, y * 2 + 1), str(y), fill=(255, 0, 255))
for x in range(0, im.width, 100):
    d.line([(x * 2, 0), (x * 2, r.height)], fill=(0, 0, 255), width=1)
    d.text((x * 2 + 2, 2), str(x), fill=(0, 0, 255))
h = r.height // parts
for i in range(parts):
    r.crop((0, i * h, r.width, (i + 1) * h + 20)).save(os.path.join(out, f"{stem}_ruler{i}.png"))
    print(f"{stem}_ruler{i}.png : 원본 y {i * h // 2} ~ {(i + 1) * h // 2 + 10}")
print("원본 크기:", im.width, "x", im.height)

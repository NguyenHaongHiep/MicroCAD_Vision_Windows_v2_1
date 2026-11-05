import argparse
import sys
from pathlib import Path
import cv2
EXTS={'.png','.jpg','.jpeg','.webp','.bmp'}
def validate(root):
 errors=[]
 for split in ('train','val','test'):
  images=root/'images'/split; labels=root/'labels'/split
  for image in sorted(p for p in images.glob('*') if p.suffix.lower() in EXTS):
   if cv2.imread(str(image)) is None:errors.append(f'{image}: ảnh lỗi');continue
   label=labels/f'{image.stem}.txt'
   if not label.exists():errors.append(f'{image}: thiếu label');continue
   for n,line in enumerate(label.read_text(encoding='utf-8').splitlines(),1):
    try:parts=line.split();cls=int(parts[0]);coords=[float(x) for x in parts[1:]]
    except (ValueError,IndexError):errors.append(f'{label}:{n}: cú pháp lỗi');continue
    if cls!=0 or len(coords)<6 or len(coords)%2:errors.append(f'{label}:{n}: cần class 0, polygon >=3 điểm')
    elif any(x<0 or x>1 for x in coords):errors.append(f'{label}:{n}: tọa độ ngoài [0,1]')
  for label in labels.glob('*.txt'):
   if not any((images/(label.stem+ext)).exists() for ext in EXTS):errors.append(f'{label}: label mồ côi')
 return errors
if __name__=='__main__':
 if hasattr(sys.stdout,'reconfigure'):sys.stdout.reconfigure(encoding='utf-8',errors='replace')
 p=argparse.ArgumentParser();p.add_argument('--dataset',type=Path,default=Path(__file__).parents[1]/'dataset');a=p.parse_args();fail=validate(a.dataset);print('\n'.join(fail) if fail else 'Dataset hợp lệ');raise SystemExit(bool(fail))

import argparse
from pathlib import Path
import cv2,numpy as np
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('image',type=Path);p.add_argument('label',type=Path);p.add_argument('--output',type=Path,required=True);a=p.parse_args();image=cv2.imread(str(a.image))
 if image is None:raise SystemExit('Không đọc được ảnh')
 h,w=image.shape[:2]
 for line in a.label.read_text(encoding='utf-8').splitlines():
  v=[float(x) for x in line.split()[1:]];pts=np.array([[v[i]*w,v[i+1]*h] for i in range(0,len(v),2)],np.int32);overlay=image.copy();cv2.fillPoly(overlay,[pts],(50,220,80));image=cv2.addWeighted(overlay,.25,image,.75,0);cv2.polylines(image,[pts],True,(40,255,120),2)
 a.output.parent.mkdir(parents=True,exist_ok=True);cv2.imwrite(str(a.output),image);print(a.output)

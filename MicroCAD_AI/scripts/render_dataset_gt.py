"""Render YOLO segmentation ground truth without changing source images/labels."""
from __future__ import annotations
import argparse
from pathlib import Path
import cv2
import numpy as np

EXTS={'.jpg','.jpeg','.png','.webp','.bmp'}
COLORS=[(70,220,70),(255,180,50),(80,180,255),(220,80,220)]

def polygons(label,w,h):
    output=[]
    for line in label.read_text(encoding='utf-8').splitlines():
        if not line.strip():continue
        values=line.split();coords=np.array([float(x) for x in values[1:]],dtype=float).reshape(-1,2)
        output.append(np.c_[coords[:,0]*w,coords[:,1]*h].round().astype(np.int32))
    return output

def main():
    p=argparse.ArgumentParser();p.add_argument('--dataset',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
    a.output.mkdir(parents=True,exist_ok=True)
    for split in ('train','val','test'):
        target=a.output/split;target.mkdir(parents=True,exist_ok=True);thumbs=[]
        for image_path in sorted(x for x in (a.dataset/'images'/split).iterdir() if x.suffix.lower() in EXTS):
            image=cv2.imread(str(image_path));h,w=image.shape[:2];overlay=image.copy();label=a.dataset/'labels'/split/f'{image_path.stem}.txt';items=polygons(label,w,h)
            for index,pts in enumerate(items):
                color=COLORS[index%len(COLORS)];cv2.fillPoly(overlay,[pts],color);cv2.polylines(image,[pts],True,color,2)
            image=cv2.addWeighted(overlay,.25,image,.75,0);cv2.rectangle(image,(0,0),(w,28),(15,15,15),-1);cv2.putText(image,f'{split} | {image_path.name} | holes={len(items)}',(7,19),cv2.FONT_HERSHEY_SIMPLEX,.43,(255,255,255),1,cv2.LINE_AA);cv2.imwrite(str(target/image_path.name),image)
            thumb=cv2.resize(image,(320,240),interpolation=cv2.INTER_AREA);thumbs.append(thumb)
        if thumbs:
            cols=3;rows=(len(thumbs)+cols-1)//cols;sheet=np.full((rows*240,cols*320,3),25,np.uint8)
            for i,thumb in enumerate(thumbs):sheet[(i//cols)*240:(i//cols+1)*240,(i%cols)*320:(i%cols+1)*320]=thumb
            cv2.imwrite(str(a.output/f'{split}_contact_sheet.jpg'),sheet)
if __name__=='__main__':main()

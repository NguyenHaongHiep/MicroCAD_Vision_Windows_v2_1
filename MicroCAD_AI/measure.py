"""YOLO-mask to robust original-pixel circle measurements."""
from __future__ import annotations
from dataclasses import asdict, dataclass
from pathlib import Path
import math, random
import cv2
import numpy as np

@dataclass
class Measurement:
    center_x: float; center_y: float; radius_px: float; diameter_px: float
    confidence: float; fit_error: float; angular_coverage: float; review_required: bool
    polygon: list[list[float]]
    def to_dict(self): return asdict(self)

def _three(a,b,c):
    ax,ay=a; bx,by=b; cx,cy=c
    d=2*(ax*(by-cy)+bx*(cy-ay)+cx*(ay-by))
    if abs(d)<1e-8:return None
    x=((ax*ax+ay*ay)*(by-cy)+(bx*bx+by*by)*(cy-ay)+(cx*cx+cy*cy)*(ay-by))/d
    y=((ax*ax+ay*ay)*(cx-bx)+(bx*bx+by*by)*(ax-cx)+(cx*cx+cy*cy)*(bx-ax))/d
    return np.array([x,y]),float(math.hypot(ax-x,ay-y))

def least_squares_circle(points):
    p=np.asarray(points,dtype=float)
    if len(p)<3:raise ValueError('Cần ít nhất 3 điểm')
    x,y,c=np.linalg.lstsq(np.c_[2*p[:,0],2*p[:,1],np.ones(len(p))],np.sum(p*p,axis=1),rcond=None)[0]
    r2=c+x*x+y*y
    if not np.isfinite(r2) or r2<=0:raise ValueError('Circle fit không hợp lệ')
    return np.array([x,y]),float(np.sqrt(r2))

def robust_circle_fit(points,iterations=500,threshold_px=None,seed=0):
    p=np.asarray(points,dtype=float)
    if len(p)<6:raise ValueError('Contour quá ngắn')
    threshold=threshold_px or max(1.25,max(np.ptp(p[:,0]),np.ptp(p[:,1]))*.015)
    rng=random.Random(seed); best=None
    for _ in range(iterations):
        model=_three(*p[rng.sample(range(len(p)),3)])
        if model is None:continue
        center,r=model
        inside=np.abs(np.linalg.norm(p-center,axis=1)-r)<=threshold
        if best is None or inside.sum()>best.sum():best=inside
    if best is None or best.sum()<max(6,int(len(p)*.25)):raise ValueError('RANSAC không ổn định')
    center,r=least_squares_circle(p[best]); residual=np.abs(np.linalg.norm(p-center,axis=1)-r)
    inside=residual<=max(threshold,np.quantile(residual,.7)*1.5); center,r=least_squares_circle(p[inside])
    residual=np.abs(np.linalg.norm(p[inside]-center,axis=1)-r)
    return center,r,float(np.sqrt(np.mean(residual**2))),p[inside]

def _coverage(points,center,bins=72):
    a=(np.arctan2(points[:,1]-center[1],points[:,0]-center[0])+2*np.pi)%(2*np.pi)
    return float(len(np.unique(np.floor(a/(2*np.pi)*bins).astype(int)))/bins)

def mask_to_measurement(mask,confidence,image_shape):
    h,w=image_shape; binary=(mask>0).astype(np.uint8)*255
    if binary.shape!=(h,w):binary=cv2.resize(binary,(w,h),interpolation=cv2.INTER_NEAREST)
    binary=cv2.morphologyEx(binary,cv2.MORPH_CLOSE,np.ones((3,3),np.uint8))
    contours,_=cv2.findContours(binary,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_NONE)
    if not contours:raise ValueError('Mask rỗng')
    contour=max(contours,key=cv2.contourArea)
    if cv2.contourArea(contour)<20 or len(contour)<12:raise ValueError('Mask quá nhỏ')
    center,r,error,inliers=robust_circle_fit(contour[:,0,:]); coverage=_coverage(inliers,center)
    edge=center[0]-r<2 or center[1]-r<2 or center[0]+r>w-2 or center[1]+r>h-2
    review=confidence<.45 or error/max(r,1e-6)>.08 or coverage<.55 or edge
    poly=cv2.approxPolyDP(contour,max(.5,cv2.arcLength(contour,True)*.002),True)[:,0,:].astype(float).tolist()
    return Measurement(float(center[0]),float(center[1]),float(r),float(2*r),float(confidence),error,coverage,bool(review),poly)

def deduplicate(items):
    kept=[]
    for x in sorted(items,key=lambda v:v.confidence,reverse=True):
        if any(math.hypot(x.center_x-k.center_x,x.center_y-k.center_y)<max(x.radius_px,k.radius_px)*.5 and abs(x.radius_px-k.radius_px)<max(x.radius_px,k.radius_px)*.35 for k in kept):continue
        kept.append(x)
    return sorted(kept,key=lambda v:(v.center_y,v.center_x))

class HoleSegmenter:
    def __init__(self,model_path,device=None):
        from ultralytics import YOLO
        self.path=Path(model_path).resolve()
        if not self.path.is_file():raise FileNotFoundError(f'Không tìm thấy model cục bộ: {self.path}')
        self.model=YOLO(str(self.path)); self.device=device
    def predict(self,image,conf=.25,imgsz=1024):
        h,w=image.shape[:2]; result=self.model.predict(image,conf=conf,imgsz=imgsz,device=self.device,verbose=False)[0]
        if result.masks is None:return []
        masks=result.masks.data.detach().cpu().numpy(); scores=result.boxes.conf.detach().cpu().numpy()
        out=[]
        for mask,score in zip(masks,scores):
            try:out.append(mask_to_measurement(mask,float(score),(h,w)))
            except ValueError:pass
        return deduplicate(out)

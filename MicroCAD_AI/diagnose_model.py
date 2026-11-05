"""Evidence-based model and dataset diagnosis; never modifies labels or weights."""
from __future__ import annotations
import argparse, csv, hashlib, json, math
from pathlib import Path
import cv2
import numpy as np
from ultralytics import YOLO

ROOT=Path(__file__).resolve().parent
THRESHOLDS=(.001,.01,.05,.10,.15,.25)
EXTS={'.jpg','.jpeg','.png','.webp','.bmp'}

def image_paths(dataset,split):return sorted(p for p in (dataset/'images'/split).iterdir() if p.suffix.lower() in EXTS)
def label_path(dataset,split,image):return dataset/'labels'/split/f'{image.stem}.txt'
def read_gt(path,w,h):
 out=[]; errors=[]
 if not path.exists():return out,[f'missing label: {path}']
 for line_no,line in enumerate(path.read_text(encoding='utf-8').splitlines(),1):
  if not line.strip():continue
  try:values=line.split(); cls=int(values[0]); coords=np.array([float(x) for x in values[1:]],dtype=float).reshape(-1,2)
  except Exception as e:errors.append(f'{path.name}:{line_no}: parse error {e}');continue
  if cls!=0:errors.append(f'{path.name}:{line_no}: class {cls}, expected 0')
  if len(coords)<3:errors.append(f'{path.name}:{line_no}: fewer than 3 points');continue
  if np.any(coords<0) or np.any(coords>1):errors.append(f'{path.name}:{line_no}: coordinate outside [0,1]')
  pts=np.c_[coords[:,0]*w,coords[:,1]*h].round().astype(np.int32)
  mask=np.zeros((h,w),np.uint8);cv2.fillPoly(mask,[pts],1)
  area=float(cv2.contourArea(pts)); bbox=cv2.boundingRect(pts)
  if area<=0:errors.append(f'{path.name}:{line_no}: zero-area polygon')
  out.append({'class':cls,'points':pts,'mask':mask,'area':area,'bbox':bbox,'equiv_diameter':2*math.sqrt(max(area,0)/math.pi),'touches_edge':bool(np.any(pts[:,0]<=0)|np.any(pts[:,0]>=w-1)|np.any(pts[:,1]<=0)|np.any(pts[:,1]>=h-1))})
 return out,errors

def pred_masks(result,h,w):
 if result.masks is None:return []
 masks=result.masks.data.detach().cpu().numpy(); conf=result.boxes.conf.detach().cpu().numpy(); cls=result.boxes.cls.detach().cpu().numpy().astype(int)
 out=[]
 for m,c,k in zip(masks,conf,cls):
  if m.shape!=(h,w):m=cv2.resize(m,(w,h),interpolation=cv2.INTER_NEAREST)
  out.append({'mask':m>.5,'confidence':float(c),'class':int(k)})
 return out

def match(gt,pred,iou_threshold=.5):
 pairs=[]
 for gi,g in enumerate(gt):
  for pi,p in enumerate(pred):
   inter=np.logical_and(g['mask'],p['mask']).sum();union=np.logical_or(g['mask'],p['mask']).sum();iou=float(inter/union) if union else 0
   pairs.append((iou,gi,pi))
 used_g=set();used_p=set();matched=[]
 for iou,gi,pi in sorted(pairs,reverse=True):
  if iou<iou_threshold:break
  if gi not in used_g and pi not in used_p:used_g.add(gi);used_p.add(pi);matched.append((gi,pi,iou))
 return matched,[i for i in range(len(gt)) if i not in used_g],[i for i in range(len(pred)) if i not in used_p]

def overlay(image,gt,pred,matches,fn,fp,title):
 canvas=image.copy();gt_layer=np.zeros_like(canvas);pred_layer=np.zeros_like(canvas)
 matched_g={g for g,_,_ in matches};matched_p={p for _,p,_ in matches}
 for i,g in enumerate(gt):gt_layer[g['mask'].astype(bool)]=(60,200,60) if i in matched_g else (0,190,255)
 for i,p in enumerate(pred):pred_layer[p['mask']]=(255,190,0) if i in matched_p else (30,30,235)
 canvas=cv2.addWeighted(canvas,1,gt_layer,.28,0);canvas=cv2.addWeighted(canvas,1,pred_layer,.32,0)
 for i,p in enumerate(pred):
  ys,xs=np.where(p['mask']);
  if len(xs):cv2.putText(canvas,f"{p['confidence']:.3f}",(int(xs.min()),max(18,int(ys.min()))),cv2.FONT_HERSHEY_SIMPLEX,.48,(255,255,255),1,cv2.LINE_AA)
 cv2.rectangle(canvas,(0,0),(canvas.shape[1],30),(15,15,15),-1);cv2.putText(canvas,title,(8,21),cv2.FONT_HERSHEY_SIMPLEX,.5,(255,255,255),1,cv2.LINE_AA)
 return canvas

def sweep(model,dataset,split,out_dir,imgsz,device,visual_limit=None):
 rows=[];summary=[];images=image_paths(dataset,split)
 for threshold in THRESHOLDS:
  tp=fp=fn=0; confs=[];ious=[]
  vis_dir=out_dir/'predictions'/split/f'conf_{threshold:g}';vis_dir.mkdir(parents=True,exist_ok=True)
  for index,path in enumerate(images):
   image=cv2.imread(str(path));h,w=image.shape[:2];gt,errors=read_gt(label_path(dataset,split,path),w,h)
   result=model.predict(source=image,imgsz=imgsz,conf=threshold,iou=.7,device=device,retina_masks=True,verbose=False)[0]
   pred=pred_masks(result,h,w);matches,missed,false=match(gt,pred)
   tp+=len(matches);fn+=len(missed);fp+=len(false);confs.extend(p['confidence'] for p in pred);ious.extend(x[2] for x in matches)
   rows.append({'split':split,'threshold':threshold,'image':path.name,'gt':len(gt),'detections':len(pred),'tp':len(matches),'fp':len(false),'fn':len(missed),'confidences':' '.join(f"{p['confidence']:.6f}" for p in pred),'matched_ious':' '.join(f'{x[2]:.6f}' for x in matches),'label_errors':' | '.join(errors)})
   if visual_limit is None or index<visual_limit:
    title=f'{split} conf={threshold:g} GT={len(gt)} TP={len(matches)} FP={len(false)} FN={len(missed)}'
    cv2.imwrite(str(vis_dir/path.name),overlay(image,gt,pred,matches,missed,false,title))
  precision=tp/(tp+fp) if tp+fp else 0;recall=tp/(tp+fn) if tp+fn else 0;f1=2*precision*recall/(precision+recall) if precision+recall else 0
  summary.append({'split':split,'threshold':threshold,'images':len(images),'tp':tp,'fp':fp,'fn':fn,'precision':precision,'recall':recall,'f1':f1,'detections':tp+fp,'mean_confidence':float(np.mean(confs)) if confs else None,'min_confidence':float(np.min(confs)) if confs else None,'max_confidence':float(np.max(confs)) if confs else None,'mean_matched_iou':float(np.mean(ious)) if ious else None})
 return rows,summary

def dhash(image):
 gray=cv2.cvtColor(image,cv2.COLOR_BGR2GRAY);small=cv2.resize(gray,(9,8),interpolation=cv2.INTER_AREA);bits=(small[:,1:]>small[:,:-1]).flatten();return sum(int(v)<<i for i,v in enumerate(bits))
def hamming(a,b):return (a^b).bit_count()

def dataset_audit(dataset,imgsz):
 records=[];errors=[];hashes={};perceptual={};objects=[]
 for split in ('train','val','test'):
  for path in image_paths(dataset,split):
   raw=path.read_bytes();image=cv2.imdecode(np.frombuffer(raw,np.uint8),cv2.IMREAD_COLOR)
   if image is None:errors.append(f'unreadable image: {path}');continue
   h,w=image.shape[:2];gt,label_errors=read_gt(label_path(dataset,split,path),w,h);errors.extend(label_errors)
   scale=min(imgsz/w,imgsz/h)
   records.append({'split':split,'image':path.name,'width':w,'height':h,'objects':len(gt),'negative':not gt,'resize_scale':scale})
   hashes.setdefault(hashlib.sha256(raw).hexdigest(),[]).append((split,path.name));perceptual[(split,path.name)]=dhash(image)
   for n,g in enumerate(gt):objects.append({'split':split,'image':path.name,'object':n,'area_px':g['area'],'area_fraction':g['area']/(w*h),'equiv_diameter_px':g['equiv_diameter'],'resized_diameter_px':g['equiv_diameter']*scale,'mask_grid_diameter_at_ratio4':g['equiv_diameter']*scale/4,'bbox_w':g['bbox'][2],'bbox_h':g['bbox'][3],'touches_edge':g['touches_edge']})
 exact=[v for v in hashes.values() if len({x[0] for x in v})>1]
 cross=[];keys=list(perceptual)
 for i,a in enumerate(keys):
  for b in keys[i+1:]:
   if a[0]!=b[0]:cross.append({'a_split':a[0],'a_image':a[1],'b_split':b[0],'b_image':b[1],'dhash_distance':hamming(perceptual[a],perceptual[b])})
 cross.sort(key=lambda x:x['dhash_distance'])
 vals=[x['equiv_diameter_px'] for x in objects];resized=[x['resized_diameter_px'] for x in objects];grid=[x['mask_grid_diameter_at_ratio4'] for x in objects]
 stats={'images':len(records),'objects':len(objects),'negative_images':sum(x['negative'] for x in records),'per_split':{s:{'images':sum(x['split']==s for x in records),'objects':sum(x['split']==s for x in objects),'negative_images':sum(x['split']==s and x['negative'] for x in records)} for s in ('train','val','test')},'polygon_errors':errors,'exact_cross_split_duplicates':exact,'nearest_cross_split_dhash':cross[:20],'diameter_px':describe(vals),'resized_diameter_px':describe(resized),'mask_grid_diameter_ratio4':describe(grid),'touching_edge_objects':sum(x['touches_edge'] for x in objects)}
 return records,objects,stats
def describe(values):
 if not values:return {}
 a=np.array(values);return {'min':float(a.min()),'p25':float(np.quantile(a,.25)),'median':float(np.median(a)),'mean':float(a.mean()),'p75':float(np.quantile(a,.75)),'max':float(a.max())}
def write_csv(path,rows):
 if not rows:return
 with path.open('w',newline='',encoding='utf-8-sig') as f:w=csv.DictWriter(f,fieldnames=rows[0].keys());w.writeheader();w.writerows(rows)

def main():
 p=argparse.ArgumentParser();p.add_argument('--model',type=Path,required=True);p.add_argument('--dataset',type=Path,default=ROOT/'dataset');p.add_argument('--output',type=Path,default=ROOT/'diagnosis');p.add_argument('--imgsz',type=int,default=640);p.add_argument('--device',default='0');a=p.parse_args();a.output.mkdir(parents=True,exist_ok=True)
 model=YOLO(str(a.model));names=model.names
 all_rows=[];all_summary=[]
 for split,limit in (('val',None),('train',6)):
  rows,summary=sweep(model,a.dataset,split,a.output,a.imgsz,a.device,limit);all_rows+=rows;all_summary+=summary
 records,objects,stats=dataset_audit(a.dataset,a.imgsz)
 write_csv(a.output/'threshold_per_image.csv',all_rows);write_csv(a.output/'threshold_summary.csv',all_summary);write_csv(a.output/'dataset_images.csv',records);write_csv(a.output/'object_sizes.csv',objects)
 payload={'checkpoint':str(a.model.resolve()),'sha256':hashlib.sha256(a.model.read_bytes()).hexdigest(),'model_names':names,'imgsz':a.imgsz,'iou_match_threshold':.5,'threshold_summary':all_summary,'dataset':stats}
 (a.output/'diagnosis.json').write_text(json.dumps(payload,indent=2,ensure_ascii=False),encoding='utf-8')
 print(json.dumps(payload,indent=2,ensure_ascii=False))
if __name__=='__main__':main()

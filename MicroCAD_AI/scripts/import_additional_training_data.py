"""Safely add labeled positives and empty-label negatives to dataset/train."""
from __future__ import annotations
import argparse, hashlib, json, shutil
from datetime import datetime, timezone
from pathlib import Path
import cv2
import numpy as np

EXTS={'.jpg','.jpeg','.png','.webp','.bmp'}
def digest(path):
 h=hashlib.sha256()
 with path.open('rb') as f:
  for chunk in iter(lambda:f.read(1024*1024),b''):h.update(chunk)
 return h.hexdigest()
def validate_label(path):
 count=0;errors=[]
 for n,line in enumerate(path.read_text(encoding='utf-8').splitlines(),1):
  if not line.strip():continue
  try:p=line.split();cls=int(p[0]);coords=[float(x) for x in p[1:]]
  except Exception as e:errors.append(f'{path.name}:{n}: {e}');continue
  if cls!=0:errors.append(f'{path.name}:{n}: class must be 0')
  if len(coords)<6 or len(coords)%2:errors.append(f'{path.name}:{n}: invalid polygon length')
  if any(x<0 or x>1 for x in coords):errors.append(f'{path.name}:{n}: coordinate outside [0,1]')
  count+=1
 return count,errors
def read_image(path):
 return cv2.imdecode(np.frombuffer(path.read_bytes(),np.uint8),cv2.IMREAD_COLOR)
def main():
 p=argparse.ArgumentParser();p.add_argument('--positive-images',type=Path,required=True);p.add_argument('--positive-labels',type=Path,required=True);p.add_argument('--negative-images',type=Path,required=True);p.add_argument('--dataset',type=Path,required=True);p.add_argument('--commit',action='store_true');a=p.parse_args()
 target_images=a.dataset/'images'/'train';target_labels=a.dataset/'labels'/'train';target_images.mkdir(parents=True,exist_ok=True);target_labels.mkdir(parents=True,exist_ok=True)
 existing=[]
 for split in ('train','val','test'):
  existing += [x for x in (a.dataset/'images'/split).iterdir() if x.suffix.lower() in EXTS]
 existing_hash={digest(x):(split,x.name) for split in ('train','val','test') for x in (a.dataset/'images'/split).iterdir() if x.suffix.lower() in EXTS}
 positives=[];negatives=[];errors=[];polygons=0
 source_images=[x for x in a.positive_images.iterdir() if x.suffix.lower() in EXTS]
 by_stem={}
 for x in source_images:by_stem.setdefault(x.stem,[]).append(x)
 for label in sorted(a.positive_labels.glob('*.txt')):
  matches=by_stem.get(label.stem,[])
  if len(matches)!=1:errors.append(f'{label.name}: expected 1 image, found {len(matches)}');continue
  image=matches[0];decoded=read_image(image)
  if decoded is None:errors.append(f'unreadable image: {image}');continue
  count,label_errors=validate_label(label);errors+=label_errors
  if count==0:errors.append(f'positive label is empty: {label}')
  h=digest(image)
  if h in existing_hash:errors.append(f'duplicate content: {image.name} == {existing_hash[h]}')
  if (target_images/image.name).exists() or (target_labels/label.name).exists():errors.append(f'target collision: {image.name}')
  positives.append((image,label,h,count,decoded.shape[1],decoded.shape[0]));polygons+=count
 for image in sorted(x for x in a.negative_images.iterdir() if x.suffix.lower() in EXTS):
  decoded=read_image(image)
  if decoded is None:errors.append(f'unreadable negative: {image}');continue
  h=digest(image)
  if h in existing_hash:errors.append(f'duplicate negative: {image.name} == {existing_hash[h]}')
  label_name=image.stem+'.txt'
  if (target_images/image.name).exists() or (target_labels/label_name).exists():errors.append(f'target collision: {image.name}')
  negatives.append((image,h,decoded.shape[1],decoded.shape[0]))
 report={'mode':'commit' if a.commit else 'dry-run','positive_images':len(positives),'positive_polygons':polygons,'negative_images':len(negatives),'errors':errors,'positives':[{'name':x[0].name,'sha256':x[2],'width':x[4],'height':x[5],'polygons':x[3]} for x in positives],'negatives':[{'name':x[0].name,'sha256':x[1],'width':x[2],'height':x[3]} for x in negatives]}
 if errors:print(json.dumps(report,indent=2,ensure_ascii=False));raise SystemExit(1)
 if a.commit:
  for image,label,*_ in positives:shutil.copy2(image,target_images/image.name);shutil.copy2(label,target_labels/label.name)
  for image,*_ in negatives:shutil.copy2(image,target_images/image.name);(target_labels/f'{image.stem}.txt').write_text('',encoding='utf-8')
  report['committed_at_utc']=datetime.now(timezone.utc).isoformat();(a.dataset/'additional_import_manifest.json').write_text(json.dumps(report,indent=2,ensure_ascii=False),encoding='utf-8')
 print(json.dumps({k:report[k] for k in ('mode','positive_images','positive_polygons','negative_images','errors')},indent=2,ensure_ascii=False))
if __name__=='__main__':main()

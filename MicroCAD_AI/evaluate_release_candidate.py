"""Fixed-threshold release evaluation on a locked test split."""
from __future__ import annotations
import argparse, csv, gc, hashlib, json, os, time
from pathlib import Path
import cv2
import numpy as np
import psutil
import torch
from ultralytics import YOLO
from diagnose_model import image_paths,label_path,read_gt,pred_masks,match,overlay
from measure import mask_to_measurement,robust_circle_fit

def sha256(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def gt_circle(mask):
 contours,_=cv2.findContours(mask.astype(np.uint8),cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_NONE)
 points=max(contours,key=cv2.contourArea)[:,0,:].astype(float)
 center,r,error,_=robust_circle_fit(points,seed=0)
 return center,r,error
def system_memory():
 m=psutil.virtual_memory();p=psutil.Process(os.getpid())
 return {'system_total_mb':m.total/1024**2,'system_available_mb':m.available/1024**2,'system_used_percent':m.percent,'process_rss_mb':p.memory_info().rss/1024**2}
def write_csv(path,rows):
 with path.open('w',newline='',encoding='utf-8-sig') as f:
  w=csv.DictWriter(f,fieldnames=rows[0].keys());w.writeheader();w.writerows(rows)
def evaluate(tag,weight,dataset,output,conf,imgsz,device):
 before=system_memory();torch.cuda.empty_cache();torch.cuda.reset_peak_memory_stats()
 started=time.perf_counter();model=YOLO(str(weight));load_seconds=time.perf_counter()-started
 names={int(k):v for k,v in model.names.items()};rows=[];tp=fp=fn=0;ious=[];diam_errors=[];center_errors=[];fit_errors=[];inference=[]
 target=output/tag;target.mkdir(parents=True,exist_ok=True)
 for path in image_paths(dataset,'test'):
  image=cv2.imread(str(path));h,w=image.shape[:2];gt,errors=read_gt(label_path(dataset,'test',path),w,h)
  t=time.perf_counter();result=model.predict(image,imgsz=imgsz,conf=conf,iou=.7,device=device,retina_masks=True,verbose=False)[0];inference.append((time.perf_counter()-t)*1000)
  pred=pred_masks(result,h,w);matches,missed,false=match(gt,pred);tp+=len(matches);fp+=len(false);fn+=len(missed)
  circle_details=[]
  for gi,pi,iou in matches:
   ious.append(iou)
   try:
    gc_center,gc_r,gc_error=gt_circle(gt[gi]['mask']);measurement=mask_to_measurement(pred[pi]['mask'],pred[pi]['confidence'],(h,w));diam_error=abs(measurement.diameter_px-2*gc_r);center_error=float(np.linalg.norm(np.array([measurement.center_x,measurement.center_y])-gc_center));diam_errors.append(diam_error);center_errors.append(center_error);fit_errors.append(measurement.fit_error);circle_details.append({'gt_index':gi,'pred_index':pi,'mask_iou':iou,'gt_diameter_px':2*gc_r,'pred_diameter_px':measurement.diameter_px,'diameter_abs_error_px':diam_error,'center_error_px':center_error,'pred_circle_fit_error_px':measurement.fit_error,'angular_coverage':measurement.angular_coverage,'review_required':measurement.review_required})
    p=(int(round(measurement.center_x)),int(round(measurement.center_y)));cv2.circle(image,p,int(round(measurement.radius_px)),(255,100,20),2)
   except Exception as e:circle_details.append({'gt_index':gi,'pred_index':pi,'mask_iou':iou,'circle_error':str(e)})
  title=f'{tag} conf={conf:g} size={imgsz} GT={len(gt)} TP={len(matches)} FP={len(false)} FN={len(missed)}'
  cv2.imwrite(str(target/path.name),overlay(image,gt,pred,matches,missed,false,title))
  rows.append({'model':tag,'image':path.name,'is_negative':len(gt)==0,'gt':len(gt),'detections':len(pred),'tp':len(matches),'fp':len(false),'fn':len(missed),'confidences':' '.join(f"{p['confidence']:.6f}" for p in pred),'matched_ious':' '.join(f'{x[2]:.6f}' for x in matches),'circle_metrics_json':json.dumps(circle_details,ensure_ascii=False),'label_errors':' | '.join(errors)})
 after=system_memory();precision=tp/(tp+fp) if tp+fp else 0;recall=tp/(tp+fn) if tp+fn else 0
 summary={'model':tag,'checkpoint':str(weight.resolve()),'sha256':sha256(weight),'class_mapping':names,'conf':conf,'imgsz':imgsz,'test_images':len(rows),'gt_instances':tp+fn,'tp':tp,'fp':fp,'fn':fn,'precision':precision,'recall':recall,'false_positives_per_image':fp/len(rows),'mean_mask_iou':float(np.mean(ious)) if ious else None,'median_mask_iou':float(np.median(ious)) if ious else None,'mean_diameter_abs_error_px':float(np.mean(diam_errors)) if diam_errors else None,'max_diameter_abs_error_px':float(np.max(diam_errors)) if diam_errors else None,'mean_center_error_px':float(np.mean(center_errors)) if center_errors else None,'mean_circle_fit_error_px':float(np.mean(fit_errors)) if fit_errors else None,'mean_inference_ms':float(np.mean(inference)),'load_seconds':load_seconds,'memory_before':before,'memory_after':after,'process_rss_delta_mb':after['process_rss_mb']-before['process_rss_mb'],'cuda_peak_allocated_mb':torch.cuda.max_memory_allocated()/1024**2,'cuda_peak_reserved_mb':torch.cuda.max_memory_reserved()/1024**2}
 del model;gc.collect();torch.cuda.empty_cache();summary['memory_after_release']=system_memory();summary['cuda_allocated_after_release_mb']=torch.cuda.memory_allocated()/1024**2;summary['cuda_reserved_after_release_mb']=torch.cuda.memory_reserved()/1024**2
 return rows,summary
def main():
 p=argparse.ArgumentParser();p.add_argument('--new-model',type=Path,required=True);p.add_argument('--old-model',type=Path,required=True);p.add_argument('--dataset',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--conf',type=float,default=.25);p.add_argument('--imgsz',type=int,default=640);p.add_argument('--device',default='0');a=p.parse_args();a.output.mkdir(parents=True,exist_ok=True)
 all_rows=[];summaries=[]
 for tag,weight in (('new',a.new_model),('old',a.old_model)):
  rows,summary=evaluate(tag,weight,a.dataset,a.output,a.conf,a.imgsz,a.device);all_rows+=rows;summaries.append(summary)
 write_csv(a.output/'per_image.csv',all_rows);(a.output/'summary.json').write_text(json.dumps(summaries,indent=2,ensure_ascii=False),encoding='utf-8');print(json.dumps(summaries,indent=2,ensure_ascii=False))
if __name__=='__main__':main()

import argparse,json
from pathlib import Path
from ultralytics import YOLO
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--model',required=True);p.add_argument('--data',default=str(Path(__file__).with_name('data.yaml')));p.add_argument('--split',choices=['val','test'],default='test');p.add_argument('--imgsz',type=int,default=1024);p.add_argument('--device');p.add_argument('--output',default='evaluation.json');a=p.parse_args();m=YOLO(a.model).val(data=a.data,split=a.split,imgsz=a.imgsz,device=a.device);out={'split':a.split,'box_map50':float(m.box.map50),'box_map50_95':float(m.box.map),'mask_map50':float(m.seg.map50),'mask_map50_95':float(m.seg.map)};Path(a.output).write_text(json.dumps(out,indent=2));print(json.dumps(out,indent=2))

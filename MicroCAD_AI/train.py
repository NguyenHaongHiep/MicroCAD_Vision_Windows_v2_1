import argparse,json,platform
from datetime import datetime,timezone
from pathlib import Path
import torch
from ultralytics import YOLO,__version__ as uv
ROOT=Path(__file__).resolve().parent
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--model',required=True,help='Checkpoint seg cục bộ hoặc tên đã xác minh');p.add_argument('--data',default=str(ROOT/'data.yaml'));p.add_argument('--epochs',type=int,default=100);p.add_argument('--imgsz',type=int,default=1024);p.add_argument('--batch',type=int,default=-1);p.add_argument('--device');p.add_argument('--patience',type=int,default=20);p.add_argument('--resume',action='store_true');p.add_argument('--workers',type=int,default=4);a=p.parse_args()
 device=a.device or ('0' if torch.cuda.is_available() else 'cpu');(ROOT/'runs').mkdir(exist_ok=True)
 metadata={**vars(a),'resolved_device':device,'utc':datetime.now(timezone.utc).isoformat(),'python':platform.python_version(),'torch':torch.__version__,'ultralytics':uv,'cuda':torch.version.cuda,'gpu':torch.cuda.get_device_name(0) if torch.cuda.is_available() else None}
 (ROOT/'runs'/'last_train_config.json').write_text(json.dumps(metadata,indent=2,ensure_ascii=False),encoding='utf-8')
 YOLO(a.model).train(data=a.data,epochs=a.epochs,imgsz=a.imgsz,batch=a.batch,device=device,patience=a.patience,resume=a.resume,workers=a.workers,project=str(ROOT/'runs'/'segment'),name='hole_inner')

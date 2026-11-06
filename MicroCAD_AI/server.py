"""Offline localhost API for the controlled MicroCAD AI experiment."""
import asyncio, os, threading, time
from pathlib import Path
import cv2, numpy as np, torch
from fastapi import FastAPI,File,HTTPException,UploadFile
from fastapi.middleware.cors import CORSMiddleware
from measure import HoleSegmenter

ROOT=Path(__file__).resolve().parent
DEFAULT_MODEL=ROOT/'runs'/'segment'/'hole_inner-2'/'weights'/'best.pt'
MODEL=Path(os.getenv('MICROCAD_MODEL',DEFAULT_MODEL))
DEVICE=os.getenv('MICROCAD_DEVICE') or ('0' if torch.cuda.is_available() else 'cpu')
MAX_BYTES=int(os.getenv('MICROCAD_MAX_IMAGE_BYTES',64*1024*1024))
DEFAULT_CONF=float(os.getenv('MICROCAD_CONF','0.25'))
DEFAULT_IMGSZ=int(os.getenv('MICROCAD_IMGSZ','640'))
INFERENCE_TIMEOUT=float(os.getenv('MICROCAD_INFERENCE_TIMEOUT_SECONDS','120'))
origins=[x.strip() for x in os.getenv('MICROCAD_CORS_ORIGINS','null,http://127.0.0.1,http://localhost').split(',') if x.strip()]
app=FastAPI(title='MicroCAD AI',version='0.1.0')
app.add_middleware(CORSMiddleware,allow_origins=origins,allow_methods=['GET','POST'],allow_headers=['*'])
_engine=None; _engine_error=None; _lock=threading.RLock()
def engine():
    global _engine,_engine_error
    if _engine is None:
        with _lock:
            if _engine is None:
                try:_engine=HoleSegmenter(MODEL,DEVICE)
                except Exception as exc:_engine_error=str(exc);raise
    return _engine
@app.on_event('startup')
def preload_model():
    """Load exactly one model instance at startup; health remains available on failure."""
    if MODEL.is_file():
        try:engine()
        except Exception:pass
@app.get('/health')
def health():return {'status':'online','model_ready':MODEL.is_file() and _engine is not None,'model_path':str(MODEL),'device':DEVICE,'cuda_available':torch.cuda.is_available(),'error':_engine_error,'pid':os.getpid(),'instance_id':os.getenv('MICROCAD_LAUNCH_ID')}
@app.get('/model-info')
def info():return {'model_path':str(MODEL),'model_version':MODEL.name,'exists':MODEL.is_file(),'loaded':_engine is not None,'device':DEVICE,'torch':torch.__version__,'cuda':torch.version.cuda,'gpu':torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,'default_conf':DEFAULT_CONF,'default_imgsz':DEFAULT_IMGSZ,'load_error':_engine_error}
async def decode(file):
    allowed_mime={'image/png','image/jpeg','image/webp','image/bmp'}
    allowed_suffix={'.png','.jpg','.jpeg','.webp','.bmp'}
    suffix=Path(file.filename or '').suffix.lower()
    if file.content_type not in allowed_mime and suffix not in allowed_suffix:raise HTTPException(415,'Chỉ hỗ trợ PNG/JPEG/WEBP/BMP')
    data=await file.read(MAX_BYTES+1)
    if len(data)>MAX_BYTES:raise HTTPException(413,'Ảnh vượt giới hạn 64 MB')
    image=cv2.imdecode(np.frombuffer(data,np.uint8),cv2.IMREAD_COLOR)
    if image is None:raise HTTPException(400,'Không giải mã được ảnh')
    if image.shape[0]*image.shape[1]>100_000_000:raise HTTPException(413,'Ảnh vượt 100 triệu pixel')
    return image
def infer(image,conf,imgsz):
    with _lock:return engine().predict(image,conf,imgsz)
@app.post('/detect')
async def detect(file:UploadFile=File(...),conf:float=DEFAULT_CONF,imgsz:int=DEFAULT_IMGSZ):
    if not .01<=conf<=.99 or not 320<=imgsz<=2048:raise HTTPException(422,'conf/imgsz ngoài giới hạn')
    image=await decode(file); started=time.perf_counter()
    try:
        found=await asyncio.wait_for(asyncio.to_thread(infer,image,conf,imgsz),timeout=INFERENCE_TIMEOUT)
    except FileNotFoundError as e:raise HTTPException(503,str(e))
    except asyncio.TimeoutError:raise HTTPException(504,f'Inference vượt timeout {INFERENCE_TIMEOUT:.0f}s')
    except Exception as e:raise HTTPException(500,f'Inference thất bại: {e}')
    h,w=image.shape[:2]
    return {'width':w,'height':h,'coordinate_space':'original_image_pixels','model_version':MODEL.name,'model_path':str(MODEL),'device':DEVICE,'conf':conf,'imgsz':imgsz,'inference_ms':(time.perf_counter()-started)*1000,'detections':[x.to_dict() for x in found]}
@app.post('/detect-batch')
async def batch(files:list[UploadFile]=File(...),conf:float=DEFAULT_CONF,imgsz:int=DEFAULT_IMGSZ):
    if len(files)>50:raise HTTPException(413,'Tối đa 50 ảnh')
    return [await detect(f,conf,imgsz) for f in files]
if __name__=='__main__':
    import uvicorn; uvicorn.run(app,host='127.0.0.1',port=8000)

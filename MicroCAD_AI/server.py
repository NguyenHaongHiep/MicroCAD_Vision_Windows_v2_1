"""Offline localhost API for the controlled MicroCAD AI experiment."""
import asyncio, logging, os, threading, time
from contextlib import asynccontextmanager
from pathlib import Path
import cv2, numpy as np, torch
from fastapi import FastAPI,File,HTTPException,UploadFile
from fastapi.middleware.cors import CORSMiddleware
from measure import HoleSegmenter

ROOT=Path(__file__).resolve().parent
DEFAULT_MODEL=ROOT/'runs'/'segment'/'hole_inner-2'/'weights'/'best.pt'
MODEL=Path(os.getenv('MICROCAD_MODEL',DEFAULT_MODEL))
CUDA_AVAILABLE = torch.cuda.is_available()
DEVICE = os.getenv('MICROCAD_DEVICE') or ('0' if CUDA_AVAILABLE else 'cpu')
MAX_BYTES=int(os.getenv('MICROCAD_MAX_IMAGE_BYTES',64*1024*1024))
DEFAULT_CONF=float(os.getenv('MICROCAD_CONF','0.25'))
DEFAULT_IMGSZ=int(os.getenv('MICROCAD_IMGSZ','640'))
INFERENCE_TIMEOUT=float(os.getenv('MICROCAD_INFERENCE_TIMEOUT_SECONDS','120'))
origins=[x.strip() for x in os.getenv('MICROCAD_CORS_ORIGINS','null,http://127.0.0.1,http://localhost').split(',') if x.strip()]
_engine = None
_startup = ('loading', None, None)  # state, error code, error detail
_lock = threading.RLock()
_log = logging.getLogger('uvicorn.error')


def validate_cuda():
    """Detect invalid GPU requests and unusable runtime before accepting images."""
    device = DEVICE.lower().strip()
    if device == 'cuda':
        indices = [0]
    else:
        device = device.removeprefix('cuda:')
        parts = device.split(',')
        if not all(part.strip().isdigit() for part in parts):
            return
        indices = [int(part) for part in parts]
    count = torch.cuda.device_count() if CUDA_AVAILABLE else 0
    for index in indices:
        if index >= count:
            raise RuntimeError(f'CUDA device {index} is unavailable (visible devices: {count}).')
        torch.empty(1, device=f'cuda:{index}')


def preload_model():
    global _engine, _startup
    stage = 'MODEL_MISSING'
    try:
        if not MODEL.is_file():
            raise FileNotFoundError(f'Trained model was not found at {MODEL}')
        stage = 'CUDA'
        validate_cuda()
        stage = 'MODEL_LOAD'
        _log.info('Loading MicroCAD AI model %s (device %s)', MODEL, DEVICE)
        _engine = HoleSegmenter(MODEL, DEVICE)
    except Exception as exc:
        if isinstance(exc, (ImportError, ModuleNotFoundError)):
            stage = 'DEPENDENCY'
        elif stage == 'MODEL_LOAD' and any(marker in str(exc).lower() for marker in ('cuda', 'cudnn', 'cublas')):
            stage = 'CUDA'
        _startup = ('failed', stage, f'{type(exc).__name__}: {exc}')
        _log.exception('MicroCAD AI model startup failed [%s]', stage)
    else:
        _startup = ('ready', None, None)
        _log.info('MicroCAD AI model ready (device %s)', DEVICE)


@asynccontextmanager
async def lifespan(_app):
    # Allow /health to respond while PyTorch and YOLO load the checkpoint.
    worker = asyncio.create_task(asyncio.to_thread(preload_model))
    try:
        yield
    finally:
        worker.cancel()
        try:
            await worker
        except asyncio.CancelledError:
            pass


app=FastAPI(title='MicroCAD AI',version='0.1.0',lifespan=lifespan)
app.add_middleware(CORSMiddleware,allow_origins=origins,allow_methods=['GET','POST'],allow_headers=['*'])


@app.get('/health')
def health():
    state, code, error = _startup
    return {
        'status':'online', 'startup_state':state, 'model_ready':state == 'ready',
        'model_path':str(MODEL), 'device':DEVICE, 'cuda_available':CUDA_AVAILABLE,
        'error':error, 'error_code':code, 'pid':os.getpid(), 'parent_pid':os.getppid(),
        'instance_id':os.getenv('MICROCAD_LAUNCH_ID'),
    }


@app.get('/model-info')
def info():return {'model_path':str(MODEL),'model_version':MODEL.name,'exists':MODEL.is_file(),'loaded':_engine is not None,'device':DEVICE,'torch':torch.__version__,'cuda':torch.version.cuda,'gpu':torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,'default_conf':DEFAULT_CONF,'default_imgsz':DEFAULT_IMGSZ,'load_error':_startup[2]}
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
    with _lock:return _engine.predict(image,conf,imgsz)
@app.post('/detect')
async def detect(file:UploadFile=File(...),conf:float=DEFAULT_CONF,imgsz:int=DEFAULT_IMGSZ):
    if not .01<=conf<=.99 or not 320<=imgsz<=2048:raise HTTPException(422,'conf/imgsz ngoài giới hạn')
    state, _, error = _startup
    if state != 'ready':
        raise HTTPException(503, error or 'AI đang nạp model. Vui lòng thử lại.')
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

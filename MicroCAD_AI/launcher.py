"""Local backend lifecycle only. Never installs dependencies or downloads models."""
import argparse
import contextlib
import importlib.util
import json
import os
from pathlib import Path
import signal
import socket
import subprocess
import sys
import time
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parent
PORT = 8000
HOST = '127.0.0.1'


class StartupError(RuntimeError):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


def state_directory():
    return Path(os.environ.get('LOCALAPPDATA', Path.home() / '.local' / 'state')) / 'MicroCADVision'


@contextlib.contextmanager
def startup_lock(directory, deadline):
    directory.mkdir(parents=True, exist_ok=True)
    with (directory / 'backend-8000.lock').open('a+b') as lock:
        # Windows permits locking beyond EOF. Reading byte zero before taking
        # the lock can fail while another launcher owns that byte.
        while True:
            try:
                lock.seek(0)
                if os.name == 'nt':
                    import msvcrt
                    msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
                else:
                    import fcntl
                    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except (OSError, BlockingIOError):
                if time.monotonic() >= deadline:
                    raise StartupError('STARTUP_LOCK_TIMEOUT', 'Another launcher is still starting or stopping AI. Try again shortly.')
                time.sleep(.1)
        try:
            yield
        finally:
            lock.seek(0)
            if os.name == 'nt':
                msvcrt.locking(lock.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(lock, fcntl.LOCK_UN)


def health():
    try:
        # Loopback only: no network proxy or remote service is involved.
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        with opener.open(f'http://{HOST}:{PORT}/health', timeout=1) as response:
            data = json.load(response)
        return data if isinstance(data, dict) else None
    except (OSError, ValueError):
        return None


def same_model(data, model):
    try:
        return data.get('status') == 'online' and Path(data['model_path']).resolve() == model.resolve()
    except (KeyError, TypeError, ValueError, OSError):
        return False


def occupied():
    try:
        with socket.create_connection((HOST, PORT), timeout=.5):
            return True
    except OSError:
        return False


def offline_env():
    return dict(os.environ, YOLO_AUTOINSTALL='false', YOLO_OFFLINE='true',
                PYTHONIOENCODING='utf-8')


def check_python():
    if sys.version_info[:2] not in ((3, 11), (3, 12)):
        raise StartupError('PYTHON', f'Python {sys.version.split()[0]} is unsupported at {sys.executable}. Use Python 3.11 or 3.12 x64.')
    required = ('torch', 'torchvision', 'cv2', 'numpy', 'ultralytics', 'fastapi', 'uvicorn', 'python_multipart')
    missing = [name for name in required if importlib.util.find_spec(name) is None]
    if missing:
        raise StartupError('DEPENDENCY', f'Missing Python dependencies in {sys.executable}: {", ".join(missing)}. Repair these packages in this .venv.')


def read_state(directory):
    try:
        return json.loads((directory / 'backend-8000.json').read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return {}


def write_state(directory, data):
    temp = directory / 'backend-8000.json.tmp'
    try:
        temp.write_text(json.dumps(data), encoding='utf-8')
        temp.replace(directory / 'backend-8000.json')
    finally:
        temp.unlink(missing_ok=True)


def owned_health(data, process, launch_id):
    if not data or data.get('instance_id') != launch_id:
        return False
    pid = data.get('pid')
    # Windows venv python.exe can be a redirector. The worker then reports
    # the redirector as its parent, and must be recorded under its own PID.
    return type(pid) is int and pid > 0 and (
        pid == process.pid or (os.name == 'nt' and data.get('parent_pid') == process.pid)
    )


def model_error(data, log):
    code = data.get('error_code')
    if code not in {'MODEL_MISSING', 'MODEL_LOAD', 'CUDA', 'DEPENDENCY'}:
        code = 'MODEL_LOAD'
    hints = {
        'MODEL_MISSING': 'Restore the trained checkpoint at the reported path.',
        'MODEL_LOAD': 'Check that the local checkpoint can be loaded by the installed Ultralytics version.',
        'CUDA': 'Check the requested GPU index, driver and PyTorch CUDA build. Set MICROCAD_DEVICE=cpu to explicitly use CPU.',
        'DEPENDENCY': 'Check the named dependency in this .venv.',
    }
    detail = data.get('error') or 'The backend did not provide details.'
    return StartupError(code, f'{detail} {hints[code]} Log: {log}')


def recent_log(log, offset):
    with log.open('rb') as stream:
        stream.seek(max(offset, log.stat().st_size - 16384))
        return stream.read(16384).decode('utf-8', errors='replace')


def process_exited(process, log, offset):
    output = recent_log(log, offset)
    lines = [line.strip() for line in output.splitlines() if line.strip()]
    detail = next((line for line in reversed(lines) if 'Error' in line or 'ERROR' in line),
                  lines[-1] if lines else 'No backend output.')
    if any(marker in output.lower() for marker in ('10048', 'address already in use', 'only one usage of each socket')):
        return StartupError('PORT_IN_USE', f'Port {PORT} became occupied during startup. {detail} Log: {log}')
    if any(marker in detail.lower() for marker in ('cuda', 'cudnn', 'cublas')):
        return StartupError('CUDA', f'PyTorch/CUDA startup failed. {detail}. Check the installed PyTorch build and NVIDIA driver. Log: {log}')
    if any(marker in output for marker in ('ModuleNotFoundError', 'ImportError', 'DLL load failed')):
        return StartupError('DEPENDENCY', f'An AI library could not be imported. {detail}. Verify the named library in this .venv. Log: {log}')
    return StartupError('BACKEND_EXIT', f'Backend exited with code {process.returncode}. {detail} Log: {log}')


def terminate_startup(process):
    if process.poll() is not None:
        return
    if os.name == 'nt':
        # Only target the process we just spawned. /T also closes the real
        # Python worker if the venv executable is a redirector.
        taskkill = Path(os.environ['SystemRoot']) / 'System32' / 'taskkill.exe'
        result = subprocess.run([str(taskkill), '/PID', str(process.pid), '/T', '/F'],
            capture_output=True, timeout=5, creationflags=subprocess.CREATE_NO_WINDOW)
        if result.returncode and process.poll() is None:
            raise RuntimeError(f'Could not stop the startup process tree (PID {process.pid}, taskkill code {result.returncode}).')
    else:
        process.terminate()
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=5)


def ensure(model, directory, timeout=90, progress=lambda stage: None):
    model = Path(model).resolve()
    log = directory / 'backend-8000.log'
    progress('CHECKING')
    if not model.is_file():
        raise StartupError('MODEL_MISSING', f'Missing trained model: {model}. Copy your existing best.pt to this path or set MICROCAD_MODEL.')
    deadline = time.monotonic() + timeout
    with startup_lock(directory, deadline):
        existing = health()
        if existing is not None:
            if not same_model(existing, model):
                raise StartupError('PORT_IN_USE', f'Port {PORT} is serving another model/application. Close it from its original application if needed.')
            if existing.get('startup_state') == 'loading':
                progress('LOADING')
                while time.monotonic() < deadline and existing.get('startup_state') == 'loading':
                    time.sleep(.25)
                    current = health()
                    if not current or not same_model(current, model) or current.get('pid') != existing.get('pid'):
                        raise StartupError('BACKEND_EXIT', f'The existing backend became unavailable or changed during model loading. Log: {log}')
                    existing = current
                if existing.get('startup_state') == 'loading':
                    raise StartupError('MODEL_TIMEOUT', f'The existing backend is still loading the model after {timeout:g}s. It is still running. Log: {log}')
            if existing.get('model_ready') is True:
                return 'AI is ready (reused existing backend).'
            if existing.get('error'):
                raise model_error(existing, log)
            raise StartupError('BACKEND_NOT_READY', f'The existing AI backend reports model_ready=false. Check its console or restart it from its original launcher. Log: {log}')
        if occupied():
            raise StartupError('PORT_IN_USE', f'Port {PORT} is occupied and /health could not identify MicroCAD AI. Check the process using this port.')
        progress('IMPORTING')
        check_python()
        if time.monotonic() >= deadline:
            raise StartupError('IMPORT_TIMEOUT', 'The startup deadline expired during Python dependency checks.')
        launch_id = uuid.uuid4().hex
        env = offline_env()
        env.update(MICROCAD_MODEL=str(model), MICROCAD_CONF='0.25', MICROCAD_IMGSZ='640', MICROCAD_LAUNCH_ID=launch_id)
        kwargs = {'creationflags': subprocess.CREATE_NO_WINDOW} if os.name == 'nt' else {'start_new_session': True}
        progress('STARTING')
        with log.open('ab', buffering=0) as output:
            offset = output.tell()
            output.write(f'\n[{time.strftime("%Y-%m-%d %H:%M:%S")}] Starting AI instance {launch_id} on port {PORT}\n'.encode('utf-8'))
            try:
                process = subprocess.Popen([sys.executable, '-u', '-m', 'uvicorn', 'server:app',
                    '--host', HOST, '--port', str(PORT), '--no-access-log'],
                    cwd=ROOT, env=env, stdin=subprocess.DEVNULL, stdout=output, stderr=output, **kwargs)
            except OSError as exc:
                raise StartupError('BACKEND_EXIT', f'Could not launch Python backend. {exc}. Log: {log}') from exc
        loading = False
        try:
            while time.monotonic() < deadline:
                if process.poll() is not None:
                    raise process_exited(process, log, offset)
                data = health()
                if owned_health(data, process, launch_id):
                    if not same_model(data, model):
                        raise StartupError('MODEL_LOAD', f'AI loaded an unexpected model. Log: {log}')
                    if data.get('model_ready') is True:
                        write_state(directory, {'pid':data['pid'], 'instance_id':launch_id, 'root':str(ROOT), 'model':str(model)})
                        return f'AI is ready. Stop it using the Stop MicroCAD AI shortcut. Log: {log}'
                    if data.get('error') or data.get('startup_state') == 'failed':
                        raise model_error(data, log)
                    if data.get('startup_state') == 'loading' and not loading:
                        loading = True
                        progress('LOADING')
                elif data is not None:
                    raise StartupError('PORT_IN_USE', f'Port {PORT} returned health for another process or launch. Check which service owns this port. Log: {log}')
                time.sleep(.25)
            if loading:
                raise StartupError('MODEL_TIMEOUT', f'The model was still loading when the {timeout:g}s startup budget expired. Check the checkpoint, storage speed and GPU status. Log: {log}')
            raise StartupError('BACKEND_TIMEOUT', f'The backend did not answer /health within the {timeout:g}s startup budget. Check the last import or startup message. Log: {log}')
        except BaseException as exc:
            try:
                terminate_startup(process)
            except (OSError, RuntimeError, subprocess.SubprocessError) as cleanup:
                raise StartupError(getattr(exc, 'code', 'BACKEND_EXIT'), f'{exc} Cleanup failed: {cleanup}') from exc
            raise


def stop(directory):
    with startup_lock(directory, time.monotonic() + 10):
        state, data = read_state(directory), health()
        if not data:
            return 'No responding AI backend found. No process was stopped.'
        if (not state or state.get('root') != str(ROOT) or not state.get('instance_id')
                or state.get('instance_id') != data.get('instance_id') or state.get('pid') != data.get('pid') or type(state.get('pid')) is not int or state['pid'] <= 0):
            raise RuntimeError('This backend is not owned by this launcher. Stop it from its original console; no unrelated process was stopped.')
        os.kill(state['pid'], signal.SIGTERM)
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline:
            current = health()
            if not current or current.get('instance_id') != state['instance_id']:
                (directory / 'backend-8000.json').unlink(missing_ok=True)
                return 'AI backend stopped. Its RAM/GPU resources are released when the process exits.'
            time.sleep(.1)
        raise RuntimeError('AI shutdown is still pending. Check the backend log; no other process was killed.')


def main():
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, 'reconfigure'):
            stream.reconfigure(encoding='utf-8', errors='replace')
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['ensure', 'stop'])
    parser.add_argument('--timeout', type=float, default=90)
    args = parser.parse_args()
    try:
        if args.timeout <= 0:
            raise RuntimeError('Startup timeout must be positive.')
        result = stop(state_directory()) if args.action == 'stop' else ensure(
            os.environ.get('MICROCAD_MODEL', ROOT / 'runs/segment/hole_inner-2/weights/best.pt'), state_directory(), args.timeout,
            progress=lambda stage: print(f'AI_STAGE={stage}', flush=True))
        print(result)
        return 0
    except Exception as exc:
        print(f'AI unavailable [{getattr(exc, "code", "LAUNCHER")}]: {exc}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())

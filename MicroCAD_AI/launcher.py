"""Local backend lifecycle only. Never installs dependencies or downloads models."""
import argparse
import contextlib
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
HEALTH = 'http://127.0.0.1:8000/health'


def state_directory():
    return Path(os.environ.get('LOCALAPPDATA', Path.home() / '.local' / 'state')) / 'MicroCADVision'


@contextlib.contextmanager
def startup_lock(directory, deadline):
    directory.mkdir(parents=True, exist_ok=True)
    with (directory / 'backend-8000.lock').open('a+b') as lock:
        lock.seek(0)
        if not lock.read(1):
            lock.write(b'0')
            lock.flush()
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
                    raise RuntimeError('Another launcher is still starting AI. Try again shortly.')
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
        with opener.open(HEALTH, timeout=1) as response:
            data = json.load(response)
        return data if isinstance(data, dict) else None
    except (OSError, ValueError):
        return None


def same_model(data, model):
    try:
        return data.get('status') == 'online' and Path(data['model_path']).resolve() == model.resolve()
    except (KeyError, TypeError):
        return False


def occupied():
    try:
        with socket.create_connection(('127.0.0.1', 8000), timeout=.5):
            return True
    except OSError:
        return False


def check_python():
    if sys.version_info[:2] not in ((3, 11), (3, 12)):
        raise RuntimeError('AI requires the existing Python 3.11 or 3.12 environment. No packages were installed.')
    check = subprocess.run([sys.executable, '-c',
        'import torch, torchvision, cv2, ultralytics, fastapi, uvicorn, multipart'],
        cwd=ROOT, capture_output=True, timeout=30)
    if check.returncode:
        raise RuntimeError('Python AI dependencies are missing or unusable. Repair the existing environment using setup.ps1 separately. No automatic installation was performed.')


def read_state(directory):
    try:
        return json.loads((directory / 'backend-8000.json').read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return {}


def write_state(directory, data):
    temp = directory / 'backend-8000.json.tmp'
    temp.write_text(json.dumps(data), encoding='utf-8')
    temp.replace(directory / 'backend-8000.json')


def ensure(model, directory, timeout=90):
    model = Path(model).resolve()
    if not model.is_file():
        raise RuntimeError(f'Missing trained model: {model}. Copy your existing best.pt to this path or set MICROCAD_MODEL. Manual measurement remains available. No model was downloaded.')
    deadline = time.monotonic() + timeout
    with startup_lock(directory, deadline):
        existing = health()
        if existing:
            if not same_model(existing, model):
                raise RuntimeError('Port 8000 is serving another model/application. It was not stopped.')
            if existing.get('model_ready') is True:
                return 'AI is ready (reused existing backend).'
            raise RuntimeError('The existing AI backend reports model_ready=false. Stop/repair that backend before retrying; no duplicate server was started.')
        if occupied():
            raise RuntimeError('Port 8000 is occupied but AI health cannot be verified. No duplicate server was started and no other process was stopped.')
        check_python()
        if time.monotonic() >= deadline:
            raise RuntimeError('AI startup timed out during environment checks. Try a longer startup timeout.')
        launch_id = uuid.uuid4().hex
        log = directory / 'backend-8000.log'
        env = os.environ.copy()
        env.update(MICROCAD_MODEL=str(model), MICROCAD_CONF='0.25', MICROCAD_IMGSZ='640', MICROCAD_LAUNCH_ID=launch_id)
        kwargs = {'creationflags': subprocess.CREATE_NO_WINDOW} if os.name == 'nt' else {'start_new_session': True}
        with log.open('ab', buffering=0) as output:
            process = subprocess.Popen([sys.executable, '-m', 'uvicorn', 'server:app', '--host', '127.0.0.1', '--port', '8000'],
                cwd=ROOT, env=env, stdin=subprocess.DEVNULL, stdout=output, stderr=output, **kwargs)
        state = {'pid': process.pid, 'instance_id': launch_id, 'root': str(ROOT), 'model': str(model)}
        try:
            write_state(directory, state)
            while time.monotonic() < deadline:
                if process.poll() is not None:
                    raise RuntimeError(f'AI process exited before readiness. See {log}')
                data = health()
                if data and data.get('instance_id') == launch_id and data.get('pid') == process.pid:
                    if not same_model(data, model):
                        raise RuntimeError(f'AI loaded an unexpected model. See {log}')
                    if data.get('model_ready') is True:
                        return f'AI is ready. Stop it using the Stop MicroCAD AI shortcut. Log: {log}'
                    if data.get('error'):
                        raise RuntimeError(f'AI could not load the model. See {log}')
                time.sleep(.15)  # Poll the actual readiness condition, not a fixed startup sleep.
            raise RuntimeError(f'AI did not become ready within {timeout}s. See {log}')
        except BaseException:
            if process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=5)
            (directory / 'backend-8000.json').unlink(missing_ok=True)
            raise


def stop(directory):
    with startup_lock(directory, time.monotonic() + 10):
        state, data = read_state(directory), health()
        if not data:
            return 'No responding AI backend found. No process was stopped.'
        if (not state or state.get('root') != str(ROOT) or not state.get('instance_id')
                or state.get('instance_id') != data.get('instance_id') or state.get('pid') != data.get('pid')):
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
            os.environ.get('MICROCAD_MODEL', ROOT / 'runs/segment/hole_inner-2/weights/best.pt'), state_directory(), args.timeout)
        print(result)
        return 0
    except Exception as exc:
        print(f'AI unavailable: {exc}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())

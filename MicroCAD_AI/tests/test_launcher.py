"""Lifecycle tests use fake processes/health, never import or load a YOLO model."""
import importlib.util
import json
from pathlib import Path
import threading
import time
from concurrent.futures import ThreadPoolExecutor
import pytest

spec = importlib.util.spec_from_file_location('launcher', Path(__file__).parents[1] / 'launcher.py')
launcher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(launcher)


@pytest.fixture
def env(tmp_path, monkeypatch):
    root = tmp_path / 'Micro CAD tiếng Việt'
    root.mkdir()
    model = root / 'best.pt'
    model.touch()
    monkeypatch.setattr(launcher, 'ROOT', root)
    monkeypatch.setattr(launcher, 'health', lambda: None)
    monkeypatch.setattr(launcher, 'occupied', lambda: False)
    monkeypatch.setattr(launcher, 'check_python', lambda: None)
    return root, model, tmp_path / 'state'


def test_missing_model_never_starts_process(env, monkeypatch):
    root, model, directory = env
    model.unlink()
    monkeypatch.setattr(launcher.subprocess, 'Popen', lambda *a, **k: pytest.fail('spawned'))
    with pytest.raises(RuntimeError, match='Missing trained model'):
        launcher.ensure(model, directory)


def test_reuse_ready_backend(env, monkeypatch):
    root, model, directory = env
    monkeypatch.setattr(launcher, 'health', lambda: {'status':'online','model_path':str(model),'model_ready':True})
    monkeypatch.setattr(launcher.subprocess, 'Popen', lambda *a, **k: pytest.fail('duplicate'))
    assert 'reused' in launcher.ensure(model, directory)


@pytest.mark.parametrize('response,message', [
    ({'status':'online','model_path':'another.pt','model_ready':True}, 'another model'),
    ({'status':'online','model_ready':True}, 'another model'),
])
def test_foreign_service_is_not_reused(env, monkeypatch, response, message):
    monkeypatch.setattr(launcher, 'health', lambda: response)
    with pytest.raises(RuntimeError, match=message): launcher.ensure(env[1], env[2])


def test_unready_backend_and_port_conflict_do_not_spawn(env, monkeypatch):
    monkeypatch.setattr(launcher, 'health', lambda: {'status':'online','model_path':str(env[1]),'model_ready':False})
    with pytest.raises(RuntimeError, match='model_ready=false'): launcher.ensure(env[1], env[2])
    monkeypatch.setattr(launcher, 'health', lambda: None)
    monkeypatch.setattr(launcher, 'occupied', lambda: True)
    with pytest.raises(RuntimeError, match='occupied'): launcher.ensure(env[1], env[2])


class Process:
    pid = 123456
    terminated = False
    def poll(self): return None
    def terminate(self): self.terminated = True
    def wait(self, timeout): return 0


def test_start_waits_for_actual_readiness_and_handles_unicode_paths(env, monkeypatch):
    seen, process = {}, Process()
    def spawn(args, **kwargs):
        seen.update(kwargs);seen['args']=args
        return process
    def health():
        if not seen: return None
        return {'status':'online','model_path':str(env[1]),'model_ready':True,
                'pid':process.pid,'instance_id':seen['env']['MICROCAD_LAUNCH_ID']}
    monkeypatch.setattr(launcher.subprocess, 'Popen', spawn)
    monkeypatch.setattr(launcher, 'health', health)
    assert 'AI is ready' in launcher.ensure(env[1], env[2])
    assert seen['cwd'] == env[0]
    assert seen['env']['MICROCAD_MODEL'] == str(env[1])
    assert seen['args'][-4:] == ['--host','127.0.0.1','--port','8000']
    assert not process.terminated
    assert json.loads((env[2]/'backend-8000.json').read_text())['pid'] == process.pid


@pytest.mark.parametrize('failure', ['timeout','exit','model-error'])
def test_failed_start_cleans_up_only_its_child(env, monkeypatch, failure):
    process, seen = Process(), {}
    if failure == 'exit': process.poll = lambda: 1
    def spawn(*a, **kwargs): seen.update(kwargs);return process
    def health():
        if failure == 'model-error' and seen:
            return {'status':'online','model_path':str(env[1]),'model_ready':False,'error':'bad weights',
                    'pid':process.pid,'instance_id':seen['env']['MICROCAD_LAUNCH_ID']}
        return None
    monkeypatch.setattr(launcher.subprocess,'Popen',spawn)
    monkeypatch.setattr(launcher,'health',health)
    with pytest.raises(RuntimeError): launcher.ensure(env[1],env[2],timeout=.04)
    assert process.terminated == (failure != 'exit')
    assert not (env[2]/'backend-8000.json').exists()


def test_missing_dependencies_do_not_spawn(env, monkeypatch):
    def fail(): raise RuntimeError('dependencies missing')
    monkeypatch.setattr(launcher,'check_python',fail)
    monkeypatch.setattr(launcher.subprocess,'Popen',lambda *a,**k: pytest.fail('spawned'))
    with pytest.raises(RuntimeError,match='dependencies'): launcher.ensure(env[1],env[2])


def test_stop_requires_matching_owner_and_pid(env, monkeypatch):
    directory=env[2];directory.mkdir()
    state={'root':str(env[0]),'pid':123,'instance_id':'owned'}
    launcher.write_state(directory,state)
    monkeypatch.setattr(launcher,'health',lambda:{'pid':123,'instance_id':'different'})
    monkeypatch.setattr(launcher.os,'kill',lambda *a: pytest.fail('killed unrelated process'))
    with pytest.raises(RuntimeError,match='not owned'): launcher.stop(directory)
    responses=iter([{'pid':123,'instance_id':'owned'},None])
    monkeypatch.setattr(launcher,'health',lambda:next(responses))
    killed=[];monkeypatch.setattr(launcher.os,'kill',lambda *args:killed.append(args))
    assert 'stopped' in launcher.stop(directory)
    assert killed == [(123,launcher.signal.SIGTERM)]


def test_concurrent_launchers_start_exactly_one_backend(env, monkeypatch):
    state, mutex = {}, threading.Lock()
    def spawn(*a,**kwargs):
        with mutex:
            assert not state
            state.update(status='online',model_path=str(env[1]),model_ready=True,pid=Process.pid,
                         instance_id=kwargs['env']['MICROCAD_LAUNCH_ID'])
        return Process()
    monkeypatch.setattr(launcher.subprocess,'Popen',spawn)
    monkeypatch.setattr(launcher,'health',lambda:dict(state) if state else None)
    with ThreadPoolExecutor(2) as pool:
        results=list(pool.map(lambda _:launcher.ensure(env[1],env[2]), range(2)))
    assert sum('reused' in result for result in results)==1


def test_real_local_http_child_readiness_reuse_and_stop(env, monkeypatch):
    """Exercise real transport/process teardown with a tiny HTTP fixture, not YOLO."""
    monkeypatch.undo()
    if launcher.occupied(): pytest.skip('Port 8000 already owned by another application')
    monkeypatch.setattr(launcher,'ROOT',env[0])
    monkeypatch.setattr(launcher,'check_python',lambda:None)
    original=launcher.subprocess.Popen
    children=[]
    code='''import http.server,json,os
class Handler(http.server.BaseHTTPRequestHandler):
 def do_GET(self):
  self.send_response(200);self.end_headers();self.wfile.write(json.dumps(dict(status='online',model_ready=True,model_path=os.environ['MICROCAD_MODEL'],pid=os.getpid(),instance_id=os.environ['MICROCAD_LAUNCH_ID'])).encode())
http.server.HTTPServer(('127.0.0.1',8000),Handler).serve_forever()
'''
    def spawn(args,**kwargs):
        child=original([launcher.sys.executable,'-c',code],**kwargs);children.append(child);return child
    monkeypatch.setattr(launcher.subprocess,'Popen',spawn)
    try:
        assert 'ready' in launcher.ensure(env[1],env[2],timeout=5)
        assert 'reused' in launcher.ensure(env[1],env[2],timeout=5)
        assert len(children)==1
        assert 'stopped' in launcher.stop(env[2])
        assert children[0].wait(timeout=5) is not None
    finally:
        for child in children:
            if child.poll() is None: child.terminate();child.wait(timeout=5)

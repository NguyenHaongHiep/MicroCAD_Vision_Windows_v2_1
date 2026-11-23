"""Lifecycle tests use fake processes/health, never import or load a YOLO model."""
import importlib.util
import json
from pathlib import Path
import socket
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
    returncode = 1
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
    assert seen['args'][-5:] == ['--host','127.0.0.1','--port','8000','--no-access-log']
    assert not process.terminated
    assert json.loads((env[2]/'backend-8000.json').read_text())['pid'] == process.pid


@pytest.mark.parametrize('failure, code', [
    ('no-health', 'BACKEND_TIMEOUT'),
    ('slow-model', 'MODEL_TIMEOUT'),
    ('exit', 'BACKEND_EXIT'),
    ('model-error', 'CUDA'),
    ('port-race', 'PORT_IN_USE'),
])
def test_failed_start_cleans_up_only_its_child(env, monkeypatch, failure, code):
    process, seen = Process(), {}
    if failure == 'exit':
        process.poll = lambda: 1
    stages = []
    def spawn(*args, **kwargs):
        seen.update(kwargs)
        if failure == 'exit':
            kwargs['stdout'].write(b'RuntimeError: example startup failure\\n')
        return process

    def health():
        if not seen or failure in {'exit', 'no-health'}:
            return None
        data = {'status':'online','model_path':str(env[1]),'model_ready':False,
                'pid':process.pid,'instance_id':seen['env']['MICROCAD_LAUNCH_ID'],
                'startup_state':'loading'}
        if failure == 'model-error':
            data.update(error='bad CUDA device', error_code='CUDA', startup_state='failed')
        elif failure == 'port-race':
            data.update(instance_id='other')
        return data

    monkeypatch.setattr(launcher.subprocess,'Popen',spawn)
    monkeypatch.setattr(launcher,'health',health)
    monkeypatch.setattr(launcher,'terminate_startup',lambda child: child.terminate() if child.poll() is None else None)
    with pytest.raises(launcher.StartupError) as reason:
        launcher.ensure(env[1],env[2],timeout=.12,progress=stages.append)
    assert reason.value.code == code
    if failure == 'slow-model':
        assert stages[-1] == 'LOADING'
    if failure == 'exit':
        assert 'example startup failure' in str(reason.value)
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


@pytest.mark.skipif(launcher.os.name != 'nt', reason='Windows venv redirector behavior')
def test_accepts_venv_worker_and_records_real_pid(env, monkeypatch):
    process, seen = Process(), {}
    worker_pid = process.pid + 1
    def spawn(*args, **kwargs):
        seen.update(kwargs)
        return process
    def health():
        if seen:
            return {'status':'online','model_path':str(env[1]),'model_ready':True,
                    'pid':worker_pid, 'parent_pid':process.pid,
                    'instance_id':seen['env']['MICROCAD_LAUNCH_ID']}
    monkeypatch.setattr(launcher.subprocess, 'Popen', spawn)
    monkeypatch.setattr(launcher, 'health', health)
    assert 'AI is ready' in launcher.ensure(env[1],env[2])
    assert launcher.read_state(env[2])['pid'] == worker_pid
    wrong_parent = {**health(), 'parent_pid':process.pid + 2}
    assert not launcher.owned_health(wrong_parent, process, wrong_parent['instance_id'])


def test_real_dependency_check_reports_missing_library(monkeypatch):
    monkeypatch.setattr(launcher.sys,'version_info',(3,12))
    monkeypatch.setattr(launcher.importlib.util,'find_spec',lambda name: None if name == 'torch' else object())
    with pytest.raises(launcher.StartupError, match='torch') as reason:
        launcher.check_python()
    assert reason.value.code == 'DEPENDENCY'


def test_existing_loading_backend_is_reused(env, monkeypatch):
    pending = {'status':'online','model_path':str(env[1]),'model_ready':False,
               'startup_state':'loading','pid':100}
    responses = iter([pending, dict(pending, model_ready=True, startup_state='ready')])
    monkeypatch.setattr(launcher,'health',lambda: next(responses))
    monkeypatch.setattr(launcher.subprocess,'Popen',lambda *a,**k: pytest.fail('duplicate'))
    assert 'reused' in launcher.ensure(env[1],env[2])


@pytest.mark.parametrize('ready', [True, False])
def test_real_local_http_child_cleanup(env, monkeypatch, ready):
    """Exercise real transport/process teardown with a tiny HTTP fixture, not YOLO."""
    monkeypatch.undo()
    with socket.socket() as probe:
        probe.bind(('127.0.0.1', 0))
        port = probe.getsockname()[1]
    monkeypatch.setattr(launcher, 'PORT', port)
    monkeypatch.setattr(launcher,'ROOT',env[0])
    monkeypatch.setattr(launcher,'check_python',lambda:None)
    original=launcher.subprocess.Popen
    children=[]
    code='''import http.server,json,os
class Handler(http.server.BaseHTTPRequestHandler):
 def do_GET(self):
  self.send_response(200);self.end_headers();self.wfile.write(json.dumps(dict(status='online',model_ready=os.environ['TEST_READY']=='1',startup_state=('ready' if os.environ['TEST_READY']=='1' else 'loading'),model_path=os.environ['MICROCAD_MODEL'],pid=os.getpid(),parent_pid=os.getppid(),instance_id=os.environ['MICROCAD_LAUNCH_ID'])).encode())
http.server.HTTPServer(('127.0.0.1',int(os.environ['TEST_PORT'])),Handler).serve_forever()
'''
    def spawn(args,**kwargs):
        if args[0] != launcher.sys.executable:
            return original(args, **kwargs)
        kwargs['env']['TEST_PORT'] = str(port)
        kwargs['env']['TEST_READY'] = '1' if ready else '0'
        child=original([launcher.sys.executable,'-c',code],**kwargs)
        children.append(child)
        return child
    monkeypatch.setattr(launcher.subprocess,'Popen',spawn)
    try:
        if ready:
            assert 'ready' in launcher.ensure(env[1],env[2],timeout=5)
            assert 'reused' in launcher.ensure(env[1],env[2],timeout=5)
            assert 'stopped' in launcher.stop(env[2])
        else:
            with pytest.raises(launcher.StartupError) as reason:
                launcher.ensure(env[1],env[2],timeout=2)
            assert reason.value.code == 'MODEL_TIMEOUT'
        assert len(children)==1
        assert children[0].wait(timeout=5) is not None
        deadline = time.monotonic() + 3
        while launcher.occupied() and time.monotonic() < deadline:
            time.sleep(.05)
        assert not launcher.occupied()
    finally:
        for child in children:
            if child.poll() is None: child.terminate();child.wait(timeout=5)

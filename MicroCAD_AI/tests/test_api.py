from fastapi.testclient import TestClient
from server import app
def test_health():
 r=TestClient(app).get('/health');assert r.status_code==200;assert r.json()['status']=='online'

def test_health_exposes_launcher_identity_without_changing_existing_fields(monkeypatch):
 import os,server
 monkeypatch.setenv('MICROCAD_LAUNCH_ID','test-launch-instance')
 data=server.health()
 assert data['pid']==os.getpid() and data['instance_id']=='test-launch-instance'
 assert {'status','model_ready','model_path','device','cuda_available','error'}<=data.keys()


def test_health_tracks_model_loading_without_blocking_http(tmp_path, monkeypatch):
    import threading
    import time
    import server

    checkpoint = tmp_path / 'best.pt'
    checkpoint.touch()
    entered, release = threading.Event(), threading.Event()
    monkeypatch.setattr(server, 'MODEL', checkpoint)
    monkeypatch.setattr(server, 'DEVICE', 'cpu')
    monkeypatch.setattr(server, '_engine', None)
    monkeypatch.setattr(server, '_startup', ('loading', None, None))

    def slow_model(*_):
        entered.set()
        assert release.wait(5)
        return object()

    monkeypatch.setattr(server, 'HoleSegmenter', slow_model)
    with TestClient(app) as client:
        try:
            assert entered.wait(5)
            pending = client.get('/health').json()
            assert pending['startup_state'] == 'loading' and not pending['model_ready']
            assert pending['parent_pid'] > 0
            response = client.post('/detect', files={'file': ('sample.png', b'x', 'image/png')})
            assert response.status_code == 503
        finally:
            release.set()
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline and not client.get('/health').json()['model_ready']:
            time.sleep(.02)
        assert client.get('/health').json()['startup_state'] == 'ready'


def test_health_reports_missing_model_and_cuda_failure(tmp_path, monkeypatch):
    import server

    checkpoint = tmp_path / 'best.pt'
    monkeypatch.setattr(server, 'MODEL', checkpoint)
    monkeypatch.setattr(server, 'DEVICE', 'cuda:0')
    monkeypatch.setattr(server, 'CUDA_AVAILABLE', False)
    monkeypatch.setattr(server, '_engine', None)
    monkeypatch.setattr(server, '_startup', ('loading', None, None))
    server.preload_model()
    missing = server.health()
    assert missing['error_code'] == 'MODEL_MISSING' and not missing['model_ready']
    checkpoint.touch()
    server.preload_model()
    invalid_gpu = server.health()
    assert invalid_gpu['error_code'] == 'CUDA' and not invalid_gpu['model_ready']
    assert 'visible devices: 0' in invalid_gpu['error']

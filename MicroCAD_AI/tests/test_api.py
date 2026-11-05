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

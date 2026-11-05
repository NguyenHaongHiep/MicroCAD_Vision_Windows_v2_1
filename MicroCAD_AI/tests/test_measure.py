import math,numpy as np
from measure import robust_circle_fit
def test_robust_circle_with_outliers():
 rng=np.random.default_rng(7);a=np.linspace(0,2*math.pi,180,endpoint=False);p=np.c_[120+40*np.cos(a),80+40*np.sin(a)]+rng.normal(0,.35,(180,2));p=np.vstack([p,rng.uniform([0,0],[240,160],(25,2))]);c,r,e,inside=robust_circle_fit(p,seed=7);assert np.linalg.norm(c-[120,80])<1;assert abs(r-40)<1;assert e<1;assert len(inside)>=150

const assert = require('node:assert/strict');
const a = require('../analytics-engine.js');
const t = a.defaults.circle;
assert.equal(a.classify(.570,t),'within');
assert.equal(a.classify(.630,t),'within');
assert.equal(a.classify(.569,t),'below');
assert.equal(a.classify(.631,t),'above');
assert.equal(a.classify(.6,{lsl:1,target:0,usl:2}),null);
const input=[{imgId:4,imgName:'A',cal:{mmPerPx:.01,refName:'R'},measures:[
 {id:1,type:'circle',px:57},{id:2,type:'circle',px:60},{id:3,type:'circle',px:63},
 {id:4,type:'circleGap',px:80},{id:5,type:'edges',px:80}]},
 {imgId:5,imgName:'B',cal:null,measures:[{id:6,type:'circle',px:60}]}];
const rows=a.records(input,m=>m.px), g=a.groups(rows);
assert.equal(rows.length,6); assert.equal(rows[0].imageId,4); assert.equal(rows[0].measurementId,1);
assert.equal(rows[0].mmPerPx,.01); assert.equal(rows[5].valueMm,null);
assert.equal(g.circle.count,3); assert.equal(g.circle.uncalibrated,1);
assert(Math.abs(g.circle.mean-.6)<1e-12); assert(Math.abs(g.circle.sampleStdDev-.03)<1e-12);
assert(Math.abs(g.circle.min-.57)<1e-12); assert(Math.abs(g.circle.max-.63)<1e-12);
assert.equal(g.circle.counts.within,3); assert.equal(g.circle.passRate,1);
assert.equal(g.circleGap.count,1); assert.equal(g.edges.count,1); assert.equal(g.edges.evaluated,0);
assert.notEqual(rows[3].method,rows[4].method);
assert.equal(a.summarize([],t).mean,null); assert.equal(a.summarize([],t).passRate,null);
assert.equal(a.summarize([{valueMm:.6}],t).sampleStdDev,null);
assert.equal(a.summarize([{valueMm:.5},{valueMm:.6},{valueMm:.7}],t).passRate,1/3);
assert.throws(()=>a.records([],null),TypeError);
const differing=[{imageId:1,valueMm:.56999},{imageId:2,valueMm:.56999}];
const mixed=a.summarize(differing,row=>row.imageId===1?t:{...t,lsl:.56});
assert.equal(mixed.counts.within,1); assert.equal(mixed.counts.below,1);
assert.equal(mixed.passRate,.5);
assert.equal(a.summarize(differing,row=>row.imageId===1?t:undefined).evaluated,1);
console.log('Analytics engine tests passed');

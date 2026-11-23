const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const Auto=require('../ai-auto-measure.js');
const html=fs.readFileSync(path.join(__dirname,'../MicroCAD_Vision.html'),'utf8');
const ctx=vm.createContext({Math,idSeed:1,pt:(x,y)=>({x,y})});
vm.runInContext(html.slice(html.indexOf('function circleGapGeometry('),html.indexOf('function chooseGapCircle(')),ctx);
const hooks={nextId:()=>ctx.idSeed++,makeGap:(a,b)=>ctx.makeCircleGap(a,b)};
const detection=(x,y=200,extra={})=>({center_x:x,center_y:y,radius_px:60,diameter_px:120,confidence:.95,fit_error:1,angular_coverage:.95,review_required:false,polygon:[],...extra});
const record=(id=1)=>({imgId:id,imgName:`image-${id}.png`,width:1600,height:1000,cal:{mmPerPx:.005},measures:[],history:[],aiPending:[]});
const response=ds=>({width:1600,height:1000,coordinate_space:'original_image_pixels',model_version:'fixture',detections:ds});
const run=(ds,settings={},r=record())=>{Auto.measure(r,response(ds),settings,hooks,'run-1');return r;};
const circles=r=>r.measures.filter(m=>m.type==='circle');
const gaps=r=>r.measures.filter(m=>m.type==='circleGap');
for(const n of [2,3,5])test(`${n} holes produce ${n} diameters and ${n-1} adjacent edge gaps`,()=>{
 const r=run(Array.from({length:n},(_,i)=>detection(100+280*i)));
 assert.equal(circles(r).length,n);assert.equal(gaps(r).length,n-1);
 for(const c of circles(r))assert.equal(2*c.r*r.cal.mmPerPx,.6);
 for(const g of gaps(r)){assert.equal(Math.hypot(g.p1.x-g.p2.x,g.p1.y-g.p2.y)*r.cal.mmPerPx,.8);assert.equal(g.relation,'separate');}
 assert(!gaps(r).some(g=>g.circleIds.includes(circles(r)[0].id)&&g.circleIds.includes(circles(r).at(-1).id)&&n>2));
});
test('multiple rows never connect across rows; shuffled input preserves geometric order',()=>{
 const r=run([detection(660,600),detection(380),detection(100,600),detection(100),detection(660),detection(380,600)]);
 assert.equal(gaps(r).length,4);
 for(const g of gaps(r)){const [a,b]=g.circleIds.map(id=>circles(r).find(c=>c.id===id));assert.equal(a.c.y,b.c.y);assert.equal(Math.abs(a.c.x-b.c.x),280);}
});
test('tilted row uses projection and vertical mode sorts y',()=>{
 const r=run([detection(660,480),detection(100,200),detection(380,340)]);
 assert.equal(gaps(r).length,2);
 const v=run([detection(200,760),detection(200,200),detection(200,480)],{direction:'vertical'});
 assert.equal(gaps(v).length,2);
});
test('ambiguous square is not paired until direction is specified',()=>{
 const ds=[detection(200,200),detection(500,200),detection(200,500),detection(500,500)];
 const r=run(ds);assert.equal(gaps(r).length,0);assert(r.aiAuto.issues.some(x=>x.code==='ambiguous_rows'));
 assert.equal(gaps(run(ds,{direction:'horizontal'})).length,2);
 assert.equal(gaps(run(ds,{direction:'vertical'})).length,2);
});
test('intersecting, tangent and contained circles retain existing geometry and require review',()=>{
 for(const [x,radius,relation] of [[190,60,'intersect'],[220,60,'tangent'],[130,10,'contained']]){
  const r=run([detection(100),detection(x,200,{radius_px:radius,diameter_px:radius*2})]);
  assert.equal(gaps(r).length,1);const g=gaps(r)[0];assert.equal(g.relation,relation);assert.equal(g.reviewRequired,true);
  if(relation!=='contained')assert.equal(Math.hypot(g.p1.x-g.p2.x,g.p1.y-g.p2.y),0);
 }
});
test('invalid or missing detections produce exceptions without invented gaps',()=>{
 const single=run([detection(100)]);assert.equal(gaps(single).length,0);assert(single.aiAuto.issues.length);
 const bad=run([detection(100),detection(NaN),detection(660)]);assert.equal(circles(bad).length,2);assert.equal(gaps(bad).length,0);assert.equal(bad.aiAuto.rejected.length,1);
 assert.equal(circles(run([detection(-1),detection(1700),detection(100,200,{radius_px:-1})])).length,0);
 assert.throws(()=>Auto.normalize(record(),{...response([]),width:12},{}),/dimension|Kích thước/i);
});
test('confidence, relative fit, coverage, API flags and border produce review reasons',()=>{
 for(const extra of [{confidence:.2},{fit_error:9},{angular_coverage:.2},{review_required:true}]){
  const r=run([detection(100,200,extra),detection(380)]);
  assert(circles(r)[0].reviewRequired);assert(gaps(r)[0].reviewRequired);
  assert.equal(Auto.summary(r).valid,1);assert.equal(Auto.summary(r).review,2);
 }
 assert(circles(run([detection(20)]))[0].reviewRequired);
 assert(!circles(run([detection(100,200,{confidence:.5})],{minConfidence:.4}))[0].reviewRequired);
 assert(circles(run([detection(100,200,{confidence:.5})],{minConfidence:.8}))[0].reviewRequired);
});
test('uncalibrated results expose pixels and never pretend mm',()=>{
 const r=record();r.cal=null;run([detection(100),detection(380)],{},r);
 const s=Auto.summary(r);assert.equal(s.unit,'px');assert.deepEqual(s.diameters.map(x=>x.value),[120,120]);assert.equal(s.gaps[0].value,160);
});
test('duplicate payloads and reruns reuse circles and unordered pairs, preserving manual geometry',()=>{
 const r=record();r.measures.push({id:500,type:'circle',c:{x:100,y:200},r:60,name:'Manual',shift:{x:4,y:5}});
 const manual=JSON.stringify(r.measures[0]);const ds=[detection(380),detection(100),detection(380)];
 run(ds,{},r);const initial=JSON.stringify(r.measures);run([...ds].reverse(),{},r);
 assert.equal(circles(r).length,2);assert.equal(gaps(r).length,1);assert.equal(JSON.stringify(r.measures[0]),manual);assert.equal(JSON.stringify(r.measures),initial);
});
test('abnormally long pitch is not bridged across a possible missing hole',()=>{
 const r=run([100,380,660,1220].map(x=>detection(x)));assert.equal(gaps(r).length,2);assert(r.aiAuto.issues.some(x=>x.code==='spacing_outlier'));
});
test('batch continues after errors and rollback removes only automatic additions',async()=>{
 const records=[record(1),record(2),record(3)];records[0].measures.push({id:900,type:'distance',p1:{x:1,y:1},p2:{x:3,y:1}});
 const tx=await Auto.runBatch(records,{settings:{},hooks,runId:'batch',request:async r=>{if(r.imgId===2)throw Error('Image broken');return response([detection(100),detection(380)]);}});
 assert.equal(records[1].aiAuto.status,'error');assert.equal(circles(records[2]).length,2);assert.equal(tx.completed,2);assert.equal(tx.failed,1);
 records[0].measures.push({id:901,type:'distance',p1:{x:1,y:1},p2:{x:4,y:1}});
 Auto.rollback(records,tx);assert.deepEqual(records[0].measures.map(x=>x.id),[900,901]);assert.equal(records[2].measures.length,0);
});
test('cancel retains committed images and ignores a late inference response',async()=>{
 const records=[record(1),record(2),record(3)],controller=new AbortController();
 const tx=await Auto.runBatch(records,{settings:{},hooks,signal:controller.signal,request:async r=>{if(r.imgId===2)controller.abort();return response([detection(100),detection(380)]);}});
 assert.equal(tx.completed,1);assert.equal(tx.cancelled,true);assert.equal(records[0].measures.length,3);assert.equal(records[1].measures.length,0);assert.equal(records[2].measures.length,0);
 Auto.rollback(records,tx);assert(records.every(r=>r.measures.length===0));
});
test('AI Save/Load preserves authoritative geometry with noisy, absent or empty polygon samples',()=>{
 const loadCtx=vm.createContext({Math,Number,idSeed:1,width:1600,height:1000,pt:(x,y)=>({x,y}),fitCircle:()=>{throw Error('AI geometry must not be refitted');}});
 vm.runInContext(html.slice(html.indexOf('function circleGapGeometry('),html.indexOf('function chooseGapCircle(')),loadCtx);
 vm.runInContext(html.slice(html.indexOf('function finite('),html.indexOf('function validateCal(')),loadCtx);
 for(const edgePts of [undefined,[],[{x:10,y:20},{x:500,y:22},{x:50,y:600}]]){
  const r=run([detection(100),detection(380)]);circles(r)[0].edgePts=edgePts;
  const loaded=loadCtx.validateMeasures(JSON.parse(JSON.stringify(r.measures)),1600,1000,false);
  assert.equal(loaded[0].r,60);assert.deepEqual(JSON.parse(JSON.stringify(loaded[0].c)),{x:100,y:200});
  assert.equal(loaded[2].autoMeasure,true);assert.equal(loaded[2].ai,true);assert.equal(loaded[2].sourceImageId,1);assert.equal(loaded[0].fitRms,1);
 }
});
test('Analytics retains raw review values but excludes them from statistical/tolerance populations',()=>{
 const Analytics=require('../analytics-engine.js');
 const r=run([detection(100,200,{confidence:.1}),detection(380)]);
 const rows=Analytics.records([r],m=>m.type==='circle'?2*m.r:Math.hypot(m.p1.x-m.p2.x,m.p1.y-m.p2.y));
 assert.equal(rows.length,3);assert.equal(rows[0].valueMm,.6);assert.equal(rows[0].reviewRequired,true);
 const stats=Analytics.summarize(rows,Analytics.defaults.circle);assert.equal(stats.count,1);assert.equal(stats.evaluated,1);assert.equal(stats.review,2);assert.equal(stats.mean,.6);
});
test('rerun with poorer quality flags reused AI geometry and its existing gaps, and can be undone',async()=>{
 const r=run([detection(100),detection(380)]),before=JSON.stringify(r.measures);
 const tx=await Auto.runBatch([r],{settings:{},hooks,request:async()=>response([detection(100,200,{confidence:.1}),detection(380)])});
 assert.equal(r.measures.length,3);assert.equal(circles(r)[0].reviewRequired,true);assert.equal(gaps(r)[0].reviewRequired,true);
 Auto.rollback([r],tx);assert.equal(JSON.stringify(r.measures),before);
});
test('rollback never removes an automatic source used by a later manual gap',()=>{
 const r=run([detection(100),detection(380)]),ids=r.measures.map(m=>m.id);
 r.measures.push({id:990,type:'circleGap',circleIds:ids.slice(0,2),...ctx.circleGapGeometry(r.measures[0],r.measures[1])});
 Auto.rollback([r],{runId:'run-1',entries:[{imageId:1,addedIds:ids}]});
 assert.deepEqual(r.measures.map(m=>m.id),[ids[0],ids[1],990]);
});
test('Analytics excludes gaps derived manually from a review circle',()=>{
 const Analytics=require('../analytics-engine.js'),r=run([detection(100,200,{confidence:.1}),detection(380)]);
 const gap=gaps(r)[0];delete gap.ai;delete gap.reviewRequired;
 const rows=Analytics.records([r],m=>m.type==='circle'?2*m.r:Math.hypot(m.p1.x-m.p2.x,m.p1.y-m.p2.y));
 assert.equal(rows[2].reviewRequired,true);assert.equal(Analytics.summarize(rows).count,1);
});
test('two detections matching the same manual circle never produce a self-referencing gap',()=>{
 const r=record();r.measures=[{id:550,type:'circle',c:{x:300,y:200},r:60}];
 run([detection(300,200,{radius_px:40,diameter_px:80}),detection(300,200,{radius_px:80,diameter_px:160})],{},r);
 assert.equal(gaps(r).length,0);assert.equal(r.aiAuto.circleIds.length,1);
});
test('changed inference geometry does not silently present stale dimensions as fresh trustworthy results',()=>{
 const r=run([detection(100),detection(380)]);
 run([detection(100,200,{radius_px:65,diameter_px:130}),detection(380)],{},r);
 assert.equal(circles(r).length,2);assert.equal(circles(r)[0].r,60);assert.equal(circles(r)[0].reviewRequired,true);
 assert.equal(gaps(r)[0].reviewRequired,true);
});
test('auto mode removes obsolete preview overlays and batch undo restores them',async()=>{
 const r=record();r.aiPending=[{proposalId:7,...detection(100)}];const pending=JSON.stringify(r.aiPending);
 const tx=await Auto.runBatch([r],{settings:{},hooks,request:async()=>response([detection(100),detection(380)])});
 assert.equal(r.aiPending.length,0);Auto.rollback([r],tx);assert.equal(JSON.stringify(r.aiPending),pending);
});

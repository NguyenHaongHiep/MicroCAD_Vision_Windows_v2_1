/* Detection policy and batch transactions. Geometry is supplied by the CAD application. */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.MicroCADAutoMeasure=api;
})(globalThis,function(){
 'use strict';
 const defaults=Object.freeze({direction:'auto',minConfidence:.6,maxFitRatio:.08,minCoverage:.55,rowTolerance:.6,maxPitchRatio:1.8,maxGeometryDriftRatio:.01});
 const finite=Number.isFinite,clone=value=>value===undefined?undefined:structuredClone(value);
 const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
 const median=values=>{const sorted=[...values].sort((a,b)=>a-b);return sorted.length?sorted[Math.floor((sorted.length-1)/2)]:0;};
 const pairKey=ids=>[...ids].sort((a,b)=>a-b).join(':');
 function settings(raw={}){
  const s={...defaults,...raw};
  if(!['auto','horizontal','vertical'].includes(s.direction))throw Error('Hướng hàng không hợp lệ');
  for(const [key,min,max] of [['minConfidence',0,1],['maxFitRatio',.001,1],['minCoverage',0,1],['rowTolerance',.05,1],['maxPitchRatio',1.1,10],['maxGeometryDriftRatio',0,.5]]){
   if(!finite(s[key])||s[key]<min||s[key]>max)throw Error('Cấu hình không hợp lệ: '+key);
  }
  return s;
 }
 function sameCircle(a,b){return distance(a.c,b.c)<Math.max(a.r,b.r)*.45&&Math.abs(a.r-b.r)<Math.max(a.r,b.r)*.35;}
 function normalize(record,result,raw={}){
  const s=settings(raw);
  if(result?.width!==record.width||result?.height!==record.height)throw Error('Kích thước API không khớp ảnh gốc');
  if(result.coordinate_space&&result.coordinate_space!=='original_image_pixels')throw Error('Hệ tọa độ AI không hợp lệ');
  if(!Array.isArray(result.detections)||result.detections.length>1000)throw Error('Danh sách detection không hợp lệ');
  const detections=[],rejected=[];let duplicates=0;
  for(const [index,input] of result.detections.entries()){
   const f=input||{},c={x:f.center_x,y:f.center_y},r=f.radius_px;
   if(![c.x,c.y,r].every(finite)||r<.5||r>Math.max(record.width,record.height)||c.x<0||c.y<0||c.x>record.width||c.y>record.height){
    rejected.push({index,reason:'Tâm/bán kính không hợp lệ hoặc ngoài ảnh'});continue;
   }
   const reasons=[];
   if(!finite(f.confidence)||f.confidence<0||f.confidence>1||f.confidence<s.minConfidence)reasons.push('Confidence thấp/thiếu');
   if(!finite(f.fit_error)||f.fit_error<0||f.fit_error/r>s.maxFitRatio)reasons.push('Fit error cao/thiếu');
   if(!finite(f.angular_coverage)||f.angular_coverage>1||f.angular_coverage<0||f.angular_coverage<s.minCoverage)reasons.push('Coverage thấp/thiếu');
   if(f.review_required===true)reasons.push('Backend yêu cầu kiểm tra');
   if(c.x-r<2||c.y-r<2||c.x+r>record.width-2||c.y+r>record.height-2)reasons.push('Lỗ sát/cắt biên ảnh');
   if(f.diameter_px!==undefined&&(!finite(f.diameter_px)||Math.abs(f.diameter_px-2*r)>Math.max(1e-6,r*.001)))reasons.push('Đường kính không khớp bán kính');
   const polygon=Array.isArray(f.polygon)?f.polygon.filter(p=>Array.isArray(p)&&p.length>=2&&p.every(finite)&&p[0]>=0&&p[1]>=0&&p[0]<=record.width&&p[1]<=record.height).map(p=>[p[0],p[1]]):[];
   if(f.polygon!==undefined&&(!Array.isArray(f.polygon)||polygon.length!==f.polygon.length))reasons.push('Polygon không hợp lệ');
   detections.push({...f,c,r,diameter_px:2*r,polygon,review_required:reasons.length>0,reviewReasons:reasons,modelVersion:String(result.model_version||'unknown').slice(0,200)});
  }
  const kept=[];
  for(const f of detections.sort((a,b)=>Number(a.review_required)-Number(b.review_required)||(b.confidence||0)-(a.confidence||0))){
   if(kept.some(k=>sameCircle(k,f))){duplicates++;continue;}kept.push(f);
  }
  return {detections:kept.sort((a,b)=>a.c.y-b.c.y||a.c.x-b.c.x),rejected,duplicates,settings:s};
 }
 function directionOf(row){
  const c=row.reduce((p,m)=>({x:p.x+m.c.x/row.length,y:p.y+m.c.y/row.length}),{x:0,y:0});
  let xx=0,xy=0,yy=0;
  for(const m of row){const x=m.c.x-c.x,y=m.c.y-c.y;xx+=x*x;xy+=x*y;yy+=y*y;}
  const angle=.5*Math.atan2(2*xy,xx-yy);
  return {x:Math.cos(angle),y:Math.sin(angle)};
 }
 function groupRows(circles,raw={}){
  const s=settings(raw),issues=[];
  if(circles.length<2)return {rows:[],issues:[{code:'insufficient_holes',message:'Cần ít nhất hai lỗ để đo khe'}]};
  if(circles.length===2)return {rows:[[...circles].sort((a,b)=>a.c.x-b.c.x||a.c.y-b.c.y)],issues};
  const tolerance=Math.max(1,median(circles.map(c=>c.r))*s.rowTolerance);
  const angles=s.direction==='horizontal'?[0]:s.direction==='vertical'?[Math.PI/2]:[];
  if(s.direction==='auto'){
   const seen=new Set();
   for(let i=0;i<circles.length;i++)for(let j=i+1;j<circles.length;j++){
    const a=circles[i].c,b=circles[j].c;if(distance(a,b)<1e-6)continue;
    const angle=(Math.atan2(b.y-a.y,b.x-a.x)+Math.PI)%Math.PI,key=Math.round(angle*180/Math.PI);
    if(!seen.has(key)){seen.add(key);angles.push(angle);}
   }
  }
  const candidates=angles.map(angle=>{
   const u={x:Math.cos(angle),y:Math.sin(angle)},v={x:-u.y,y:u.x};
   const points=circles.map(m=>({m,p:m.c.x*v.x+m.c.y*v.y})).sort((a,b)=>a.p-b.p);
   const groups=[];
   for(const p of points){let last=groups.at(-1);if(!last||p.p-last[0].p>tolerance){last=[];groups.push(last);}last.push(p);}
   const rows=groups.map(g=>g.map(p=>p.m)),score=rows.reduce((sum,row)=>sum+row.length*(row.length-1)/2,0);
   const signature=rows.filter(r=>r.length>1).map(r=>pairKey(r.map(m=>m.id))).sort().join('|');
   return {rows,score,signature,angle};
  }).sort((a,b)=>b.score-a.score);
  const best=candidates[0];
  if(!best||!best.score)return {rows:[],issues:[{code:'unclear_rows',message:'Không đủ bằng chứng để nhóm hàng'}]};
  if(s.direction==='auto'&&candidates.some(c=>c.signature!==best.signature&&c.score>=best.score*.9&&Math.abs(Math.sin(c.angle-best.angle))>.17)){
   return {rows:[],issues:[{code:'ambiguous_rows',message:'Hướng hàng mơ hồ; chọn Horizontal hoặc Vertical'}]};
  }
  const rows=[];
  for(const row of best.rows){
   if(row.length<2){issues.push({code:'isolated_hole',message:'Lỗ đơn không có lỗ liền kề trong hàng',circleIds:row.map(m=>m.id)});continue;}
   const u=directionOf(row);if(u.x<-.001||(Math.abs(u.x)<.001&&u.y<0)){u.x=-u.x;u.y=-u.y;}
   rows.push([...row].sort((a,b)=>(a.c.x-b.c.x)*u.x+(a.c.y-b.c.y)*u.y));
  }
  return {rows,issues};
 }
 function measure(record,result,raw,hooks,runId){
  const normalized=normalize(record,result,raw),s=normalized.settings;
  const measures=[...record.measures],selected=[],addedIds=[],updates=[],reuseIssues=[];
  function flagExisting(m,reasons){
   const before={reviewRequired:m.reviewRequired,reviewReasons:m.reviewReasons},after={reviewRequired:true,reviewReasons:[...new Set([...(m.reviewReasons||[]),...reasons])]};
   if(JSON.stringify(before)===JSON.stringify(after))return m;
   const updated={...m,...after};measures[measures.indexOf(m)]=updated;updates.push({id:m.id,before,after});return updated;
  }
  for(const f of normalized.detections){
   let m=measures.find(m=>m.type==='circle'&&sameCircle(m,f));
   if(m&&selected.some(c=>c.id===m.id)){normalized.duplicates++;reuseIssues.push({code:'ambiguous_match',message:'Nhiều detection cùng khớp một đường tròn; không tạo cặp với chính nó'});continue;}
   if(!m){
    const id=hooks.nextId(),index=measures.filter(m=>m.type==='circle').length+1;
    m={id,type:'circle',name:`${f.review_required?'⚠ ':''}Lỗ AI ${index}`,c:{...f.c},r:f.r,
     ai:true,autoMeasure:true,sourceImageId:record.imgId,aiRunId:runId,sourceKey:`${record.imgId}:${id}`,
     autoConfidence:finite(f.confidence)?f.confidence:null,fitRms:finite(f.fit_error)?f.fit_error:null,
     angularCoverage:finite(f.angular_coverage)?f.angular_coverage:null,modelVersion:f.modelVersion,
     reviewRequired:f.review_required,reviewReasons:[...f.reviewReasons],polygon:f.polygon,shift:{x:0,y:0}};
    measures.push(m);addedIds.push(id);
   }else if(m.ai){
    const reasons=[...f.reviewReasons],tolerance=Math.max(.5,m.r*s.maxGeometryDriftRatio);
    if(distance(m.c,f.c)>tolerance||Math.abs(m.r-f.r)>tolerance)reasons.push('Detection mới lệch hình học; giữ số đo đã lưu, cần kiểm tra');
    if(reasons.length)m=flagExisting(m,reasons);
   }
   selected.push(m);
  }
  const grouped=normalized.rejected.length?{rows:[],issues:[{code:'invalid_detections',message:'Có detection không hợp lệ; không tự ghép qua lỗ có thể bị thiếu'}]}:groupRows(selected,s);
  grouped.issues.push(...reuseIssues);
  const keys=new Set(measures.filter(m=>m.type==='circleGap').map(m=>pairKey(m.circleIds)));
  const gapIds=[];
  for(const [ri,row] of grouped.rows.entries()){
   const pitches=row.slice(1).map((b,i)=>distance(row[i].c,b.c)),pitch=median(pitches);
   for(let i=0;i<row.length-1;i++){
    const a=row[i],b=row[i+1],key=pairKey([a.id,b.id]);
    if(pitches.length>1&&pitches[i]>pitch*s.maxPitchRatio){grouped.issues.push({code:'spacing_outlier',message:'Bước lỗ bất thường; có thể thiếu detection',circleIds:[a.id,b.id]});continue;}
    if(keys.has(key)){
     const existing=measures.find(m=>m.type==='circleGap'&&pairKey(m.circleIds)===key);
     if(existing.ai&&(a.reviewRequired||b.reviewRequired))flagExisting(existing,['Đường tròn nguồn cần kiểm tra']);
     gapIds.push(existing.id);continue;
    }
    const gap=hooks.makeGap(a,b),reasons=[];
    if(a.reviewRequired||b.reviewRequired)reasons.push('Đường tròn nguồn cần kiểm tra');
    if(gap.relation!=='separate')reasons.push('Hai lỗ không rời nhau: '+gap.relation);
    Object.assign(gap,{name:`${reasons.length?'⚠ ':''}Gap ${i+1}–${i+2}${grouped.rows.length>1?' · H'+(ri+1):''}`,
     ai:true,autoMeasure:true,sourceImageId:record.imgId,sourceKey:`${record.imgId}:${key}`,pairKey:key,
     aiRunId:runId,reviewRequired:reasons.length>0,reviewReasons:reasons,modelVersion:result.model_version||'unknown'});
    measures.push(gap);addedIds.push(gap.id);gapIds.push(gap.id);keys.add(key);
   }
  }
  record.measures=measures;
  record.aiPending=[];
  record.aiAuto={runId,status:normalized.rejected.length||grouped.issues.length||selected.some(m=>m.reviewRequired)||gapIds.some(id=>measures.find(m=>m.id===id)?.reviewRequired)?'review':'complete',
   detected:selected.length,circleIds:selected.map(m=>m.id),gapIds,rejected:normalized.rejected,duplicates:normalized.duplicates,issues:grouped.issues,settings:s};
  return {addedIds,updates,summary:summary(record)};
 }
 function summary(record){
  const meta=record.aiAuto||{},ids=new Set([...(meta.circleIds||[]),...(meta.gapIds||[])]);
  const measures=(record.measures||[]).filter(m=>ids.has(m.id)||(!record.aiAuto&&m.autoMeasure));
  const scale=record.cal?.mmPerPx,calibrated=finite(scale)&&scale>0;
  const value=m=>({id:m.id,name:m.name,value:(m.type==='circle'?2*m.r:distance(m.p1,m.p2))*(calibrated?scale:1),review:m.reviewRequired===true});
  return {status:meta.status||'not_run',detected:meta.detected??measures.filter(m=>m.type==='circle').length,
   diameters:measures.filter(m=>m.type==='circle').map(value),gaps:measures.filter(m=>m.type==='circleGap').map(value),
   valid:measures.filter(m=>!m.reviewRequired).length,review:measures.filter(m=>m.reviewRequired).length+(meta.rejected?.length||0),
   unit:calibrated?'mm':'px',issues:meta.issues||[],rejected:meta.rejected||[],error:meta.error||''};
 }
 async function runBatch(records,{request,hooks,settings:config={},signal,runId=String(Date.now()),progress=()=>{}}){
  const s=settings(config),tx={runId,entries:[],completed:0,failed:0,cancelled:false,total:records.length};
  for(const [index,record] of records.entries()){
   if(signal?.aborted){tx.cancelled=true;break;}
   progress({index,total:records.length,record,transaction:tx});
   const previous=clone(record.aiAuto),previousPending=clone(record.aiPending||[]),before=JSON.stringify({measures:record.measures,cal:record.cal,selected:record.selected??null,aiPending:record.aiPending||[],aiAuto:record.aiAuto});
   try{
    const result=await request(record,signal);
    if(signal?.aborted){tx.cancelled=true;break;}
    const changed=measure(record,result,s,hooks,runId);
    if(changed.addedIds.length||changed.updates.length||previousPending.length){record.history||=[];record.history.push(before);if(record.history.length>75)record.history.shift();}
    tx.entries.push({imageId:record.imgId,addedIds:changed.addedIds,updates:changed.updates,previous,previousPending});tx.completed++;
   }catch(error){
    if(signal?.aborted||error.name==='AbortError'){tx.cancelled=true;break;}
    record.aiAuto={...previous,runId,status:'error',error:String(error.message||error).slice(0,1000)};
    tx.entries.push({imageId:record.imgId,addedIds:[],previous});tx.failed++;
   }
   progress({index:index+1,total:records.length,record,transaction:tx});
  }
  return tx;
 }
 function rollback(records,tx){
  // Remove added objects only, never replace an image's current manual measurement list.
  for(const entry of tx.entries){
   const r=records.find(r=>r.imgId===entry.imageId);if(!r)continue;
   const removed=new Set(entry.addedIds);
   // Keep manual dependents safe: retain any auto source now used by a later manual measurement.
   for(const m of r.measures)if(!removed.has(m.id))for(const id of [...(m.circleIds||[]),...(m.row1Ids||[]),...(m.row2Ids||[])])removed.delete(id);
   r.measures=r.measures.filter(m=>!removed.has(m.id));
   function restoreQuality(measures){
    for(const change of entry.updates||[]){
     const m=measures.find(m=>m.id===change.id);
     if(m&&JSON.stringify({reviewRequired:m.reviewRequired,reviewReasons:m.reviewReasons})===JSON.stringify(change.after)){
      for(const [key,value] of Object.entries(change.before)){if(value===undefined)delete m[key];else m[key]=clone(value);}
     }
    }
   }
   restoreQuality(r.measures);
   if(r.aiAuto?.runId===tx.runId){r.aiAuto=clone(entry.previous);if(entry.previousPending&&!(r.aiPending||[]).length)r.aiPending=clone(entry.previousPending);}
   if(removed.has(r.selected))r.selected=null;
   r.history=(r.history||[]).map(raw=>{
    const state=JSON.parse(raw);state.measures=state.measures.filter(m=>!removed.has(m.id));
    restoreQuality(state.measures);
    if(state.aiAuto?.runId===tx.runId)state.aiAuto=clone(entry.previous);
    if(removed.has(state.selected))state.selected=null;
    return JSON.stringify(state);
   });
  }
 }
 return {defaults,settings,normalize,groupRows,measure,summary,runBatch,rollback,pairKey,sameCircle};
});

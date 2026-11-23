/* Real repository photos + human segmentation annotations. This is NOT YOLO inference. */
const fs=require('node:fs/promises'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url'),{chromium}=require('playwright');
const Auto=require('../ai-auto-measure.js'),Analytics=require('../analytics-engine.js');
const root=path.resolve(__dirname,'..'),out=path.join(root,'output/qa/ai-auto-measure');
(async()=>{
 const html=await fs.readFile(path.join(root,'MicroCAD_Vision.html'),'utf8');
 const ctx=vm.createContext({Math,Number,idSeed:1,pt:(x,y)=>({x,y}),dist:(a,b)=>Math.hypot(a.x-b.x,a.y-b.y)});
 vm.runInContext(html.slice(html.indexOf('function circumcircle('),html.indexOf('function snapPoint(')),ctx);
 vm.runInContext(html.slice(html.indexOf('function circleGapGeometry('),html.indexOf('function chooseGapCircle(')),ctx);
 vm.runInContext(html.slice(html.indexOf('function finite('),html.indexOf('function validateCal(')),ctx);
 const browser=await chromium.launch(),page=await browser.newPage(),report=[];
 try{
  await page.goto(pathToFileURL(path.join(root,'MicroCAD_Vision.html')).href);
  const names=(await fs.readdir(path.join(root,'MicroCAD_AI/dataset/images/val'))).filter(x=>x.endsWith('.jpg')).sort();
  for(const [i,name] of names.entries()){
   const dims=await page.evaluate(async url=>{const img=new Image();img.src=url;await img.decode();return {width:img.naturalWidth,height:img.naturalHeight};},pathToFileURL(path.join(root,'MicroCAD_AI/dataset/images/val',name)).href);
   const text=await fs.readFile(path.join(root,'MicroCAD_AI/dataset/labels/val',name.replace('.jpg','.txt')),'utf8');
   const detections=text.trim().split(/\r?\n/).map(line=>{
    const values=line.trim().split(/\s+/).slice(1).map(Number),points=[];
    for(let j=0;j<values.length;j+=2)points.push({x:values[j]*dims.width,y:values[j+1]*dims.height});
    const fit=ctx.fitCircle(points);assert(fit,'Real annotation must admit a circle fit');
    return {center_x:fit.c.x,center_y:fit.c.y,radius_px:fit.r,diameter_px:fit.r*2,confidence:1,fit_error:fit.fitRms,angular_coverage:1,
     review_required:true,polygon:points.map(p=>[p.x,p.y])};
   });
   const record={...dims,imgId:i+1,imgName:name,cal:{mmPerPx:.005},measures:[]};
   Auto.measure(record,{...dims,model_version:'human-annotation-fixture-NOT-YOLO',detections},{},{nextId:()=>ctx.idSeed++,makeGap:(a,b)=>ctx.makeCircleGap(a,b)},'annotation-validation');
   const s=Auto.summary(record);assert.equal(detections.length,3);assert.equal(s.rejected.length,0);assert.equal(s.diameters.length,3);assert.equal(s.gaps.length,2);
   const restored=ctx.validateMeasures(JSON.parse(JSON.stringify(record.measures)),dims.width,dims.height,false);
   assert.deepEqual(JSON.parse(JSON.stringify(restored.map(m=>[m.c,m.r,m.p1,m.p2]))),JSON.parse(JSON.stringify(record.measures.map(m=>[m.c,m.r,m.p1,m.p2]))));
   const rows=Analytics.records([record],m=>m.type==='circle'?2*m.r:Math.hypot(m.p1.x-m.p2.x,m.p1.y-m.p2.y));assert.equal(Analytics.summarize(rows).evaluated,0);
   report.push({image:name,...dims,annotatedHoles:detections.length,diameters:s.diameters.length,gaps:s.gaps.length,review:s.review,issues:s.issues,roundtrip:'exact',inference:false});
  }
  await fs.mkdir(out,{recursive:true});await fs.writeFile(path.join(out,'real-annotation-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

/* Real browser workflow; only the external YOLO HTTP response is deterministic. */
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'output/qa/ai-auto-measure');
const d=(x,extra={})=>({center_x:x,center_y:200,radius_px:60,diameter_px:120,confidence:.95,fit_error:1,angular_coverage:.95,review_required:false,polygon:[[x+59,200],[x,259],[x-61,201],[x,138]],...extra});
async function download(page,id,name){const [dl]=await Promise.all([page.waitForEvent('download'),page.locator(id).click()]);const file=path.join(out,name||dl.suggestedFilename());await dl.saveAs(file);return file;}
async function project(page,name){return JSON.parse(await fs.readFile(await download(page,'#saveProjectBtn',name),'utf8'));}
async function main(){
 await fs.mkdir(out,{recursive:true});const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1600,height:1050}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',dialog=>dialog.accept());
 let mode='normal',calls=0;
 await page.route('http://127.0.0.1:8000/**',async route=>{
  if(route.request().url().endsWith('/health'))return route.fulfill({json:{status:'online',model_ready:true,device:'deterministic QA fixture'}});
  calls++;const payload=route.request().postDataBuffer().toString('latin1');
  if(mode==='slow'&&calls>=2)await new Promise(r=>setTimeout(r,1200));
  if(mode==='error'&&payload.includes('two.png'))return route.fulfill({status:500,json:{detail:'Fixture inference failure'}});
  await route.fulfill({json:{width:900,height:500,coordinate_space:'original_image_pixels',model_version:'QA-fixture',detections:[d(100,mode==='review'?{confidence:.2}:{}),d(380),d(660)]}}).catch(()=>{});
 });
 try{
  await page.goto(pathToFileURL(path.join(root,'MicroCAD_Vision.html')).href);
  const data=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=900;c.height=500;const g=c.getContext('2d');g.fillStyle='#adb4b8';g.fillRect(0,0,900,500);for(const x of [100,380,660]){g.fillStyle='#111820';g.beginPath();g.arc(x,200,60,0,Math.PI*2);g.fill();}return c.toDataURL();});
  const fixture={app:'MicroCAD Vision',version:3,unit:'mm',images:['one.png','two.png','three.png'].map((name,i)=>({imgId:i+1,imgName:name,width:900,height:500,imageDataUrl:data,role:'image',cal:{mmPerPx:.005,refName:'QA scale'},measures:i===0?[{id:800,type:'distance',name:'Manual preserved',p1:{x:50,y:400},p2:{x:150,y:400}}]:[]}))};
  const fixturePath=path.join(out,'input.json');await fs.writeFile(fixturePath,JSON.stringify(fixture));
  await page.locator('#fileProject').setInputFiles(fixturePath);await page.waitForFunction(()=>document.getElementById('imageCount').textContent==='3 ảnh'&&document.getElementById('busyPanel').hidden);
  assert.equal(await page.locator('#aiAutoAllBtn').count(),1,'one-click default batch action exists');
  await page.locator('#aiAutoAllBtn').click();await page.locator('#aiResultsDialog').waitFor({state:'visible'});
  assert.equal(await page.locator('#aiResultsBody tr').count(),3);assert.equal(calls,3);
  assert.match(await page.locator('#aiResultsSummary').textContent(),/9.*6/);
  await page.screenshot({path:path.join(out,'batch-results.png')});
  await page.locator('#aiResultsBody button').first().click();await page.locator('#fitBtn').click();
  await page.screenshot({path:path.join(out,'three-holes.png')});
  const saved=await project(page,'roundtrip-before.json');
  for(const r of saved.images){assert.equal(r.measures.filter(m=>m.type==='circle').length,3);assert.equal(r.measures.filter(m=>m.type==='circleGap').length,2);}
  assert(saved.images[0].measures.some(m=>m.id===800));
  const stage=await page.locator('#stage').boundingBox();await page.mouse.move(stage.x+stage.width/2,stage.y+stage.height/2);await page.mouse.wheel(0,-300);
  await page.locator('[data-tool="pan"]').click();await page.mouse.move(stage.x+stage.width/2,stage.y+stage.height/2);await page.mouse.down();await page.mouse.move(stage.x+stage.width/2+45,stage.y+stage.height/2+20);await page.mouse.up();
  const zoomed=await project(page,'zoom-pan.json');assert.deepEqual(zoomed.images.map(r=>r.measures),saved.images.map(r=>r.measures));await page.locator('#fitBtn').click();
  await page.locator('#aiAutoAllBtn').click();await page.locator('#aiResultsDialog').waitFor({state:'visible'});await page.locator('#aiResultsClose').click();
  const repeated=await project(page,'repeat.json');assert.deepEqual(repeated.images.map(r=>r.measures),saved.images.map(r=>r.measures));
  await page.locator('#fileProject').setInputFiles(path.join(out,'roundtrip-before.json'));await page.waitForFunction(()=>document.getElementById('busyPanel').hidden);
  const loaded=await project(page,'roundtrip-after.json');
  for(let i=0;i<3;i++)assert.deepEqual(loaded.images[i].measures.map(m=>[m.type,m.c,m.r,m.p1,m.p2]),saved.images[i].measures.map(m=>[m.type,m.c,m.r,m.p1,m.p2]));
  const csv=await fs.readFile(await download(page,'#exportCsvBtn','measurements.csv'),'utf8');
  assert.equal(csv.split('\r\n').length,17);assert.match(csv,/Review_required/);assert.match(csv,/'?0\.8/);
  await download(page,'#exportPngBtn','dimensions.png');await download(page,'#exportAllBtn','measurements.zip');
  await page.locator('[data-view="analytics"]').click();await page.locator('#arKpis').waitFor();
  assert.match(await page.locator('#arKpis').textContent(),/Đường kính9/);
  await page.locator('[data-view="reports"]').click();
  await page.waitForFunction(()=>document.querySelectorAll('#arPages .ar-page').length>0);
  assert.equal(await page.locator('.ai-report-result').count(),15);
  await page.evaluate(()=>{window.print=()=>{window.printRequested=true;};});await page.locator('#arPrint').click();await page.waitForFunction(()=>window.printRequested);
  await page.pdf({path:path.join(out,'auto-measure-report.pdf'),preferCSSPageSize:true,printBackground:true});
  const overflow=await page.locator('.ar-page-content').evaluateAll(nodes=>nodes.map(n=>n.scrollHeight>n.clientHeight+2));assert(overflow.every(x=>!x),'report content fits every page');
  await page.locator('[data-view="measurement"]').click();
  // Fresh batch verifies error continuation and all-image rollback without losing manual work.
  await page.locator('#fileProject').setInputFiles(fixturePath);await page.waitForFunction(()=>document.getElementById('busyPanel').hidden);mode='error';calls=0;
  await page.locator('#aiAutoAllBtn').click();await page.locator('#aiResultsDialog').waitFor({state:'visible'});
  assert.match(await page.locator('#aiResultsBody').textContent(),/Fixture inference failure/);assert.equal(calls,3);
  await page.locator('#aiResultsUndo').click();await page.locator('#aiResultsClose').click();
  const undone=await project(page,'undo.json');assert.deepEqual(undone.images.map(r=>r.measures.length),[1,0,0]);
  mode='slow';calls=0;await page.locator('#aiAutoAllBtn').click();
  await page.waitForFunction(()=>document.getElementById('batchProgress').value>=1);await page.locator('#cancelBatch').click();
  await page.locator('#aiResultsDialog').waitFor({state:'visible'});assert.match(await page.locator('#aiResultsSummary').textContent(),/Đã hủy/);
  await page.locator('#aiResultsUndo').click();await page.locator('#aiResultsClose').click();
  const cancelled=await project(page,'cancel-undo.json');assert.deepEqual(cancelled.images.map(r=>r.measures.length),[1,0,0]);
  // Quality warnings reach the real dashboard and both report templates, not just the unit API.
  mode='review';await page.locator('#aiAutoAllBtn').click();await page.locator('#aiResultsDialog').waitFor({state:'visible'});
  assert.match(await page.locator('#aiResultsSummary').textContent(),/6 kết quả cần kiểm tra/);await page.locator('#aiResultsClose').click();
  await page.locator('[data-view="analytics"]').click();
  await page.waitForFunction(()=>[...document.querySelectorAll('.ar-kpi')].some(n=>n.textContent==='Cần kiểm tra6'));
  assert.match(await page.locator('#arTrace').textContent(),/Confidence thấp/);
  await page.locator('[data-view="reports"]').click();await page.locator('[name=template]').selectOption('technical');
  await page.waitForFunction(()=>document.querySelectorAll('.ai-report-result.ai-review').length===6);
  assert.match(await page.locator('#arPages .ar-page').first().textContent(),/6 phép đo cần kiểm tra/);
  const reviewOverflow=await page.locator('.ar-page-content').evaluateAll(nodes=>nodes.some(n=>n.scrollHeight>n.clientHeight+2));assert.equal(reviewOverflow,false);
  await page.pdf({path:path.join(out,'review-technical-report.pdf'),preferCSSPageSize:true,printBackground:true});
  await page.locator('[data-view="measurement"]').click();
  // A folder import and one manual calibration apply to every image before auto-measuring.
  await page.goto(pathToFileURL(path.join(root,'MicroCAD_Vision.html')).href);mode='normal';calls=0;
  const folder=path.join(out,'import-folder');await fs.mkdir(folder,{recursive:true});
  for(const name of ['one.png','two.png','three.png'])await fs.writeFile(path.join(folder,name),Buffer.from(data.split(',')[1],'base64'));
  await page.locator('#fileFolder').setInputFiles(folder);await page.waitForFunction(()=>document.getElementById('imageCount').textContent==='3 ảnh'&&document.getElementById('busyPanel').hidden);
  await page.locator('#aiAutoAllBtn').click();await page.locator('#aiResultsDialog').waitFor({state:'visible'});
  assert.match(await page.locator('#aiResultsBody').textContent(),/120,00 px/);await page.locator('#aiResultsClose').click();
  await page.locator('[data-tool="calibrate"]').click();const uncal=await project(page,'uncalibrated.json');const current=uncal.images[uncal.activeIndex],box=await page.locator('#stage').boundingBox(),v=current.view;
  for(const [x,y] of [[100,400],[300,400]])await page.mouse.click(box.x+v.x+x*v.z,box.y+v.y+y*v.z);
  await page.locator('#calLength').fill('1');await page.locator('#calLengthUnit').selectOption('mm');await page.locator('#confirmCalBtn').click();
  await page.locator('#aiAutoAllBtn').click();await page.locator('#aiResultsDialog').waitFor({state:'visible'});await page.locator('#aiResultsClose').click();
  const calibrated=await project(page,'folder-calibrated.json');
  for(const r of calibrated.images){assert(Math.abs(r.cal.mmPerPx-.005)<1e-8);assert.equal(r.measures.length,5);}
  await page.locator('#inspectorAiBtn').click();calls=0;await page.locator('#aiAutoCurrentBtn').click();await page.locator('#aiResultsDialog').waitFor({state:'visible'});assert.equal(calls,1);await page.keyboard.press('Escape');
  await page.setViewportSize({width:700,height:850});await page.emulateMedia({reducedMotion:'reduce'});
  // Open via the visible primary action; dialog scroll stays contained on a narrow viewport.
  await page.locator('#aiAutoAllBtn').click();await page.locator('#aiResultsDialog').waitFor({state:'visible'});
  assert(await page.locator('#aiResultsDialog').evaluate(n=>{const b=n.getBoundingClientRect();return b.left>=0&&b.right<=innerWidth&&b.bottom<=innerHeight;}));
  await page.screenshot({path:path.join(out,'batch-narrow.png')});await page.keyboard.press('Escape');
  assert.deepEqual(errors,[]);await fs.writeFile(path.join(out,'ui-results.json'),JSON.stringify({passed:true,checks:['folder import','global calibration','current image','batch','adjacency','rerun','JSON roundtrip','zoom/pan invariance','uncalibrated px','CSV','PNG','ZIP','Analytics quality exclusion','quick PDF','technical review PDF','per-image error','batch undo','cancel','narrow viewport','reduced motion','Escape'],pageErrors:errors},null,2));
  console.log('AI auto-measure browser workflow passed');
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});

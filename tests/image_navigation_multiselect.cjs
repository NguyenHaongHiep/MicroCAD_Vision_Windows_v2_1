const {test,before,after,beforeEach,afterEach}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
let browser,server,page,errors,base;
before(async()=>{
 server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(fs.readFileSync(path.join(__dirname,'../MicroCAD_Vision.html')));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${server.address().port}`;
 browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
});
after(async()=>{await browser?.close();await new Promise(r=>server.close(r));});
async function startPage(dpi=1){
 page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:dpi});errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('http://127.0.0.1:8000/**',r=>r.fulfill({json:{status:'online',model_ready:false,device:'cpu'}}));
 await page.goto(base);await page.locator('#demoBtn').click();
 await page.waitForFunction(()=>document.querySelector('#imageSizeText').textContent.includes('1400'));
}
beforeEach(()=>startPage());
afterEach(async()=>{await page.close();assert.deepEqual(errors,[]);});
async function download(selector){const pending=page.waitForEvent('download');await page.locator(selector).click();return fs.readFileSync(await(await pending).path());}
async function project(){return JSON.parse((await download('#saveProjectBtn')).toString());}
function circle(id,x,y,ai=false){return {id,type:'circle',name:`M${id}`,c:{x,y},r:35,fitRms:0,shift:{x:0,y:0},edgePts:[{x:x+35,y},{x,y:y+35},{x:x-35,y}],...(ai?{ai:true,autoConfidence:.9,reviewRequired:false,angularCoverage:1,modelVersion:'accepted-fixture'}:{})};}
async function fixture({images=1,zoom=.5,pan={x:55,y:85},dependencies=false}={}){
 const original=await project(),template=original.images[0];
 const measures=[circle(1,200,200),circle(2,450,200,true),circle(3,700,200),circle(4,200,450),circle(5,450,450),circle(6,700,450)];
 if(dependencies)measures.push({id:7,type:'circleGap',name:'gap',circleIds:[1,2],shift:{x:0,y:0}},
  {id:8,type:'rowSpacing',name:'rows',row1Ids:[1,2],row2Ids:[4,5],shift:{x:0,y:0}});
 const cal={mmPerPx:.005,p1:{x:130,y:750},p2:{x:330,y:750},lengthMm:1,refName:'fixture-01.png',refW:1400,refH:850,refId:1};
 const data={...original,unit:'um',activeIndex:0,latestCalibration:cal,images:Array.from({length:images},(_,i)=>({...template,imgName:`fixture-${String(i+1).padStart(2,'0')}.png`,imgId:i+1,role:'image',cal,measures,view:{z:zoom,...pan}}))};
 page.once('dialog',d=>d.accept());await page.locator('#fileProject').setInputFiles({name:'selection-fixture.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});
 await page.waitForFunction(()=>document.querySelector('#busyPanel').hidden&&document.querySelector('#docName').textContent==='fixture-01.png');
 return (await project()).images[0];
}
const row=id=>page.locator(`#measureList .meas-item[data-id="${id}"]`);
async function selected(){return page.locator('#measureList .selected').evaluateAll(nodes=>nodes.map(n=>Number(n.dataset.id)).sort((a,b)=>a-b));}
async function screenPoint(p,view){const b=await page.locator('#stage').boundingBox();return {x:b.x+view.x+p.x*view.z,y:b.y+view.y+p.y*view.z};}
async function canvasClick(p,view,modifiers=[]){for(const key of modifiers)await page.keyboard.down(key);const q=await screenPoint(p,view);await page.mouse.click(q.x,q.y);for(const key of modifiers.reverse())await page.keyboard.up(key);}
async function box(a,b,view,modifiers=[]){
 for(const key of modifiers)await page.keyboard.down(key);const start=await screenPoint(a,view),end=await screenPoint(b,view);
 await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(end.x,end.y,{steps:6});await page.mouse.up();
 for(const key of modifiers.reverse())await page.keyboard.up(key);
}

test('arrows navigate 12 images in order, scroll active thumbnail and preserve data',async()=>{
 const initial=await fixture({images:12});
 await page.evaluate(()=>window.addEventListener('keydown',e=>{if(e.key==='ArrowUp'||e.key==='ArrowDown')window.navigationPrevented=e.defaultPrevented;}));
 await page.keyboard.press('ArrowUp');assert.equal(await page.evaluate(()=>window.navigationPrevented),false);
 for(let i=2;i<=12;i++){await page.keyboard.press('ArrowDown');assert.equal(await page.locator('#imagePosition').textContent(),`${i} / 12`);}
 assert.equal(await page.evaluate(()=>window.navigationPrevented),true);
 const bottom=await page.locator('#imageList').evaluate(el=>({scroll:el.scrollTop,list:el.getBoundingClientRect().toJSON(),active:el.querySelector('[aria-current=true]').getBoundingClientRect().toJSON()}));
 assert(bottom.scroll>0);assert(bottom.active.top>=bottom.list.top-1&&bottom.active.bottom<=bottom.list.bottom+1);
 await page.keyboard.press('ArrowDown');assert.equal(await page.locator('#imagePosition').textContent(),'12 / 12');
 assert.equal(await page.evaluate(()=>window.navigationPrevented),false);
 for(let i=11;i>=1;i--)await page.keyboard.press('ArrowUp');
 await page.keyboard.press('ArrowUp');assert.equal(await page.locator('#imagePosition').textContent(),'1 / 12');
 const restored=(await project()).images[0];assert.deepEqual(restored.measures,initial.measures);assert.deepEqual(restored.cal,initial.cal);
 assert.equal(await page.locator('#imageList .image-entry[aria-current=true]').count(),1);
});

test('navigation ignores editable fields, native widgets, modal and active pointer gestures',async()=>{
 const image=await fixture({images:5});await row(1).click();
 for(const selector of ['#measNameEdit','#unitSelect']){await page.locator(selector).focus();await page.keyboard.press('ArrowDown');assert.equal(await page.locator('#imagePosition').textContent(),'1 / 5');}
 await page.locator('#toolGuide').evaluate(el=>{const edit=document.createElement('div');edit.contentEditable='true';edit.id='test-edit';el.append(edit);edit.focus();});
 await page.keyboard.press('ArrowDown');assert.equal(await page.locator('#imagePosition').textContent(),'1 / 5');
 await page.locator('#test-edit').evaluate(el=>el.remove());
 await page.locator('#calModal').evaluate(el=>el.classList.add('open'));await page.keyboard.press('ArrowDown');assert.equal(await page.locator('#imagePosition').textContent(),'1 / 5');await page.keyboard.press('Escape');
 const start=await screenPoint({x:100,y:100},image.view);await page.mouse.move(start.x,start.y);await page.mouse.down();
 await page.keyboard.press('ArrowDown');assert.equal(await page.locator('#imagePosition').textContent(),'1 / 5');await page.keyboard.press('Escape');await page.mouse.up();
 await page.locator('#measureList').evaluate(el=>{el.tabIndex=0;el.focus();});await page.keyboard.press('ArrowDown');assert.equal(await page.locator('#imagePosition').textContent(),'1 / 5');
});

test('Ctrl/Cmd toggles manual and accepted AI measurements; Shift selects anchored ranges',async()=>{
 await fixture();await row(1).click({modifiers:['Control']});await row(2).click({modifiers:['Control']});await row(3).click({modifiers:['Control']});
 assert.deepEqual(await selected(),[1,2,3]);assert.equal(await page.locator('#selectedCount').textContent(),'3');assert.equal(await page.locator('#editBox').isVisible(),false);
 assert.equal(await page.locator('#selectionSummary').isVisible(),true);await row(2).click({modifiers:['Control']});assert.deepEqual(await selected(),[1,3]);
 await row(2).click();await row(5).click({modifiers:['Shift']});assert.deepEqual(await selected(),[2,3,4,5]);
 await row(1).click({modifiers:['Meta']});assert.deepEqual(await selected(),[1,2,3,4,5]);
 await page.keyboard.press('Escape');await row(4).click({modifiers:['Shift']});assert.deepEqual(await selected(),[4]);
});

test('Ctrl+A only selects all in Select mode, Escape clears and selection never leaks across images',async()=>{
 await fixture({images:5});await page.keyboard.press('Control+a');assert.deepEqual(await selected(),[1,2,3,4,5,6]);
 assert.equal(await page.locator('#toolMode').textContent(),'SELECT');await page.keyboard.press('Escape');assert.deepEqual(await selected(),[]);
 await row(1).click();await page.keyboard.press('Control+a');await page.keyboard.press('ArrowDown');assert.deepEqual(await selected(),[]);
 await page.keyboard.press('ArrowUp');assert((await selected()).length<=1);
 await page.locator('[data-tool="circle"]').click();await page.keyboard.press('Control+a');assert.equal(await page.locator('#toolMode').textContent(),'CIRCLE');assert.deepEqual(await selected(),[]);
});

test('window vs crossing selection is correct at 50% and 200% zoom with pan',async()=>{
 for(const [zoom,pan] of [[.5,{x:55,y:85}],[2,{x:-200,y:-200}]]){
  const image=await fixture({zoom,pan});const before=await project();
  await box({x:150,y:150},{x:250,y:250},image.view);assert.deepEqual(await selected(),[1]);
  await box({x:190,y:150},{x:220,y:250},image.view);assert.deepEqual(await selected(),[]);
  await box({x:220,y:150},{x:190,y:250},image.view);assert.deepEqual(await selected(),[1]);
  await box({x:400,y:150},{x:500,y:250},image.view,['Shift']);assert.deepEqual(await selected(),[1,2]);
  assert.deepEqual(await project(),before);
 }
});

test('canvas Ctrl click and label selection synchronize list without moving geometry',async()=>{
 const image=await fixture();const before=await project();
 await canvasClick({x:235,y:200},image.view);assert.deepEqual(await selected(),[1]);
 await canvasClick({x:485,y:200},image.view,['Control']);assert.deepEqual(await selected(),[1,2]);
 await canvasClick({x:235,y:200},image.view,['Meta']);assert.deepEqual(await selected(),[2]);
 await canvasClick({x:100,y:100},image.view);assert.deepEqual(await selected(),[]);assert.deepEqual(await project(),before);
});

test('group Delete removes dependents with one Undo and restores selection',async()=>{
 await fixture({dependencies:true});const before=await project();
 await row(1).click();await row(2).click({modifiers:['Control']});await page.keyboard.press('Delete');
 assert.deepEqual((await project()).images[0].measures.map(m=>m.id),[3,4,5,6]);assert.deepEqual(await selected(),[]);
 await page.keyboard.press('Control+z');assert.deepEqual((await project()).images[0].measures,before.images[0].measures);assert.deepEqual(await selected(),[1,2]);
 // Selection and group deletion made exactly one history entry, so another Undo changes nothing.
 await page.keyboard.press('Control+z');assert.deepEqual((await project()).images[0].measures,before.images[0].measures);
});

test('group inspector action deletes the selected group, not just its primary object',async()=>{
 await fixture();await row(1).click();await row(2).click({modifiers:['Control']});await row(3).click({modifiers:['Control']});
 assert.equal(await page.locator('#deleteMeasureBtn').textContent(),'× Xóa 3 phép đo đã chọn');
 const box=await page.locator('#deleteMeasureBtn').boundingBox();assert(box.y+box.height<1000);
 await page.locator('#deleteMeasureBtn').click();assert.deepEqual((await project()).images[0].measures.map(m=>m.id),[4,5,6]);
 await page.locator('#undoBtn').click();assert.deepEqual(await selected(),[1,2,3]);
});

test('dragging one label in a group changes only that label and Undo restores the group',async()=>{
 const image=await fixture();await row(1).click();await row(2).click({modifiers:['Control']});
 const before=await project(),m=image.measures[0],v=image.view;
 const point=await screenPoint({x:m.c.x+Math.cos(-.6)*(m.r+71/v.z),y:m.c.y+Math.sin(-.6)*(m.r+71/v.z)},v);
 await page.mouse.move(point.x,point.y);await page.mouse.down();await page.mouse.move(point.x+25,point.y+15,{steps:5});await page.mouse.up();
 const after=await project();assert.deepEqual(after.images[0].measures.slice(1),before.images[0].measures.slice(1));
 assert.deepEqual({...after.images[0].measures[0],shift:m.shift},m);assert.notDeepEqual(after.images[0].measures[0].shift,m.shift);
 assert.deepEqual(await selected(),[1,2]);await page.keyboard.press('Control+z');assert.deepEqual((await project()).images[0].measures,before.images[0].measures);assert.deepEqual(await selected(),[1,2]);
});

test('selection is transient and does not affect JSON/CSV/PNG/ZIP exports',async()=>{
 await fixture();const snapshots={};
 for(const selector of ['#saveProjectBtn','#exportCsvBtn','#exportPngBtn','#exportAllBtn'])snapshots[selector]=await download(selector);
 await row(1).click();await row(2).click({modifiers:['Control']});
 for(const [selector,buffer] of Object.entries(snapshots))assert.deepEqual(await download(selector),buffer,selector);
});

test('marquee hit testing uses CSS pixels at device scale factor 2 and Escape cancels mid-drag',async()=>{
 await page.close();await startPage(2);const image=await fixture();
 const a=await screenPoint({x:150,y:150},image.view),b=await screenPoint({x:250,y:250},image.view);
 await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y);await page.keyboard.press('Escape');await page.mouse.up();assert.deepEqual(await selected(),[]);
 await box({x:150,y:150},{x:250,y:250},image.view);assert.deepEqual(await selected(),[1]);
});

test('selection UI remains usable at requested desktop sizes',async()=>{
 await fixture();
 for(const [width,height] of [[1280,720],[1366,768],[1920,1080]]){
  await page.setViewportSize({width,height});await row(1).click();await row(2).click({modifiers:['Control']});await row(3).click({modifiers:['Control']});
  assert.equal(await page.locator('#selectionSummary').isVisible(),true);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);
  if(process.env.MICROCAD_SCREENSHOT_DIR){fs.mkdirSync(process.env.MICROCAD_SCREENSHOT_DIR,{recursive:true});await page.locator('#fitBtn').click();await page.mouse.move(0,0);await page.waitForFunction(()=>!document.querySelector('#toast').classList.contains('show'));await page.waitForTimeout(300);await page.screenshot({path:path.join(process.env.MICROCAD_SCREENSHOT_DIR,`multiselect-${width}x${height}.png`)});}
 }
});

test('AI pending proposals survive group deletion and busy detection blocks image navigation',async()=>{
 await fixture({images:5});let release;
 const pending=new Promise(resolve=>{release=resolve;});
 await page.route('http://127.0.0.1:8000/**',async route=>{
  if(route.request().url().endsWith('/health'))return route.fulfill({json:{status:'online',model_ready:true,device:'fixture'}});
  await pending;await route.fulfill({json:{width:1400,height:850,model_version:'fixture',detections:[{center_x:1030,center_y:200,radius_px:40,diameter_px:80,confidence:.9,fit_error:0,angular_coverage:1,polygon:[],review_required:false}]}});
 });
 await page.waitForFunction(()=>document.querySelector('#aiEngineStatus').textContent.includes('AI ONLINE'));
 await page.locator('#inspectorAiBtn').click();await page.locator('#aiDetectBtn').click();
 await page.waitForFunction(()=>!document.querySelector('#busyPanel').hidden);
 await page.keyboard.press('ArrowDown');assert.equal(await page.locator('#imagePosition').textContent(),'1 / 5');release();
 await page.locator('#aiReviewList .meas-item').waitFor();
 await page.keyboard.press('Control+a');assert.deepEqual(await selected(),[1,2,3,4,5,6]);
 await page.keyboard.press('Delete');assert.equal(await page.locator('#measCount').textContent(),'0');assert.equal(await page.locator('#aiReviewList .meas-item').count(),1);
 await page.keyboard.press('Control+z');assert.equal(await page.locator('#measCount').textContent(),'6');assert.equal(await page.locator('#aiReviewList .meas-item').count(),1);
});

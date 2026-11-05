const {test,before,after,beforeEach,afterEach}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
let browser,server,page,errors,release,requests;
const detections=Array.from({length:23},(_,i)=>{const x=120+(i%8)*150,y=180+Math.floor(i/8)*200;return {center_x:x,center_y:y,radius_px:30,diameter_px:60,confidence:.9,fit_error:0,angular_coverage:1,review_required:false,polygon:[[x-30,y],[x,y-30],[x+30,y],[x,y+30]]};});
before(async()=>{server=http.createServer((q,r)=>{r.setHeader('Content-Type','text/html; charset=utf-8');r.end(fs.readFileSync(path.join(__dirname,'../MicroCAD_Vision.html')));});await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});});
after(async()=>{await browser?.close();await new Promise(r=>server.close(r));});
beforeEach(async()=>{
 page=await browser.newPage({viewport:{width:1366,height:768}});errors=[];requests=0;page.on('pageerror',e=>errors.push(e.message));
 const gate=new Promise(r=>{release=r;});
 await page.route('http://127.0.0.1:8000/**',async route=>{if(route.request().url().endsWith('/health'))return route.fulfill({json:{status:'online',model_ready:true,device:'fixture'}});requests++;await gate;await route.fulfill({json:{width:1400,height:850,model_version:'fixture',detections}});});
 await page.goto(`http://127.0.0.1:${server.address().port}`);await page.locator('#demoBtn').click();await page.waitForFunction(()=>document.querySelector('#imageSizeText').textContent.includes('1400'));await page.locator('#fitBtn').click();await page.locator('#inspectorAiBtn').click();
});
afterEach(async()=>{release();await page.close();assert.deepEqual(errors,[]);});
async function detect(){await page.locator('#aiDetectBtn').click();await page.waitForFunction(()=>!document.querySelector('#busyPanel').hidden);release();await page.waitForFunction(()=>document.querySelector('#busyPanel').hidden);}
test('analysis status precedes response, then proposals reveal progressively and skip immediately',async()=>{
 await page.locator('#aiDetectBtn').click();assert((await page.locator('#busyText').textContent()).includes('Đang phân tích ảnh'));
 assert.equal(await page.locator('#aiReviewList .meas-item').count(),0);release();
 await page.waitForFunction(()=>document.querySelector('#aiRevealStatus').textContent.startsWith('Hiển thị sau suy luận:'));
 const initial=await page.locator('#aiRevealStatus').textContent();assert(!initial.includes('23/23'));
 await page.waitForTimeout(350);assert.notEqual(await page.locator('#aiRevealStatus').textContent(),initial);
 assert.equal(await page.locator('#measCount').textContent(),'0');assert.equal(await page.locator('#aiReviewList .meas-item').count(),23);
 await page.locator('#aiShowAllBtn').click();assert((await page.locator('#aiCanvasReveal').textContent()).includes('23/23'));assert.equal(await page.locator('#aiShowAllBtn').isVisible(),false);assert.equal(requests,1);
 await page.locator('#aiAcceptAllBtn').click();assert.equal(await page.locator('#measCount').textContent(),'23');await page.locator('#undoBtn').click();assert.equal(await page.locator('#measCount').textContent(),'0');
});
test('switching images cancels animation and never shows the previous image results',async()=>{
 await page.locator('#saveProjectBtn').click();
 const buffer=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=1400;c.height=850;return c.toDataURL().split(',')[1];});
 await page.locator('#fileImage').setInputFiles({name:'second.png',mimeType:'image/png',buffer:Buffer.from(buffer,'base64')});await page.waitForFunction(()=>document.querySelector('#docName').textContent==='second.png');await page.locator('#prevImage').click();await page.locator('#inspectorAiBtn').click();
 await detect();await page.keyboard.press('ArrowDown');assert.equal(await page.locator('#docName').textContent(),'second.png');assert.equal(await page.locator('#aiCanvasReveal').isVisible(),false);
 await page.waitForTimeout(500);assert.equal(await page.locator('#aiReviewList .meas-item').count(),0);
 await page.keyboard.press('ArrowUp');assert((await page.locator('#aiCanvasReveal').textContent()).includes('23/23'));assert.equal(await page.locator('#aiShowAllBtn').isVisible(),false);
});
test('batch has no reveal delay and reduced-motion single detection shows all',async()=>{
 release();await page.locator('#aiBatchBtn').click();await page.waitForFunction(()=>document.querySelector('#aiProposalCount').textContent==='23 đề xuất');
 assert.equal(await page.locator('#aiShowAllBtn').isVisible(),false);assert((await page.locator('#aiCanvasReveal').textContent()).includes('23/23'));
 await page.emulateMedia({reducedMotion:'reduce'});await detect();assert.equal(await page.locator('#aiShowAllBtn').isVisible(),false);assert((await page.locator('#aiCanvasReveal').textContent()).includes('23/23'));
});
test('canvas draws segmentation, fitted circle, center and ordinal confidence without changing proposals',async()=>{
 await page.evaluate(()=>{window.aiDrawCalls=[];const proto=CanvasRenderingContext2D.prototype;for(const name of ['arc','lineTo','fillText']){const original=proto[name];proto[name]=function(...args){window.aiDrawCalls.push([name,...args]);return original.apply(this,args);};}});
 await detect();await page.locator('#aiShowAllBtn').click();await page.waitForTimeout(80);
 const calls=await page.evaluate(()=>window.aiDrawCalls);assert(calls.some(c=>c[0]==='fillText'&&String(c[1]).includes('#23 90%')));assert(calls.some(c=>c[0]==='arc'));assert(calls.some(c=>c[0]==='lineTo'));assert.equal(await page.locator('#measCount').textContent(),'0');
 if(process.env.AI_CAPTURE_DIR){fs.mkdirSync(process.env.AI_CAPTURE_DIR,{recursive:true});await page.waitForFunction(()=>!document.querySelector('#toast').classList.contains('show'));await page.waitForTimeout(300);await page.screenshot({path:path.join(process.env.AI_CAPTURE_DIR,'ai-proposals-1366x768.png')});}
});
test('late response is discarded when source image is replaced',async()=>{
 await page.locator('#aiDetectBtn').click();await page.waitForFunction(()=>!document.querySelector('#busyPanel').hidden);
 // Exercise the existing new-image lifecycle while the request is still pending.
 await page.locator('#demoBtn').evaluate(el=>el.click());await page.waitForFunction(()=>document.querySelector('#imageCount').textContent==='2 ảnh');release();
 await page.waitForFunction(()=>document.querySelector('#busyPanel').hidden);
 assert.equal(await page.locator('#aiReviewList .meas-item').count(),0);assert.equal(await page.locator('#aiCanvasReveal').isVisible(),false);
});
test('empty response and API error end processing without starting animation',async()=>{
 await page.route('http://127.0.0.1:8000/detect?**',r=>r.fulfill({json:{width:1400,height:850,model_version:'fixture',detections:[]}}));
 await detect();assert.equal(await page.locator('#aiShowAllBtn').isVisible(),false);assert((await page.locator('#aiRevealStatus').textContent()).includes('0/0'));
 await page.route('http://127.0.0.1:8000/detect?**',r=>r.fulfill({status:503,json:{detail:'fixture model unavailable'}}));
 await page.locator('#aiDetectBtn').click();await page.waitForFunction(()=>document.querySelector('#busyPanel').hidden);
 assert.equal(await page.locator('#aiShowAllBtn').isVisible(),false);assert((await page.locator('#toast').textContent()).includes('fixture model unavailable'));
});

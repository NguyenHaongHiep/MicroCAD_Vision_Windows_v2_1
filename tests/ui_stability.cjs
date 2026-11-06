// Run: PLAYWRIGHT_MODULE=/path/to/playwright CHROMIUM_PATH=/usr/bin/chromium node --test tests/ui_stability.cjs
const {test, before, after, beforeEach, afterEach} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const htmlPath = process.env.MICROCAD_UI_HTML || path.join(root, 'MicroCAD_Vision.html');
let server, browser, page, errors, base;

before(async () => {
  server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(fs.readFileSync(htmlPath));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({headless:true,
    ...(process.env.CHROMIUM_PATH ? {executablePath:process.env.CHROMIUM_PATH} : {})});
});
after(async () => { await browser?.close(); await new Promise(resolve => server?.close(resolve)); });
beforeEach(async () => {
  page = await browser.newPage({viewport:{width:1440,height:1000}});
  errors = []; page.on('pageerror', e => errors.push(e.message));
  // Deterministic UI fixture only: this does not test model inference or accuracy.
  await page.route('http://127.0.0.1:8000/**', route => route.fulfill({json:
    route.request().url().endsWith('/health')
      ? {status:'online',model_ready:true,device:'UI test fixture'}
      : {width:1400,height:850,model_version:'UI-fixture',detections:[{
        center_x:545,center_y:255,radius_px:69,diameter_px:138,
        fit_error:0,confidence:.9,angular_coverage:1,review_required:false,polygon:[]
      }]}}));
  await page.goto(base);
  await page.locator('#demoBtn').click();
  await page.waitForFunction(() => document.querySelector('#imageSizeText').textContent.includes('1400'));
  await page.locator('#fitBtn').click();
});
afterEach(async () => {
  await page.close(); assert.deepEqual(errors, [], 'No browser JavaScript errors');
});

async function clickImage(x,y) {
  const b=await page.locator('#stage').boundingBox();
  const z=Math.max(.05,Math.min((b.width-170)/1400,(b.height-170)/850));
  await page.mouse.click(b.x+(b.width-1400*z)/2+x*z,b.y+(b.height-850*z)/2+y*z);
}
async function circle() {
  await page.locator('[data-tool="circle"]').click();
  await clickImage(296,270);await clickImage(235,331);await clickImage(174,270);
}
async function propose() {
  await openAi();
  await page.locator('#aiDetectBtn').click();
  await page.locator('#aiReviewList .meas-item').waitFor();
}
async function openAi() {
  if(await page.locator('#inspectorAiBtn').count())await page.locator('#inspectorAiBtn').click();
}
async function selectRow() {
  await circle();
  await page.locator('[data-tool="rowSpacing"]').click();
  await page.locator('#measureList .meas-item').click();
  assert.equal(await page.locator('[data-row="0"]').textContent(),'Hàng 1 (1)');
}

test('DOM IDs are unique and all literal ID references exist after initialization', async t => {
  const ids=await page.locator('[id]').evaluateAll(nodes=>nodes.map(n=>n.id));
  assert.equal(new Set(ids).size,ids.length);
  t.diagnostic(`${ids.length} unique runtime IDs (including dynamically installed panels)`);
  const html=fs.readFileSync(htmlPath,'utf8');
  for(const [,id] of html.matchAll(/\$\('([^']+)'\)/g)) assert(ids.includes(id),`Missing ID ${id}`);
});
test('accepting an AI proposal keeps the accepted measurement selected', async () => {
  await propose();await page.locator('#aiReviewList button', {hasText:'Chấp nhận'}).click();
  assert.equal(await page.locator('#measCount').textContent(),'1');
  assert.equal(await page.locator('#measureList .selected').count(),1);
  assert.equal(await page.locator('#editBox').isVisible(),true);
  await page.locator('#undoBtn').click();
  assert.equal(await page.locator('#measCount').textContent(),'0');
  await openAi();
  assert.equal(await page.locator('#aiReviewList .meas-item').count(),1);
});
test('rejecting an AI proposal preserves the existing manual selection', async () => {
  await circle();await propose();
  await page.locator('#aiReviewList button', {hasText:'Loại bỏ'}).click();
  assert.equal(await page.locator('#measCount').textContent(),'1');
  assert.equal(await page.locator('#measureList .selected').count(),1);
  assert.equal(await page.locator('#aiReviewList .meas-item').count(),0);
});
test('row selection counts refresh when a selected circle is deleted', async () => {
  await selectRow();await page.locator('#measureList .remove-one').click();
  assert.equal(await page.locator('[data-row="0"]').textContent(),'Hàng 1 (0)');
});
test('switching images clears the previous image row context', async () => {
  await selectRow();
  await page.locator('#fileImage').setInputFiles(path.join(root,'VI_DU_KET_QUA.png'));
  await page.waitForFunction(()=>document.querySelector('#docName').textContent==='VI_DU_KET_QUA.png');
  await page.locator('[data-tool="rowSpacing"]').click();
  assert.equal(await page.locator('[data-row="0"]').textContent(),'Hàng 1 (0)');
});
test('Escape cancels the row context and tool switches hide its panel', async () => {
  await selectRow();await page.keyboard.press('Escape');
  assert.equal(await page.locator('#toolMode').textContent(),'SELECT');
  assert.equal(await page.locator('#rowSpacingPanel').isVisible(),false);
  await page.locator('[data-tool="rowSpacing"]').click();
  assert.equal(await page.locator('[data-row="0"]').textContent(),'Hàng 1 (0)');
  await page.locator('[data-tool="circle"]').click();
  assert.equal(await page.locator('#rowSpacingPanel').isVisible(),false);
});
test('Ctrl+A does not unexpectedly change the active measurement tool', async () => {
  await page.keyboard.press('Control+a');
  assert.equal(await page.locator('#toolMode').textContent(),'CALIBRATE');
});

async function download(selector) {
  const pending=page.waitForEvent('download');await page.locator(selector).click();
  const file=await pending;return fs.readFileSync(await file.path());
}
async function project() { return JSON.parse((await download('#saveProjectBtn')).toString()); }
async function calibrate() {
  await page.locator('[data-tool="calibrate"]').click();
  await clickImage(130,750);await clickImage(330,750);
  await page.locator('#calLength').fill('1');
  await page.locator('#calLengthUnit').selectOption('mm');
  await page.locator('#confirmCalBtn').click();
}
const near=(actual,expected,tolerance=1e-3)=>assert(Math.abs(actual-expected)<tolerance,`${actual} != ${expected}`);

test('manual calibration, label drag, Undo, and exports preserve original pixels', async () => {
  await calibrate();await circle();
  const original=await project(),image=original.images[0],measure=image.measures[0];
  assert.equal(original.version,3);assert.equal(image.width,1400);assert.equal(image.height,850);
  near(image.cal.mmPerPx,.005,1e-8);near(measure.r,61);near(measure.c.x,235);near(measure.c.y,270);
  const csv=await download('#exportCsvBtn');
  const cells=[...csv.toString().split(/\r?\n/)[1].matchAll(/"([^"]*)"/g)].map(m=>m[1]);
  near(Number(cells[8]),122);near(Number(cells[10]),610,.01);
  assert.equal(cells[14],'MANUAL_THREE_POINT_CIRCLE');
  const png=await download('#exportPngBtn');
  assert.equal(png.subarray(1,4).toString(),'PNG');
  assert.equal(png.readUInt32BE(16),1400);assert.equal(png.readUInt32BE(20),850);
  const zip=await download('#exportAllBtn');
  assert.equal(zip.readUInt32LE(0),0x04034b50);
  let offset=0,entries=[];
  while(zip.readUInt32LE(offset)===0x04034b50) {
    const size=zip.readUInt32LE(offset+18),nameLength=zip.readUInt16LE(offset+26),extraLength=zip.readUInt16LE(offset+28);
    const name=zip.subarray(offset+30,offset+30+nameLength).toString(),start=offset+30+nameLength+extraLength;
    entries.push(name);
    if(name==='measurements.csv') assert.deepEqual(zip.subarray(start,start+size),csv);
    offset=start+size;
  }
  assert.deepEqual(entries,['0001_laser_fabric_DEMO_dimension.png','measurements.csv','README.txt']);
  if(process.env.MICROCAD_EXPORT_CAPTURE) {
    fs.mkdirSync(process.env.MICROCAD_EXPORT_CAPTURE,{recursive:true});
    for(const [name,buffer] of Object.entries({'project.json':JSON.stringify(original),'measurements.csv':csv,'measurement.png':png,'measurements.zip':zip}))
      fs.writeFileSync(path.join(process.env.MICROCAD_EXPORT_CAPTURE,name),buffer);
  }
  await page.locator('[data-tool="select"]').click();
  const b=await page.locator('#stage').boundingBox(),v=image.view;
  const x=b.x+v.x+measure.c.x*v.z+Math.cos(-.6)*(measure.r*v.z+71);
  const y=b.y+v.y+measure.c.y*v.z+Math.sin(-.6)*(measure.r*v.z+71);
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+30,y+20,{steps:5});await page.mouse.up();
  const shifted=(await project()).images[0].measures[0];
  near(shifted.shift.x,30/v.z);near(shifted.shift.y,20/v.z);
  assert.deepEqual({...shifted,shift:measure.shift},measure);
  await page.locator('#undoBtn').click();
  assert.deepEqual((await project()).images[0].measures[0],measure);
  // A project round-trip must preserve measurement data and calibration values.
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('#fileProject').setInputFiles({name:'round-trip.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(original))});
  await page.waitForFunction(()=>document.querySelector('#busyPanel').hidden);
  const restored=await project();
  // Existing loader normalizes an absent three-point fit residual to zero.
  assert.deepEqual(restored.images[0].measures,image.measures.map(m=>({...m,fitRms:m.fitRms??0})));
  near(restored.images[0].cal.mmPerPx,image.cal.mmPerPx,1e-12);
  await page.locator('#measureList .meas-item').click();
  await page.locator('#measNameEdit').fill('Nhãn kiểm thử');await page.locator('#updateNameBtn').click();
  await page.keyboard.press('Control+z'); // Input still owns focus: do not hijack text undo.
  await page.locator('[data-tool="select"]').click();await page.keyboard.press('Control+z');
  assert.equal((await project()).images[0].measures[0].name,measure.name);
});

test('AI Batch fixtures stay proposals until explicit acceptance and Undo restores them', async () => {
  // Import the same synthetic demo as a second image through the real file input.
  const saved=await project();
  const buffer=Buffer.from(saved.images[0].imageDataUrl.split(',')[1],'base64');
  await page.locator('#fileImage').setInputFiles({name:'second.jpg',mimeType:'image/jpeg',buffer});
  await page.waitForFunction(()=>document.querySelector('#docName').textContent==='second.jpg');
  await openAi();
  await page.locator('#aiBatchBtn').click();
  await page.locator('#aiReviewList .meas-item').waitFor();
  assert.equal(await page.locator('#measCount').textContent(),'0');
  await page.locator('#prevImage').click();
  await openAi();
  assert.equal(await page.locator('#aiReviewList .meas-item').count(),1);
  await page.locator('#aiAcceptAllBtn').click();
  assert.equal(await page.locator('#measCount').textContent(),'1');
  await page.locator('#undoBtn').click();
  assert.equal(await page.locator('#measCount').textContent(),'0');
  await openAi();
  assert.equal(await page.locator('#aiReviewList .meas-item').count(),1);
  await page.locator('#aiRejectAllBtn').click();
  assert.equal(await page.locator('#aiReviewList .meas-item').count(),0);
});

test('Row Spacing calculates from selected circles and remains undoable', async () => {
  await calibrate();await circle();
  await clickImage(606,255);await clickImage(545,316);await clickImage(484,255);
  await clickImage(296,535);await clickImage(235,596);await clickImage(174,535);
  await clickImage(606,520);await clickImage(545,581);await clickImage(484,520);
  await page.locator('[data-tool="rowSpacing"]').click();
  await page.locator('#measureList .meas-item').nth(0).click();
  await page.locator('#measureList .meas-item').nth(1).click();
  await page.locator('[data-row="1"]').click();
  await page.locator('#measureList .meas-item').nth(2).click();
  await page.locator('#measureList .meas-item').nth(3).click();
  await page.locator('#rowCalculateBtn').click();
  const saved=await project(),m=saved.images[0].measures.at(-1);
  assert.equal(m.type,'rowSpacing');assert.equal(m.row1Ids.length,2);assert.equal(m.row2Ids.length,2);
  near(m.distancePx,265/Math.sqrt(1+(15/310)**2),.01);
  await page.locator('#undoBtn').click();assert.equal(await page.locator('#measCount').textContent(),'4');
});

test('desktop layouts keep the independent library and context controls accessible', async () => {
  for(const width of [1280,1366,1920]) {
    await page.setViewportSize({width,height:768});
    await page.locator('[data-tool="rowSpacing"]').click();
    await page.locator('#rowCalculateBtn').scrollIntoViewIfNeeded();
    const panel=await page.locator('#sidePanel').boundingBox(),canvas=await page.locator('#stage').boundingBox();
    assert(panel.x>=canvas.x+canvas.width-1);assert(panel.x+panel.width<=width);
    await page.locator('#imageList').scrollIntoViewIfNeeded();
    assert.equal(await page.locator('#imageList .image-entry').isVisible(),true);
    const library=page.locator('#imageLibrary');
    if(await library.count()) {
      const box=await library.boundingBox();assert(box.x+box.width<=canvas.x);
      assert.equal(await page.locator('#sidePanel #imageList').count(),0);
    }
  }
});

test('Phase 1 docks never overlap and library stays visible while inspector scrolls', async () => {
  for(const [width,height] of [[1280,720],[1366,768],[1920,1080]]) {
    await page.setViewportSize({width,height});
    await page.locator('[data-tool="rowSpacing"]').click();
    const rail=await page.locator('.tools').boundingBox(),library=await page.locator('#imageLibrary').boundingBox();
    const canvas=await page.locator('#stage').boundingBox(),inspector=await page.locator('#sidePanel').boundingBox();
    assert(rail.x+rail.width<=library.x);assert(library.x+library.width<=canvas.x);
    assert(canvas.x+canvas.width<=inspector.x);assert(inspector.x+inspector.width<=width);
    assert(canvas.width>500);assert(canvas.height>600);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);
    await page.locator('#sidePanel').evaluate(el=>{el.scrollTop=el.scrollHeight;});
    assert.equal(await page.locator('#imageList .image-entry[aria-current="true"]').isVisible(),true);
  }
});

test('AI inspector is independent of canvas tool and transient row selections', async () => {
  await selectRow();const before=await project();
  await openAi();
  assert.equal(await page.locator('#toolMode').textContent(),'ROWSPACING');
  assert.equal(await page.locator('#aiReviewPanel').isVisible(),true);
  assert.equal(await page.locator('#rowSpacingPanel').isVisible(),false);
  assert.equal(await page.locator('#calibrationPanel').isVisible(),false);
  assert.deepEqual(await project(),before);
  // Canvas interaction must not reopen the hidden row panel over the AI context.
  await clickImage(235,270);
  assert.equal(await page.locator('#rowSpacingPanel').isVisible(),false);
  await clickImage(235,270);
  await page.locator('#inspectorToolBtn').click();
  assert.equal(await page.locator('#rowSpacingPanel').isVisible(),true);
  assert.equal(await page.locator('[data-row="0"]').textContent(),'Hàng 1 (1)');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#rowSpacingPanel').isVisible(),false);
});

test('context switches show calibration, measurement help, and AI only when requested', async () => {
  assert.equal(await page.locator('#calibrationPanel').isVisible(),true);
  assert.equal(await page.locator('#aiReviewPanel').isVisible(),false);
  await page.locator('[data-tool="circle"]').click();
  assert.equal(await page.locator('#calibrationPanel').isVisible(),false);
  assert.equal(await page.locator('#inspectorToolTitle').textContent(),'Đo Ø lỗ');
  await page.locator('#inspectorHelpBtn').click();
  assert.equal(await page.locator('#helpPanel').isVisible(),true);
  assert.equal(await page.locator('#toolMode').textContent(),'CIRCLE');
  await page.locator('#inspectorToolBtn').click();
  assert.equal(await page.locator('#helpPanel').isVisible(),false);
});

test('1024px dock toggles free canvas space and desktop restores the library', async () => {
  await page.setViewportSize({width:1024,height:768});
  await page.waitForFunction(()=>document.querySelector('#mobileSideBtn').getAttribute('aria-expanded')==='false');
  const initial=await page.locator('#stage').boundingBox();
  await page.locator('#mobileSideBtn').click();
  const docked=await page.locator('#stage').boundingBox();
  assert(docked.width<initial.width);assert(docked.width>=500);
  const side=await page.locator('#sidePanel').boundingBox();assert(docked.x+docked.width<=side.x);
  await page.locator('#libraryToggleBtn').click();
  assert.equal(await page.locator('#imageLibrary').isVisible(),false);
  await page.setViewportSize({width:1366,height:768});
  await page.waitForFunction(()=>document.querySelector('#libraryToggleBtn').getAttribute('aria-expanded')==='true');
  assert.equal(await page.locator('#imageList').isVisible(),true);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),1366);
});

test('footer reports existing zoom, coordinates, units, calibration, and AI state', async () => {
  await calibrate();await circle();
  await page.locator('#unitSelect').selectOption('mm');
  assert.equal(await page.locator('#footerUnit').textContent(),'mm');
  assert((await page.locator('#footerScale').textContent()).includes('µm/px'));
  await clickImage(700,400);
  assert((await page.locator('#coordinateText').textContent()).includes('700'));
  assert((await page.locator('#zoomText').textContent()).includes('%'));
  assert((await page.locator('#footerAi').textContent()).includes('AI ONLINE'));
});

test('fixed project input exports independently of dock layout', async () => {
  const fixture=await project();
  const cal={mmPerPx:.005,p1:{x:130,y:750},p2:{x:330,y:750},lengthMm:1,
    refName:fixture.images[0].imgName,refW:1400,refH:850,refId:fixture.images[0].imgId};
  fixture.latestCalibration=cal;fixture.images[0].cal=cal;
  fixture.images[0].view={z:.5,x:50,y:50};
  fixture.images[0].measures=[{id:1,type:'circle',name:'Lỗ 1',c:{x:235,y:270},r:61,
    edgePts:[{x:296,y:270},{x:235,y:331},{x:174,y:270}],shift:{x:0,y:0},fitRms:0}];
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('#fileProject').setInputFiles({name:'fixed.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture))});
  await page.waitForFunction(()=>document.querySelector('#busyPanel').hidden);
  const outputs={'fixed-project.json':await download('#saveProjectBtn'),'fixed-measurements.csv':await download('#exportCsvBtn'),
    'fixed-measurement.png':await download('#exportPngBtn'),'fixed-measurements.zip':await download('#exportAllBtn')};
  if(process.env.MICROCAD_EXPORT_CAPTURE) {
    fs.mkdirSync(process.env.MICROCAD_EXPORT_CAPTURE,{recursive:true});
    for(const [name,buffer] of Object.entries(outputs))fs.writeFileSync(path.join(process.env.MICROCAD_EXPORT_CAPTURE,name),buffer);
  }
  const saved=JSON.parse(outputs['fixed-project.json']);
  assert.equal(saved.images[0].measures[0].r,61);assert.equal(saved.images[0].cal.mmPerPx,.005);
  assert.equal(outputs['fixed-measurement.png'].readUInt32BE(16),1400);
  assert.equal(outputs['fixed-measurement.png'].readUInt32BE(20),850);
});

test('missing AI model leaves manual tools usable and AI actions disabled', async () => {
  await page.route('http://127.0.0.1:8000/**',route=>route.fulfill({json:{status:'online',model_ready:false,device:'cpu'}}));
  await page.reload();
  await page.waitForFunction(()=>document.querySelector('#footerAi').textContent.includes('MODEL'));
  await page.locator('#demoBtn').click();
  await page.waitForFunction(()=>document.querySelector('#imageSizeText').textContent.includes('1400'));
  await page.locator('#fitBtn').click();await openAi();
  assert.equal(await page.locator('#aiDetectBtn').isDisabled(),true);
  assert.equal(await page.locator('#aiBatchBtn').isDisabled(),true);
  await circle();assert.equal(await page.locator('#measCount').textContent(),'1');
});

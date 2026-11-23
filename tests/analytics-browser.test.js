/* Run with a local Playwright installation and a Chromium-family browser. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require(process.env.PLAYWRIGHT_PACKAGE || 'playwright');

const root=path.resolve(__dirname,'..');
const fixture=name=>path.join(root,name);
const app=pathToFileURL(fixture('MicroCAD_Vision.html')).href;
const artifacts=process.env.MICROCAD_QA_OUTPUT;
const fixtureV2=fixture('VI_DU_Bo_Anh.json');
const fixtureV3=fixture('VI_DU_DUONG_KINH_VA_MEP.json');
const sourceV3=require(fixtureV3);
const view=(page,name)=>page.locator('[data-view="'+name+'"]').click();

async function load(page,file,count) {
  await page.locator('#fileProject').setInputFiles(file);
  await page.waitForFunction(expected=>document.getElementById('imageCount').textContent===expected+' ảnh' &&
    document.getElementById('busyPanel').hidden, count);
}
async function kpi(page,label,value) {
  await page.waitForFunction(({label,value})=>[...document.querySelectorAll('.ar-kpi')].some(e=>
    e.querySelector('span').textContent===label&&e.querySelector('strong').textContent===String(value)),{label,value});
}
async function submitDialog(page,values) {
  const dialog=page.locator('#arDialog');
  for (const [label,value] of Object.entries(values)) await dialog.getByLabel(label,{exact:true}).fill(value);
  await dialog.getByRole('button',{name:'Lưu',exact:true}).click();
  await dialog.waitFor({state:'hidden'});
}
async function download(page,selector) {
  const [result]=await Promise.all([page.waitForEvent('download'),page.locator(selector).click()]);
  return {file:await result.path(),name:result.suggestedFilename()};
}
async function validateGeometry(page) {
  assert(await page.evaluate(()=>{
    const pane=document.querySelector('.ar-pane:not([hidden])');
    const box=pane.getBoundingClientRect();
    return document.documentElement.scrollHeight===innerHeight && box.left>=0 &&
      box.right<=innerWidth && box.bottom<=innerHeight && pane.scrollWidth<=pane.clientWidth;
  }),'Unexpected page scroll or horizontal overflow');
}
async function validatePages(page) {
  const fits=await page.locator('.ar-page-content').evaluateAll(nodes=>nodes.map(node=>node.scrollHeight<=node.clientHeight+2));
  assert(fits.every(Boolean),'Overflow on report pages '+fits.map((fits,i)=>fits?'':i+1).filter(Boolean).join(', '));
}
async function print(page,file) {
  await page.evaluate(async ()=>{
    window.didRequestPrint=false;
    window.print=()=>{window.didRequestPrint=true;};
    for (const image of document.querySelectorAll('#arPages img')) await image.decode();
  });
  await page.locator('#arPrint').click();
  await page.waitForFunction(()=>window.didRequestPrint===true);
  await page.pdf({path:file,preferCSSPageSize:true,printBackground:true});
}

async function testMockedAi(browser) {
  const context=await browser.newContext();
  const source=sourceV3.images[0];
  await context.route(/^http:\/\/127\.0\.0\.1:8000\//,async route=>{
    if(route.request().url().endsWith('/health')) {
      await route.fulfill({json:{status:'online',model_ready:true,device:'QA'},headers:{'Access-Control-Allow-Origin':'*'}});
    } else {
      const x=source.width/2,y=source.height/2,r=10;
      const detection={center_x:x,center_y:y,radius_px:r,fit_error:.05,confidence:.95,polygon:[[x+r,y],[x,y+r],[x-r,y]]};
      await route.fulfill({json:{width:source.width,height:source.height,detections:[detection]},headers:{'Access-Control-Allow-Origin':'*'}});
    }
  });
  try {
    const page=await context.newPage();
    await page.goto(app);
    await load(page,fixtureV3,1);
    await page.locator('#inspectorAiBtn').click();
    await page.locator('#aiDetectBtn').click();
    await page.getByRole('button',{name:'Chấp nhận',exact:true}).waitFor();
    await view(page,'analytics');
    await kpi(page,'Đường kính',2);
    await view(page,'measurement');
    await page.getByRole('button',{name:'Chấp nhận',exact:true}).click();
    await view(page,'analytics');
    await kpi(page,'Đường kính',3);
    await page.locator('#arMethodFilter').selectOption({label:'Khớp đường tròn từ đề xuất AI'});
    await kpi(page,'Đường kính',1);
    await view(page,'measurement');
    await page.locator('#undoBtn').click();
    await view(page,'analytics');
    await kpi(page,'Đường kính',2);
  } finally {await context.close();}
}

(async()=>{
  const browser=await chromium.launch({
    executablePath:process.env.MICROCAD_BROWSER,
    args:['--disable-gpu','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']
  });
  try {
    const context=await browser.newContext({viewport:{width:1366,height:768},offline:true,acceptDownloads:true});
    const external=[];
    await context.route(/^https?:\/\//,route=>{
      const url=route.request().url();
      if(!url.startsWith('http://127.0.0.1:8000/'))external.push(url);
      return route.abort();
    });
    const page=await context.newPage();
    page.setDefaultTimeout(7000);
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('dialog',dialog=>dialog.accept());
    await page.goto(app);
    await view(page,'analytics');
    await kpi(page,'Phép đo hợp lệ',0);
    await validateGeometry(page);
    await view(page,'measurement');
    await load(page,fixtureV2,3);
    await page.locator('#nextImage').click();
    assert.equal(await page.locator('#imagePosition').innerText(),'2 / 3');
    await page.locator('#prevImage').click();
    assert.equal(await page.locator('#imagePosition').innerText(),'1 / 3');
    await view(page,'analytics');
    await kpi(page,'Tổng số ảnh',3);
    await kpi(page,'Khe thủ công',1);
    await page.locator('#arTypeFilter').selectOption('distance');
    assert.match(await page.locator('#arScopeNote').innerText(),/1 phép đo.*chưa hiệu chuẩn/);
    await kpi(page,'Trong dung sai','—');
    await view(page,'library');
    await page.locator('#arLibraryRows input').first().check();
    await page.locator('#arRemoveImages').click();
    await view(page,'analytics');
    await kpi(page,'Tổng số ảnh',2);
    await kpi(page,'Khe thủ công',0);
    await view(page,'library');
    await page.locator('#arRestoreImages').click();
    await view(page,'analytics');
    await kpi(page,'Tổng số ảnh',3);
    await kpi(page,'Khe thủ công',1);

    await view(page,'measurement');
    await load(page,fixtureV3,1);
    await view(page,'analytics');
    await page.locator('#arTypeFilter').selectOption('circle');
    await kpi(page,'Đường kính',2);
    const secondPoint=page.locator('#arPlot-trend [role=button]').filter({hasText:'#2'});
    await secondPoint.focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('.meas-item.selected').getAttribute('data-id'),'2');
    await page.locator('#deleteMeasureBtn').click();
    await view(page,'analytics');
    await kpi(page,'Đường kính',1);
    await kpi(page,'Khe hai đường tròn',0);
    await view(page,'measurement');
    await page.locator('#undoBtn').click();
    await view(page,'analytics');
    await kpi(page,'Đường kính',2);
    await kpi(page,'Khe hai đường tròn',1);

    await page.locator('#arNewCondition').click();
    await submitDialog(page,{'Tên dự án':'Kiểm thử MicroCAD','Tên điều kiện':'Điều kiện kiểm thử'});
    await view(page,'library');
    await page.locator('#arNewSession').click();
    await submitDialog(page,{'Tên phiên':'Phiên kiểm thử'});
    await page.locator('#arLibraryRows input').first().check();
    await page.locator('#arAssign').click();
    await view(page,'analytics');
    await page.locator('#arSessionFilter').selectOption({label:'Phiên kiểm thử'});
    await kpi(page,'Tổng số ảnh',1);
    await page.locator('#arTolerance').click();
    await submitDialog(page,{'Đường kính lỗ · LSL (mm)':'0.56','Khe đo thủ công · TARGET (mm)':'0.8',
      'Khe đo thủ công · LSL (mm)':'0.75','Khe đo thủ công · USL (mm)':'0.85'});
    await page.waitForFunction(()=>document.querySelector('#arScopeNote').textContent.includes('0,56'));
    await page.locator('#arBins').selectOption('10');
    const histogram=await download(page,'#arDownloadHistogram');
    assert((await fs.readFile(histogram.file)).subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])));
    if(artifacts){
      await page.locator('#toast.show').waitFor({state:'hidden'});
      await page.screenshot({path:path.join(artifacts,'screenshots','Analytics-1366x768.png')});
      await page.setViewportSize({width:1920,height:1080});
      await validateGeometry(page);
      await page.screenshot({path:path.join(artifacts,'screenshots','Analytics-1920x1080.png')});
    }
    await page.locator('#arGenerate').click();
    await page.locator('[name=source]').fill('Dữ liệu kiểm thử từ dự án mẫu VI_DU_DUONG_KINH_VA_MEP.json trong repository.');
    await page.locator('[name=template]').selectOption('technical');
    await page.locator('[name=reportTitle]').fill('Báo cáo đo kiểm lỗ laser');
    await page.locator('[name=evidence]').selectOption({index:1});
    assert.equal(await page.locator('.ar-evidence img').count(),1);
    await validateGeometry(page);
    await validatePages(page);
    assert(await page.locator('#arPrint').isVisible());
    if(artifacts){
      await page.screenshot({path:path.join(artifacts,'screenshots','Report-Editor-1920x1080.png')});
      await page.setViewportSize({width:1366,height:768});
      await validateGeometry(page);
      await page.screenshot({path:path.join(artifacts,'screenshots','Report-Editor-1366x768.png')});
      await print(page,path.join(artifacts,'pdf','MicroCAD_Technical_Report_Test.pdf'));
      await page.locator('[name=template]').selectOption('quick');
      await validatePages(page);
      await print(page,path.join(artifacts,'pdf','MicroCAD_Quick_Report_Test.pdf'));
    }
    const saved=await download(page,'#arSaveReport');
    const json=JSON.parse(await fs.readFile(saved.file,'utf8'));
    assert.equal(json.analytics.conditions[0].tolerances.circle.lsl,.56);
    assert.equal(json.analytics.conditions[0].tolerances.edges.target,.8);
    assert.equal(json.analytics.report.title,'Báo cáo đo kiểm lỗ laser');
    await load(page,{name:saved.name,mimeType:'application/json',buffer:Buffer.from(JSON.stringify(json))},1);
    await view(page,'analytics');
    await page.locator('#arConditionFilter').selectOption({label:'Điều kiện kiểm thử'});
    await page.locator('#arSessionFilter').selectOption({label:'Phiên kiểm thử'});
    await kpi(page,'Tổng số ảnh',1);
    await view(page,'reports');
    assert.equal(await page.locator('[name=reportTitle]').inputValue(),'Báo cáo đo kiểm lỗ laser');
    assert.equal(await page.locator('.ar-evidence img').count(),1);
    await page.locator('[name=evidence]').selectOption('');
    assert.equal(await page.locator('.ar-evidence img').count(),0);

    await view(page,'measurement');
    const png=await download(page,'#exportPngBtn');
    assert((await fs.readFile(png.file)).subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])));
    const csv=await download(page,'#exportCsvBtn');
    assert.match(await fs.readFile(csv.file,'utf8'),/Measurement_id.*Value_mm.*\r?\n.*"circle"/s);
    const zip=await download(page,'#exportAllBtn');
    assert((await fs.readFile(zip.file)).includes(Buffer.from('measurements.csv')));
    const source=sourceV3.images[0];
    await page.locator('#fileImage').setInputFiles({
      name:'ảnh nhập thêm.png',mimeType:'image/png',buffer:Buffer.from(source.imageDataUrl.split(',')[1],'base64')
    });
    await page.waitForFunction(()=>document.getElementById('imageCount').textContent==='2 ảnh');
    await view(page,'measurement');
    await page.locator('#fitBtn').click();
    await page.locator('[data-tool=distance]').click();
    const stage=page.locator('#stage');
    const box=await stage.boundingBox();
    await stage.click({position:{x:box.width/2-15,y:box.height/2}});
    await stage.click({position:{x:box.width/2+15,y:box.height/2}});
    await view(page,'analytics');
    await page.locator('#arConditionFilter').selectOption('all');
    await kpi(page,'Tổng số ảnh',2);
    await kpi(page,'Phép đo hợp lệ',4);
    await view(page,'measurement');
    await page.locator('#undoBtn').click();
    await page.locator('#cameraBtn').click();
    await page.locator('#snapshotBtn').waitFor({state:'visible'});
    await page.locator('#snapshotBtn').click();
    await page.waitForFunction(()=>document.getElementById('imageCount').textContent==='3 ảnh');
    await view(page,'analytics');
    await kpi(page,'Tổng số ảnh',3);
    await kpi(page,'Phép đo hợp lệ',3);

    const twoConditions={
      ...sourceV3,images:[{...source,imgId:1},{...source,imgId:2,imgName:'Ảnh điều kiện B.png'}],
      analytics:{
        conditions:[
          {id:'a',name:'Điều kiện A'},
          {id:'b',name:'Điều kiện B',tolerances:{circle:{target:.4,lsl:.3,usl:.5}}}
        ],
        assignments:{1:{conditionId:'a'},2:{conditionId:'b'}}
      }
    };
    await load(page,{name:'comparison.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(twoConditions))},2);
    await kpi(page,'Đường kính',4);
    await kpi(page,'Trong dung sai','50%');
    assert.match(await page.locator('#arScopeNote').innerText(),/Dung sai khác nhau/);
    assert.equal(await page.locator('#arCompareStats tbody tr').count(),2);
    assert.deepEqual(await page.locator('#arCompareStats tbody tr td:last-child').allTextContents(),['0%','100%']);

    await view(page,'reports');
    await page.locator('[name=template]').selectOption('technical');
    await page.locator('[name=comparison]').check();
    assert.equal(await page.locator('.ar-page').filter({hasText:'ĐIỀU KIỆN THÍ NGHIỆM'}).count(),2);
    await validatePages(page);
    await view(page,'analytics');

    // Repeated repository fixture rows are solely a pagination stress test.
    const many={...sourceV3,images:Array.from({length:46},(_,i)=>({...source,imgId:i+1,imgName:'Ảnh kiểm thử '+(i+1)+' '+ 'dài '.repeat(43)+'.png'}))};
    await load(page,{name:'pagination.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(many))},46);
    await view(page,'analytics');
    await kpi(page,'Tổng số ảnh',46);
    await page.locator('#arTrendZoom').click();
    await page.locator('#arTrendNext').click();
    assert.notEqual(await page.locator('#arTrendRange').innerText(),'Toàn bộ');
    await page.locator('#arTrendMode').selectOption('average');
    await view(page,'reports');
    await page.locator('[name=template]').selectOption('technical');
    const tracePages=page.locator('.ar-page').filter({hasText:'Kết quả theo ảnh'});
    assert(await tracePages.count()>=3);
    assert.equal(await tracePages.locator('tbody tr').count(),46);
    await validatePages(page);
    if(artifacts)await print(page,path.join(artifacts,'qa','Pagination_Test.pdf'));
    assert.deepEqual(errors,[]);
    assert.deepEqual(external,[]);
    await context.close();
    await testMockedAi(browser);
    console.log('Browser integration passed: offline file launch, legacy JSON, filters, chart point, Undo, removal, PNG/CSV/ZIP/JSON, A4 pagination, manual measurement, simulated camera and AI review.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

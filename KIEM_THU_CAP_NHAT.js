// Chạy bằng: node KIEM_THU_CAP_NHAT.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync(__dirname + '/MicroCAD_Vision.html', 'utf8');
function between(start, end) {
  const a = html.indexOf(start), b = html.indexOf(end, a + start.length);
  assert(a >= 0 && b > a, `Không tìm thấy đoạn mã ${start}`);
  return html.slice(a, b);
}

{
  const geometry = between('function circumcircle(', 'function snapPoint(');
  const context = vm.createContext({Math});
  const {fitCircle} = vm.runInContext(`const pt=(x,y)=>({x,y}),dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);${geometry};({fitCircle})`, context);
  const perfect = Array.from({length:12}, (_,i) => ({x:120+40*Math.cos(i*Math.PI/6),y:90+40*Math.sin(i*Math.PI/6)}));
  const fit = fitCircle(perfect);
  assert(Math.abs(fit.c.x-120)<1e-8 && Math.abs(fit.c.y-90)<1e-8);
  assert(Math.abs(fit.r-40)<1e-8 && fit.fitRms<1e-8);
  const distorted = perfect.map((p,i) => ({x:120+(40+(i%2?3:-3))*Math.cos(i*Math.PI/6),y:90+(40+(i%2?3:-3))*Math.sin(i*Math.PI/6)}));
  assert(fitCircle(distorted).fitRms>2);
  assert.equal(fitCircle([{x:0,y:0},{x:10,y:0},{x:20,y:0},{x:30,y:0}]),null);
  const validation = between('function validateMeasures(', 'function validateCal(');
  context.width=640;context.height=480;context.idSeed=1;
  const {validateMeasures}=vm.runInContext(`const finite=n=>typeof n==='number'&&Number.isFinite(n),validPoint=p=>p&&finite(p.x)&&finite(p.y)&&Math.abs(p.x)<1e7&&Math.abs(p.y)<1e7;${validation};({validateMeasures})`,context);
  const loaded=validateMeasures([{id:7,type:'circle',name:'Lỗ méo',edgePts:distorted}],640,480,false);
  assert.equal(loaded[0].edgePts.length,12);
  assert(loaded[0].fitRms>2);
  assert.throws(()=>validateMeasures([{id:8,type:'circle',edgePts:perfect.concat(Array(60).fill(perfect[0]))}],640,480,false));
}

{
  const pillCode = between('function pill(', 'function drawSegment(');
  const context = vm.createContext({width:640,height:480,exportBounds:null,doc:{view:{z:1}},Math});
  const {pill} = vm.runInContext(`${pillCode};({pill})`, context);
  const canvas = {save(){},restore(){},measureText(){return {width:100}},beginPath(){},roundRect(){},fill(){},stroke(){},fillText(){}};
  const boxes=[];
  pill(canvas,'Lỗ 1',300,220,'#fff',false,boxes,1);
  pill(canvas,'Lỗ 2',300,220,'#fff',false,boxes,2);
  assert(boxes[0].bottom <= boxes[1].top || boxes[1].bottom <= boxes[0].top || boxes[0].right <= boxes[1].left || boxes[1].right <= boxes[0].left);
}

{
  const calibrationCode = between('function confirmCalibration(', 'function pointerDown(');
  const elements = {calLength:{value:'1'},calLengthUnit:{value:'mm'},calModal:{classList:{remove(){}}}};
  const doc = {imgId:1,imgName:'mau.png',width:1000,height:800,cal:null,pending:[]};
  const images = [{imgId:1,cal:null,history:[],measures:[],selected:null},{imgId:2,cal:{mmPerPx:.01},history:[],measures:[],selected:null}];
  const context = vm.createContext({doc,images,latestCalibration:null,calPair:{p1:{x:0,y:0},p2:{x:200,y:0},px:200},dirty:false,Math,structuredClone,$:id=>elements[id],historyPush(){},stashActive(){},setTool(){},updateUI(){},render(){},toast(){},num:String});
  vm.runInContext(`${calibrationCode};confirmCalibration()`,context);
  assert.equal(doc.cal.mmPerPx,.005);
  assert(images.every(r=>r.cal.mmPerPx===.005));
  assert.equal(context.latestCalibration.mmPerPx,.005);
  assert.equal(images[1].history.length,1);
}

assert(html.includes('MicroCAD_${dateName}.zip'));
assert(html.includes('cal:latestCalibration?structuredClone(latestCalibration):null'));
console.log('OK: khớp vòng tròn, tránh chồng nhãn, áp chuẩn toàn bộ ảnh, tên ZIP.');

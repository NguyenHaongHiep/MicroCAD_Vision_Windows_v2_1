const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../MicroCAD_Vision.html'),'utf8');
const context=vm.createContext({Math});
vm.runInContext(html.slice(html.indexOf('function selectionSegments('),html.indexOf('function selectionSegmentDistance(')),context);
const pick=(m,r,crossing)=>context.measurementInSelectionRect(m,r,crossing);
const circle={type:'circle',c:{x:0,y:0},r:10};
test('circle selection uses circumference, not just an overlapping bounding box',()=>{
 assert(pick(circle,{left:-10,right:10,top:-10,bottom:10},false));
 assert(!pick(circle,{left:9,right:11,top:9,bottom:11},true));
 assert(!pick(circle,{left:-1,right:1,top:-1,bottom:1},true));
 assert(pick(circle,{left:10,right:12,top:-1,bottom:1},true));
 assert(!pick(circle,{left:-9,right:10,top:-10,bottom:10},false));
});
test('crossing clips finite segments exactly, including parallel and zero-length cases',()=>{
 const rect={left:0,right:10,top:0,bottom:10};
 assert(pick({type:'distance',p1:{x:-5,y:5},p2:{x:15,y:5}},rect,true));
 assert(!pick({type:'distance',p1:{x:-5,y:11},p2:{x:15,y:11}},rect,true));
 assert(pick({type:'circleGap',p1:{x:5,y:5},p2:{x:5,y:5}},rect,true));
 assert(!pick({type:'circleGap',p1:{x:20,y:20},p2:{x:20,y:20}},rect,true));
 assert(!pick({type:'rowSpacing',p1:{x:-5,y:5},p2:{x:15,y:5}},rect,false));
});
test('angle window contains both arms, while crossing can intersect either arm',()=>{
 const angle={type:'angle',p1:{x:1,y:1},p2:{x:5,y:5},p3:{x:15,y:5}},rect={left:0,right:10,top:0,bottom:10};
 const before=JSON.stringify(angle);assert(!pick(angle,rect,false));assert(pick(angle,rect,true));assert.equal(JSON.stringify(angle),before);
});
test('navigation guard leaves camera, busy and pointer interaction alone',()=>{
 const ctx=vm.createContext({busy:false,doc:{camera:false,mouse:{down:false}},selectionBox:null,activeId:1,images:[{imgId:1},{imgId:2}],$:()=>({classList:{contains:()=>false}})});
 vm.runInContext(html.slice(html.indexOf('function navigateImage('),html.indexOf('// Original-pixel selection primitives')),ctx);
 ctx.activateImage=id=>{ctx.activeId=id;};
 assert.equal(ctx.navigateImage(-1),false);ctx.doc.camera=true;assert.equal(ctx.navigateImage(1),false);
 ctx.doc.camera=false;ctx.busy=true;assert.equal(ctx.navigateImage(1),false);
 ctx.busy=false;ctx.doc.mouse.down=true;assert.equal(ctx.navigateImage(1),false);
 ctx.doc.mouse.down=false;ctx.selectionBox={};assert.equal(ctx.navigateImage(1),false);
 ctx.selectionBox=null;assert.equal(ctx.navigateImage(1),true);assert.equal(ctx.activeId,2);
});

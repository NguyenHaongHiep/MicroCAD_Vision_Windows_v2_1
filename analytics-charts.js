/* Offline SVG charts. The same plots are reused for print and PNG. */
(() => {
  'use strict';
  const A = MicroCADAnalytics;
  const NS = 'http://www.w3.org/2000/svg';
  const palette = {below:'#f0ad63', within:'#57cec3', above:'#f18e9f', neutral:'#8caaf9'};
  const labels = {below:'Dưới LSL', within:'Trong dung sai', above:'Trên USL', neutral:'Chưa đặt dung sai'};
  const fmt = (x, digits = 3) => Number.isFinite(x) ? x.toLocaleString('vi-VN', {maximumFractionDigits:digits}) : '—';
  const exact = x => fmt(x, 12);
  const pct = n => n === null ? '—' : fmt(n * 100, 1) + '%';
  const svgNode = (tag, attrs = {}, content) => {
    const node = document.createElementNS(NS, tag);
    for (const [k,v] of Object.entries(attrs)) node.setAttribute(k, v);
    if (content !== undefined) node.textContent = content;
    return node;
  };
  const plot = (title, light = false) => {
    const svg = svgNode('svg', {width:640,height:236,viewBox:'0 0 640 236',role:'group','aria-label':title,'font-family':'Segoe UI, Arial, sans-serif','font-size':12});
    const theme = light ? {bg:'#ffffff', ink:'#243d52', grid:'#dde7ee', point:'#137a83'} :
      {bg:'#101c2b', ink:'#c4d2e4', grid:'#2a3c51', point:'#61e2e7'};
    const add = (tag, attrs, content) => {const n = svgNode(tag, attrs, content); svg.append(n); return n;};
    add('rect',{width:640,height:236,fill:theme.bg});
    return {svg,add,theme,text:(x,y,value,extra={})=>add('text',{x,y,fill:theme.ink,...extra},value)};
  };
  const left=60, right=615, top=25, bottom=187;
  function range(values) {
    let min=Infinity,max=-Infinity;
    for (const x of values) {min=Math.min(x,min);max=Math.max(x,max);}
    if (!Number.isFinite(min)) return [0,1];
    const pad = (max-min || Math.abs(max)*.1 || .01)*.09;
    return [min-pad,max+pad];
  }
  function controls(p, mark, tooltip, onClick) {
    mark.append(svgNode('title',{},tooltip));
    if (!onClick) return;
    mark.setAttribute('role','button');
    mark.setAttribute('tabindex','0');
    mark.setAttribute('aria-label',tooltip);
    mark.style.cursor='pointer';
    mark.addEventListener('click',onClick);
    mark.addEventListener('keydown',event => {
      if (event.key === 'Enter' || event.key === ' ') {event.preventDefault();onClick();}
    });
  }
  function line(p,x1,y1,x2,y2,attrs={}) {
    return p.add('line',{x1,y1,x2,y2,stroke:p.theme.grid,...attrs});
  }
  function axes(p, xlo, xhi, ylo, yhi, xLabel, yLabel, xFormat=fmt, yFormat=fmt) {
    for (let n=0;n<=4;n++) {
      const y=bottom-(bottom-top)*n/4, x=left+(right-left)*n/4;
      line(p,left,y,right,y);
      p.text(left-7,y+4,yFormat(ylo+(yhi-ylo)*n/4),{'text-anchor':'end'});
      if (xLabel) p.text(x,bottom+18,xFormat(xlo+(xhi-xlo)*n/4),{'text-anchor':'middle'});
    }
    line(p,left,top,left,bottom);
    if (xLabel) p.text((left+right)/2,229,xLabel,{'text-anchor':'middle'});
    p.text(10,15,yLabel);
  }
  const limits = tolerance => A.validTolerance(tolerance) ? [
    ['LSL',tolerance.lsl,'#dc8850'], ['Target',tolerance.target,'#328895'], ['USL',tolerance.usl,'#d3647e']
  ] : [];
  function empty(p, message='Chưa có dữ liệu đã hiệu chuẩn.') {
    p.text(320,120,message,{'text-anchor':'middle'});
    return p.svg;
  }
  function histogram(rows,tolerance,bins=0,light=false,resolve=()=>tolerance) {
    const p=plot('Histogram · Phép đo thô',light);
    const values=rows.map(row=>row.valueMm).filter(Number.isFinite);
    if (!values.length) return empty(p);
    const lineDefs=limits(tolerance);
    const [lo,hi]=range(values.concat(lineDefs.map(l=>l[1])));
    const n=bins || Math.min(32,Math.max(5,Math.ceil(Math.sqrt(values.length))));
    const buckets=Array.from({length:n},()=>({below:0,within:0,above:0,neutral:0,total:0}));
    for (const row of rows) {
      const val=row.valueMm;
      if (!Number.isFinite(val)) continue;
      const b=buckets[Math.min(n-1,Math.floor((val-lo)/(hi-lo)*n))];
      b[A.classify(val,resolve(row)) || 'neutral']++; b.total++;
    }
    const max=Math.ceil(Math.max(...buckets.map(b=>b.total))/4)*4;
    axes(p,lo,hi,0,max,'Kích thước (mm)','Số phép đo');
    const x=v=>left+(right-left)*(v-lo)/(hi-lo), h=c=>(bottom-top)*c/max;
    buckets.forEach((b,i)=>{
      let y=bottom;
      for (const key of Object.keys(palette)) {
        if (!b[key]) continue;
        y-=h(b[key]);
        const mark=p.add('rect',{x:left+i*(right-left)/n+1,y,width:(right-left)/n-2,height:h(b[key]),fill:palette[key]});
        controls(p,mark,exact(lo+(hi-lo)*i/n)+' – '+exact(lo+(hi-lo)*(i+1)/n)+' mm · '+labels[key]+': '+b[key]+' / '+b.total);
      }
    });
    lineDefs.forEach(([label,value,color],i)=>{
      line(p,x(value),top,x(value),bottom,{stroke:color,'stroke-width':2,'stroke-dasharray':'5 3'});
      p.text(x(value),top-5+(i%2)*13,label,{'text-anchor':'middle',fill:p.theme.ink,'font-size':10});
    });
    const keys=Object.keys(palette).filter(k=>buckets.some(b=>b[k]));
    p.svg.setAttribute('viewBox','0 0 640 264');
    p.svg.setAttribute('height','264');
    p.svg.firstChild.setAttribute('height','264');
    let legendX=60;
    for(const key of keys){
      p.add('rect',{x:legendX,y:245,width:9,height:9,rx:2,fill:palette[key]});
      p.text(legendX+14,253,labels[key],{'font-size':11});
      legendX+=key==='neutral'?140:123;
    }
    return p.svg;
  }
  function trend(rows,tolerance,{average=false,visible=['LSL','Target','USL'],start,end,open,light=false}={}) {
    const p=plot(average?'Xu hướng · Trung bình ảnh':'Xu hướng · Từng phép đo',light);
    const calibrated=rows.filter(row=>Number.isFinite(row.valueMm));
    if (!calibrated.length) return empty(p);
    const batches=Map.groupBy(calibrated,r=>r.imageIndex);
    const all=[...batches.keys()];
    const xlo=start ?? all[0], last=end ?? all.at(-1);
    const data=[];
    for (const [index,group] of batches) {
      if (index<xlo || index>last) continue;
      if (average) data.push({...group[0],measurementId:null,valueMm:A.summarize(group).mean});
      else group.forEach((row,i)=>data.push({...row,jitter:group.length>1?(i/(group.length-1)-.5)*.14:0}));
    }
    const lines=limits(tolerance).filter(l=>visible.includes(l[0]));
    const [lo,hi]=range(data.map(r=>r.valueMm).concat(lines.map(l=>l[1])));
    const x=v=>left+(right-left)*(v-xlo+.25)/(last-xlo+.5), y=v=>bottom-(bottom-top)*(v-lo)/(hi-lo);
    // Show actual image indexes, including gaps introduced by filters.
    axes(p,xlo,last,lo,hi,'Thứ tự ảnh','mm',()=> '');
    const ticks=new Set(Array.from({length:5},(_,i)=>Math.round(xlo+(last-xlo)*i/4)));
    for (const i of ticks) p.text(x(i),bottom+18,String(i+1),{'text-anchor':'middle'});
    for (const [name,value,color] of lines) {
      line(p,left,y(value),right,y(value),{stroke:color,'stroke-width':1.6,'stroke-dasharray':'5 4'});
      p.text(right-2,y(value)-3,name,{'text-anchor':'end','font-size':10});
    }
    if (average && data.length>1) p.add('polyline',{points:data.map(r=>x(r.imageIndex)+','+y(r.valueMm)).join(' '),fill:'none',stroke:p.theme.point,'stroke-opacity':.6});
    for (const row of data) {
      const cx=x(row.imageIndex+(row.jitter||0));
      const mark=p.add('circle',{cx,cy:y(row.valueMm),r:average?5:4,fill:p.theme.point,stroke:p.theme.bg,'stroke-width':1});
      const tip=(row.imageIndex+1)+' · '+row.imageName+' · '+(average?'Trung bình':'#'+row.measurementId)+' · '+exact(row.valueMm)+' mm';
      controls(p,mark,tip,open && (()=>open(row)));
    }
    return p.svg;
  }
  function tolerance(rows,spec,light=false) {
    const p=plot('Phân loại dung sai',light), stats=A.summarize(rows,spec);
    if (!stats.evaluated) return empty(p,'Chưa có phép đo được đánh giá dung sai.');
    ['below','within','above'].forEach((key,i)=>{
      const y=38+i*62, count=stats.counts[key], fraction=count/stats.evaluated;
      p.text(35,y,labels[key]);
      p.text(605,y,count+' / '+stats.evaluated+' · '+pct(fraction),{'text-anchor':'end'});
      p.add('rect',{x:35,y:y+10,width:570,height:12,rx:4,fill:p.theme.grid});
      p.add('rect',{x:35,y:y+10,width:570*fraction,height:12,rx:4,fill:palette[key]});
    });
    return p.svg;
  }
  function comparison(entries,light=false) {
    const p=plot('So sánh điều kiện · Trung bình ± SD mẫu',light);
    if (!entries.length) return empty(p,'Chưa có điều kiện có dữ liệu đã hiệu chuẩn.');
    const stats=entries.map(e=>e.stats);
    const [lo,hi]=range(stats.flatMap(s=>[s.mean-(s.sampleStdDev||0),s.mean+(s.sampleStdDev||0)]));
    const x=n=>237+(n-lo)/(hi-lo)*260;
    p.text(35,21,'Trung bình ± SD mẫu (mm)');
    p.text(602,21,'Tỷ lệ đạt',{'text-anchor':'end'});
    entries.slice(0,6).forEach(({name,stats:s},i)=>{
      const y=46+i*28, sd=s.sampleStdDev;
      const label=p.text(35,y,name.length>26?name.slice(0,25)+'…':name);
      controls(p,label,name);
      if (sd!==null) line(p,x(s.mean-sd),y-4,x(s.mean+sd),y-4,{stroke:p.theme.point,'stroke-width':2});
      const marker=p.add('circle',{cx:x(s.mean),cy:y-4,r:5,fill:p.theme.point});
      controls(p,marker,name+' · '+exact(s.mean)+' mm · SD '+exact(sd)+' · n='+s.count);
      p.text(602,y,pct(s.passRate),{'text-anchor':'end'});
    });
    line(p,237,196,497,196);
    p.text(237,213,fmt(lo),{'text-anchor':'middle'});
    p.text(497,213,fmt(hi),{'text-anchor':'middle'});
    return p.svg;
  }
  async function png(svg) {
    const url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)],{type:'image/svg+xml;charset=utf-8'}));
    try {
      const img=new Image(); img.src=url; await img.decode();
      const canvas=document.createElement('canvas');
      canvas.width=img.naturalWidth*2; canvas.height=img.naturalHeight*2;
      canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
      return await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Không thể tạo ảnh PNG.')),'image/png'));
    } finally {URL.revokeObjectURL(url);}
  }
  globalThis.MicroCADCharts={fmt,pct,palette,labels,histogram,trend,tolerance,comparison,png};
})();

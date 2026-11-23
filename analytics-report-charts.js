/* Vector plots for the technical PDF. Visual tokens come from its print CSS. */
(() => {
  'use strict';

  const ns = 'http://www.w3.org/2000/svg';
  const plot = {left:48, right:483, top:14, bottom:135};
  const colors = {
    grid:'var(--tech-grid)', text:'var(--tech-muted)', data:'var(--tech-blue)',
    below:'var(--tech-red)', within:'var(--tech-teal)', above:'var(--tech-orange)',
    neutral:'var(--tech-neutral)', limit:'var(--tech-teal)', target:'var(--tech-orange)'
  };
  function chart(label) {
    const svg=document.createElementNS(ns,'svg');
    svg.setAttribute('viewBox','0 0 490 171');
    svg.setAttribute('role','img');
    svg.setAttribute('aria-label',label);
    function draw(tag,attrs,text) {
      const e=document.createElementNS(ns,tag);
      for (const [key,value] of Object.entries(attrs)) e.setAttribute(key,value);
      if (text!==undefined) e.textContent=text;
      svg.append(e);
      return e;
    }
    return {svg,draw};
  }
  function decimals(value,digits) {
    return value.toFixed(digits).replace('.',',');
  }
  function line(c,x1,y1,x2,y2,stroke=colors.grid,width=.7,dash) {
    c.draw('line',{x1,y1,x2,y2,stroke,'stroke-width':width,...(dash?{'stroke-dasharray':dash}:{})});
  }
  function text(c,x,y,value,attrs={}) {
    c.draw('text',{x,y,fill:colors.text,'font-size':8,'text-anchor':'middle',...attrs},value);
  }
  function axes(c,xTicks,yTicks,x,y,xLabel,yLabel,zone) {
    if(zone) c.draw('rect',{x:plot.left,y:y(zone.usl),width:plot.right-plot.left,height:y(zone.lsl)-y(zone.usl),fill:'var(--tech-teal-light)'});
    for (const [value,label] of yTicks) {
      line(c,plot.left,y(value),plot.right,y(value));
      text(c,plot.left-6,y(value)+2.6,label,{'text-anchor':'end'});
    }
    line(c,plot.left,plot.top,plot.left,plot.bottom);
    line(c,plot.left,plot.bottom,plot.right,plot.bottom);
    for (const [value,label] of xTicks) {
      line(c,x(value),plot.bottom,x(value),plot.bottom+3);
      text(c,x(value),plot.bottom+13,label);
    }
    text(c,(plot.left+plot.right)/2,164,xLabel);
    text(c,12,74,yLabel,{transform:'rotate(-90 12 74)'});
  }
  function limits(spec) {
    return spec ? [[spec.lsl,'limit'],[spec.usl,'limit'],[spec.target,'target']] : [];
  }
  function extent(points,spec) {
    const values=points.map(p=>p.mean).concat(limits(spec).map(([value])=>value));
    const low=Math.min(...values), high=Math.max(...values);
    const spread=high-low || Math.max(.001,Math.abs(low)*.04);
    return [low-spread*.06,high+spread*.06];
  }
  function ticks(low,high,preferred=6) {
    const approximate=(high-low)/(preferred-1);
    const power=10**Math.floor(Math.log10(approximate));
    const step=([1,2,2.5,5,10].find(x=>x>=approximate/power)||10)*power;
    const digits=Math.min(10,Math.max(0,Math.ceil(-Math.log10(step))+((step/power===2.5)?1:0)));
    const values=[];
    for (let i=Math.ceil(low/step);i<=Math.floor(high/step);i++) values.push([i*step,decimals(i*step,digits)]);
    return values;
  }
  const scale = (lo,hi,start,end) => value=>start+(value-lo)/(hi-lo)*(end-start);
  function empty(c) {
    text(c,245,83,'Chưa có kích thước đã hiệu chuẩn.');
    return c.svg;
  }
  function histogram(points,spec,requestedBins) {
    const c=chart('Histogram trung bình theo ảnh');
    if (!points.length) return empty(c);
    const [lo,hi]=extent(points,spec);
    const count=requestedBins||Math.max(6,Math.min(24,Math.round(Math.sqrt(points.length)*1.6)));
    const bins=Array.from({length:count},()=>({below:0,within:0,above:0,neutral:0,total:0}));
    for (const point of points) {
      const i=Math.min(count-1,Math.floor((point.mean-lo)/(hi-lo)*count));
      const bin=bins[i];
      bin[point.category||'neutral']++;
      bin.total++;
    }
    const max=Math.max(...bins.map(b=>b.total));
    const step=Math.max(1,Math.ceil(max/5)), ceiling=Math.ceil(max/step)*step;
    const yTicks=Array.from({length:ceiling/step+1},(_,i)=>[i*step,String(i*step)]);
    const x=scale(lo,hi,plot.left,plot.right), y=scale(0,ceiling,plot.bottom,plot.top);
    axes(c,ticks(lo,hi,7),yTicks,x,y,'Trung bình theo ảnh (mm)','Số ảnh');
    const slot=(plot.right-plot.left)/count;
    for (const [i,bin] of bins.entries()) {
      let cumulative=0;
      for (const key of ['below','within','above','neutral']) {
        if (!bin[key]) continue;
        const bottom=y(cumulative);
        cumulative+=bin[key];
        c.draw('rect',{x:plot.left+i*slot+1.1,y:y(cumulative),width:slot-2.2,height:bottom-y(cumulative),fill:colors[key]});
      }
    }
    for (const [value,key] of limits(spec)) line(c,x(value),plot.top,x(value),plot.bottom,colors[key],1,key==='limit'?'4 3':null);
    return c.svg;
  }
  function trend(points,spec) {
    const c=chart('Xu hướng trung bình theo thứ tự ảnh');
    if (!points.length) return empty(c);
    const first=points[0].index, last=points.at(-1).index;
    const [lo,hi]=extent(points,spec);
    const pad=first===last?.5:Math.max(.4,(last-first)*.015);
    const x=scale(first-pad,last+pad,plot.left,plot.right), y=scale(lo,hi,plot.bottom,plot.top);
    const tickCount=Math.min(7,last-first+1);
    const labels=first===last?[[first,String(first)]]:Array.from({length:tickCount},(_,i)=>{
      const index=Math.round(first+(last-first)*i/(tickCount-1));
      return [index,String(index)];
    });
    axes(c,labels,ticks(lo,hi,7),x,y,'Số thứ tự ảnh trong bộ dữ liệu','Trung bình (mm)',spec);
    for (const [value,key] of limits(spec)) line(c,plot.left,y(value),plot.right,y(value),colors[key],1,key==='limit'?'4 3':null);
    const path=points.map((p,i)=>(i&&points[i-1].index+1===p.index?'L':'M')+x(p.index)+' '+y(p.mean)).join(' ');
    c.draw('path',{d:path,stroke:colors.data,'stroke-width':1,fill:'none'});
    for (const p of points) {
      const outside=p.category==='below'||p.category==='above';
      c.draw('circle',{cx:x(p.index),cy:y(p.mean),r:outside?1.7:1.15,fill:outside?colors[p.category]:colors.data});
    }
    return c.svg;
  }

  function comparison(entries) {
    const c=chart('So sánh trung bình theo điều kiện');
    if(!entries.length) return empty(c);
    const rangePoints=entries.flatMap(({stats:s})=>[{mean:s.mean-(s.sampleStdDev||0)},{mean:s.mean+(s.sampleStdDev||0)}]);
    const [lo,hi]=extent(rangePoints);
    const x=scale(lo,hi,171,471);
    for(const [value,label] of ticks(lo,hi)) {
      line(c,x(value),12,x(value),138);
      text(c,x(value),150,label);
    }
    for(const [i,{name,stats}] of entries.entries()) {
      const y=21+i*19, sd=stats.sampleStdDev||0;
      text(c,4,y+2,name.length>28?name.slice(0,27)+'…':name,{'text-anchor':'start'});
      line(c,x(stats.mean-sd),y,x(stats.mean+sd),y,colors.data,1.4);
      c.draw('circle',{cx:x(stats.mean),cy:y,r:2.8,fill:colors.within});
    }
    text(c,320,165,'Trung bình ± độ lệch chuẩn mẫu (mm)');
    return c.svg;
  }

  globalThis.MicroCADReportCharts={histogram,trend,comparison};
})();

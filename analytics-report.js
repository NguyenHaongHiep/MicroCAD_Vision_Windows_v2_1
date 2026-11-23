/* Printable, paginated A4 document shared by preview and PDF export. */
(() => {
  'use strict';
  const C = MicroCADCharts;
  const fmt = C.fmt, pct = C.pct;
  const el = (tag, text, className) => {
    const n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    if (className) n.className = className;
    return n;
  };
  function table(headers, rows, caption) {
    const t=el('table',undefined,'ar-table');
    if (caption) t.append(el('caption',caption));
    const head=t.createTHead().insertRow();
    headers.forEach(label=>{const th=el('th',label);th.scope='col';head.append(th);});
    const body=t.createTBody();
    for (const row of rows) {
      const tr=body.insertRow();
      row.forEach(value=>tr.insertCell().textContent=value ?? '—');
    }
    return t;
  }
  const pass = s => s.evaluated ? s.counts.within+' / '+s.evaluated : '—';
  function statTable(model, keys) {
    const body=keys.map(type=>{
      const s=model.stats[type];
      return [model.names[type],s.count,s.uncalibrated,fmt(s.mean),fmt(s.sampleStdDev),fmt(s.min),fmt(s.max),s.evaluated?s.counts.below:'—',s.evaluated?s.counts.above:'—',pass(s),pct(s.passRate)];
    });
    return table(['Đặc tính','N mm','N px','TB','SD','Min','Max','< LSL','> USL','Đạt / N','Đạt %'],body,'Thống kê kích thước (mm) · SD mẫu');
  }
  function observations(model, keys) {
    const evaluated=keys.filter(key=>model.stats[key].evaluated);
    if (!evaluated.length) return 'Chưa có dữ liệu đủ điều kiện để kết luận về dung sai.';
    const ranked=evaluated.slice().sort((a,b)=>model.stats[a].passRate-model.stats[b].passRate);
    const statements=evaluated.map(key=>{
      const s=model.stats[key];
      return model.names[key]+': '+pass(s)+' phép đo đạt ('+pct(s.passRate)+').';
    });
    const first=ranked[0], last=ranked.at(-1);
    if (model.stats[first].passRate<model.stats[last].passRate) statements.push(model.names[first]+' có tỷ lệ đạt thấp hơn các đặc tính được đánh giá khác và cần ưu tiên kiểm tra.');
    return statements.join(' ');
  }
  const plotNames={histogram:'Histogram · Phép đo thô',trend:'Xu hướng · Thứ tự ảnh',tolerance:'Phân loại dung sai',comparison:'So sánh điều kiện'};
  function figure(svg, heading) {
    const f=el('figure',undefined,'ar-figure');
    f.append(el('figcaption',heading),svg);
    return f;
  }
  const conditionTable=c=>table(['Thông tin','Giá trị'],Object.entries(MicroCADSession.fields)
    .filter(([key])=>c[key]).map(([key,label])=>[label,c[key]]),'Điều kiện thí nghiệm');
  const specsTable=rows=>table(['Đặc tính','Target (mm)','LSL (mm)','USL (mm)'],rows,'Giới hạn dung sai');
  const specRow=(name,spec)=>[name,fmt(spec.target,9),fmt(spec.lsl,9),fmt(spec.usl,9)];
  function render(destination, model, config) {
    if(config.template==='technical') {
      MicroCADTechnicalReport.render(destination,model,config,{el,table,figure,addEvidence});
      return;
    }
    const pages=[];
    const title=config.title || 'Báo cáo đo kiểm nhanh';
    const date=new Date().toLocaleDateString('vi-VN');
    const page=(section,subheading) => {
      const p=el('article',undefined,'ar-page');
      const head=el('header',undefined,'ar-page-head');
      head.append(el('strong','MicroCAD Vision'),el('span',section));
      const content=el('div',undefined,'ar-page-content');
      content.append(el('h2',subheading));
      const foot=el('footer',undefined,'ar-page-foot');
      foot.append(el('span',model.project || 'Dự án chưa đặt tên'),el('span',date),el('span',undefined,'ar-page-number'));
      p.append(head,content,foot);pages.push(p);
      return content;
    };
    const overview=page('TỔNG QUAN',title);
    overview.append(el('p',model.scope+' · '+date,'ar-report-sub'));
    if (config.source || model.demo) overview.append(el('p',[model.demo?'Có ảnh minh họa MicroCAD.':'',config.source].filter(Boolean).join(' '),'ar-source'));
    const kpis=el('div',undefined,'ar-print-kpis');
    for (const [label,value] of [['Số ảnh',model.images.length],['Phép đo chiều dài',model.rows.length],['Đã hiệu chuẩn',model.rows.filter(r=>r.valueMm!==null).length]]) {
      const k=el('div');k.append(el('strong',value),el('span',label));kpis.append(k);
    }
    overview.append(kpis);
    const conditions=model.conditions;
    if (conditions.length) {
      const c=conditions.length===1?conditions[0]:null;
      if (c) overview.append(conditionTable(c));
      else overview.append(el('p',conditions.length+' điều kiện trong phạm vi báo cáo.'));
    }
    const keys=Object.keys(model.stats);
    if (keys.length) overview.append(statTable(model,keys));
    else overview.append(el('p','Chưa có phép đo chiều dài trong phạm vi đã chọn.'));
    const specRows=keys.filter(k=>model.spec[k]).map(k=>specRow(model.names[k],model.spec[k]));
    if (specRows.length) overview.append(specsTable(specRows));
    if (keys.some(k=>model.mixed[k])) overview.append(el('p','Tỷ lệ đạt dùng dung sai áp dụng cho mỗi điều kiện. Biểu đồ chỉ hiện các đường giới hạn khi dung sai trùng nhau.'));
    overview.append(el('h3','Nhận định'),el('p',observations(model,keys)));
    const chosen=Object.keys(plotNames).filter(k=>config.charts[k]).slice(0,3);
    const makePlot=(group,type) => {
      const rows=model.byType[type]||[], spec=model.spec[type], resolver=model.resolver(type);
      if (group==='histogram') return C.histogram(rows,spec,model.bins,true,resolver);
      if (group==='trend') return C.trend(rows,spec,{average:model.average,visible:model.visible,light:true});
      if (group==='tolerance') return C.tolerance(rows,resolver,true);
      return C.comparison(model.compare.slice(0,6),true);
    };
    const evidence=model.images.find(image=>image.imgId===config.evidence);
    if (chosen.length || config.notes || evidence) {
      const content=page('KẾT QUẢ',model.names[model.type] || 'Biểu đồ và kết luận');
      const grid=el('div',undefined,'ar-print-charts quick');
      for (const group of chosen) grid.append(figure(makePlot(group,model.type),plotNames[group]));
      content.append(grid);
      if (chosen.includes('comparison') && model.compare.length>6) content.append(el('p','Biểu đồ hiển thị 6 điều kiện đầu tiên.'));
      if (evidence) addEvidence(content,evidence);
      if (config.notes) content.append(el('h3','Kết luận / ghi chú'),el('p',config.notes));
    }
    pages.forEach((p,i)=>p.querySelector('.ar-page-number').textContent='Trang '+(i+1)+' / '+pages.length);
    destination.replaceChildren(...pages);
  }
  function addEvidence(content,image) {
    const f=el('figure',undefined,'ar-evidence');
    const pic=el('img');pic.src=image.dataUrl;pic.alt='Ảnh gốc '+image.imgName;
    f.append(pic,el('figcaption','Ảnh gốc minh chứng · '+image.imgName));
    content.append(f);
  }
  globalThis.MicroCADReport={el,table,render,plotNames,observations};
})();

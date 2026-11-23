/* Reference-style technical report. Content is supplied by MicroCADReportData. */
(() => {
  'use strict';

  const D=MicroCADReportData;
  const Charts=MicroCADReportCharts;
  const A=MicroCADAnalytics;
  const labels={circle:'Đường kính lỗ',circleGap:'Khoảng cách hai mép'};
  const descriptions={
    circle:{section:'PHÂN TÍCH ĐƯỜNG KÍNH',title:'Đường kính lỗ',short:'đường kính',note:'blue'},
    circleGap:{section:'PHÂN TÍCH KHE MÉP',title:'Khoảng cách hai mép lỗ',short:'khe mép',note:'orange'}
  };
  const keys=['circle','circleGap'];
  const states=[['below','Dưới LSL'],['within','Trong giới hạn'],['above','Trên USL']];
  const pad=n=>String(n).padStart(2,'0');
  const n=value=>D.count.format(value);

  function render(destination, model, config, ui) {
    const {el,table,figure,addEvidence}=ui;
    const data=D.create(model,config);
    const pages=[];
    function page(section,title,subtitle,style,intro) {
      const p=el('article',undefined,'ar-page tech '+style);
      const header=el('header',undefined,'tech-header');
      const brand=el('div');
      brand.append(el('strong','MICROCAD VISION'),el('span','ANALYTICS & REPORTS'));
      header.append(brand,el('span',section,'tech-header-section'));
      const main=el('div',undefined,'ar-page-content tech-content');
      const head=el('div',undefined,'tech-intro');
      head.append(el('h2',title),el('p',subtitle,'tech-subtitle'));
      if(intro) head.append(el('p',intro,'tech-intro-note'));
      main.append(head);
      const footer=el('footer',undefined,'tech-footer');
      const date=new Date().toLocaleDateString('vi-VN');
      footer.append(el('span','Nguồn: '+data.source+'  |  '+(data.conditionDate?'Ngày thí nghiệm: '+data.conditionDate+'  |  ':'')+'Ngày tạo: '+date),
        el('b',undefined,'ar-page-number'));
      p.append(header,main,footer);
      pages.push(p);
      return main;
    }
    function card(label,value,description,color='teal') {
      const elCard=el('div',undefined,'tech-card tech-accent-'+color);
      elCard.append(el('span',label,'tech-card-label'),el('strong',value),el('small',description));
      return elCard;
    }
    function kpis(items) {
      const grid=el('div',undefined,'tech-kpis');
      grid.append(...items.map(values=>card(...values)));
      return grid;
    }
    function heading(index,text) {
      const h=el('h3',undefined,'tech-heading');
      h.append(el('span',index),el('b',text));
      return h;
    }
    function note(text,color='teal',title) {
      const block=el('aside',undefined,'tech-note tech-accent-'+color);
      if(title) block.append(el('strong',title));
      block.append(el('p',text));
      return block;
    }
    function makeTable(headers,rows,className='') {
      const t=table(headers,rows);
      const wrapper=el('div',undefined,'tech-table '+className);
      wrapper.append(t);
      return wrapper;
    }
    function ratioText(s) {
      return s.evaluated ? n(s.counts.within)+'/'+n(s.evaluated)+' đạt · '+D.rate(s.passRate) : 'Chưa đủ dữ liệu đánh giá';
    }
    function specText(f) {
      return f.spec ? 'DUNG SAI '+D.mm(f.spec.lsl)+' - '+D.mm(f.spec.usl)+' mm  ·  MỤC TIÊU '+D.mm(f.spec.target)+' mm' :
        f.mixed ? 'Các điều kiện có dung sai khác nhau' : 'Chưa thiết lập dung sai';
    }
    function acceptance(label,f) {
      if(!f.spec) return card(label,'—',specText(f));
      const {target,lsl,usl}=f.spec;
      const lower=target-lsl,upper=usl-target;
      const interval=Math.abs(lower-upper)<1e-10?' ± '+D.mm(upper):' +'+D.mm(upper)+' / −'+D.mm(lower);
      return card(label,D.mm(target)+interval+' mm','LSL '+D.mm(lsl)+'  |  USL '+D.mm(usl));
    }
    function stack(label,s) {
      const group=el('div',undefined,'tech-stack');
      const caption=el('div',undefined,'tech-stack-cap');
      caption.append(el('strong',label),el('span',ratioText(s)));
      const track=el('div',undefined,'tech-stack-track');
      track.setAttribute('role','img');
      const names=el('div',undefined,'tech-stack-labels');
      for (const [key,label] of states) {
        const block=el('span',undefined,'tech-state-'+key);
        if(s.evaluated) block.style.width=100*s.counts[key]/s.evaluated+'%';
        track.append(block);
        names.append(el('span',label+': '+(s.evaluated?n(s.counts[key]):'—'),'tech-state-'+key));
      }
      track.setAttribute('aria-label',names.textContent);
      group.append(caption,track,names);
      return group;
    }
    function findings() {
      const measured=keys.filter(key=>data.features[key].stats.evaluated);
      if(!measured.length) return 'Chưa đủ kích thước đã hiệu chuẩn và dung sai để đánh giá tỷ lệ đạt.';
      const results=measured.map(key=>labels[key]+' đạt '+D.rate(data.features[key].stats.passRate));
      const [diameter,gap]=keys.map(k=>data.features[k].stats);
      let text=results.join(' · ')+'.';
      if (gap.evaluated) text+=' Có '+n(gap.counts.above)+' phép đo khe vượt USL.';
      if (diameter.evaluated&&gap.evaluated&&diameter.passRate!==gap.passRate) {
        text+=' Ưu tiên kiểm tra '+(diameter.passRate<gap.passRate?'đường kính lỗ':'khoảng cách hai mép')+' vì tỷ lệ đạt thấp hơn.';
      }
      return text;
    }

    const overview=page('TỔNG QUAN CHẤT LƯỢNG',config.title||'Báo cáo đo kiểm lỗ laser', model.scope,'tech-overview',
      'Kết quả được tính từ các phép đo trong phạm vi đã chọn. '+n(data.uncalibrated)+' phép đo chưa hiệu chuẩn không tham gia thống kê mm.'+(data.reviewRequired?' '+n(data.reviewRequired)+' phép đo cần kiểm tra bị loại khỏi thống kê và tỷ lệ đạt. Xem chi tiết ở phụ lục AI.':''));
    const gap=data.features.circleGap.stats;
    const breakdown=[n(data.features.circle.size)+' Ø',n(data.features.circleGap.size)+' khe',n(data.edges)+' edges'];
    if(data.other)breakdown.push(n(data.other)+' phép đo khác');
    overview.append(kpis([
      ['Tổng số ảnh',n(model.images.length),'Ảnh thuộc phạm vi báo cáo'],
      ['Tổng dòng đo',n(data.total),breakdown.join(' + '),'blue'],
      ['Tỷ lệ đạt khe',D.rate(gap.passRate),gap.evaluated?D.fraction(gap)+' phép đo':'Chưa có kết quả dung sai','orange']
    ]));
    const limits=el('div',undefined,'tech-specs');
    limits.append(acceptance('Đường kính lỗ (Ø)',data.features.circle),
      acceptance('Khoảng cách hai mép (circleGap)',data.features.circleGap));
    overview.append(heading('01','Giới hạn chấp nhận'),limits,heading('02','Kết quả đánh giá'));
    const stats=makeTable(['Đặc tính','n','TB ± s (mm)','Min - Max (mm)','Tỷ lệ đạt'],
      keys.map((key,i)=>{
        const s=data.features[key].stats;
        const mean=s.sampleStdDev===null?D.mm(s.mean):D.mm(s.mean)+' ± '+D.mm(s.sampleStdDev);
        return [i?'Khe mép':'Đường kính Ø',n(s.count),mean,
          s.count?D.mm(s.min)+' - '+D.mm(s.max):'—',D.rate(s.passRate)];
      }),'tech-stats');
    overview.append(stats);
    if(config.charts.tolerance) overview.append(heading('03','Phân loại theo dung sai'),
      ...keys.map(key=>stack(labels[key],data.features[key].stats)));
    overview.append(note(findings(),'teal','Nhận định tự động'));

    function plotCard(svg,title,caption,spec) {
      const box=el('figure',undefined,'tech-plot');
      box.append(el('figcaption',title),svg);
      if(spec) {
        const legend=el('div',undefined,'tech-plot-legend');
        legend.append(el('span','LSL / USL','tech-legend-limit'),el('span','Mục tiêu','tech-legend-target'));
        box.append(legend);
      }
      box.append(el('p',caption,'tech-caption'));
      return box;
    }
    for(const key of keys) {
      const f=data.features[key], s=f.stats, meta=descriptions[key];
      const main=page(meta.section,meta.title,specText(f),'tech-analysis');
      main.append(kpis([
        ['Trung bình gộp',D.mm(s.mean),'mm  |  s '+D.mm(s.sampleStdDev)],
        ['Tỷ lệ đạt',D.rate(s.passRate),s.evaluated?D.fraction(s)+' phép đo':'Chưa có kết quả dung sai',key==='circleGap'?'orange':'teal'],
        key==='circle' ? ['Ngoài giới hạn',s.evaluated?n(s.counts.below+s.counts.above):'—',s.evaluated?n(s.counts.below)+' dưới + '+n(s.counts.above)+' trên':'Chưa có kết quả dung sai','red'] :
          ['Trên USL',s.evaluated?n(s.counts.above):'—',s.evaluated?n(s.counts.below)+' phép dưới LSL':'Chưa có kết quả dung sai','red']
      ]));
      if(config.charts.histogram) main.append(plotCard(Charts.histogram(f.points,f.spec,model.bins),
        'Phân bố trung bình '+meta.short+' theo ảnh',
        'Mỗi cột đếm ảnh theo giá trị trung bình. n = '+n(f.points.length)+' ảnh có số đo mm.',f.spec));
      if(config.charts.trend) main.append(plotCard(Charts.trend(f.points,f.spec),
        'Diễn biến trung bình '+meta.short+' qua '+n(f.points.length)+' ảnh',
        f.spec?'Các đường đứt là giới hạn dung sai LSL/USL. Các điểm cam/đỏ vượt giới hạn.':
          f.mixed?'Màu điểm xét theo điều kiện từng ảnh. Không có giới hạn chung để vẽ.':'Dữ liệu hiển thị theo thứ tự ảnh. Chưa có giới hạn để vẽ.',f.spec));
      const {low,high}=f.extremes;
      let comment=low?'TB theo ảnh thấp nhất '+D.mm(low.mean)+' mm tại ảnh '+low.index+
        ', cao nhất '+D.mm(high.mean)+' mm tại ảnh '+high.index+'.':'Chưa có trung bình theo ảnh bằng mm.';
      if(s.evaluated)comment+=' Tỷ lệ '+D.rate(s.passRate)+' tính trên '+n(s.evaluated)+' phép đo riêng lẻ.';
      if(key==='circleGap')comment+=' Phép đo edges thủ công được thống kê riêng.';
      main.append(note(comment,meta.note));
    }

    const traceRow=p=>[
      String(p.index).padStart(3,'0'),p.time,D.mm(p.features.circle.mean),D.fraction(p.features.circle),
      D.mm(p.features.circleGap.mean),D.fraction(p.features.circleGap),p.reasons||'—'
    ];
    const traceRows=data.rows.map(traceRow);
    const trace=page('TRUY XUẤT VÀ PHƯƠNG PHÁP','Truy xuất & ghi chú kỹ thuật',
      'Trích '+n(traceRows.length)+' ảnh cần xem lại từ bộ '+n(model.images.length)+' ảnh','tech-trace',
      'Chọn ảnh theo cực trị, mức không đạt hoặc ảnh minh chứng. TB tính theo ảnh (mm), đạt/n tính từ các phép đo. Giờ lấy từ tên ảnh có thông tin giờ chụp.');
    const traceHeaders=['Ảnh','Giờ','TB Ø','Đạt Ø','TB khe','Đạt khe','Nhận diện'];
    trace.append(makeTable(traceHeaders,traceRows.length?traceRows:[['—','—','—','—','—','—','Chưa có ảnh đủ dữ liệu để truy xuất.']],'tech-traces'));
    trace.append(heading('04','Phương pháp đo & bảo toàn dữ liệu'));
    const methods=el('ul',undefined,'tech-methods');
    const list=data.diameterMethods.map(([key,number])=>n(number)+' '+A.methodLabel(key).toLocaleLowerCase('vi-VN')).join(', ');
    methods.append(el('li',(list?list+'; ':'')+n(data.features.circleGap.size)+' phép circleGap giữa hai đường tròn đã khớp.'));
    methods.append(el('li',n(data.edges)+' phép edges thủ công được giữ riêng. '+n(data.uncalibrated)+' phép đo chưa hiệu chuẩn.'));
    const shown=data.calibrations.slice(0,4).map(v=>v.toLocaleString('vi-VN',{maximumFractionDigits:12,useGrouping:false}));
    methods.append(el('li',shown.length?'Hệ số hiệu chuẩn: '+shown.join('; ')+' mm/px'+(data.calibrations.length>shown.length?' · còn '+(data.calibrations.length-shown.length)+' hệ số trong phụ lục.':'.'):'Chưa có hệ số hiệu chuẩn.'));
    methods.append(el('li','Nguồn dữ liệu: '+data.source+'.'));
    trace.append(methods,heading('05','Cảnh báo khi tạo báo cáo tự động'),note(
      'Tỷ lệ đạt xét trên các phép đo có hiệu chuẩn và dung sai áp dụng. Giá trị trung bình theo ảnh có thể che khác biệt giữa các phép đo. Báo cáo không kết luận Cp/Cpk, tính ổn định quá trình hoặc nguyên nhân sai lệch.',
      'orange'));
    trace.append(el('h4','Mẫu đầu ra có thể xuất'),el('p','PDF báo cáo · CSV số đo · PNG ảnh đo · JSON dự án · ZIP dữ liệu','tech-caption'));

    if(config.allTrace) {
      const marked=new Map(data.rows.map(p=>[p.id,p.reasons]));
      const full=data.byImage.map(p=>traceRow({...p,reasons:[p.source,marked.get(p.id)].filter(Boolean).join(' · ')}));
      let start=0;
      while(start<full.length) {
        let end=start, lineBudget=52;
        while(end<full.length) {
          const cost=Math.ceil(full[end][6].length/31)+2;
          if(end>start && lineBudget<cost) break;
          lineBudget-=cost;
          end++;
        }
        const extras=page('TRUY XUẤT TOÀN BỘ','Kết quả theo ảnh','Ảnh '+(start+1)+' - '+end+' / '+full.length+' · TB (mm)','tech-appendix');
        extras.append(makeTable(traceHeaders,full.slice(start,end),'tech-traces tech-full-traces'));
        start=end;
      }
    }
    for(const condition of model.conditions) {
      const metadata=Object.entries(MicroCADSession.fields).filter(([key])=>key!=='name'&&key!=='date'&&condition[key]).map(([key,label])=>[label,condition[key]]);
      if(model.conditions.length<2&&!metadata.length) continue;
      const extras=page('ĐIỀU KIỆN THÍ NGHIỆM',condition.name,condition.date||model.project,'tech-appendix');
      if(metadata.length) extras.append(makeTable(['Thông tin','Giá trị'],metadata));
      const specs=model.conditionSpecs(condition);
      const tolerances=keys.filter(key=>specs[key]).map(key=>[labels[key],D.mm(specs[key].target),D.mm(specs[key].lsl),D.mm(specs[key].usl)]);
      if(tolerances.length) extras.append(heading('','Giới hạn chấp nhận'),makeTable(['Đặc tính','Mục tiêu (mm)','LSL (mm)','USL (mm)'],tolerances));
    }
    const evidence=model.images.find(image=>image.imgId===config.evidence);
    if(evidence||config.notes) {
      const extras=page('PHỤ LỤC','Ảnh minh chứng & ghi chú',model.scope,'tech-appendix');
      if(config.notes) extras.append(note(config.notes,'teal','Ghi chú'));
      if(evidence) addEvidence(extras,evidence);
    }
    for(let i=4;i<data.calibrations.length;i+=120) {
      const extras=page('PHỤ LỤC','Hệ số hiệu chuẩn','Đơn vị mm/px','tech-appendix');
      extras.append(el('p',data.calibrations.slice(i,i+120).map(v=>v.toLocaleString('vi-VN',{maximumFractionDigits:12,useGrouping:false})).join(' · ')));
    }
    if(config.charts.comparison) {
      for(let i=0;i<Math.max(1,model.compare.length);i+=6) {
        const entries=model.compare.slice(i,i+6);
        const extras=page('SO SÁNH','So sánh điều kiện',model.names[model.type]||model.scope,'tech-appendix');
        extras.append(figure(Charts.comparison(entries),'So sánh điều kiện'));
        if(entries.length) extras.append(makeTable(['Điều kiện','n','TB (mm)','s (mm)','Đạt/n','Đạt %'],
          entries.map(e=>[e.name,n(e.stats.count),D.mm(e.stats.mean),D.mm(e.stats.sampleStdDev),D.fraction(e.stats),D.rate(e.stats.passRate)])));
      }
    }
    pages.forEach((p,i)=>p.querySelector('.ar-page-number').textContent=pad(i+1)+' / '+pad(pages.length));
    destination.replaceChildren(...pages);
  }

  globalThis.MicroCADTechnicalReport={render};
})();

/* Workspace orchestration. Measurement state stays in MicroCAD Vision. */
(() => {
  'use strict';
  const A=MicroCADAnalytics, C=MicroCADCharts, S=MicroCADSession, R=MicroCADReport;
  const {el,table}=R;
  const names={circle:'Đường kính lỗ',circleGap:'Khe giữa hai đường tròn',edges:'Khe đo thủ công',distance:'Đo chiều dài',centers:'Khoảng cách tâm',rowSpacing:'Khoảng cách hai hàng'};
  const chartNames={histogram:'Phân bố kích thước',trend:'Xu hướng theo ảnh',tolerance:'Phân loại dung sai',comparison:'So sánh điều kiện'};
  const unassigned='unassigned', all='all';
  function mount(bridge) {
    const $=id=>document.getElementById(id);
    const panel=$('analyticsPanel'), library=$('analyticsLibrary'), editor=$('analyticsReport');
    const nav=$('analyticsNav'), measurement=document.querySelector('.workspace');
    const reportConfig=$('arReportConfig'), pages=$('arPages'), filter=$('arConditionFilter');
    let state=S.restore(), view='measurement', type='circle', scope=all, session='', method='', bins=0, average=false;
    let windowSize=0, offset=0, comparePage=0, drawFrame=0;
    let visible=['LSL','Target','USL'], libraryCondition='', librarySession='';
    const action=(label, click, primary=false) => {
      const b=el('button',label,'btn'+(primary?' primary':'')); b.type='button';b.onclick=click; return b;
    };
    function options(select, entries, chosen) {
      select.replaceChildren(...entries.map(([value,label])=>new Option(label,value)));
      if (entries.some(([value])=>value===chosen)) select.value=chosen;
    }
    const conditionOf=id=>state.conditions.find(c=>c.id===id);
    const assignment=id=>state.assignments[id] || {};
    const title=c=>c?.name || 'Chưa gán điều kiện';
    const tags=id=>{
      const a=assignment(id), c=conditionOf(a.conditionId);
      return [c?.name,c?.sessions.find(s=>s.id===a.sessionId)?.name];
    };
    function changed() {
      bridge.dirty();
      updated();
    }
    function model() {
      const snapshot=bridge.snapshot();
      const rows=A.records(snapshot,bridge.basePx);
      const index=new Map(snapshot.map((image,i)=>[image.imgId,i]));
      const matches=imgId=>{
        const a=assignment(imgId);
        const scopeMatch=scope===all || (scope===unassigned ? !a.conditionId : scope===a.conditionId);
        return scopeMatch && (!session || a.sessionId===session);
      };
      const images=snapshot.filter(r=>matches(r.imgId));
      const pool=rows.filter(r=>matches(r.imageId));
      const availableMethods=[...new Set(pool.filter(r=>r.type===type).map(r=>r.method))];
      if (!availableMethods.includes(method)) method='';
      const filtered=pool.filter(r=>!method || r.type!==type || r.method===method);
      const byType=Object.fromEntries(Map.groupBy(filtered,r=>r.type));
      const getSpec=(key,id)=>(conditionOf(assignment(id).conditionId)?.tolerances || state.tolerances)[key];
      const resolver=key=>row=>getSpec(key,row.imageId);
      const stats={}, spec={}, mixed={};
      for (const key of Object.keys(names)) {
        const group=byType[key]||[];
        if (group.length) stats[key]=A.summarize(group,resolver(key));
        const calibrated=group.filter(r=>r.valueMm!==null);
        const distinct=new Set(calibrated.map(row=>JSON.stringify(resolver(key)(row))));
        mixed[key]=distinct.size>1;
        spec[key]=mixed[key]?null:(calibrated.length?resolver(key)(calibrated[0]):((conditionOf(scope)?.tolerances || state.tolerances)[key]));
      }
      const compareRows=rows.filter(r=>r.type===type && (!method || r.method===method) && (!session || assignment(r.imageId).sessionId===session));
      const grouped=Map.groupBy(compareRows,r=>assignment(r.imageId).conditionId);
      const compare=state.conditions.map(c=>({name:c.name,stats:A.summarize(grouped.get(c.id)||[],resolver(type))})).filter(row=>row.stats.count);
      const conditionIds=new Set(images.map(r=>assignment(r.imgId).conditionId));
      const conditions=state.conditions.filter(c=>scope===c.id || (scope===all && conditionIds.has(c.id)));
      const conditionSpecs=c=>c.tolerances||state.tolerances;
      const angles=images.reduce((count,img)=>count+img.measures.filter(m=>m.type==='angle'&&Number.isFinite(bridge.basePx(m))).length,0);
      const scopeName=scope===all?'Tất cả điều kiện':scope===unassigned?'Chưa gán điều kiện':title(conditionOf(scope));
      const selectedSession=conditionOf(scope)?.sessions.find(s=>s.id===session);
      return {images,rows:filtered,byType,stats,spec,mixed,names,type,compare,project:state.project,conditions,resolver,tags,index,availableMethods,average,bins,visible,angles,conditionSpecs,
        demo:images.some(image=>image.imgName==='laser_fabric_DEMO.jpg'),
        scope:scopeName+(selectedSession?' / '+selectedSession.name:'')+(method?' · '+A.methodLabel(method):'')};
    }
    function selectView(next) {
      if (bridge.locked()) return;
      view=next;
      for (const b of nav.querySelectorAll('button')) b.setAttribute('aria-current',String(b.dataset.view===view));
      measurement.hidden=view!=='measurement';
      panel.hidden=view!=='analytics';
      library.hidden=view!=='library';
      editor.hidden=view!=='reports';
      $('app').dataset.analyticsView=view;
      if (view==='measurement') bridge.resize();
      else draw();
    }
    function updated() {
      if (view==='measurement'||drawFrame) return;
      drawFrame=requestAnimationFrame(()=>{drawFrame=0;if(view!=='measurement')draw();});
    }
    function draw() {
      if (view==='analytics') drawDashboard(model());
      if (view==='library') drawLibrary();
      if (view==='reports') drawReport(model());
    }
    function resetTrend() {offset=0;windowSize=0;comparePage=0;}
    function setScope(next) {scope=next;session='';method='';resetTrend();}
    function syncFilters(m) {
      options(filter,[[all,'Tất cả điều kiện'],[unassigned,'Chưa gán điều kiện'],...state.conditions.map(c=>[c.id,c.name])],scope);
      options($('arSessionFilter'),[['','Tất cả phiên'],...(conditionOf(scope)?.sessions||[]).map(s=>[s.id,s.name])],session);
      $('arSessionFilter').disabled=!(conditionOf(scope)?.sessions.length);
      options($('arMethodFilter'),[['','Mọi phương pháp'],...m.availableMethods.map(key=>[key,A.methodLabel(key)])],method);
      $('arMethodFilter').disabled=m.availableMethods.length<2;
      $('arProjectName').textContent=m.project || 'Dự án chưa đặt tên';
      $('arEditCondition').disabled=!conditionOf(scope);
    }
    function drawDashboard(m) {
      syncFilters(m);
      const stats=m.stats[type]||A.summarize([]), total=m.rows.filter(r=>!r.reviewRequired).length+m.angles;
      const kpis=[
        ['Tổng số ảnh',m.images.length],['Phép đo hợp lệ',total],['Đường kính',m.byType.circle?.length||0],
        ['Khe hai đường tròn',m.byType.circleGap?.length||0],['Khe thủ công',m.byType.edges?.length||0],['Cần kiểm tra',m.rows.filter(r=>r.reviewRequired).length],
        ['Trung bình (mm)',C.fmt(stats.mean)],['SD mẫu (mm)',C.fmt(stats.sampleStdDev)],['Min / Max (mm)',C.fmt(stats.min)+' / '+C.fmt(stats.max)],
        ['Trong dung sai',C.pct(stats.passRate)],['Dưới LSL',stats.evaluated?stats.counts.below:'—'],['Trên USL',stats.evaluated?stats.counts.above:'—']
      ];
      $('arKpis').replaceChildren(...kpis.map(([label,value])=>{
        const div=el('div',undefined,'ar-kpi');div.append(el('span',label),el('strong',value));return div;
      }));
      $('arScopeNote').textContent=(m.mixed[type]?'Dung sai khác nhau theo điều kiện. Tỷ lệ đạt dùng giới hạn của từng ảnh. ':
        m.spec[type]?'Target '+C.fmt(m.spec[type].target,9)+' · LSL '+C.fmt(m.spec[type].lsl,9)+' · USL '+C.fmt(m.spec[type].usl,9)+' mm. ':
        'Chưa có dung sai mặc định cho đặc tính này. ')+stats.uncalibrated+' phép đo của đặc tính này chưa hiệu chuẩn. '+stats.review+' phép đo cần kiểm tra bị loại khỏi thống kê và tỷ lệ đạt.';
      const rows=m.byType[type]||[], resolver=m.resolver(type), tolerance=m.spec[type];
      const calibrated=rows.filter(r=>Number.isFinite(r.valueMm));
      const span=calibrated.length?calibrated.at(-1).imageIndex-calibrated[0].imageIndex+1:0;
      if (windowSize>=span) windowSize=0;
      offset=Math.max(0,Math.min(offset,span-windowSize));
      const start=windowSize?calibrated[0].imageIndex+offset:undefined;
      $('arTrendZoom').disabled=span<=2||windowSize===2;
      $('arTrendReset').disabled=!windowSize;
      $('arTrendPrev').disabled=!windowSize||offset===0;
      $('arTrendNext').disabled=!windowSize||offset+windowSize>=span;
      $('arTrendRange').textContent=windowSize?'Ảnh '+(start+1)+'–'+(start+windowSize):'Toàn bộ';
      $('arTrendZoom').onclick=()=>{windowSize=Math.max(2,Math.ceil((windowSize||span)/2));draw();};
      $('arTrendPrev').onclick=()=>{offset-=Math.max(1,Math.floor(windowSize/2));draw();};
      $('arTrendNext').onclick=()=>{offset+=Math.max(1,Math.floor(windowSize/2));draw();};
      $('arTrendReset').onclick=()=>{offset=0;windowSize=0;draw();};
      const open=row=>{
        selectView('measurement');
        bridge.open(row.imageId,row.measurementId);
      };
      const plots={
        histogram:C.histogram(rows,tolerance,bins,false,resolver),
        trend:C.trend(rows,tolerance,{average,visible,start,end:windowSize?start+windowSize-1:undefined,open}),
        tolerance:C.tolerance(rows,resolver),
        comparison:C.comparison(m.compare.slice(comparePage*6,comparePage*6+6))
      };
      const lastPage=Math.max(0,Math.ceil(m.compare.length/6)-1);
      if(comparePage>lastPage){comparePage=lastPage;plots.comparison=C.comparison(m.compare.slice(comparePage*6));}
      $('arComparePrev').disabled=comparePage===0;
      $('arCompareNext').disabled=comparePage>=lastPage;
      $('arCompareRange').textContent=m.compare.length?String(comparePage+1)+' / '+(lastPage+1):'—';
      for(const [key,svg] of Object.entries(plots)) $('arPlot-'+key).replaceChildren(svg);
      const comparison=m.compare.slice(comparePage*6,comparePage*6+6);
      const details=$('arCompareStats');
      details.replaceChildren();
      if(comparison.length) details.append(table(['Điều kiện','N mm','TB (mm)','SD (mm)','Đạt %'],
        comparison.map(({name,stats:s})=>[name,s.count,C.fmt(s.mean),C.fmt(s.sampleStdDev),C.pct(s.passRate)])));
      const trace=$('arTrace');
      const traceLimit=300;
      trace.replaceChildren(el('p',rows.length>traceLimit?'Hiển thị '+traceLimit+' / '+rows.length+' dòng. Lọc theo điều kiện, phiên hoặc phương pháp để thu hẹp.':rows.length+' phép đo · Chọn ảnh để mở đúng phép đo.'));
      const t=table(['Ảnh nguồn','ID','Phương pháp','Giá trị','Hệ số mm/px','Chuẩn','Chất lượng'],[]);
      for (const row of rows.slice(0,traceLimit)) {
        const tr=t.tBodies[0].insertRow();
        const a=action((row.imageIndex+1)+' · '+row.imageName,()=>open(row));
        const imgCell=tr.insertCell();imgCell.append(a);
        const meta=tags(row.imageId).filter(Boolean).join(' / ');
        if(meta)imgCell.append(el('small',meta));
        for (const value of [row.measurementId,A.methodLabel(row.method),row.valueMm===null?C.fmt(row.valuePx,6)+' px':C.fmt(row.valueMm,8)+' mm',C.fmt(row.mmPerPx,12),row.calibrationReference||'—',row.reviewRequired?'Cần kiểm tra · '+row.reviewReasons.join('; '):'Hợp lệ']) tr.insertCell().textContent=value;
      }
      trace.append(t);
    }
    function drawLibrary() {
      const records=bridge.snapshot();
      const c=conditionOf(libraryCondition);
      options($('arAssignCondition'),[['','Chưa gán điều kiện'],...state.conditions.map(condition=>[condition.id,condition.name])],libraryCondition);
      options($('arAssignSession'),[['','Chưa gán phiên'],...(c?.sessions||[]).map(s=>[s.id,s.name])],librarySession);
      $('arAssignSession').disabled=!(c?.sessions.length);
      $('arNewSession').disabled=!c;
      const list=$('arLibraryRows');
      const selected=new Set([...list.querySelectorAll('input:checked')].map(input=>input.value));
      list.replaceChildren();
      $('arLibraryCount').textContent=records.length+' ảnh';
      $('arAssign').disabled=!records.length;
      $('arRemoveImages').disabled=!records.length||!bridge.canRemove();
      $('arRestoreImages').disabled=!bridge.canRestore();
      $('arSelectImages').disabled=!records.length;
      for (const r of records) {
        const item=el('div',undefined,'ar-image-row');
        const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.value=r.imgId;
        checkbox.checked=selected.has(String(r.imgId));checkbox.setAttribute('aria-label','Chọn '+r.imgName);
        const img=el('img');img.src=r.thumb || r.dataUrl;img.alt='';
        const pic=action(r.imgName,()=>{selectView('measurement');bridge.open(r.imgId,null);});
        const detail=el('div');
        detail.append(pic,el('small',[(r.measures.length+' phép đo'),...tags(r.imgId)].filter(Boolean).join(' · ')));
        item.append(checkbox,img,detail);list.append(item);
      }
      if (!records.length) list.append(el('p','Nhập ảnh hoặc mở dự án JSON để gán điều kiện và phiên.'));
    }
    function drawReport(m) {
      $('arReportScope').textContent=(m.project || 'Dự án chưa đặt tên')+' · '+m.scope;
      $('arReportCondition').disabled=!conditionOf(scope);
      const config=state.report;
      reportConfig.elements.template.value=config.template;
      reportConfig.elements.reportTitle.value=config.title;
      reportConfig.elements.notes.value=config.notes;
      reportConfig.elements.source.value=config.source;
      for (const key of S.chartKeys) reportConfig.elements[key].checked=config.charts[key];
      reportConfig.elements.allTrace.checked=config.allTrace;
      syncChartOptions();
      options(reportConfig.elements.evidence,[['','Không chọn'],...m.images.map(r=>[String(r.imgId),r.imgName])],String(config.evidence));
      R.render(pages,m,config);
      $('arPageCount').textContent=pages.children.length+' trang A4';
    }
    function syncChartOptions() {
      const form=reportConfig.elements;
      const selected=S.chartKeys.filter(key=>form[key].checked);
      // Quick has room for three charts. Keep the user's first three choices in order.
      if(form.template.value==='quick')selected.slice(3).forEach(key=>form[key].checked=false);
      const full=form.template.value==='quick'&&selected.length>=3;
      for (const key of S.chartKeys) form[key].disabled=full&&!form[key].checked;
      $('arQuickChartNote').hidden=form.template.value!=='quick';
      $('arFullTraceOption').hidden=form.template.value==='quick';
    }
    function readReport(event) {
      const f=reportConfig.elements;
      const config=state.report;
      if (event) syncChartOptions();
      if (event?.target===f.evidence) config.evidence=f.evidence.value?Number(f.evidence.value):null;
      config.template=f.template.value;
      config.allTrace=f.allTrace.checked;
      config.title=S.clean(f.reportTitle.value,120);
      config.notes=S.clean(f.notes.value,850);
      config.source=S.clean(f.source.value,160);
      for (const key of S.chartKeys) config.charts[key]=f[key].checked;
      if(event) bridge.dirty();
      const m=model();
      R.render(pages,m,config);
      $('arPageCount').textContent=pages.children.length+' trang A4';
    }
    function dialog(titleText, fields, onSave) {
      const dialog=$('arDialog'), form=$('arDialogForm'), inputs=$('arDialogFields');
      $('arDialogTitle').textContent=titleText;inputs.replaceChildren();
      const elements={};
      for (const [key,label,value,type='text',length=120,required=false] of fields) {
        const group=el('label',label);
        const input=el(type==='textarea'?'textarea':'input');
        if(type!=='textarea')input.type=type;
        input.value=value??'';input.required=required;
        if(type==='number'){input.step='any';input.min=0;} else input.maxLength=length;
        group.append(input);inputs.append(group);elements[key]=input;
      }
      form.onsubmit=event=>{
        event.preventDefault();
        if (event.submitter?.value==='cancel') {dialog.close();return;}
        const error=onSave(Object.fromEntries(Object.entries(elements).map(([key,input])=>[key,input.value])));
        if(error) $('arDialogError').textContent=error;
        else dialog.close();
      };
      $('arDialogError').textContent='';
      dialog.showModal();
    }
    function editCondition(existing) {
      if(!existing && state.conditions.length>=300){bridge.toast('Tối đa 300 điều kiện.',true);return;}
      const fields=[['project','Tên dự án',state.project],...Object.entries(S.fields).map(([k,label])=>[k,label,existing?.[k],
        k==='notes'?'textarea':k==='date'?'date':k==='power'||k==='scan'||k==='wait'?'number':'text',k==='notes'?500:120,k==='name'])];
      dialog(existing?'Sửa điều kiện':'Tạo điều kiện',fields,values=>{
        if(!values.name.trim())return 'Nhập tên điều kiện.';
        if(values.power!=='' && Number(values.power)>100)return 'Công suất phải nằm trong khoảng 0–100%.';
        state.project=S.clean(values.project,120);
        const c=existing||{id:S.id(),sessions:[],tolerances:null};
        Object.keys(S.fields).forEach(key=>c[key]=S.clean(values[key],key==='notes'?500:120));
        if(!existing){state.conditions.push(c);setScope(c.id);libraryCondition=c.id;librarySession='';}
        changed();
      });
    }
    function editTolerance() {
      const c=conditionOf(scope), specs=c?.tolerances||state.tolerances;
      const fields=['circle','circleGap','edges'].flatMap(key=>['target','lsl','usl'].map(part=>[key+':'+part,names[key]+' · '+part.toUpperCase()+' (mm)',specs[key]?.[part],'number',0,key!=='edges']));
      dialog(c?'Dung sai · '+c.name:'Dung sai dự án',fields,values=>{
        const result={};
        for(const key of ['circle','circleGap','edges']){
          const vals=['target','lsl','usl'].map(part=>values[key+':'+part]);
          if(key==='edges'&&vals.every(x=>x===''))continue;
          const [target,lsl,usl]=vals.map(Number);
          if(vals.some(x=>x==='')||!A.validTolerance({target,lsl,usl}))return 'Nhập đủ giới hạn theo thứ tự LSL ≤ Target ≤ USL.';
          result[key]={target,lsl,usl};
        }
        if(c)c.tolerances=result;else state.tolerances=result;
        changed();
      });
      const reset=$('arToleranceReset');
      reset.hidden=!c?.tolerances;
      reset.onclick=()=>{c.tolerances=null;$('arDialog').close();changed();};
    }
    function newSession() {
      const c=conditionOf(libraryCondition);
      if(!c||c.sessions.length>=300)return;
      dialog('Tạo phiên · '+c.name,[['name','Tên phiên','','text',120,true]],values=>{
        if(!values.name.trim())return 'Nhập tên phiên.';
        const session={id:S.id(),name:S.clean(values.name,120)};
        c.sessions.push(session);librarySession=session.id;changed();
      });
    }
    function assignImages() {
      const checked=[...$('arLibraryRows').querySelectorAll('input:checked')];
      if (!checked.length){bridge.toast('Chọn ảnh cần gán trước.',true);return;}
      for(const input of checked){
        if(libraryCondition)state.assignments[input.value]={conditionId:libraryCondition,sessionId:librarySession};
        else delete state.assignments[input.value];
        input.checked=false;
      }
      changed();
      bridge.toast('Đã cập nhật điều kiện cho '+checked.length+' ảnh.');
    }
    nav.addEventListener('click',event=>{const button=event.target.closest('[data-view]'); if(button)selectView(button.dataset.view);});
    options($('arTypeFilter'),Object.entries(names),type);
    $('arTypeFilter').onchange=event=>{type=event.target.value;method='';resetTrend();draw();};
    filter.onchange=event=>{setScope(event.target.value);draw();};
    $('arSessionFilter').onchange=event=>{session=event.target.value;resetTrend();draw();};
    $('arMethodFilter').onchange=event=>{method=event.target.value;resetTrend();draw();};
    $('arBins').onchange=event=>{bins=Number(event.target.value);draw();};
    $('arTrendMode').onchange=event=>{average=event.target.value==='average';draw();};
    $('arTrendLines').onchange=()=>{visible=[...$('arTrendLines').querySelectorAll('input:checked')].map(input=>input.value);draw();};
    $('arComparePrev').onclick=()=>{comparePage--;draw();};
    $('arCompareNext').onclick=()=>{comparePage++;draw();};
    $('arNewCondition').onclick=$('arLibraryNewCondition').onclick=()=>editCondition();
    $('arEditProject').onclick=()=>dialog('Thông tin dự án',[['project','Tên dự án',state.project]],values=>{state.project=S.clean(values.project,120);changed();});
    $('arEditCondition').onclick=$('arReportCondition').onclick=()=>{const c=conditionOf(scope);if(c)editCondition(c);else bridge.toast('Chọn một điều kiện cụ thể trong Analytics.',true);};
    $('arTolerance').onclick=editTolerance;
    $('arDialog').addEventListener('close',()=>$('arToleranceReset').hidden=true);
    $('arAssignCondition').onchange=event=>{libraryCondition=event.target.value;librarySession='';draw();};
    $('arAssignSession').onchange=event=>librarySession=event.target.value;
    $('arNewSession').onclick=newSession;
    $('arAssign').onclick=assignImages;
    $('arRemoveImages').onclick=()=>{
      const ids=[...$('arLibraryRows').querySelectorAll('input:checked')].map(input=>Number(input.value));
      if(!ids.length){bridge.toast('Chọn ảnh cần bỏ trước.',true);return;}
      bridge.remove(ids);
    };
    $('arRestoreImages').onclick=bridge.restoreImages;
    $('arSelectImages').onclick=()=>{
      const checks=[...$('arLibraryRows').querySelectorAll('input')];
      const check=checks.some(input=>!input.checked); checks.forEach(input=>input.checked=check);
    };
    $('arGenerate').onclick=()=>selectView('reports');
    reportConfig.addEventListener('input',readReport);
    reportConfig.addEventListener('submit',event=>event.preventDefault());
    $('arSaveReport').onclick=()=>{readReport();bridge.save();};
    $('arPrint').onclick=async ()=>{
      try {
        readReport();
        await MicroCADReportExporter.print(pages);
      } catch(err) {bridge.toast('Không thể xuất PDF: '+err.message,true);}
    };
    $('arDownloadHistogram').onclick=async ()=>{
      try{const svg=$('arPlot-histogram').querySelector('svg'); if(svg)bridge.download(await C.png(svg),'MicroCAD_histogram_'+type+'.png');}
      catch(err){bridge.toast(err.message,true);}
    };
    return {
      get view(){return view;},
      updated,
      serialize(images){
        return {...state,assignments:Object.fromEntries(images.filter(i=>state.assignments[i.imgId]).map(i=>[i.imgId,state.assignments[i.imgId]]))};
      },
      restore(raw,ids){
        state=S.restore(raw,ids);setScope(all);libraryCondition='';librarySession='';updated();
      },
      register(id){
        if (conditionOf(libraryCondition))state.assignments[id]={conditionId:libraryCondition,sessionId:librarySession};
      }
    };
  }
  globalThis.MicroCADWorkspace={mount};
})();

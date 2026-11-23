/* Derive report view data from the existing Analytics records and summaries. */
(() => {
  'use strict';

  const A = MicroCADAnalytics;
  const kinds = ['circle','circleGap'];
  const unknownStats = A.summarize([]);
  const number = new Intl.NumberFormat('vi-VN', {minimumFractionDigits:3, maximumFractionDigits:3, useGrouping:false});
  const mm = value => Number.isFinite(value) ? number.format(value) : '—';
  const count = new Intl.NumberFormat('vi-VN');
  const rate = value => Number.isFinite(value) ? (value*100).toFixed(1).replace('.',',')+'%' : '—';
  const fraction = s => s.evaluated ? s.counts.within + '/' + s.evaluated : '—';

  function imageTime(image) {
    // Only read recognized camera names that contain an actual clock field.
    const match = image.imgName.match(/(?:^|[/\\])WIN_\d{8}_([01]\d|2[0-3])_([0-5]\d)_([0-5]\d)(?:_[^.]+)?\.[^.]+$/i);
    return match ? match.slice(1).join(':') : '—';
  }

  function extremes(points) {
    let low=null, high=null;
    for (const point of points) {
      if (!low || point.mean<low.mean) low=point;
      if (!high || point.mean>high.mean) high=point;
    }
    return {low,high};
  }

  function create(model, config) {
    const groups = Map.groupBy(model.rows,row=>row.imageId);
    const byImage = model.images.map(image=>{
      const rows=groups.get(image.imgId)||[];
      const byType=Map.groupBy(rows,row=>row.type);
      const features=Object.fromEntries(kinds.map(kind=>{
        const records=byType.get(kind)||[];
        const resolver=model.resolver(kind);
        const stats=A.summarize(records,resolver);
        const reference=records.find(r=>Number.isFinite(r.valueMm));
        return [kind,{...stats, category:reference?A.classify(stats.mean,resolver(reference)):null}];
      }));
      return {id:image.imgId, index:model.index.get(image.imgId)+1, time:imageTime(image), features,
        source:[image.imgName,...model.tags(image.imgId)].filter(Boolean).join(' / ')};
    });
    const features = Object.fromEntries(kinds.map(kind=>{
      const stats=model.stats[kind] || unknownStats;
      const points=byImage.filter(p=>Number.isFinite(p.features[kind].mean))
        .map(p=>({index:p.index, mean:p.features[kind].mean, category:p.features[kind].category}));
      const records=model.byType[kind]||[];
      return [kind,{stats, points, extremes:extremes(points), spec:model.spec[kind], mixed:model.mixed[kind], size:records.length}];
    }));
    const review = new Map();
    function flag(index, reason) {
      if (!index) return;
      if (!review.has(index)) review.set(index,[]);
      review.get(index).push(reason);
    }
    for (const [kind,label] of [['circle','Ø'],['circleGap','Khe']]) {
      const {low,high}=features[kind].extremes;
      if (low?.index===high?.index) flag(low?.index,label+' · TB theo ảnh');
      else {
        flag(low?.index,label+' nhỏ nhất');
        flag(high?.index,label+' lớn nhất');
      }
    }
    flag(byImage.find(p=>p.id===config.evidence)?.index,'Ảnh minh chứng');
    const flagged=byImage.map(p=>{
      const stats=kinds.map(key=>p.features[key]);
      const rejected=stats.reduce((sum,s)=>sum+s.counts.below+s.counts.above,0);
      const evaluated=stats.reduce((sum,s)=>sum+s.evaluated,0);
      return {index:p.index,rejected,rate:evaluated?rejected/evaluated:0};
    }).filter(p=>p.rejected).sort((a,b)=>b.rate-a.rate||b.rejected-a.rejected||a.index-b.index);
    for (const p of flagged) {
      if (review.size>=8) break;
      if (!review.has(p.index)) flag(p.index,'Cần xem lại dung sai');
    }
    const rows = byImage.filter(p=>review.has(p.index)).map(p=>({
      ...p, reasons:review.get(p.index).join(' · ')
    }));
    const calibrations=[...new Set(model.rows.map(r=>r.mmPerPx).filter(Number.isFinite))].sort((a,b)=>a-b);
    const diameterMethods=[...Map.groupBy(model.byType.circle||[],r=>r.method)]
      .map(([method,records])=>[method,records.length]);
    const uncalibrated=model.rows.filter(r=>!Number.isFinite(r.valueMm)).length;
    const experimentDates=[...new Set(model.conditions.map(c=>c.date).filter(Boolean))];
    const conditionDate=experimentDates.length===1?experimentDates[0].replace(/^(\d{4})-(\d{2})-(\d{2})$/,'$3/$2/$1'):'';
    return {features, byImage, rows, calibrations, diameterMethods, uncalibrated, conditionDate,
      source:config.source || model.project || 'Dự án MicroCAD đang mở',
      total:model.rows.length+(model.angles||0),
      edges:model.byType.edges?.length||0,
      other:model.rows.length-features.circle.size-features.circleGap.size-(model.byType.edges?.length||0)+(model.angles||0)};
  }

  globalThis.MicroCADReportData = {create,mm,count,rate,fraction};
})();

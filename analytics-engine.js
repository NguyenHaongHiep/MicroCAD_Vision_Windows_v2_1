/* Analytics consumes the application's measurements; it never performs geometry. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MicroCADAnalytics = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const defaults = Object.freeze({
    circle: Object.freeze({target: 0.600, lsl: 0.570, usl: 0.630}),
    circleGap: Object.freeze({target: 0.800, lsl: 0.750, usl: 0.850})
  });
  function validTolerance(t) {
    return !!t && [t.target,t.lsl,t.usl].every(Number.isFinite) && t.lsl <= t.target && t.target <= t.usl;
  }
  function method(m) {
    if (m.type === 'circleGap') return 'minimum_between_fitted_circles';
    if (m.type === 'edges') return 'manual_two_edge_points';
    if (m.type === 'circle') return m.ai ? 'ai_circle_fit' : m.auto ? 'legacy_auto_circle' : (m.edgePts?.length > 3 ? 'manual_multipoint_circle' : 'manual_three_point_circle');
    return m.type;
  }
  const methodNames={minimum_between_fitted_circles:'Khe giữa hai đường tròn đã khớp', manual_two_edge_points:'Hai điểm mép thủ công', ai_circle_fit:'Khớp đường tròn từ đề xuất AI', legacy_auto_circle:'Tự động (Legacy)', manual_multipoint_circle:'Khớp đường tròn nhiều điểm', manual_three_point_circle:'Đường tròn qua ba điểm', rowSpacing:'Pháp tuyến chung hai hàng (TLS/PCA)', distance:'Hai điểm', centers:'Hai tâm'};
  const methodLabel=key=>methodNames[key]||key;
  // basePx is injected from the existing application so the measurement formula stays authoritative.
  function records(images, basePx) {
    if (!Array.isArray(images) || typeof basePx !== 'function') throw new TypeError('images and basePx are required');
    const rows = [];
    images.forEach((image, index) => {
      for (const m of image.measures || []) {
        if (m.type === 'angle') continue;
        const px = basePx(m), scale = image.cal?.mmPerPx;
        if (!Number.isFinite(px) || px < 0) continue;
        const calibrated = Number.isFinite(scale) && scale > 0;
        const value = calibrated ? px * scale : null;
        rows.push({imageIndex:index, imageId:image.imgId, imageName:image.imgName, measurementId:m.id,
          type:m.type, method:method(m), valuePx:px, valueMm:Number.isFinite(value) ? value : null,
          mmPerPx:calibrated ? scale : null, calibrationReference:image.cal?.refName || '',
          ai:m.ai===true, autoMeasure:m.autoMeasure===true, name:m.name||'',
          reviewRequired:m.reviewRequired===true || !!(m.ai&&m.type==='circleGap'&&m.relation!=='separate') ||
            (m.circleIds||[]).some(id=>image.measures.some(source=>source.id===id&&source.reviewRequired)),
          reviewReasons:m.reviewReasons||[], relation:m.relation||''});
      }
    });
    return rows;
  }
  function classify(value, tolerance) {
    if (!Number.isFinite(value) || !validTolerance(tolerance)) return null;
    return value < tolerance.lsl ? 'below' : value > tolerance.usl ? 'above' : 'within';
  }
  function summarize(rows, tolerance) {
    const values = rows.filter(r => !r.reviewRequired && Number.isFinite(r.valueMm));
    let n=0, mean=0, m2=0, min=Infinity, max=-Infinity, evaluated=0;
    const counts = {below:0, within:0, above:0};
    for (const row of values) {
      const x=row.valueMm;
      n++; const delta=x-mean; mean+=delta/n; m2+=delta*(x-mean);
      min=Math.min(min,x); max=Math.max(max,x);
      const result=classify(x,typeof tolerance === 'function' ? tolerance(row) : tolerance); if (result) {counts[result]++; evaluated++;}
    }
    return {count:n, uncalibrated:rows.filter(r=>r.valueMm===null).length, review:rows.filter(r=>r.reviewRequired).length,
      mean:n?mean:null, sampleStdDev:n>1?Math.sqrt(m2/(n-1)):null,
      min:n?min:null, max:n?max:null, counts, evaluated,
      passRate:evaluated?counts.within/evaluated:null};
  }
  function groups(rows, tolerances=defaults) {
    const types = [...new Set(rows.map(r=>r.type))];
    return Object.fromEntries(types.map(type=>[type,summarize(rows.filter(r=>r.type===type),tolerances[type])]));
  }
  return {defaults, validTolerance, method, methodLabel, records, classify, summarize, groups};
});

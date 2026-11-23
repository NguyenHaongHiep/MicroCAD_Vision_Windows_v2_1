/* Optional project metadata. Image IDs are runtime IDs and are remapped on load. */
(() => {
  'use strict';
  const fields = {
    name: 'Tên điều kiện', material: 'Vật liệu', laser: 'Loại laser',
    power: 'Công suất (%)', scan: 'Đường kính quét (mm)', wait: 'Waiting time (ms)',
    feed: 'Tốc độ cấp vật liệu', date: 'Ngày thí nghiệm', notes: 'Ghi chú'
  };
  const clean = (value, max = 180) => typeof value === 'string' ? value.trim().slice(0, max) : '';
  const tolerances = raw => Object.fromEntries(Object.entries({...MicroCADAnalytics.defaults,...(MicroCADAnalytics.validTolerance(raw?.edges)?{edges:raw.edges}:{})}).map(([key, value]) =>
    [key, MicroCADAnalytics.validTolerance(raw?.[key]) ? {target:raw[key].target, lsl:raw[key].lsl, usl:raw[key].usl} : {...value}]));
  const chartKeys = ['histogram', 'trend', 'tolerance', 'comparison'];
  function report(raw, ids = new Map()) {
    return {
      allTrace:raw?.allTrace === true,
      template:raw?.template === 'technical' ? 'technical' : 'quick',
      title:clean(raw?.title, 120), notes:clean(raw?.notes, 850),
      source:clean(raw?.source, 160),
      charts:Object.fromEntries(chartKeys.map(key => [key, typeof raw?.charts?.[key] === 'boolean' ? raw.charts[key] : key !== 'comparison'])),
      evidence:ids.get(raw?.evidence) ?? null
    };
  }
  function restore(raw, ids = new Map()) {
    const conditions = [];
    for (const c of (Array.isArray(raw?.conditions) ? raw.conditions.slice(0, 300) : [])) {
      if (typeof c?.id !== 'string' || ['all','unassigned'].includes(c.id) || !c.id || c.id.length > 80 || conditions.some(other => other.id === c.id)) continue;
      const condition = Object.fromEntries(Object.keys(fields).map(key => [key, clean(c[key], key === 'notes' ? 500 : 120)]));
      const sessions = [];
      for (const s of (Array.isArray(c.sessions) ? c.sessions.slice(0, 300) : [])) {
        if (typeof s?.id !== 'string' || !s.id || s.id.length > 80 || sessions.some(other => other.id === s.id)) continue;
        sessions.push({id:s.id, name:clean(s.name, 120)});
      }
      conditions.push({...condition, id:c.id, tolerances:c.tolerances ? tolerances(c.tolerances) : null, sessions});
    }
    const assignments = {};
    for (const [oldId, newId] of ids) {
      const a = raw?.assignments?.[oldId];
      const c = conditions.find(condition => condition.id === a?.conditionId);
      if (c) assignments[newId] = {conditionId:c.id, sessionId:c.sessions.some(s => s.id === a.sessionId) ? a.sessionId : ''};
    }
    return {project:clean(raw?.project,120), conditions, assignments, tolerances:tolerances(raw?.tolerances), report:report(raw?.report,ids)};
  }
  function id() {
    return globalThis.crypto.randomUUID?.() ?? Array.from(crypto.getRandomValues(new Uint32Array(4)), n => n.toString(16)).join('-');
  }
  globalThis.MicroCADSession = {fields, clean, chartKeys, restore, id};
})();

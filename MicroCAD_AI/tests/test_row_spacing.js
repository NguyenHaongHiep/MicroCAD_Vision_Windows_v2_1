const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', '..', 'MicroCAD_Vision.html'), 'utf8');
const start = html.indexOf('function fitCenterRow(');
const end = html.indexOf('function rowCircles(', start);
assert(start >= 0 && end > start, 'row-spacing geometry source not found');

const context = {
  validPoint: p => p && Number.isFinite(p.x) && Number.isFinite(p.y),
  pt: (x, y) => ({x, y}),
  num: (n, digits) => Number(n).toFixed(digits),
  Math,
};
vm.createContext(context);
vm.runInContext(`${html.slice(start, end)};this.rowSpacingGeometry=rowSpacingGeometry`, context);

const line = (origin, direction, values) => values.map(t => ({
  x: origin.x + direction.x * t,
  y: origin.y + direction.y * t,
}));
const near = (actual, expected, tolerance = 1e-9) => assert(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);

near(context.rowSpacingGeometry(line({x: 0, y: 10}, {x: 1, y: 0}, [0, 50, 120]), line({x: 5, y: 110}, {x: 1, y: 0}, [-20, 40])).distancePx, 100);
near(context.rowSpacingGeometry(line({x: 20, y: 0}, {x: 0, y: 1}, [0, 30]), line({x: 100, y: 5}, {x: 0, y: 1}, [-10, 20, 70])).distancePx, 80);

const theta = Math.PI / 6, u = {x: Math.cos(theta), y: Math.sin(theta)}, n = {x: -u.y, y: u.x};
near(context.rowSpacingGeometry(line({x: 40, y: 60}, u, [-30, 10, 55]), line({x: 40 + n.x * 120, y: 60 + n.y * 120}, u, [-10, 35])).distancePx, 120, 1e-8);

assert.throws(() => context.rowSpacingGeometry(line({x: 0, y: 0}, {x: 1, y: 0}, [0, 10]), line({x: 0, y: 50}, {x: Math.cos(.12), y: Math.sin(.12)}, [0, 20])), /vượt giới hạn/);
assert.throws(() => context.rowSpacingGeometry([{x: 1, y: 1}], [{x: 1, y: 2}, {x: 2, y: 2}]), /ít nhất 2 tâm/);
assert.throws(() => context.rowSpacingGeometry([{x: 1, y: 1}, {x: 1, y: 1}], [{x: 1, y: 2}, {x: 2, y: 2}]), /trùng nhau/);

const calibrated = context.rowSpacingGeometry(line({x: 0, y: 0}, {x: 1, y: 0}, [0, 10]), line({x: 0, y: 100}, {x: 1, y: 0}, [0, 10])).distancePx * 0.002 * 1000;
near(calibrated, 200);
console.log('row-spacing geometry: 7 cases passed');

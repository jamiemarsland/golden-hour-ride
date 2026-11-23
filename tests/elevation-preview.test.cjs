const {test} = require('node:test');
const assert = require('node:assert/strict');
global.window = {devicePixelRatio: 2};
require('../elevation-preview.js');

function fixture(heights, length, options = {}) {
  const strokes = [], draws = [], labels = {};
  let reads = 0;
  const ctx = {
    clearRect() { draws.push(true); }, stroke() { strokes.push(this.strokeStyle); },
    setTransform(){}, beginPath(){}, moveTo(){}, lineTo(){}, fill(){}, arc(){}
  };
  const canvas = {clientWidth:200, clientHeight:38, getContext:() => ctx, setAttribute:(k,v) => { labels[k] = v; }};
  const title = {}, metrics = {};
  const points = heights.map(y => ({get y() { reads++; return y; }}));
  const preview = window.createElevationPreview({canvas, title, metrics, points, length, ...options});
  return {canvas, title, metrics, strokes, draws, labels, preview, reads:() => reads};
}

test('both approaches include intervening descents in the remaining ascent', () => {
  const f = fixture([100,140,120,200,160,170,110], 600, {openRoad:true,summitIndex:3});
  f.preview.update(0);
  assert.equal(f.metrics.textContent, '100 m altitude · 120 m ascent left');
  f.preview.update(50);
  assert.equal(f.metrics.textContent, '120 m altitude · 100 m ascent left');
  f.preview.update(600,-1);
  assert.equal(f.metrics.textContent, '110 m altitude · 100 m ascent left');
  f.preview.update(500,1);
  assert.equal(f.metrics.textContent, '170 m altitude');
  f.preview.update(300,1);
  assert.equal(f.metrics.textContent, '200 m altitude · 0 m ascent left');
});

test('a shorter open-road preview stops exactly at each endpoint', () => {
  const f = fixture([0,100,150], 2000, {openRoad:true});
  f.preview.update(1950);
  assert.equal(f.title.textContent, 'Next 50 m');
  assert.match(f.labels['aria-label'], /grade 5%/);
  f.preview.update(2000);
  assert.equal(f.title.textContent, 'End of road');
  f.preview.update(2000,-1);
  assert.equal(f.title.textContent, 'Next kilometre');
  assert.deepEqual(new Set(f.strokes.slice(-63)), new Set(['#70cbe5']));
  f.preview.update(0,-1);
  assert.equal(f.title.textContent, 'End of road');
});

test('loop seam wraps in both directions and uphill grade bands change colour', () => {
  const f = fixture([0,0,4,12,26], 500);
  f.preview.update(-50);
  assert.equal(f.metrics.textContent, '13 m altitude');
  assert.deepEqual(new Set(f.strokes), new Set(['#70cbe5','#9bd7ac','#f4d17f','#f4a064','#f17d88']));
  f.preview.update(10,-1,'Gate');
  assert.match(f.title.textContent, /^Gate/);
  assert.match(f.labels['aria-label'], /grade 26%/);
});

test('stationary updates and movement inside five metres reuse the chart', () => {
  const f = fixture([0,25,100], 2000, {openRoad:true,summitIndex:2});
  f.preview.update(0);
  const firstReads = f.reads();
  for (let i=0; i<20; i++) f.preview.update(2);
  assert.equal(f.draws.length, 1);
  assert.equal(f.reads()-firstReads, 40);
  f.preview.update(5);
  f.preview.update(5,-1);
  f.canvas.clientWidth = 160;
  f.preview.update(5,-1);
  assert.equal(f.draws.length, 4);
  assert.equal(f.canvas.width, 320);
  f.canvas.hidden = true;
  f.preview.update(900);
  assert.equal(f.draws.length, 4);
});

const assert=require('node:assert/strict');
const test=require('node:test');
global.window={};
require('../ride-power-bests.js');
const bests=window.ridePowerBests;
const sample=(t,w,source='trainer',wall=t)=>[t,w,source,0,0,wall*1000];

test('reports fixed-duration peaks in an exact warmup/effort/recovery trace',()=>{
  const rows=Array.from({length:1201},(_,i)=>sample(i,i>=250&&i<550?303:100));
  assert.deepEqual(bests(rows).trainer,{60:303,300:303,480:227,1200:151});
});
test('breaks at pauses, missing signal, large sample gaps, and changed power source',()=>{
  const rows=[sample(0,500),sample(1,500),sample(2,null),sample(3,800),sample(4,800),
    sample(5,800,'trainer',60),sample(9,800,'trainer',64),sample(10,550,'sim',65),sample(11,550,'sim',66)];
  assert.deepEqual(bests(rows,[1,2,3]),{trainer:{1:800},sim:{1:550}});
  assert.deepEqual(bests([[1,850,'trainer'],[2,750,'trainer']],[1]),{trainer:{},sim:{}});
});
test('accounts for fractional sampling intervals on both sides of the window',()=>{
  const data=[[0,100],[.2,600],[1.4,300],[2.3,350],[3,75]];
  const rows=data.map(([t,w])=>sample(t,w));
  assert.deepEqual(bests(rows,[1,2]).trainer,{1:600,2:480});
});

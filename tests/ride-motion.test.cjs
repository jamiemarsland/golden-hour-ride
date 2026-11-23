const assert=require('node:assert/strict');
const test=require('node:test');
global.window={};
require('../ride-motion.js');
const advance=window.advanceRideMotion;
function simulate(fps,grade,watts,seconds=60,mass){
  const state={s:0,v:0,power:watts,target:watts,mass};
  for(let i=0;i<fps*seconds;i++)state.s+=advance(state,1/fps,()=>grade);
  return state;
}
test('slow rendering does not halve climb distance',()=>{
  const slow=simulate(5,.07,240);
  const fast=simulate(90,.07,240);
  assert.ok(slow.s>150 && Math.abs(slow.s-fast.s)<1);
});
test('zero watts holds on a climb and coasts downhill',()=>{
  assert.equal(simulate(30,.08,0).s,0);
  assert.ok(simulate(30,-.08,0).s>100);
});
test('a rider can restart on a steep pitch and a pause covers no distance',()=>{
  const st=simulate(30,.13,120);
  assert.ok(st.v>.8 && st.s>40);
  const before={...st};
  assert.equal(advance(st,0,()=>.1),0);
  assert.deepEqual(st,before);
});

test('combined rider and bike weight changes climb speed and retains the original default',()=>{
  const distance=mass=>simulate(30,.075,220,120,mass).s;
  assert.equal(distance(),distance(80));
  assert.ok(distance(65)>distance(80)&&distance(80)>distance(100));
});

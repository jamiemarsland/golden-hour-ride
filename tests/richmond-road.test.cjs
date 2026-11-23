const {test} = require('node:test');
const assert = require('node:assert/strict');
global.window = {};
require('../assets/richmond.js');
require('../assets/richmond-scenery.js');
const {road, origin, details} = window.RIDE_COURSES.richmond;
require('../richmond-park.js');

function distanceToRoad(easting, northing) {
  const x = easting - origin[0], z = origin[1] - northing;
  let nearest = Infinity;
  for (let i = 0; i < road.length; i++) {
    const [ax,,az] = road[i], [bx,,bz] = road[(i + 1) % road.length];
    const dx = bx - ax, dz = bz - az;
    const u = Math.max(0, Math.min(1, ((x-ax)*dx + (z-az)*dz) / (dx*dx + dz*dz)));
    nearest = Math.min(nearest, Math.hypot(x - ax - u*dx, z - az - u*dz));
  }
  return nearest;
}

test('parking boards mark actual access junctions instead of parking polygon corners', () => {
  assert.equal(details.parkingSigns.length,11);
  assert.equal(new Set(details.parkingSigns.map(s=>s[2])).size,8);
  for(const [x,z] of details.parkingSigns)assert.ok(distanceToRoad(origin[0]+x,origin[1]-z)<1.1);
  for(const [name,gate,metres] of [['Pen Ponds','Robin Hood Gate',904],['Sheen','Sheen Gate',621],['Isabella','Ham Gate',491]]){
    const parking=details.parkingSigns.find(s=>s[2].startsWith(name));
    const approach=details.gateApproaches.find(s=>s[0]===gate);
    assert.deepEqual(parking.slice(0,2),approach.slice(1,3));assert.equal(parking[3],metres);
  }
  const pembroke=details.parkingSigns.filter(s=>s[2]==='Pembroke Lodge Car Park');
  assert.deepEqual(pembroke.map(s=>s[4]),['entrance','exit']);
  assert.ok(Math.abs(Math.hypot(pembroke[0][0]-pembroke[1][0],pembroke[0][1]-pembroke[1][1])-25)<1);
});

test('park cues use the nearest junction ahead, in either direction across the lap line',()=>{
  const toggle={checked:false},setting={hidden:true},line={hidden:true};
  const cue=window.createRichmondPlaceCue({length:1000,toggle,setting,line,
    markers:[{station:80,places:['Gate turn-off','Car park']},{station:995,places:['Car park exit']}]});
  cue.update(40,1);assert.equal(line.hidden,true);
  toggle.checked=true;toggle.onchange();
  cue.update(980,1);assert.equal(line.textContent,'20 m · Car park exit');
  cue.update(2,1);assert.equal(line.textContent,'80 m · Gate turn-off');
  assert.equal(line.title,'Gate turn-off · Car park');
  cue.update(2,-1);assert.equal(line.textContent,'Here · Car park exit');
  cue.update(520,1);assert.equal(line.hidden,true);
  toggle.checked=false;toggle.onchange();assert.equal(line.hidden,true);
});

test('the perimeter follows the paved Broomfield carriageway through its bends', () => {
  // British National Grid coordinates of intermediate nodes 30182299, 5157396916,
  // 21090228 and 30182340 on OSM way 838833357. The parallel trail misses these.
  for (const [east,north] of [[521010.34,172227.33],[520772.49,172076.90],
    [520625.49,172064.83],[520488.81,171963.43]]) {
    assert.ok(distanceToRoad(east,north) < 1);
  }
});

test('the interval across the lap line has normal road spacing and gradient', () => {
  const [ax,ay,az] = road.at(-1), [bx,by,bz] = road[0];
  const metres = Math.hypot(ax-bx,az-bz);
  assert.ok(metres > 7 && metres < 11);
  assert.ok(Math.abs(by-ay)/metres < 0.1);
});

test('Pembroke cattle-grid slats run across their mapped service drive', () => {
  const grid = details.gates.find(g => g[2] === 'cattle_grid');
  // Adjacent OSM centreline nodes lie 2.6 m east and 27.6 m north of each other.
  const dot = (Math.cos(grid[3])*2.6 - Math.sin(grid[3])*27.6) / Math.hypot(2.6,27.6);
  assert.ok(Math.abs(dot) < 0.04);
});

test('all six access signs sit at the perimeter junction, with distance along the gate road', () => {
  assert.deepEqual(details.gateApproaches.map(g=>g[0]).sort(), [
    'Ham Gate','Kingston Gate','Richmond Gate','Robin Hood Gate','Roehampton Gate','Sheen Gate'
  ]);
  const physical = new Map(window.RIDE_COURSES.richmond.gates.map(([name,x,z])=>[name,[x,z]]));
  for (const [name,x,z,metres] of details.gateApproaches) {
    assert.ok(distanceToRoad(origin[0]+x,origin[1]-z) < 2, name);
    const [gx,gz] = physical.get(name);
    const direct = Math.hypot(gx-x,gz-z);
    assert.ok(metres > 20 && metres >= direct-2 && metres < direct*1.2, name);
  }
});

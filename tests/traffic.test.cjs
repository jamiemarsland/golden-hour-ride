const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const world = vm.createContext({console});
world.window = world;
function load(file) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), world);
}
load('vendor/three-0.160.0/ride-three.min.js');
load('assets/richmond.js');
load('road-models.js');
load('traffic.js');
const {THREE} = world.RideThree;
const road = world.RIDE_COURSES.richmond.road.map(p => new THREE.Vector3(...p));
const makePose = () => ({p:new THREE.Vector3(),t:new THREE.Vector3(),r:new THREE.Vector3()});

function fixture(course, reverse = false) {
  const points = reverse ? [road[0], ...road.slice(1).reverse()] : road;
  const curve = new THREE.CatmullRomCurve3(points, true);
  curve.arcLengthDivisions = 12000;
  const length = curve.getLength(), scene = new THREE.Scene();
  function poseAt(metres, pose) {
    const u = (metres % length + length) % length / length;
    curve.getPointAt(u, pose.p);
    curve.getTangentAt(u, pose.t);
    pose.r.set(-pose.t.z,0,pose.t.x).normalize();
    return pose;
  }
  const update = world.createRideTraffic({THREE, scene, length, openRoad:course==='core',
    course, reversed:reverse, poseAt, makePose, groundHeight:() => 30,walkHeight:(x,z)=>road[nearest(new THREE.Vector3(x,0,z))[0]].y});
  return {length, scene, poseAt, update, cars:scene.children.filter(g => g.name==='Visitor car')};
}

function nearest(point) {
  let best = 0, distance = Infinity;
  for (let i=0; i<road.length; i++) {
    const p = road[i], d = (point.x-p.x)**2 + (point.z-p.z)**2;
    if (d < distance) {best=i; distance=d;}
  }
  return [best, Math.sqrt(distance)];
}

test('Richmond visitor cars use permitted roads and parking drives for both course directions', () => {
  const cw = fixture('richmond'), ccw = fixture('richmond',true);
  assert.equal(cw.cars.length,3);
  // Identify the mapped driveways by location, regardless of how many samples
  // represent the intervening car-free Broomfield climb.
  const driveIndex=(x,z)=>nearest({x,z})[0];
  const east=[driveIndex(1339.2,-1669.9),driveIndex(1275.9,30)];
  const west=[driveIndex(448.5,585.4),driveIndex(-1204.9,-604.2)];
  const sampled = new Set();
  let jumps=0;
  const previous = [];
  for (let seconds=0;seconds<2100;seconds+=2) {
    // Observe from Sawyer's Hill, then spend the second half at Robin Hood car park.
    const observer = seconds<1000 ? cw.length*.85 : cw.length*189/road.length;
    cw.update(2,observer,1);
    ccw.update(2,ccw.length-observer,-1);
    cw.cars.forEach((car,i) => {
      const position=car.position;
      assert.ok(position.distanceTo(ccw.cars[i].position)<1.1,'reversing the course moved traffic');
      const [index, offset]=nearest(position);
      if (offset<6) {
        assert.ok(([east,west].some(([a,b])=>index>=a-1 && index<=b+1)), 'car on restricted road at sample '+index);
        sampled.add(Math.floor(index/10));
      }
      if (previous[i] && previous[i].point.distanceTo(position)>25) {
        jumps++;
        assert.equal(previous[i].visible,false,'recycled a visible car');
        assert.equal(car.visible,false,'recycled into view');
      }
      previous[i]={point:position.clone(), visible:car.visible};
    });
  }
  assert.ok(jumps>0);
  assert.ok(sampled.has(6) && sampled.has(39) && sampled.has(72));
  assert.ok(cw.cars[0].visible,'arrived car should remain parked near rider');
  const parked = cw.cars[0].position.clone();
  cw.update(30,cw.length*189/road.length,1);
  assert.ok(parked.distanceTo(cw.cars[0].position)<.001);
});

test('UK and French generic traffic keep to their respective lanes and historic Leckhampton has cyclists', () => {
  for (const course of ['valley','core','leckhampton','richmond']) {
    const ride=fixture(course);
    const cyclists=ride.scene.children.filter(g=>g.name==='Road cyclist');
    assert.ok(cyclists.length>0);
    const cars=ride.scene.children.filter(g=>g.name==='Road car');
    assert.equal(cars.length>0,course==='valley' || course==='core');
    // The first generic traveller is oncoming and begins at 140 m; ignore passer clearance.
    if (cars.length) {
      ride.update(0,140,1);
      const pose=ride.poseAt(140,makePose());
      assert.ok(Math.abs(cars[0].position.clone().sub(pose.p).dot(pose.r)-(course==='core'?-1.65:1.65))<.01);
    }
    if (course==='richmond') {
      let seen=false;
      for (let t=0; t<900; t++) {
        ride.update(1,ride.length*.226,1);
        if(cyclists.some(c=>c.visible)) {seen=true;break;}
      }
      assert.ok(seen,'no cyclists observed on the car-free Broomfield climb');
    }
  }
});


test('walkers are clear of the start lane, walking, with bikes visible in both directions',()=>{
  for(const course of ['valley','richmond','leckhampton','core']){
    const ride=fixture(course);
    ride.update(0,0,1);
    const walkers=ride.scene.children.filter(g=>g.name==='Walker'&&g.visible);
    assert.ok(walkers.length>=1,course);
    const position=walkers[0].position.clone(),shoe=walkers[0].getObjectByName('shoeR');
    const footBefore=shoe.position.clone();
    assert.ok(nearest(position)[1]>4,course+' walker on road');
    assert.ok(ride.scene.children.filter(g=>g.name==='Road cyclist'&&g.visible).length>=2);
    ride.update(.4,0,1);
    assert.ok(walkers[0].position.distanceTo(position)>.2);
    assert.ok(shoe.position.distanceTo(footBefore)>.05);
  }
});

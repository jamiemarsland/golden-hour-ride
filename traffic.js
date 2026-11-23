/* Low-density road users move in the course's original coordinate system, so
   turning the player around doesn't teleport traffic or reverse its direction. */
window.createRideTraffic=function({THREE,scene,length,openRoad,poseAt,makePose,course,reversed=false,groundHeight,
  start=0,headingAtStart=1,parked=[],buildings=[],walkHeight=groundHeight}){
  const {car,bike,walker}=window.createRoadModels(THREE);
  const bound=s=>openRoad?Math.max(0,Math.min(length,s)):(s%length+length)%length;
  const travellers=[],count=Math.max(4,Math.round(length/950)),pose=makePose();
  // Visitor journeys use roads open on weekdays, weekends and public holidays.
  // Coordinates are OSM driveway centrelines in the Richmond course's local frame.
  // Royal Parks access map: https://www.royalparks.org.uk/sites/default/files/2023-06/Richmond-Map-v2.pdf
  const parkCars=[];
  const observer=makePose(), tangent=new THREE.Vector3(), lateral=new THREE.Vector3();
  if(course==='richmond'){
    const roehampton=[[1339.2,-1669.9],[1346.2,-1670.7],[1364.8,-1673.8],[1381.1,-1676.7],[1405.8,-1681.3]];
    const robinHood=[[1275.9,30],[1286.8,35.6],[1294,38],[1293.9,63.8],[1294.4,76.9]];
    const broomfield=[[448.5,585.4],[462.2,597.6],[478.9,611.6],[501.2,589.7]];
    // Way 32864089 is one-way: enter south of the separate exit.
    const pembrokeIn=[[-1201,-579.5],[-1209.3,-578.5],[-1216.2,-576],[-1216.8,-570.9],[-1211.8,-543.5]];
    const pembrokeOut=[[-1204.9,-604.2],[-1211.9,-603.7],[-1216.9,-603.2],[-1219.6,-607.4],[-1222.6,-621.5]];
    function clockwisePose(distance){
      poseAt(reversed?(length-distance)%length:distance,pose);
      if(reversed){pose.t.negate();pose.r.negate();}
      return pose;
    }
    function station([x,z]){
      let best=0,min=Infinity;
      for(let s=0;s<length;s+=3){
        const p=clockwisePose(s).p, d=(x-p.x)**2+(z-p.z)**2;
        if(d<min){min=d;best=s;}
      }
      return best;
    }
    function journey(start,end,seed,color){
      const first=station(start[0]),last=station(end[0]),dir=Math.sign(last-first);
      const points=[],steps=Math.ceil(Math.abs(last-first)/7);
      function driveway([x,z]){return new THREE.Vector3(x,groundHeight(x,z)+.04,z);}
      // Bring the lane to the mouth of each drive, then follow the mapped aisle.
      for(const pt of start.slice(1).reverse())points.push(driveway(pt));
      const firstRoad=points.length;
      for(let i=0;i<=steps;i++){
        const p=clockwisePose(first+(last-first)*i/steps);
        points.push(p.p.clone().addScaledVector(p.r,-1.65*dir));
      }
      const lastRoad=points.length-1;
      for(const pt of end.slice(1))points.push(driveway(pt));
      const path=new THREE.CatmullRomCurve3(points,false,'centripetal');
      path.arcLengthDivisions=(points.length-1)*4;
      const lengths=path.getLengths(),total=lengths[lengths.length-1];
      const {g}=car(color,parkCars.length%3);g.name='Visitor car';scene.add(g);
      parkCars.push({g,path,total,firstRoad:lengths[firstRoad*4],lastRoad:lengths[lastRoad*4],
                     distance:seed*total,start:points[0],end:points[points.length-1]});
    }
    journey(roehampton,robinHood,.23,0xa2b0a8);
    journey(pembrokeOut,broomfield,.62,0x657987);
    journey(broomfield,pembrokeIn,.57,0xa59887);
  }
  function updateParkCars(dt,rider,heading){
    poseAt(rider,observer);
    for(const c of parkCars){
      // A car stays parked if either end of its next trip is visible.
      if(c.distance===c.total && observer.p.distanceToSquared(c.end)>300**2 &&
          observer.p.distanceToSquared(c.start)>300**2)c.distance=0;
      const entry=Math.min(c.distance-c.firstRoad,c.lastRoad-c.distance);
      const cruise=3+5.2*THREE.MathUtils.smoothstep(entry,0,35);
      const speed=Math.min(cruise,.6+Math.sqrt(2*Math.min(c.distance,c.total-c.distance)));
      c.distance=Math.min(c.total,c.distance+speed*dt);
      const fraction=c.distance/c.total;
      c.path.getPointAt(fraction,c.g.position);
      const separation=c.g.position.distanceTo(observer.p);
      c.g.visible=separation<260;
      if(!c.g.visible)continue;
      c.path.getTangentAt(fraction,tangent);
      if(entry>12 && tangent.dot(observer.t)*heading>.8){
        lateral.set(-tangent.z,0,tangent.x).normalize();
        c.g.position.addScaledVector(lateral,1.85*(1-THREE.MathUtils.smoothstep(separation,6,40)));
      }
      c.g.rotation.set(-Math.asin(tangent.y),Math.atan2(tangent.x,tangent.z),0,'YXZ');
    }
  }
  for(let i=0;i<count;i++){
    if(i%4===0 && course==='richmond')continue;
    const motor=course!=='leckhampton' && i%4===0,dir=i%3===1?1:-1;
    const model=motor?car(i%8?0xa2b0a8:0x657987,(i>>2)%3):bike(i%4);
    model.g.name=motor?'Road car':'Road cyclist';model.g.visible=false;scene.add(model.g);
    travellers.push({...model,motor,dir,s:(140+i*length/count)%length,speed:motor?9.4:5.5+i%3,phase:i});
  }
  // A rider approaching the start gives the road life before the spaced-out
  // traffic further along the course comes into view.
  const firstRider=travellers.find(t=>!t.motor);
  firstRider.s=bound(start+headingAtStart*42);firstRider.dir=-headingAtStart;
  const riderAhead=travellers.find(t=>!t.motor && t!==firstRider);
  if(riderAhead){riderAhead.s=bound(start+headingAtStart*67);riderAhead.dir=headingAtStart;riderAhead.speed=4.6;}
  const pedestrians=[],parkedModels=[];
  const colours=[0x627b83,0xb4b7ad,0x516473,0x964a42,0x576457,0xc0b09a];
  parked.forEach(([x,z,yaw],i)=>{
    const model=car(colours[i%colours.length],i%3).g;
    model.name='Parked car';model.position.set(x,groundHeight(x,z)+.02,z);
    model.rotation.y=yaw;model.visible=false;scene.add(model);parkedModels.push(model);
  });
  function intersectsBuilding(x,z){
    return buildings.some(([cx,cz,w,d,angle])=>{
      const dx=x-cx,dz=z-cz;
      if(Math.abs(dx)+Math.abs(dz)>w+d+2)return false;
      const ca=Math.cos(angle),sa=Math.sin(angle);
      return Math.abs(dx*ca-dz*sa)<w/2+.45&&Math.abs(dx*sa+dz*ca)<d/2+.45;
    });
  }
  function walkingPath(at,side){
    const points=[];
    for(let i=0;i<9;i++){
      const s=bound(at+i*3.2);
      poseAt(s,pose);
      const p=pose.p.clone().addScaledVector(pose.r,side*5.7),y=walkHeight(p.x,p.z);
      if(!Number.isFinite(y)||Math.abs(y-pose.p.y)>1.45||intersectsBuilding(p.x,p.z))return;
      if(points.length&&Math.abs(y-points.at(-1).y)>1.2)return;
      p.y=y+.018;
      if(!points.length||p.distanceToSquared(points.at(-1))>1)points.push(p);
    }
    if(points.length>=5)return new THREE.CatmullRomCurve3(points,false,'centripetal');
  }
  const groups=Math.max(5,Math.ceil(length/850));
  for(let i=0;i<groups;i++){
    const base=start+headingAtStart*(i===0?22:i*length/groups);
    let path;
    for(const offset of [0,13,30,54,85,120,170]){
      const station=openRoad?Math.max(0,Math.min(length-27,base+headingAtStart*offset)):bound(base+headingAtStart*offset);
      const side=i%2?1:-1;
      path=walkingPath(station,side)||walkingPath(station,-side);
      if(path)break;
    }
    if(!path)continue;
    const span=path.getLength();
    for(let j=0;j<(i%3===0?2:1);j++){
      const person=walker((i+j)%4);person.g.name='Walker';person.g.visible=false;scene.add(person.g);
      pedestrians.push({...person,path,span,offset:i===0?4+j*1.9:span*.4+j*1.9,time:0,speed:.98+(i%3)*.09,step:i+j*.7});
    }
  }
  return function update(dt,rider,heading){
    poseAt(rider,observer);
    for(const g of parkedModels)g.visible=g.position.distanceToSquared(observer.p)<190**2;
    for(const w of pedestrians){
      w.time+=dt;
      const cycle=(w.time*w.speed+w.offset)%(2*w.span),forward=cycle<w.span;
      const fraction=(forward?cycle:2*w.span-cycle)/w.span;
      w.path.getPointAt(fraction,w.g.position);
      w.g.visible=w.g.position.distanceToSquared(observer.p)<150**2;
      if(!w.g.visible)continue;
      w.path.getTangentAt(fraction,tangent);
      w.g.rotation.y=Math.atan2(tangent.x,tangent.z)+(forward?0:Math.PI);
      w.animate(w.time*w.speed*4.8+w.step,0);
    }

    if(parkCars.length)updateParkCars(dt,rider,heading);
    for(const t of travellers){
      t.s+=t.speed*t.dir*dt;
      if(openRoad){
        if(t.s<0){t.s=-t.s;t.dir=1;}
        else if(t.s>length){t.s=length*2-t.s;t.dir=-1;}
      }else t.s=(t.s+length)%length;
      const delta=openRoad?t.s-rider:(t.s-rider+length*1.5)%length-length*.5;
      t.g.visible=Math.abs(delta)<260;
      if(!t.g.visible)continue;
      poseAt(t.s,pose);const forward=pose.t.multiplyScalar(t.dir);
      const clearance=t.motor&&t.dir===heading?1.85*(1-THREE.MathUtils.smoothstep(Math.abs(delta),6,40)):0;
      t.g.position.copy(pose.p).addScaledVector(pose.r,(openRoad?-1:1)*t.dir*((t.motor?-1.65:-2.65)+clearance));
      t.g.rotation.set(-Math.asin(forward.y),Math.atan2(forward.x,forward.z),0,'YXZ');
      if(t.animate){t.phase+=dt*(7+t.speed*.15);t.animate(t.phase,t.s*t.dir);}
    }
  };
};

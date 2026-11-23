/* Scenery is built once per visit. Repeated objects share geometry and draw calls. */
window.createRichmondPlaceCue = function({markers,length,toggle,setting,line}) {
  const key='ride-richmond-places';
  setting.hidden=false;
  try{toggle.checked=localStorage.getItem(key)==='on';}catch{}
  let lastCell=-1,lastDirection=0;
  toggle.onchange=()=>{
    lastCell=-1;line.hidden=true;
    try{localStorage.setItem(key,toggle.checked?'on':'off');}catch{}
  };
  return {update(position,direction){
    if(!toggle.checked)return;
    const cell=Math.floor(position/5);
    if(cell===lastCell&&direction===lastDirection)return;
    lastCell=cell;lastDirection=direction;
    let next=null,metres=Infinity;
    for(const marker of markers){
      const gap=((marker.station-position)*direction%length+length)%length;
      if(gap<=450&&gap<metres){metres=gap;next=marker;}
    }
    if(next){
      // One destination fits at riding speed. Keep every destination of a
      // shared junction available in the tooltip and on its physical board.
      const text=(metres<10?'Here':Math.round(metres/10)*10+' m')+' · '+next.places[0];
      if(line.textContent!==text)line.textContent=text;
      const details=next.places.join(' · ');
      if(line.title!==details)line.title=details;
    }
    line.hidden=!next;
  }};
};

window.fitRichmondRoadbed = function({points,rights,tangents,heights,positions,cells,size}) {
  // Cap only the coarse terrain triangles touched by the asphalt. Otherwise a
  // high bank beside a bend can interpolate through the carriageway.
  const spacing=size/cells,stride=cells+1;
  for(let i=0;i<points.length;i++){
    const p=points[i],r=rights[i],t=tangents[i];
    for(const side of [-3.65,0,3.65]){
      const col=Math.floor((p.x+side*r.x+size/2)/spacing);
      const row=Math.floor((p.z+side*r.z+size/2)/spacing);
      for(let j=row;j<=row+1;j++)for(let k=col;k<=col+1;k++){
        if(k<0||k>cells||j<0||j>cells)continue;
        const index=j*stride+k,dx=positions[index*3]-p.x,dz=positions[index*3+2]-p.z;
        const plane=p.y+(dx*t.x+dz*t.z)*t.y/(t.x*t.x+t.z*t.z);
        const h=Math.min(heights[index],plane-.045);
        heights[index]=h;positions[index*3+1]=h;
      }
    }
  }
};

window.buildRichmondShoulders = function({THREE,scene,points,rights,spacing,ground,material}) {
  const count=points.length,widths=new Float32Array(count*2),drops=new Float32Array(count*2);
  const verge=material.clone();verge.vertexColors=true;verge.transparent=true;verge.depthWrite=false;
  for(const side of [-1,1]){
    const positions=[],uv=[],colours=[],indices=[];
    const edges=[];
    for(let i=0;i<count;i++){
      const p=points[i],r=rights[i],index=i*2+(side>0?1:0);
      const sample=d=>ground(p.x+r.x*d*side,p.z+r.z*d*side);
      const drop=Math.abs(p.y-sample(4.8));
      const width=.95+Math.min(2,drop*1.3)+.13*Math.sin(p.x*.08+p.z*.05);
      const d=(3.5+width)*side,x=p.x+r.x*d,z=p.z+r.z*d;
      widths[index]=width;
      edges.push({x,z,y:ground(x,z)-.018,lower:0});
    }
    // A metre-long edge can bridge a crease between terrain triangles. Tuck
    // both ends below the local mesh so the grass can meet it without daylight.
    for(let i=0;i<count;i++){
      const a=edges[i],b=edges[(i+1)%count];
      for(const u of [.25,.5,.75]){
        const gap=a.y+(b.y-a.y)*u-ground(a.x+(b.x-a.x)*u,a.z+(b.z-a.z)*u);
        if(gap>-.008){a.lower=Math.max(a.lower,gap+.008);b.lower=Math.max(b.lower,gap+.008);}
      }
    }
    for(let row=0;row<=count;row++){
      const i=row%count,p=points[i],r=rights[i],index=i*2+(side>0?1:0);
      const width=widths[index],outer=edges[i].y-edges[i].lower;
      drops[index]=outer-p.y;
      for(const u of side<0?[1,.55,0]:[0,.55,1]){
        const d=(3.5+width*u)*side;
        positions.push(p.x+r.x*d,p.y+(outer-p.y)*u,p.z+r.z*d);
        uv.push(u,row*spacing/5);colours.push(1,1,1,u===1?0:1);
      }
      if(row<count)for(let k=0;k<2;k++){
        const a=row*3+k;indices.push(a,a+1,a+3,a+1,a+4,a+3);
      }
    }
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
    geometry.setAttribute('color',new THREE.Float32BufferAttribute(colours,4));
    geometry.setIndex(indices);geometry.computeVertexNormals();
    const mesh=new THREE.Mesh(geometry,verge);mesh.name='Park verge';mesh.receiveShadow=true;scene.add(mesh);
  }
  return function surfaceHeight(i,lateral,roadY,groundY){
    const d=Math.abs(lateral)-3.5;
    if(d<=0)return roadY;
    const index=i*2+(lateral>0?1:0);
    return d<widths[index]?Math.max(groundY,roadY+drops[index]*d/widths[index]):groundY;
  };
};

window.buildRichmondPark = function({THREE,scene,details,meshH,nearRoad,camera,vergeHeight}) {
  const scratch=new THREE.Object3D(), batches=new Map();
  const box=new THREE.BoxGeometry(),sphere=new THREE.SphereGeometry(1,9,7);
  const island=new THREE.CylinderGeometry(1,1,1,28);
  // Join the raised road edge to each mapped access lane. The rest of each
  // lane is already present on the terrain, including the parking aisles.
  const faceSamples=[[.5,.5,0],[.5,0,.5],[0,.5,.5],[1/3,1/3,1/3]];
  for(const kind of [1,2]){
    const positions=[],indices=[];
    function substrate(x,z){
      const n=nearRoad(x,z),ground=meshH(x,z);
      return n&&vergeHeight?vergeHeight(n.i,n.side,n.y,ground):ground;
    }
    for(const [surface,width,line] of details.junctions){
      if(surface!==kind)continue;
      for(let j=1;j<line.length;j++){
        const [x,z]=line[j-1],[xx,zz]=line[j];
        const length=Math.hypot(xx-x,zz-z);if(length<.05)continue;
        const sx=-(zz-z)/length*width/2,sz=(xx-x)/length*width/2;
        // Sample across the entrance as well as along it. Wide entrances can
        // span the whole transition from asphalt to grass within one cross-section.
        const count=Math.ceil(length/.75),across=Math.ceil(width/.75);
        const vertices=[];
        const base=positions.length/3;
        function face(ia,ib,ic){
          const a=vertices[ia],b=vertices[ib],c=vertices[ic];
          if(Math.min(a.edgeDistance,b.edgeDistance,c.edgeDistance)<2){
            // At the crest a planar triangle can cut through the road even
            // though its corners are above it. Keep shared corners watertight.
            for(const [u,v,w] of faceSamples){
              const x=a.x*u+b.x*v+c.x*w,z=a.z*u+b.z*v+c.z*w,y=a.y*u+b.y*v+c.y*w;
              const lift=substrate(x,z)+.012-y;
              if(lift>0){
                a.lift=Math.max(a.lift,lift);b.lift=Math.max(b.lift,lift);c.lift=Math.max(c.lift,lift);
              }
            }
          }
          indices.push(base+ia,base+ib,base+ic);
        }
        for(let k=0;k<=count;k++){
          const cx=x+(xx-x)*k/count,cz=z+(zz-z)*k/count;
          for(let col=0;col<=across;col++){
            const side=2*col/across-1;
            const px=cx+sx*side,pz=cz+sz*side,n=nearRoad(px,pz),ground=meshH(px,pz);
            const y=n&&vergeHeight?vergeHeight(n.i,n.side,n.y,ground):ground;
            vertices.push({x:px,y:y+.018,z:pz,lift:0,edgeDistance:n?Math.abs(Math.abs(n.side)-3.5):Infinity});
            if(col&&k){
              const d=vertices.length-1,c=d-1,b=d-across-1,a=b-1;
              face(a,b,c);face(c,b,d);
            }
          }
        }
        for(const p of vertices)positions.push(p.x,p.y+p.lift,p.z);
      }
    }
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:kind===1?0x514f48:0x8c775c,side:THREE.DoubleSide,roughness:1}));
    mesh.name='Park access entrances';
    mesh.receiveShadow=true;scene.add(mesh);
  }
  // A single park-wide batch sent all fence rails to the GPU from every viewpoint.
  // Local batches share the same material, including posts and gates of different colours.
  function instance(geometry,color,x,y,z,sx,sy,sz,angle=0,pitch=0){
    const tile=geometry.id+':'+Math.floor(x/600)+','+Math.floor(z/600);
    let b=batches.get(tile);
    if(!b){b={geometry,matrices:[],colours:[]};batches.set(tile,b);}
    scratch.position.set(x,y,z);scratch.rotation.set(0,angle,pitch,'YXZ');
    scratch.scale.set(sx,sy,sz);scratch.updateMatrix();
    b.matrices.push(scratch.matrix.clone());b.colours.push(color);
  }
  function rail(color,x,z,xx,zz,offset,width,height){
    const a=meshH(x,z)+offset,b=meshH(xx,zz)+offset,d=Math.hypot(xx-x,zz-z);
    instance(box,color,(x+xx)/2,(a+b)/2,(z+zz)/2,Math.hypot(d,b-a),height,width,-Math.atan2(zz-z,xx-x),Math.atan2(b-a,d));
  }
  const gateCells=new Map();
  const cell=(x,z)=>Math.floor(x/10)+','+Math.floor(z/10);
  for(const [x,z] of details.gates){
    const k=cell(x,z);if(!gateCells.has(k))gateCells.set(k,[]);gateCells.get(k).push([x,z]);
  }
  function gatesNear(x,z){
    const found=[];
    for(const dx of [-10,0,10])for(const dz of [-10,0,10])found.push(...gateCells.get(cell(x+dx,z+dz))||[]);
    return found;
  }
  const gateAngles=new Map();
  for(const [kind,pts] of details.fences){
    for(let i=1;i<pts.length;i++){
      const [a,b]=pts[i-1],[c,d]=pts[i],n=Math.ceil(Math.hypot(c-a,d-b)/4);
      for(let k=0;k<n;k++){
        const x=a+(c-a)*k/n,z=b+(d-b)*k/n,xx=a+(c-a)*(k+1)/n,zz=b+(d-b)*(k+1)/n;
        const near=gatesNear((x+xx)/2,(z+zz)/2).find(([gx,gz])=>Math.hypot(gx-(x+xx)/2,gz-(z+zz)/2)<3.8);
        if(near){gateAngles.set(near.join(','),Math.atan2(zz-z,xx-x));continue;}
        if(kind==='hedge'||kind.includes('wall')){
          rail(kind==='hedge'?0x455337:0x928577,x,z,xx,zz,.65,kind==='hedge'?1:.4,1.35);
        }else{
          instance(box,0x65594a,x,meshH(x,z)+.65,z,.13,1.3,.13);
          for(const h of [.46,.99])rail(0x756b56,x,z,xx,zz,h,.075,.09);
        }
      }
    }
  }
  for(const [x,z,kind,pathBearing] of details.gates){
    const nr=nearRoad(x,z);
    // Through gates are open while riding. Put their posts on the verges of
    // the seven-metre carriageway, including a margin for offset gate nodes.
    const throughRoad=nr && nr.d<4.5;
    const width=throughRoad?8.8:kind==='kissing_gate'?1.2:3.8;
    const a=pathBearing??gateAngles.get([x,z].join(','))??0,dx=Math.cos(a),dz=Math.sin(a);
    if(kind==='cattle_grid'){
      for(let k=-4;k<=4;k++){
        const cx=x-dz*k*.16,cz=z+dx*k*.16;
        rail(0x75817d,cx-dx*width/2,cz-dz*width/2,cx+dx*width/2,cz+dz*width/2,.04,.09,.04);
      }
      continue;
    }
    for(const side of [-1,1]){
      const gx=x+dx*width*.5*side,gz=z+dz*width*.5*side;
      instance(box,0x51483b,gx,meshH(gx,gz)+.8,gz,.24,1.6,.24);
    }
    if(throughRoad)continue;
    for(const h of [.42,.91,1.25])rail(0x48584d,x-dx*width/2,z-dz*width/2,x+dx*width/2,z+dz*width/2,h,.06,.07);
  }
  for(const [x,z] of details.roundabouts){
    const nr=nearRoad(x,z),y=nr&&nr.d<4.2?nr.y+.035:meshH(x,z)+.04;
    instance(island,0xdedaca,x,y,z,1.4,.06,1.4);
  }
  const staticMaterial=new THREE.MeshStandardMaterial({roughness:.96}),colour=new THREE.Color();
  for(const b of batches.values()){
    const mesh=new THREE.InstancedMesh(b.geometry,staticMaterial,b.matrices.length);
    b.matrices.forEach((m,i)=>{mesh.setMatrixAt(i,m);mesh.setColorAt(i,colour.setHex(b.colours[i]));});
    mesh.computeBoundingSphere();mesh.receiveShadow=true;scene.add(mesh);
  }
  batches.clear();
  // All deer share the same six meshes. Each animal follows a checked meadow segment,
  // rests at either end, and occasionally canters to the other end.
  const animals=details.deer.map(([x,z,dx,dz],i)=>({x,z,dx,dz,i,phase:i*53.17%151,cycle:92+i*17%63}));
  const parts={};
  for(const [name,count,color,geometry] of [
    ['body',1,0x985e35,sphere],['rump',1,0xcbb794,sphere],['head',1,0x835031,sphere],
    ['neck',1,0x9d673d,sphere],['ear',2,0x875b3c,sphere],['leg',4,0x60452e,box],
    ['antler',4,0x655540,box]]){
    const mesh=new THREE.InstancedMesh(geometry,new THREE.MeshStandardMaterial({color,roughness:1}),animals.length*count);
    mesh.frustumCulled=false;mesh.receiveShadow=true;scene.add(mesh);parts[name]=mesh;
  }
  let time=0,last=-1;
  function update(dt){
    time+=dt;if(time-last<.075)return;last=time;
    const counts={};
    for(const a of animals){
      if((camera.position.x-a.x)**2+(camera.position.z-a.z)**2>330**2)continue;
      const t=(time+a.phase)%a.cycle, half=a.cycle/2, distance=Math.hypot(a.dx,a.dz),duration=Math.max(1.1,distance/4.5);
      const back=t>=half,local=back?t-half:t;
      const run=local<duration,frac=Math.min(1,local/duration),progress=back?1-frac:frac;
      const x=a.x+a.dx*progress,z=a.z+a.dz*progress,angle=-Math.atan2(a.dz,a.dx)+(back?Math.PI:0);
      const ground=meshH(x,z),stride=run?Math.sin(t*10):0,graze=run?0:Math.max(0,Math.sin(time*.17+a.phase));
      function part(name,ox,oy,oz,sx,sy,sz,tilt=0){
        const mesh=parts[name],i=counts[name]||0;
        scratch.position.set(x+ox*Math.cos(angle)+oz*Math.sin(angle),ground+oy,z-ox*Math.sin(angle)+oz*Math.cos(angle));
        scratch.rotation.set(0,angle,tilt,'YXZ');scratch.scale.set(sx,sy,sz);scratch.updateMatrix();
        mesh.setMatrixAt(i,scratch.matrix);counts[name]=i+1;
      }
      const bob=run?Math.abs(stride)*.09:0,headY=1.62-graze*.78+bob;
      part('body',0,.95+bob,0,.74,.34,.26);
      part('rump',-.58,.97+bob,0,.17,.19,.22);
      part('neck',.52,(1.04+headY)/2,0,.17,.39,.16,-.48-graze*.75);
      part('head',.76+.14*graze,headY,0,.24,.13,.14,-graze*.55);
      for(const side of [-1,1]){
        part('ear',.69,headY+.14,.09*side,.065,.13,.044,.3);
        if(a.i%4===0)for(const branch of [0,1])part('antler',.65-branch*.08,headY+.25+branch*.11,.09*side,.031,.24,.031,.38-branch*.75);
        for(const end of [-1,1])part('leg',.44*end,.43+bob,.13*side,.065,.86,.07,stride*side*end*.58);
      }
    }
    for(const [name,mesh] of Object.entries(parts)){mesh.count=counts[name]||0;mesh.instanceMatrix.needsUpdate=true;}
  }
  update(0);return update;
};

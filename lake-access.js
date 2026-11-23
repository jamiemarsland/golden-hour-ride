window.createLakeGround=function(data,scenery){
  if(!data)return (x,z,fallback)=>fallback;
  const height=new Uint16Array(Uint8Array.from(atob(data.decimetres),c=>c.charCodeAt(0)).buffer);
  const {cells,spacing}=data,width=cells+1;
  const grid=new Map(),cellSize=32;
  const key=(x,z)=>Math.floor(x/cellSize)+','+Math.floor(z/cellSize);
  for(const [id,w,line] of scenery.lanes){
    const profile=scenery.profiles?.[id];
    if(!profile)continue;
    for(let j=1;j<line.length;j++){
      const y0=profile[j-1],y1=profile[j];if(y0==null||y1==null)continue;
      const [ax,az]=line[j-1],[bx,bz]=line[j],dx=bx-ax,dz=bz-az,l2=dx*dx+dz*dz;
      if(l2<.01)continue;
      const reach=w/2+14,segment={ax,az,dx,dz,l2,y0,dy:y1-y0,w,reach};
      for(let z=Math.floor((Math.min(az,bz)-reach)/cellSize);z<=Math.floor((Math.max(az,bz)+reach)/cellSize);z++){
        for(let x=Math.floor((Math.min(ax,bx)-reach)/cellSize);x<=Math.floor((Math.max(ax,bx)+reach)/cellSize);x++){
          const cell=x+','+z;if(!grid.has(cell))grid.set(cell,[]);grid.get(cell).push(segment);
        }
      }
    }
  }
  return function(x,z,fallback){
    const col=(x-data.x)/spacing,row=(z-data.z)/spacing;
    if(col<0||row<0||col>=cells||row>=cells)return fallback;
    const i=Math.floor(col),j=Math.floor(row),u=col-i,v=row-j,a=j*width+i;
    const left=height[a]*(1-u)+height[a+1]*u;
    const right=height[a+width]*(1-u)+height[a+width+1]*u;
    let surveyed=(left*(1-v)+right*v)*.1,closest=Infinity,target;
    for(const segment of grid.get(key(x,z))||[]){
      const {ax,az,dx,dz,l2,y0,dy,w,reach}=segment;
      const t=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/l2));
      const d=Math.hypot(x-ax-t*dx,z-az-t*dz);
      if(d>=closest||d>=reach)continue;
      const blend=Math.min(1,Math.max(0,(d-w/2-2)/(reach-w/2-2)));
      target=(y0+t*dy)*(1-blend*blend*(3-2*blend))+surveyed*blend*blend*(3-2*blend);
      closest=d;
    }
    if(target!==undefined)surveyed=target;
    const blend=Math.min(1,col/3,row/3,(cells-col)/3,(cells-row)/3);
    return fallback+(surveyed-fallback)*blend;
  };
};

// Keep vegetation off the mapped access road, walking paths and parking clearings.
window.createLakeSurfaceMask=function({THREE,scenery,lake}){
  const points=lake.concat(...scenery.parking,...scenery.lanes.map(l=>l[2]));
  const xs=points.map(p=>p[0]),zs=points.map(p=>p[1]);
  const x0=Math.min(...xs)-20,z0=Math.min(...zs)-20;
  const width=Math.max(...xs)+20-x0,height=Math.max(...zs)+20-z0;
  const canvas=document.createElement('canvas');
  const scale=Math.min(1,1536/Math.max(width,height));
  canvas.width=Math.ceil(width*scale);canvas.height=Math.ceil(height*scale);
  const ctx=canvas.getContext('2d');
  ctx.fillStyle='#000';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle=ctx.strokeStyle='#fff';ctx.lineCap=ctx.lineJoin='round';
  const path=line=>{
    ctx.beginPath();
    line.forEach(([x,z],i)=>ctx[i?'lineTo':'moveTo']((x-x0)*scale,(z-z0)*scale));
  };
  for(const ring of [lake,...scenery.parking]){path(ring);ctx.fill();}
  for(const [,w,line] of scenery.lanes){path(line);ctx.lineWidth=(w+1.5)*scale;ctx.stroke();}
  const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
  const texture=new THREE.CanvasTexture(canvas);texture.flipY=false;
  return {texture,bounds:new THREE.Vector4(x0,z0,canvas.width/scale,canvas.height/scale),
    contains(x,z){
      const i=Math.floor((x-x0)*scale),j=Math.floor((z-z0)*scale);
      return i>=0&&j>=0&&i<canvas.width&&j<canvas.height&&pixels[4*(j*canvas.width+i)]>64;
    }};
};

/* Mapped access roads, parking and footpaths at Lac de Bethmale. */
window.buildLakeAccess=function({THREE,scene,scenery,meshH,nearRoad,asphalt,gravel}){
  const strips=new Map();
  function ground(x,z){
    const terrain=meshH(x,z),road=nearRoad(x,z);
    if(!road||road.d>12)return terrain;
    const t=THREE.MathUtils.smoothstep(road.d,3.5,12);
    return road.y*(1-t)+terrain*t;
  }
  function surface(color,positions){
    if(!positions.length)return;
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    const uv=[],clearance=[];
    for(let i=0;i<positions.length;i+=3){
      const x=positions[i],z=positions[i+2];uv.push(x/4,z/4);
      clearance.push(nearRoad(x,z)?.d??100);
    }
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
    geometry.setAttribute('roadDistance',new THREE.Float32BufferAttribute(clearance,1));
    geometry.computeVertexNormals();
    const mat=new THREE.MeshStandardMaterial({color,map:color===0x777771?asphalt:gravel,alphaTest:.2,side:THREE.DoubleSide,roughness:1,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
    mat.onBeforeCompile=shader=>{
      shader.vertexShader='attribute float roadDistance;varying float vRoadDistance;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvRoadDistance=roadDistance;');
      shader.fragmentShader='varying float vRoadDistance;\n'+shader.fragmentShader.replace('#include <alphatest_fragment>','diffuseColor.a*=smoothstep(2.9,3.6,vRoadDistance);\n#include <alphatest_fragment>');
    };
    const mesh=new THREE.Mesh(geometry,mat);
    mesh.receiveShadow=true;scene.add(mesh);
  }
  for(const [,width,line] of scenery.lanes){
    const color=width>=4?0x777771:width>2?0x8e897d:0x94866d;
    if(!strips.has(color))strips.set(color,[]);
    const vertices=strips.get(color);
    for(let i=1;i<line.length;i++){
      const [x,z]=line[i-1],[endX,endZ]=line[i];
      const dx=endX-x,dz=endZ-z,length=Math.hypot(dx,dz);
      if(length<.05)continue;
      const rx=-dz/length*width/2,rz=dx/length*width/2;
      const count=Math.ceil(length/2.5);
      let prior;
      for(let j=0;j<=count;j++){
        const cx=x+dx*j/count,cz=z+dz*j/count;
        const current=[-1,1].map(side=>{
          const px=cx+rx*side,pz=cz+rz*side;
          return [px,ground(px,pz)+.045,pz];
        });
        if(prior)vertices.push(...prior[0],...prior[1],...current[0],...prior[1],...current[1],...current[0]);
        prior=current;
      }
    }
  }
  for(const [color,vertices] of strips)surface(color,vertices);
  const vertices=[];
  for(const ring of scenery.parking){
    const contour=ring.map(([x,z])=>new THREE.Vector2(x,z));
    // Break broad triangles into small patches to follow uneven ground.
    function triangle(a,b,c){
      const longest=Math.max(a.distanceTo(b),b.distanceTo(c),c.distanceTo(a));
      if(longest>5){
        const ab=a.clone().lerp(b,.5),bc=b.clone().lerp(c,.5),ca=c.clone().lerp(a,.5);
        triangle(a,ab,ca);triangle(ab,b,bc);triangle(ca,bc,c);triangle(ab,bc,ca);
      }else for(const p of [a,b,c])vertices.push(p.x,ground(p.x,p.y)+.032,p.y);
    }
    for(const [a,b,c] of THREE.ShapeUtils.triangulateShape(contour,[]))triangle(contour[a],contour[b],contour[c]);
  }
  surface(0x736f62,vertices);
};

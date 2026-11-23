/* Render the mapped exterior walls. Keep the houses beside the street clear
   of its two riding lanes where the original surveyed street is narrower. */
window.buildCoreVillages=function({THREE,scene,footprints,buildings,points,rights,nearRoad,meshH,wallMat,roofMat}){
  const chunks=new Map();
  wallMat.vertexColors=true;
  roofMat.vertexColors=true;
  function geometry(){return {position:[],uv:[],color:[]};}
  function vertex(data,p,y,u,v,color){
    data.position.push(p.x,y,p.y);data.uv.push(u,v);data.color.push(color.r,color.g,color.b);
  }
  for(let index=0;index<footprints.length;index++){
    const outline=footprints[index];
    const [cx,cz,width,depth,angle,height,pitched]=buildings[index];
    const near=nearRoad(cx,cz);
    const close=near&&near.d<Math.max(width,depth)+8;
    const contour=[];
    for(let j=0;j<outline.length;j++){
      const [x,z]=outline[j],[xx,zz]=outline[(j+1)%outline.length];
      const n=close?Math.max(1,Math.ceil(Math.hypot(xx-x,zz-z)/2.5)):1;
      for(let k=0;k<n;k++){
        const p=new THREE.Vector2(x+(xx-x)*k/n,z+(zz-z)*k/n);
        const road=close?nearRoad(p.x,p.y):null;
        if(road&&road.d<4.05){
          const i=road.i,r=rights[i];
          const side=Math.sign((cx-points[i].x)*r.x+(cz-points[i].z)*r.z)||1;
          const step=4.05*side-road.side;
          p.x+=r.x*step;p.y+=r.z*step;
        }
        if(!contour.length||p.distanceToSquared(contour.at(-1))>.0001)contour.push(p);
      }
    }
    if(contour.length<3||Math.abs(THREE.ShapeUtils.area(contour))<2)continue;
    if(THREE.ShapeUtils.area(contour)<0)contour.reverse();
    const sector=Math.floor(cx/450)+','+Math.floor(cz/450);
    if(!chunks.has(sector))chunks.set(sector,{walls:geometry(),roofs:geometry()});
    const {walls,roofs}=chunks.get(sector);
    const heights=contour.map(p=>meshH(p.x,p.y));
    const floor=Math.max(...heights),eaves=floor+height;
    const c=Math.cos(angle),s=Math.sin(angle);
    const across=width>=depth?p=>-(p.x-cx)*s+(p.y-cz)*c:p=>(p.x-cx)*c+(p.y-cz)*s;
    const span=Math.max(1,Math.min(width,depth)/2),rise=pitched?Math.min(3,span*.52):0;
    const roofY=p=>eaves+rise*Math.max(0,1-Math.abs(across(p))/span);
    const shade=(index*0.61803398875)%1;
    const plaster=new THREE.Color().setHSL(.06+.06*shade,.11+.1*shade,.54+.18*shade);
    const slate=new THREE.Color().setHSL(shade<.35?.055:.6,shade<.35?.37:.07,.24+.1*shade);
    for(let j=0;j<contour.length;j++){
      const next=(j+1)%contour.length,a=contour[j],b=contour[next],cut=across(a)*across(b)<0;
      const line=cut?[a,a.clone().lerp(b,across(a)/(across(a)-across(b))),b]:[a,b];
      for(let k=1;k<line.length;k++){
        const v=line[k-1],w=line[k],floorY=Math.min(heights[j],heights[next])-.5;
        const chars=[[v,floorY],[v,roofY(v)],[w,floorY],[v,roofY(v)],[w,roofY(w)],[w,floorY]];
        // World-aligned texture coordinates continue through collinear survey vertices.
        const horizontal=Math.abs(b.x-a.x)>Math.abs(b.y-a.y)?p=>p.x:p=>p.y;
        for(const [p,y] of chars)vertex(walls,p,y,horizontal(p)/3.4,(y-floor)/2.8,plaster);
      }
    }
    function clip(poly,sign){
      const result=[];
      for(let i=0;i<poly.length;i++){
        const a=poly[i],b=poly[(i+1)%poly.length],da=across(a)*sign,db=across(b)*sign;
        if(da>=0)result.push(a);
        if(da*db<0)result.push(a.clone().lerp(b,da/(da-db)));
      }
      return result;
    }
    for(const ids of THREE.ShapeUtils.triangulateShape(contour,[])){
      const triangle=ids.map(i=>contour[i]);
      const pieces=pitched?[clip(triangle,1),clip(triangle,-1)]:[triangle];
      for(const poly of pieces){
        if(THREE.ShapeUtils.area(poly)>0)poly.reverse();
        for(let j=2;j<poly.length;j++)
          for(const p of [poly[0],poly[j-1],poly[j]])vertex(roofs,p,roofY(p),0,0,slate);
      }
    }
  }
  for(const {walls,roofs} of chunks.values()){
    for(const [data,mat] of [[walls,wallMat],[roofs,roofMat]]){
      if(!data.position.length)continue;
      const geo=new THREE.BufferGeometry();
      for(const [name,size] of [['position',3],['uv',2],['color',3]])
        geo.setAttribute(name,new THREE.Float32BufferAttribute(data[name],size));
      geo.computeVertexNormals();geo.computeBoundingSphere();
      const mesh=new THREE.Mesh(geo,mat);mesh.castShadow=true;mesh.receiveShadow=true;
      scene.add(mesh);
    }
  }
};

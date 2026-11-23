/* Refine only mountain cells beside the road. The far terrain stays at its
   source resolution, and adjacent surface tiles share their edge heights. */
window.createMountainGround=function({THREE,size,cells,points,rights,tangents,nearRoad,baseH,coarseH,refineArea}){
  const spacing=size/cells,sub=8,tileSide=sub+1,step=spacing/sub;
  const offsets=new Int32Array(cells*cells),tiles=[];
  for(let i=0;i<points.length;i+=6){
    const col=Math.floor((points[i].x+size/2)/spacing),row=Math.floor((points[i].z+size/2)/spacing);
    for(let z=row-2;z<=row+2;z++)for(let x=col-2;x<=col+2;x++){
      const k=z*cells+x;
      if(x<0||x>=cells||z<0||z>=cells||offsets[k])continue;
      offsets[k]=tiles.length+1;tiles.push([x,z]);
    }
  }
  if(refineArea){
    const {x,z,cells:n,spacing:res}=refineArea;
    const hiX=Math.ceil((x+n*res+size/2)/spacing),hiZ=Math.ceil((z+n*res+size/2)/spacing);
    for(let row=Math.floor((z+size/2)/spacing);row<hiZ;row++){
      for(let col=Math.floor((x+size/2)/spacing);col<hiX;col++){
        const k=row*cells+col;
        if(!offsets[k]){offsets[k]=tiles.length+1;tiles.push([col,row]);}
      }
    }
  }
  // Pack the local heights and road distances for vegetation's vertex shader.
  const tilesPerRow=Math.ceil(Math.sqrt(tiles.length));
  const width=tilesPerRow*tileSide,height=Math.ceil(tiles.length/tilesPerRow)*tileSide;
  const atlas=new Float32Array(width*height*2);
  function offset(id,x,z){
    return 2*((Math.floor(id/tilesPerRow)*tileSide+z)*width+(id%tilesPerRow)*tileSide+x);
  }
  const smooth=THREE.MathUtils.smoothstep;
  tiles.forEach(([col,row],id)=>{
    for(let j=0;j<=sub;j++)for(let i=0;i<=sub;i++){
      const x=(col+i/sub)*spacing-size/2,z=(row+j/sub)*spacing-size/2;
      const road=nearRoad(x,z),d=road?.d??150;
      let h=coarseH(x,z);
      const lakeBlend=refineArea?smooth(Math.min(x-refineArea.x,z-refineArea.z,
        refineArea.x+refineArea.cells*refineArea.spacing-x,
        refineArea.z+refineArea.cells*refineArea.spacing-z),0,45):0;
      if(d<72||lakeBlend>0){
        const influence=1-smooth(d,8,40);
        const ground=baseH(x,z),cut=road?ground+(road.y-.6-ground)*influence:ground;
        h+=(cut-h)*Math.max(lakeBlend,1-smooth(d,48,72));
      }
      const k=offset(id,i,j);
      atlas[k]=h;atlas[k+1]=Math.min(100,d);
    }
  });
  // A hairpin can put two different road levels close together. Constrain
  // the small mesh triangles intersecting the carriageway to stay below it.
  const fineRow=cells*sub+1,ceiling=new Map();
  for(let i=0;i<points.length;i++){
    const p=points[i],r=rights[i],t=tangents[i];
    for(const side of [-3.8,0,3.8]){
      const ix=Math.floor((p.x+side*r.x+size/2)/step);
      const iz=Math.floor((p.z+side*r.z+size/2)/step);
      for(let z=iz;z<=iz+1;z++)for(let x=ix;x<=ix+1;x++){
        const key=z*fineRow+x,dx=x*step-size/2-p.x,dz=z*step-size/2-p.z;
        const roadPlane=p.y+(dx*t.x+dz*t.z)*t.y/(t.x*t.x+t.z*t.z);
        ceiling.set(key,Math.min(ceiling.get(key)??Infinity,roadPlane-.48));
      }
    }
  }
  tiles.forEach(([col,row],id)=>{
    for(let j=0;j<=sub;j++)for(let i=0;i<=sub;i++){
      const cap=ceiling.get((row*sub+j)*fineRow+col*sub+i);
      if(cap!==undefined){
        const k=offset(id,i,j);atlas[k]=Math.min(cap,atlas[k]);
      }
    }
  });
  function ground(x,z){
    const gx=(x+size/2)/spacing,gz=(z+size/2)/spacing;
    const col=Math.floor(gx),row=Math.floor(gz),id=offsets[row*cells+col]-1;
    if(!Number.isInteger(id)||id<0)return coarseH(x,z);
    const u=(gx-col)*sub,v=(gz-row)*sub,i=Math.min(sub-1,Math.floor(u)),j=Math.min(sub-1,Math.floor(v));
    const s=u-i,t=v-j,k=offset(id,i,j);
    const a=atlas[k],b=atlas[k+2*width],c=atlas[k+2*width+2],d=atlas[k+2];
    return s+t<=1?a+(d-a)*s+(b-a)*t:c+(b-c)*(1-s)+(d-c)*(1-t);
  }
  function texture(data,w,h,format){
    const tex=new THREE.DataTexture(data,w,h,format,THREE.FloatType);
    tex.needsUpdate=true;return tex;
  }
  const atlasTexture=texture(atlas,width,height,THREE.RGFormat);
  const indexTexture=texture(Float32Array.from(offsets),cells,cells,THREE.RedFormat);
  function grassShader(shader){
    shader.uniforms.roadGroundIndex={value:indexTexture};
    shader.uniforms.roadGroundAtlas={value:atlasTexture};
    shader.vertexShader='uniform sampler2D roadGroundIndex, roadGroundAtlas;\n'+shader.vertexShader;
    return `
      int tileId=int(texelFetch(roadGroundIndex,gi,0).r)-1;
      if(tileId>=0){
        vec2 fgu=gu*${sub}.;
        ivec2 subcell=min(ivec2(floor(fgu)),ivec2(${sub-1}));
        vec2 st=fgu-vec2(subcell);
        ivec2 corner=ivec2(tileId%${tilesPerRow},tileId/${tilesPerRow})*${tileSide}+subcell;
        vec2 a=texelFetch(roadGroundAtlas,corner,0).rg,b=texelFetch(roadGroundAtlas,corner+ivec2(0,1),0).rg;
        vec2 c=texelFetch(roadGroundAtlas,corner+ivec2(1,1),0).rg,d=texelFetch(roadGroundAtlas,corner+ivec2(1,0),0).rg;
        fl.xy=st.x+st.y<=1.?a+(d-a)*st.x+(b-a)*st.y:c+(b-c)*(1.-st.x)+(d-c)*(1.-st.y);
      }`;
  }
  function install(scene,coarse,material){
    const remaining=[];
    const indices=coarse.index.array;
    for(let k=0;k<offsets.length;k++)if(!offsets[k])
      for(let j=k*6;j<k*6+6;j++)remaining.push(indices[j]);
    coarse.setIndex(remaining);
    const batches=new Map();
    const attributes=['color','aMix','aShade'];
    tiles.forEach(([col,row],id)=>{
      const key=Math.floor(col/8)+','+Math.floor(row/8);
      if(!batches.has(key))batches.set(key,{position:[],uv:[],color:[],aMix:[],aShade:[],indices:[]});
      const batch=batches.get(key),first=batch.position.length/3;
      const a=row*(cells+1)+col,b=a+cells+1,c=b+1,d=a+1;
      for(let z=0;z<=sub;z++)for(let x=0;x<=sub;x++){
        const u=x/sub,v=z/sub,px=(col+u)*spacing-size/2,pz=(row+v)*spacing-size/2;
        batch.position.push(px,atlas[offset(id,x,z)],pz);batch.uv.push(px/4,pz/4);
        for(const name of attributes){
          const attr=coarse.attributes[name],arr=attr.array,n=attr.itemSize;
          for(let j=0;j<n;j++){
            const av=arr[a*n+j],bv=arr[b*n+j],cv=arr[c*n+j],dv=arr[d*n+j];
            batch[name].push(u+v<=1?av+(dv-av)*u+(bv-av)*v:cv+(bv-cv)*(1-u)+(dv-cv)*(1-v));
          }
        }
        if(x<sub&&z<sub){
          const k=first+z*tileSide+x;
          batch.indices.push(k,k+tileSide,k+1,k+tileSide,k+tileSide+1,k+1);
        }
      }
    });
    for(const batch of batches.values()){
      const geo=new THREE.BufferGeometry();
      for(const [name,n] of [['position',3],['uv',2],['color',3],['aMix',2],['aShade',1]])
        geo.setAttribute(name,new THREE.Float32BufferAttribute(batch[name],n));
      geo.setIndex(batch.indices);geo.computeVertexNormals();geo.computeBoundingSphere();
      const mesh=new THREE.Mesh(geo,material);mesh.castShadow=true;mesh.receiveShadow=true;
      scene.add(mesh);
    }
  }
  return {ground,grassShader,install};
};
/* Leave a shallow shoulder at the top of steep cuttings. A textured bank joins
   it to the hillside, stopping short of the lower road on close switchbacks. */
window.buildMountainShoulders=function({THREE,scene,points,rights,spacing,nearRoad,ground,shoulderMat,rockMap}){
  const stone=new THREE.MeshStandardMaterial({map:rockMap,roughness:1,color:0xb6ad98,side:THREE.DoubleSide});
  function geometry(pos,uv,idx,mat){
    if(!idx.length)return;
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
    g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();
    const mesh=new THREE.Mesh(g,mat);mesh.receiveShadow=true;scene.add(mesh);
  }
  for(const side of [-1,1]){
    const pos=[],uv=[],idx=[],bank=[],tex=[],faces=[];
    const bankFloor=new Float32Array(points.length);
    let previousBank=false;
    for(let i=0;i<points.length;i++){
      const p=points[i],r=rights[i],at=d=>[p.x+r.x*d*side,p.z+r.z*d*side];
      const [ax,az]=at(3.5);
      let width=6.8,[bx,bz]=at(width);
      const lower=nearRoad(bx,bz);
      if(lower&&Math.abs(lower.i-i)*spacing>18&&lower.d<4.25){
        width=Math.max(3.65,width-(4.25-lower.d));
        [bx,bz]=at(width);
      }
      const low=ground(bx,bz),lip=Math.max(low-.04,p.y-.72);
      const drop=Math.max(0,lip-low);
      let tx=bx,tz=bz;
      if(drop>.04){
        const end=width+Math.min(16,drop*1.4);
        for(let d=width+.75;d<=end;d+=.75){
          const [x,z]=at(d),other=nearRoad(x,z);
          if(other&&Math.abs(other.i-i)*spacing>18&&other.d<4.35)break;
          tx=x;tz=z;
        }
      }
      // Left and right strips have opposite winding when traced up the road.
      if(side<0){pos.push(bx,lip,bz,ax,p.y+.005,az);uv.push(1,i*spacing/5,0,i*spacing/5);}
      else{pos.push(ax,p.y+.005,az,bx,lip,bz);uv.push(0,i*spacing/5,1,i*spacing/5);}
      const toe=ground(tx,tz)-.10;
      bank.push(bx,lip,bz,tx,toe,tz);
      tex.push(i*spacing/3,lip/3,i*spacing/3,toe/3);
      if(i){
        const k=(i-1)*2;
        idx.push(k,k+1,k+2,k+1,k+3,k+2);
        const from=(i-1)*6+3,to=i*6+3;
        const dx=bank[to]-bank[from],dz=bank[to+2]-bank[from+2];
        const samples=Math.max(2,Math.ceil(Math.hypot(dx,dz)/.40));
        let underlap=0;
        for(let n=1;n<samples;n++){
          const t=n/samples,x=bank[from]+dx*t,z=bank[from+2]+dz*t;
          const edge=bank[from+1]*(1-t)+bank[to+1]*t;
          underlap=Math.max(underlap,edge-ground(x,z)+.08);
        }
        bankFloor[i-1]=Math.max(bankFloor[i-1],underlap);bankFloor[i]=underlap;
        if(previousBank||drop>.04||underlap>.01)faces.push(k,k+1,k+2,k+1,k+3,k+2);
      }
      previousBank=drop>.04;
    }
    for(let i=0;i<points.length;i++){
      bank[i*6+4]-=bankFloor[i];
      tex[i*4+3]=bank[i*6+4]/3;
    }
    geometry(pos,uv,idx,shoulderMat);geometry(bank,tex,faces,stone);
  }
};
/* Surveyed ridgelines beyond the high-resolution riding area. */
window.addMountainHorizon=function({THREE,scene,data,innerSize}){
  const bytes=Uint8Array.from(atob(data.heights),c=>c.charCodeAt(0));
  const heights=new Uint16Array(bytes.buffer),stride=data.cells+1,spacing=data.size/data.cells;
  const low=new THREE.Color(0x506d53),high=new THREE.Color(0x9faaa4),color=new THREE.Color();
  const mat=new THREE.MeshLambertMaterial({vertexColors:true});
  const block=19;
  for(let row=0;row<data.cells;row+=block)for(let col=0;col<data.cells;col+=block){
    const pos=[],cols=[],idx=[];
    const w=Math.min(block,data.cells-col),h=Math.min(block,data.cells-row);
    for(let j=0;j<=h;j++)for(let i=0;i<=w;i++){
      const x=(col+i)*spacing-data.size/2,z=(row+j)*spacing-data.size/2;
      const height=heights[(row+j)*stride+col+i];
      const inset=innerSize/2-Math.max(Math.abs(x),Math.abs(z));
      const y=height-Math.max(0,Math.min(1,inset/spacing))*120;
      pos.push(x,y,z);
      color.copy(low).lerp(high,THREE.MathUtils.smoothstep(height,1350,2450));
      cols.push(color.r,color.g,color.b);
      if(i===w||j===h||Math.max(Math.abs(x+spacing/2),Math.abs(z+spacing/2))<innerSize/2-spacing)continue;
      const a=j*(w+1)+i,b=a+w+1;
      idx.push(a,b,a+1,b,b+1,a+1);
    }
    if(!idx.length)continue;
    const geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
    geo.setAttribute('color',new THREE.Float32BufferAttribute(cols,3));
    geo.setIndex(idx);geo.computeVertexNormals();geo.computeBoundingSphere();
    scene.add(new THREE.Mesh(geo,mat));
  }
};

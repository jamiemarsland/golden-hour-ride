// A 40 m terrain triangle can span water even if all three vertices are on land.
// Keep vertices within a cell diagonal of the mapped shore at water level,
// then blend back into the original mountainside beyond the immediate bank.
window.lakeBankHeight = function(x,z,height,ring,bounds,water,cell) {
  const margin=cell*3;
  if(x<bounds[0]-margin || x>bounds[1]+margin || z<bounds[2]-margin || z>bounds[3]+margin)return height;
  let nearest=Infinity;
  for(let i=1;i<ring.length;i++){
    const [ax,az]=ring[i-1],[bx,bz]=ring[i],dx=bx-ax,dz=bz-az;
    const t=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz||1)));
    nearest=Math.min(nearest,Math.hypot(x-ax-t*dx,z-az-t*dz));
  }
  const t=Math.max(0,Math.min(1,(nearest-cell*Math.SQRT2)/(margin-cell*Math.SQRT2)));
  return Math.min(height,water+.04)+(height-Math.min(height,water+.04))*t*t*(3-2*t);
};
// Two ripple scales break up the reflection without a render target or a
// reflection pass. Suppress sub-pixel waves near the far bank.
window.lakeSurfaceMaterial = function(THREE) {
  const water=new THREE.MeshStandardMaterial({color:0x398888,roughness:.57,side:THREE.DoubleSide});
  water.onBeforeCompile=shader=>{
    shader.vertexShader='varying vec2 lakeXZ;\n'+shader.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\nlakeXZ = position.xz;');
    shader.fragmentShader='varying vec2 lakeXZ;\n'+shader.fragmentShader.replace('#include <normal_fragment_maps>',`
      #include <normal_fragment_maps>
      vec2 ripple = vec2(dot(lakeXZ,vec2(.57,2.5)),dot(lakeXZ,vec2(.31,4.1)));
      ripple += sin(lakeXZ.yx*.16)*1.4;
      vec2 waves = cos(ripple)*clamp(1.-fwidth(ripple)*.38,0.,1.);
      normal = normalize(normal + mat3(viewMatrix)*vec3(.018*waves.x,0.,.035*waves.y+.016*waves.x));
      diffuseColor.rgb *= 1.+.055*(waves.x+waves.y);
    `);
  };
  return water;
};
// Give the shoreline the same near-view detail as the carriageway. Instances
// share the existing forest meshes and follow the course's ESA woodland mask.
window.addLakeWoodland = function({course,bounds,spots,groundHeight,water,nearRoad,random}) {
  const avoid=[];
  for(const [,width,line] of course.scenery.lanes){
    for(let i=1;i<line.length;i++){
      const [x,z]=line[i-1],[xx,zz]=line[i];
      const steps=Math.max(1,Math.ceil(Math.hypot(xx-x,zz-z)/4));
      for(let k=0;k<=steps;k++)avoid.push([x+(xx-x)*k/steps,z+(zz-z)*k/steps,3+width/2]);
    }
  }
  for(const [x,z,w,d] of course.scenery.buildings)avoid.push([x,z,Math.hypot(w,d)/2+4]);
  const occupied=new Set();
  for(const [x,z,r] of avoid){
    for(let i=Math.floor((x-r)/5);i<=Math.floor((x+r)/5);i++)
      for(let j=Math.floor((z-r)/5);j<=Math.floor((z+r)/5);j++)occupied.add(i+','+j);
  }
  function parked(x,z){
    return course.scenery.parking.some(ring=>{
      let inside=false;
      for(let i=0,j=ring.length-1;i<ring.length;j=i++){
        const [a,b]=ring[i],[c,d]=ring[j];
        if((b>z)!==(d>z) && x<(c-a)*(z-b)/(d-b)+a)inside=!inside;
      }
      return inside;
    });
  }
  for(let x=bounds[0]-95;x<bounds[1]+95;x+=10){
    for(let z=bounds[2]-95;z<bounds[3]+95;z+=10){
      const a=x+random()*8,b=z+random()*8;
      if(!course.wood(a,b)||water(a,b)||occupied.has(Math.floor(a/5)+','+Math.floor(b/5))||
          parked(a,b)||(nearRoad(a,b)?.d??Infinity)<10)continue;
      spots.push([a,groundHeight(a,b),b,8+random()*7]);
    }
  }
};
/* Camera for the mapped southern footpath looking across Lac de Bethmale. */
window.createLakeView = function({THREE, course, groundHeight, camera, rig, onPause}) {
  const control=document.getElementById('visitShore');
  const dialog=document.getElementById('lakeView');
  const path=course.scenery?.lanes.find(([id])=>id===298757729)?.[2];
  if(!path?.length || !course.lake?.length)return null;
  const [x,z]=path.reduce((a,b)=>a[1]>b[1]?a:b);
  const surface=course.lakeHeight+.2;
  const eye=new THREE.Vector3(x, Math.max(groundHeight(x,z),surface)+1.65, z);
  const target=new THREE.Vector3();
  // Aim towards the far end of the lake from this point on the southern path.
  const far=course.lake.reduce((a,b)=>Math.hypot(a[0]-x,a[1]-z)>Math.hypot(b[0]-x,b[1]-z)?a:b);
  target.set(far[0],surface+3,far[1]);
  let previousRig=true;
  control.onclick=()=>{
    if(control.hidden || dialog.open)return;
    previousRig=rig.visible;
    rig.visible=false;
    onPause(true);
    dialog.showModal();
  };
  document.getElementById('returnFromLake').onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>{
    rig.visible=previousRig;
    onPause(false);
    control.focus({preventScroll:true});
  });
  return {
    update(nearby){
      control.hidden=!nearby;
      if(!dialog.open)return;
      camera.position.copy(eye);
      camera.lookAt(target);
    },
    get active(){return dialog.open;}
  };
};

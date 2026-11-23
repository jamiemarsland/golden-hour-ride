/* Physical dimensions in metres. Models face +Z and stand on the XZ plane.
   Merge rigid coloured parts so details do not add a draw call apiece. */
window.createRoadModels=function(THREE){
  const {mergeGeometries}=window.RideThree;
  const sphere=new THREE.SphereGeometry(.5,14,10),box=new THREE.BoxGeometry();
  const cylinder=new THREE.CylinderGeometry(.5,.5,1,10);
  const wheelRubber=new THREE.LatheGeometry([[.205,-.103],[.276,-.103],[.313,-.088],[.325,-.066],[.326,.066],[.313,.088],[.276,.103],[.205,.103]].map(([x,y])=>new THREE.Vector2(x,y)),36);
  const rimFace=new THREE.CylinderGeometry(.5,.5,1,32);
  const rubber=0x22252a,alloy=0xb5bdc2,black=0x293039;
  const paint=new THREE.MeshStandardMaterial({vertexColors:true,metalness:.28,roughness:.32});
  const glass=new THREE.MeshStandardMaterial({vertexColors:true,metalness:.34,roughness:.13,transparent:true,opacity:.67,depthWrite:false});
  const matte=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.78});
  const up=new THREE.Vector3(0,1,0);
  function builder(material=matte){
    const parts=[];
    function put(geo,color,pos=[0,0,0],scale=[1,1,1],rotation){
      const piece=geo.index?geo.toNonIndexed():geo.clone();
      piece.deleteAttribute('uv');
      const q=rotation?.isQuaternion?rotation:new THREE.Quaternion().setFromEuler(new THREE.Euler(...(rotation||[0,0,0])));
      piece.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...pos),q,new THREE.Vector3(...scale)));
      const rgb=new THREE.Color(color),colors=new Float32Array(piece.attributes.position.count*3);
      for(let i=0;i<colors.length;i+=3)rgb.toArray(colors,i);
      piece.setAttribute('color',new THREE.BufferAttribute(colors,3));parts.push(piece);
    }
    function tube(a,b,width,color,elliptical=false,depth=width){
      const aa=new THREE.Vector3(...a),bb=new THREE.Vector3(...b),d=bb.clone().sub(aa);
      const l=d.length();if(!l)return;
      put(elliptical?sphere:cylinder,color,aa.lerp(bb,.5).toArray(),[width,l*(elliptical?1.14:1),depth],new THREE.Quaternion().setFromUnitVectors(up,d.normalize()));
    }
    function line(points,r,color){for(let i=1;i<points.length;i++)tube(points[i-1],points[i],r,color);}
    function loft(rings,color){
      const vertices=[],faces=[],n=rings[0].length;
      for(const ring of rings)for(const v of ring)vertices.push(...v);
      for(let i=1;i<rings.length;i++)for(let j=0;j<n;j++){
        const a=(i-1)*n+j,b=(i-1)*n+(j+1)%n;faces.push(a,b,a+n,b,b+n,a+n);
      }
      const end=(rings.length-1)*n;
      for(let j=1;j<n-1;j++)faces.push(0,j+1,j,end,end+j,end+j+1);
      const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
      geo.setIndex(faces);geo.computeVertexNormals();put(geo,color);geo.dispose();
    }
    return {put,tube,line,loft,finish(){
      const geo=mergeGeometries(parts);parts.forEach(p=>p.dispose());
      const mesh=new THREE.Mesh(geo,material);mesh.castShadow=true;mesh.receiveShadow=true;return mesh;
    }};
  }
  const carCache=new Map();
  function car(color,variant=0){
    const key=color+'-'+variant,g=new THREE.Group();
    if(carCache.has(key)){for(const mesh of carCache.get(key))g.add(mesh.clone());return {g};}
    const body=builder(paint),trim=builder(),windows=builder(glass),inside=builder();
    const wheelZ=variant===1?1.36:1.25,tail=variant===0?-1.96:-2.20,nose=variant===2?2.18:2.09;
    const profile=[[tail,.63,.74],[tail+.12,.82,.89],[-1.5,.90,.93],[-.7,.91,.94],[.4,.91,.93],[1,.90,.88],[1.53,.88,.82],[nose-.13,.84,.74],[nose,.66,.63]];
    function sample(z,k){
      const i=profile.findIndex(p=>p[0]>=z);
      if(i<=0)return profile[i<0?profile.length-1:0][k];
      const a=profile[i-1],b=profile[i];return THREE.MathUtils.lerp(a[k],b[k],(z-a[0])/(b[0]-a[0]));
    }
    const stations=new Set(profile.map(p=>p[0]));
    for(const z of [-wheelZ,wheelZ])for(let i=0;i<=14;i++)stations.add(z-Math.cos(i*Math.PI/14)*.39);
    body.loft([...stations].sort((a,b)=>a-b).map(z=>{
      const w=sample(z,1),top=sample(z,2),dz=Math.min(Math.abs(z-wheelZ),Math.abs(z+wheelZ));
      const sill=dz<=.39001?.32+Math.sqrt(Math.max(0,.39**2-dz**2)):.29;
      return [[-w*.84,sill,z],[w*.84,sill,z],[w,sill+.028,z],[w,top-.11,z],[w*.94,top-.025,z],[w*.73,top,z],[-w*.73,top,z],[-w*.94,top-.025,z],[-w,top-.11,z],[-w,sill+.028,z]];
    }),color);
    const roof=variant===1?1.51:variant===2?1.41:1.47;
    const cabin=[[variant===2?-1.44:variant===1?-1.96:-1.73,.74,.935,.71,.96],[variant===2?-.82:variant===1?-1.66:-1.37,.80,.925,.63,roof-.07],[-.64,.815,.926,.635,roof],[-.25,.815,.925,.64,roof+.012],[.30,.804,.916,.627,roof-.04],[.99,.77,.868,.735,.903]];
    windows.loft(cabin.map(([z,w,y,r,h])=>[[-w,y,z],[w,y,z],[r,h,z],[-r,h,z]]),0x40535e);
    body.loft(cabin.slice(1,-1).map(([z,, ,r,h])=>[[-r,h-.025,z],[r,h-.025,z],[r*.95,h+.018,z],[0,h+.041,z],[-r*.95,h+.018,z]]),color);
    inside.put(box,0x33393d,[0,.90,.65],[1.44,.10,.4]);
    inside.put(box,0x363b40,[0,.88,-1.09],[1.30,.13,.39]);
    for(const side of [-1,1]){
      for(const z of [-1.02,-.05]){
        inside.put(sphere,0x44494c,[side*.385,1.015,z],[.49,.46,.155],[-.15,0,0]);
        inside.put(sphere,0x414749,[side*.385,1.255,z-.063],[.234,.14,.132]);
      }
    }
    inside.put(new THREE.TorusGeometry(.15,.017,6,20),black,[.39,1.085,.44],[1,1,1],[-.45,0,0]);
    inside.put(sphere,0x817366,[.385,1.272,.008],[.174,.209,.173]);
    inside.put(sphere,0x47413b,[.385,1.325,-.004],[.18,.132,.178]);
    inside.put(sphere,0x546269,[.385,1.067,-.001],[.36,.35,.22]);
    trim.line([[-.62,.938,.88],[-.31,.953,.841],[-.12,.959,.828]],.017,black);
    trim.line([[.03,.953,.858],[.26,.957,.831],[.58,.951,.795]],.017,black);
    for(const side of [-1,1]){
      const edge=(p,top)=>[side*(top?p[3]:p[1]),top?p[4]:p[2],p[0]];
      for(const indices of [[0,1],[4,5]])body.tube(edge(cabin[indices[0]],indices[0]===4),edge(cabin[indices[1]],indices[1]===1),.066,color);
      trim.tube([side*.812,.926,-.34],[side*.64,roof+.01,-.43],.065,0x262c31);
      trim.line(cabin.map(p=>edge(p,false)),.027,alloy);
      for(const zz of [-.76,.29])trim.put(sphere,alloy,[side*.901,.82,zz],[.027,.031,.15]);
      trim.line([[side*.90,.78,-.35],[side*.907,.54,-.32],[side*.90,.355,-.32]],.012,0x52575a);
      body.tube([side*.81,.98,.63],[side*.955,1.015,.57],.047,black);
      body.put(sphere,color,[side*.983,1.035,.56],[.19,.125,.23]);
      for(const z of [-wheelZ,wheelZ]){
        const wheel=[side*.815,.327,z],turn=[0,0,Math.PI/2];
        trim.put(wheelRubber,rubber,wheel,[1,1,1],turn);
        trim.put(rimFace,0x42484e,[side*.912,.327,z],[.425,.017,.425],turn);
        trim.put(new THREE.TorusGeometry(.208,.009,5,32),alloy,[side*.921,.327,z],[1,1,1],[0,Math.PI/2,0]);
        for(let i=0;i<5;i++){
          const a=i*2*Math.PI/5,branch=[side*.929,.327+Math.cos(a)*.105,z+Math.sin(a)*.105];
          trim.tube([side*.932,.327,z],branch,.039,alloy);
          for(const split of [-.13,.13])trim.tube(branch,[side*.929,.327+Math.cos(a+split)*.204,z+Math.sin(a+split)*.204],.020,alloy);
        }
        trim.put(sphere,0xc3cbd0,[side*.942,.327,z],[.033,.12,.12]);
      }
      // Wrap the light clusters around the corner into the wings.
      const lamp=(z,y,front)=>{
        const contour=[[.465,y+.012,0],[.726,y+.042,.042],[.815,y+.074,.16],[.809,y+.009,.175],[.731,y-.037,.054],[.49,y-.042,0]];
        const lens=new THREE.BufferGeometry(),vertices=contour.flatMap(([x,h,d])=>[side*x,h,z-front*d]);
        lens.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
        const faces=[0,1,2,0,2,3,0,3,4,0,4,5];
        if(side*front>0)faces.reverse();lens.setIndex(faces);lens.computeVertexNormals();
        body.put(lens,front>0?0xc4cbca:0xa32329);lens.dispose();
        trim.line(contour.slice(0,3).map(([x,h,d])=>[side*x,h,z-front*d]),.012,front>0?0xfff3d8:0xfa6456);
      };
      lamp(nose+.007,.666,1);
      lamp(tail-.008,.75,-1);
      if(variant===1){
        body.tube([side*.57,roof+.06,-1.49],[side*.57,roof+.06,.20],.039,0x43494b);
        trim.line([[side*.754,.765,tail+.104],[side*.796,.857,tail+.15]],.064,0xa73532);
      }
      trim.line([[side*.48,.70,nose-.11],[side*.60,.801,nose-.52],[side*.62,.871,1.02]],.008,0x53616b);
      trim.line([[side*.90,.35,-.80],[side*.90,.35,.80]],.031,black);
    }
    const intake=[[nose-.010,.54,.455],[nose+.017,.51,.428],[nose+.029,.43,.39]];
    for(const [z,w,y] of intake)trim.line([[-w,y,z],[0,y-.013,z+.017],[w,y,z]],.032,black);
    trim.line([[-.48,.675,nose+.018],[0,.653,nose+.045],[.48,.675,nose+.018]],.034,black);
    trim.line([[-.48,.69,nose+.016],[0,.666,nose+.049],[.48,.69,nose+.016]],.015,alloy);
    trim.put(sphere,alloy,[0,.663,nose+.054],[.086,.058,.017]);
    for(const z of [nose+.015,tail-.024])trim.put(box,z>0?0xe9e9d5:0xe9ba5b,[0,.56,z],[.46,.114,.023]);
    g.add(body.finish(),inside.finish(),trim.finish(),windows.finish());carCache.set(key,g.children.slice());return {g};
  }
  const personCache=new Map();
  const kits=[0xcb573e,0x408b92,0xab9050,0x5c78a5],skins=[0xce9570,0x855940,0xe4b394,0xa77354];
  const tireRing=new THREE.TorusGeometry(.325,.022,7,40),rimRing=new THREE.TorusGeometry(.298,.014,6,40);
  const riderHead=(part,x,y,z,id,cycling)=>{
    const skin=skins[id];
    part.put(sphere,skin,[x,y,z],[.165,.219,.181]);
    part.put(sphere,skin,[x,y-.013,z+.088],[.043,.047,.047]);
    for(const side of [-1,1])part.put(sphere,skin,[x+side*.08,y-.007,z],[.033,.054,.033]);
    for(const side of [-1,1]){
      part.put(sphere,0x443b32,[x+side*.035,y+.017,z+.079],[.021,.010,.013]);
      part.put(sphere,0x674d41,[x+side*.034,y+.031,z+.080],[.031,.008,.009]);
    }
    part.put(sphere,0x916a57,[x,y-.044,z+.078],[.044,.009,.009]);
    if(cycling){
      part.put(sphere,[0xf0e9d9,0xe4bb50,0xdbe9e2,0x354358][id],[x,y+.082,z-.013],[.211,.143,.258],[-.1,0,0]);
      for(const dx of [-.049,0,.049])part.put(sphere,black,[x+dx,y+.135,z],[.015,.021,.126]);
      part.put(sphere,0x34444b,[x,y+.013,z+.069],[.173,.043,.062]);
      for(const side of [-1,1])part.line([[x+side*.09,y+.052,z+.045],[x+side*.061,y-.083,z+.025],[x+side*.09,y+.048,z-.064]],.011,black);
    }else{
      part.put(sphere,[0x5d4435,0x302b29,0x705643,0x443a34][id],[x,y+.049,z-.021],[.176,.151,.181]);
      if(id%2)part.put(sphere,0x382f29,[x,y-.021,z-.106],[.095,.15,.098]);
    }
  };
  function wheel(){
    const w=builder(),spin=[0,Math.PI/2,0];
    w.put(tireRing,rubber,[0,0,0],[1,1,1],spin);w.put(rimRing,0x79848b,[0,0,0],[1,1,1],spin);
    for(let i=0;i<16;i++){
      const a=i*Math.PI/8;
      w.tube([i%2?.036:-.036,0,0],[0,Math.sin(a)*.295,Math.cos(a)*.295],.0075,0xa9b0b2);
    }
    w.put(cylinder,alloy,[0,0,0],[.047,.105,.047],[0,0,Math.PI/2]);return w.finish();
  }
  function bicycle(p,id){
    const frame=[0x889fa9,0xac6445,0x668c77,0x9e9ba5][id],rear=[0,.347,-.50],front=[0,.347,.52],bb=[0,.33,-.044],seat=[0,.818,-.184],head=[0,.828,.325];
    for(const [a,b,diameter] of [[bb,head,.059],[seat,head,.042],[bb,seat,.049],[seat,[0,.912,-.209],.027],[head,[0,.739,.344],.054]])p.tube(a,b,diameter,frame);
    for(const side of [-1,1]){
      const r=[side*.066,rear[1],rear[2]],f=[side*.049,front[1],front[2]];
      p.tube(bb,r,.026,frame);p.tube(seat,r,.021,frame);p.tube([side*.022,.757,.344],f,.029,frame);
      p.line([[side*.019,.852,.333],[side*.20,.879,.389],[side*.205,.873,.472],[side*.205,.81,.49],[side*.205,.778,.465],[side*.205,.78,.412]],.025,black);
      p.put(sphere,black,[side*.2,.894,.447],[.047,.08,.073]);
    }
    p.put(sphere,black,[0,.92,-.186],[.151,.062,.247]);
    p.put(cylinder,0x394148,[.069,.33,-.044],[.18,.018,.18],[0,0,Math.PI/2]);
    p.line([[.077,.413,-.044],[.076,.376,-.50],[.077,.318,-.54],[.077,.244,-.045]],.009,0x8b9291);
    p.tube([0,.477,.083],[0,.637,.189],.066,0xedeee4);p.tube([0,.637,.189],[0,.666,.208],.043,black);
  }
  function personModel(id,cycling){
    id%=4;
    const key=id+(cycling?'bike':'walk');
    if(!personCache.has(key)){
      const template=new THREE.Group(),p=builder(),skin=skins[id],kit=kits[id];
      const hipY=cycling?.929:.902,hipZ=cycling?-.18:0;
      function garment(rows,color){
        const rings=rows.map(([y,z,width,depth])=>Array.from({length:16},(_,i)=>{
          const a=i*2*Math.PI/16;return [Math.cos(a)*width,y,z-Math.sin(a)*depth];
        }));
        p.loft(rings,color);
      }
      if(cycling){
        bicycle(p,id);
        garment([[.985,-.147,.132,.104],[1.029,-.136,.145,.106],[1.13,-.050,.157,.129],[1.24,.064,.176,.131],[1.29,.110,.169,.110],[1.327,.134,.091,.086]],kit);
        garment([[1.108,-.07,.157,.13],[1.125,-.054,.160,.132]],0xe3d6ae);
        p.line([[0,1.326,.207],[0,1.238,.195],[0,1.128,.084],[0,1.01,-.046]],.009,black);
        p.put(sphere,0x303642,[0,.965,-.168],[.298,.234,.255]);
        p.tube([0,1.30,.137],[0,1.398,.215],.115,skin);
        riderHead(p,0,1.455,.224,id,true);
        for(const side of [-1,1]){
          const shoulder=[side*.157,1.274,.118],elbow=[side*.181,1.075,.224],hand=[side*.199,.907,.448];
          p.tube(shoulder,elbow,.094,skin,true);p.tube(shoulder,[side*.174,1.181,.172],.116,kit,true);
          p.tube(elbow,hand,.074,skin,true);p.put(sphere,black,hand,[.067,.063,.091]);
        }
        const w=wheel();
        for(const z of [-.50,.52]){const m=w.clone();m.name='wheel';m.position.set(0,.347,z);template.add(m);}
      }else{
        garment([[.941,0,.149,.109],[1.019,0,.153,.112],[1.188,.011,.145,.109],[1.326,.014,.181,.122],[1.382,.009,.171,.104],[1.422,0,.086,.082]],kit);
        p.line([[0,1.42,.082],[0,1.32,.137],[0,1.18,.122],[0,.982,.112]],.009,0x444c4d);
        p.put(sphere,0x424751,[0,.923,0],[.30,.22,.226]);
        p.tube([0,1.395,.012],[0,1.482,.018],.124,skin);
        riderHead(p,0,1.562,.018,id,false);
        if(id%2===0){p.put(sphere,0x475447,[0,1.222,-.135],[.266,.31,.14]);for(const side of [-1,1])p.line([[side*.091,1.405,-.064],[side*.112,1.397,.073],[side*.12,1.12,.087]],.025,0x424a41);}
      }
      template.add(p.finish());
      for(const side of [-1,1]){
        const suffix=side===1?'R':'L',thigh=builder(),shin=builder(),foot=builder();
        thigh.tube([0,0,0],[0,-.365,0],.141,cycling?0x303642:0x505258,true,.155);
        if(cycling)thigh.tube([0,-.295,0],[0,-.405,0],.103,skin,true);
        shin.tube([0,0,0],[0,-.405,0],cycling?.089:.112,cycling?skin:0x505258,true,.101);
        if(cycling)shin.tube([0,-.30,0],[0,-.411,0],.079,0xe3e3d7);
        foot.put(sphere,cycling?0x36404a:0x594d41,[0,0,.054],[.10,.085,.217]);
        if(cycling){
          foot.put(box,black,[0,-.041,.059],[.091,.022,.088]);
          const crank=builder();crank.tube([0,0,0],[0,.158,0],.026,alloy);
          const m=crank.finish();m.name='crank'+suffix;m.position.set(side*.088,.347,-.044);template.add(m);
        }
        for(const [b,n] of [[thigh,'thigh'],[shin,'shin'],[foot,'shoe']]){const m=b.finish();m.name=n+suffix;template.add(m);}
        if(!cycling){
          const arm=builder();arm.tube([0,0,0],[side*.017,-.235,.005],.10,kit,true);arm.tube([side*.017,-.235,.005],[0,-.438,.064],.077,skin,true);
          arm.put(sphere,skin,[0,-.46,.072],[.081,.105,.061]);const m=arm.finish();m.name='arm'+suffix;m.position.set(side*.157,1.373,0);template.add(m);
        }
      }
      personCache.set(key,{template,hipY,hipZ});
    }
    const {template,hipY,hipZ}=personCache.get(key),g=template.clone(true);
    const wheels=g.children.filter(m=>m.name==='wheel');
    const legs=[-1,1].map(side=>{const s=side===1?'R':'L';return {side,thigh:g.getObjectByName('thigh'+s),shin:g.getObjectByName('shin'+s),shoe:g.getObjectByName('shoe'+s),arm:g.getObjectByName('arm'+s),crank:g.getObjectByName('crank'+s)};});
    function animate(phase,travel){
      for(const w of wheels)w.rotation.x=travel/.347;
      for(const l of legs){
        const a=phase+(l.side===1?0:Math.PI),x=l.side*(cycling?.103:.085);
        const ankleY=cycling?.389+Math.cos(a)*.158:.046+Math.max(0,Math.cos(a))*.095;
        const ankleZ=cycling?-.103+Math.sin(a)*.158:Math.sin(a)*.250;
        const dy=ankleY-hipY,dz=ankleZ-hipZ,reach=Math.hypot(dy,dz);
        const mid=Math.sqrt(Math.max(.0001,.44**2-reach*reach/4));
        const ky=hipY+dy*.5+dz/reach*mid,kz=hipZ+dz*.5-dy/reach*mid;
        l.thigh.position.set(x,hipY,hipZ);l.thigh.rotation.x=-Math.atan2(kz-hipZ,hipY-ky);l.thigh.scale.y=Math.hypot(ky-hipY,kz-hipZ)/.396;
        l.shin.position.set(x,ky,kz);l.shin.rotation.x=-Math.atan2(ankleZ-kz,ky-ankleY);l.shin.scale.y=Math.hypot(ankleY-ky,ankleZ-kz)/.407;
        l.shoe.position.set(x,ankleY,ankleZ);l.shoe.rotation.x=cycling?-.13*Math.cos(a):-.20*Math.cos(a);
        if(l.crank)l.crank.rotation.x=a;
        if(l.arm)l.arm.rotation.x=.42*Math.sin(a);
      }
    }
    animate(0,0);return {g,animate};
  }
  return {car,bike:id=>personModel(id,true),walker:id=>personModel(id,false)};
};

/* Coordinates in the course's local British National Grid frame, from OSM
   nodes in the same extract as the road and independently of the EA canopy.
   Each pair is ordered clockwise. The selected Broomfield section ends
   beside Broomfield Hill Car Park, before the flatter continuation towards Dark Hill.
   OSM ways 838833357, 209209230/4005274/901686878/901686879, 157064500. */
const richmondHillSections = [
  {id:'broomfield-road', name:'Broomfield Hill', a:[1266.6,96.5], b:[512.9,527.6]}, // 21090177 → 30643573; paved alignment
  {id:'dark', name:'Dark Hill', a:[-17.1,1196.2], b:[-679.4,1799.9]}, // 21090172 → 21090171
  {id:'sawyers', name:'Sawyer’s Hill', a:[-1360.2,-1297.4], b:[551.2,-1579.9]} // 30553745 → 21090182
];

window.createRichmondSegments=function({sampleDistance,length,initialReverse,panel,recordingId,record}){
  const wrap=s=>(s%length+length)%length;
  function clockwiseDistance([x,z]){
    const distance=sampleDistance(x,z);
    return initialReverse?wrap(-distance):distance;
  }
  const directions=[false,true].map(reverse=>richmondHillSections.map(section=>{
    const a=clockwiseDistance(section.a),b=clockwiseDistance(section.b);
    return {name:section.name,id:section.id,reverse,start:reverse?wrap(-b):a,
      metres:wrap(b-a),key:'ride-richmond-section:'+section.id+':'+(reverse?'acw':'cw')};
  }));
  const title=document.createElement('strong'),detail=document.createElement('div');
  title.setAttribute('role','status');panel.append(title,detail);
  const kilometres=m=>(m/1000).toFixed(2)+' km';
  const time=seconds=>{const tenths=Math.floor(seconds*10);return Math.floor(tenths/600)+':'+String(Math.floor(tenths/10)%60).padStart(2,'0')+'.'+tenths%10;};
  const bestFor=key=>{try{return Number(localStorage.getItem(key))||null;}catch{return null;}};
  let active=null,lastEnd=null,lastPaint=-Infinity,resultSeconds=0;
  function reset(){
    active=null;lastEnd=null;lastPaint=-Infinity;resultSeconds=0;panel.hidden=true;
  }
  function show(heading,line){
    if(title.textContent!==heading)title.textContent=heading;
    if(detail.textContent!==line)detail.textContent=line;
    panel.hidden=false;
  }
  function finish(){
    const {section,seconds,startedRide}=active;
    const previous=bestFor(section.key),pb=!previous||seconds<previous;
    if(pb){try{localStorage.setItem(section.key,String(seconds));}catch{}}
    if(startedRide && startedRide===recordingId()){
      record({id:section.id,name:section.name,reverse:section.reverse,metres:section.metres,seconds});
    }
    show(section.name+' · '+(pb?'Personal best':'Finished'),time(seconds)+' · '+kilometres(section.metres));
    active=null;resultSeconds=7;
  }
  function advance(from,metres,seconds,reverse){
    if(lastEnd!==null && Math.min(wrap(from-lastEnd),wrap(lastEnd-from))>0.25)reset();
    lastEnd=wrap(from+metres);
    if(metres<=0||seconds<=0)return;
    const sections=directions[Number(reverse)];
    let travelled=metres;
    if(!active){
      const section=sections.find(item=>wrap(item.start-from)<metres);
      if(section){
        travelled-=wrap(section.start-from);
        active={section,covered:0,seconds:0,startedRide:recordingId(),best:bestFor(section.key)};
        resultSeconds=0;lastPaint=-Infinity;
      }
    }
    if(active){
      const remaining=active.section.metres-active.covered,used=Math.min(remaining,travelled);
      active.covered+=used;active.seconds+=seconds*used/metres;
      if(used>=remaining){finish();return;}
      if(performance.now()-lastPaint>=200){
        lastPaint=performance.now();
        show(active.section.name+' · '+(reverse?'Anticlockwise':'Clockwise'),
          time(active.seconds)+' · '+Math.ceil((remaining-used)/10)*10+' m left'+(active.best?' · Best '+time(active.best):''));
      }
    }else if(resultSeconds>0){
      resultSeconds-=seconds;
      if(resultSeconds<=0)panel.hidden=true;
    }else{
      const next=sections.find(item=>wrap(item.start-lastEnd)<=100);
      if(next)show(next.name+' ahead',Math.ceil(wrap(next.start-lastEnd)/10)*10+' m to start · '+kilometres(next.metres));
      else panel.hidden=true;
    }
  }
  return {advance,reset};
};

(() => {
/* Local ride recording. Each ride has its own IndexedDB record so long histories
   and concurrent tabs do not overwrite one another. */
const byId = id => document.getElementById(id);
const names = { core:'Col de la Core', valley: 'Golden Valley', leckhampton: 'Leckhampton Hill', richmond: 'Richmond Park' };
const clock = seconds => {
  const s = Math.max(0, Math.floor(seconds));
  return (s >= 3600 ? Math.floor(s / 3600) + ':' + String(Math.floor(s / 60) % 60).padStart(2,'0') : Math.floor(s / 60)) + ':' + String(s % 60).padStart(2,'0');
};
function element(tag, text, parent) {
  const el = document.createElement(tag);
  if (text != null) el.textContent = text;
  if (parent) parent.append(el);
  return el;
}
function action(parent, text, fn) {
  const button = element('button', text, parent);
  button.type = 'button'; button.onclick = fn;
  return button;
}
function read(store, key, fallback) {
  try { return JSON.parse(store.getItem(key)) ?? fallback; } catch { return fallback; }
}
const database = new Promise((resolve,reject) => {
  const request = indexedDB.open('golden-hour-training',1);
  request.onupgradeneeded = () => request.result.createObjectStore('rides',{keyPath:'id'});
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});
database.catch(() => {});
async function rideRecord(method,value) {
  const db=await database;
  return new Promise((ok,no)=>{
    const tx=db.transaction('rides',method==='put'?'readwrite':'readonly');
    const request=tx.objectStore('rides')[method](value);
    tx.oncomplete=()=>ok(request.result);
    tx.onabort=tx.onerror=()=>no(tx.error);
  });
}
// Keep only the fields used by the list. A multi-hour ride's individual
// power samples are needed only when its review is opened.
async function historyEntries() {
  const db=await database,entries=[];
  return new Promise((ok,no)=>{
    const tx=db.transaction('rides','readonly');
    const request=tx.objectStore('rides').openCursor();
    request.onsuccess=()=>{
      const cursor=request.result;
      if(!cursor)return;
      const {id,name,date,s,m,legacySummary}=cursor.value;
      entries.push({id:legacySummary?null:id,name,date,s,m});
      cursor.continue();
    };
    tx.oncomplete=()=>ok(entries);
    tx.onabort=tx.onerror=()=>no(tx.error);
  });
}
const presets = [
  {name:'3 × 8 minutes', reps:3, effort:8, watts:250, rest:4, easy:120, warm:5, cool:5},
  {name:'5 × 5 minutes', reps:5, effort:5, watts:280, rest:3, easy:120, warm:5, cool:5}
];
function steps(p) {
  if (!p) return [];
  const list=[];
  const add=(label,min,value)=>{
    const watts=p.unit==='ftp'?Math.min(2000,Math.round(value*p.ftp/100)):value;
    if(min>0)list.push({label,end:(list.at(-1)?.end||0)+min*60,watts});
  };
  add('Warm-up',p.warm,p.easy);
  for(let i=1;i<=p.reps;i++){
    add('Effort '+i+' of '+p.reps,p.effort,p.watts);
    if(i<p.reps) add('Recovery '+i,p.rest,p.easy);
  }
  add('Cool-down',p.cool,p.easy);
  return list;
}
function plot(canvas, series, height, scaleMax, color, domain) {
  const ctx=canvas.getContext('2d');
  ctx.strokeStyle=color;ctx.lineWidth=2;ctx.beginPath();
  let pen=false;
  for(const [t,w] of series){
    if(w==null){pen=false;continue;}
    const x=t/domain*canvas.width,y=height-4-w/scaleMax*(height-9);
    if(pen) ctx.lineTo(x,y); else ctx.moveTo(x,y);
    pen=true;
  }
  ctx.stroke();
}
window.createRideTraining = function training({course,reverse,length,heightAt,state,drawElevation,openRoad=false}) {
  const panel=byId('studio'), body=byId('studioBody'), status=byId('sessionStatus');
  const ghostKey=()=> 'ride-lap:'+course+(reverse?'-reverse':'-forward');
  let ride=read(sessionStorage,'ride-draft',null), paused=Boolean(ride), saving=false;
  let graphicsPaused=false,sightseeing=false,switching=false, samples=[], trainerSeen=Boolean(ride?.hadTrainer), telemetryAt=-Infinity;
  let previousTime=performance.now(), lastCheckpoint=0, lastUi=0;
  const selectedIndex=()=>ride?.plan.findIndex(step=>ride.cursor<step.end)??-1;
  const selected=()=>ride?.plan[selectedIndex()];
  const minIntensity=50,maxIntensity=125;
  const intensity=()=>ride?.intensity??100;
  const target=block=>Math.min(2000,Math.round(block.watts*intensity()/100));
  function setIntensity(value){
    if(!selected()||saving)return;
    ride.intensity=Math.max(minIntensity,Math.min(maxIntensity,value));
    renderedStep=null;checkpoint();draw();
  }
  function initTimeline(){
    if(!ride || ride.cursor!==undefined)return;
    ride.cursor=ride.s;
    ride.visits=[];
    for(let i=0;i<ride.plan.length;i++){
      const start=i?ride.plan[i-1].end:0,stop=Math.min(ride.s,ride.plan[i].end);
      if(stop>start)ride.visits.push({index:i,start,end:stop,complete:stop===ride.plan[i].end});
    }
  }
  initTimeline();
  let renderedStep=null;
  function jump(index){
    if(!ride||saving||index<0||index>ride.plan.length)return;
    ride.cursor=index?ride.plan[index-1].end:0;
    previousTime=performance.now();ride.newVisit=true;checkpoint();draw();
  }
  const currentSegment=()=>ride?.segments.at(-1);
  const segment=()=>({course,reverse,m:0});
  if(ride && (currentSegment().course!==course || currentSegment().reverse!==reverse)) ride.segments.push(segment());
  function checkpoint(){
    if(!ride)return;
    try {sessionStorage.setItem('ride-draft',JSON.stringify(ride));}
    catch {byId('sessionNotice').textContent='Recovery storage is full. Finish & save before closing.';}
  }
  let panelVersion=0;
  function show(title){
    panelVersion++;
    body.replaceChildren();byId('studioTitle').textContent=title;
    if(!panel.open)panel.showModal();
    return panelVersion;
  }
  function start(plan,savedSteps){
    if(ride)return;
    ride={hadTrainer:trainerSeen,id:crypto.randomUUID(),date:new Date().toISOString(),name:plan?.name||'Free ride',plan:savedSteps?savedSteps.map(step=>({...step})):steps(plan),segments:[segment()],s:0,m:0,ascent:0,energy:0,measured:0,series:[],stats:[],laps:[]};
    initTimeline();renderedStep=null;paused=false;previousTime=performance.now();resetLap();checkpoint();panel.close();draw();
  }
  function plans(){
    const saved=[];
    for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k.startsWith('ride-plan:')){const p=read(localStorage,k,null);if(p)saved.push(p);}}
    return [...presets,...saved];
  }
  function library(){
    show('Workouts');
    const free=action(body,'Start free ride',()=>start(null));free.className='primary';
    element('h3','Interval workouts',body);
    for(const p of plans()){
      const row=element('div',null,body);row.className='planRow';
      const info=element('div',null,row);element('strong',p.name,info);
      const power=p.unit==='ftp'?p.watts+'% FTP ('+Math.min(2000,Math.round(p.watts*p.ftp/100))+' W)':p.watts+' W';
      element('small',(p.id?'Custom · ':'')+p.reps+' × '+p.effort+' min at '+power+' · '+clock(steps(p).at(-1).end)+' total',info);
      action(row,'Edit',()=>builder(p));action(row,'Ride',()=>start(p));
    }
    action(body,'Build a workout',()=>builder({...presets[0],name:'My intervals'}));
  }
  function builder(p){
    show('Workout builder');
    const form=element('form',null,body);const fields={};
    const specs=[['name','Workout name'],['reps','Repeats',1,50,1],['effort','Effort (minutes)',0.1,180,0.1],['watts','Effort target (W)',1,2000,1],['rest','Recovery (minutes)',0,120,0.1],['easy','Easy target (W)',0,2000,1],['warm','Warm-up (minutes)',0,120,0.1],['cool','Cool-down (minutes)',0,120,0.1]];
    for(const [k,title,min,max,step] of specs){
      const label=element('label',title,form),input=element('input',null,label);fields[k]=input;
      if(k!=='name'){input.type='number';Object.assign(input,{min,max,step});}else input.maxLength=60;
      input.value=p[k];input.required=true;
    }
    const targetMode=element('label','Power targets',form),mode=element('select',null,targetMode);
    for(const [value,text] of [['watts','Watts'],['ftp','Percentage of FTP']]){
      const opt=element('option',text,mode);opt.value=value;
    }
    mode.value=p.unit||'watts';
    const ftpLabel=element('label','Reference FTP (W)',form),ftp=element('input',null,ftpLabel);
    Object.assign(ftp,{type:'number',min:1,max:2000,step:1,placeholder:'Enter your threshold power'});
    ftp.value=p.ftp??read(localStorage,'ride-builder-ftp','');
    const preview=element('section',null,form);preview.className='builderPreview';
    const heading=element('strong','Workout preview',preview);
    const chart=element('div',null,preview);chart.className='builderChart';chart.setAttribute('aria-hidden','true');
    const detail=element('small',null,preview);
    function values(){
      const o={};
      for(const [key,input] of Object.entries(fields))o[key]=key==='name'?input.value.trim():Number(input.value);
      if(mode.value==='ftp'){o.unit='ftp';o.ftp=Number(ftp.value);}
      return o;
    }
    function showMode(convert){
      const relative=mode.value==='ftp',reference=Number(ftp.value);
      ftpLabel.hidden=!relative;ftp.disabled=!relative;ftp.required=relative;
      for(const [key,title] of [['watts','Effort target'],['easy','Easy target']]){
        const input=fields[key];input.previousSibling.textContent=title+(relative?' (% FTP)':' (W)');
        input.max=relative?300:2000;
        if(convert){
          let value=Number(input.value);
          if(reference>0)value=Math.round(relative?value*100/reference:value*reference/100);
          else value=relative?(key==='watts'?100:50):(key==='watts'?p.watts:p.easy);
          input.value=Math.min(Number(input.max),Math.max(Number(input.min),value));
        }
      }
    }
    function describe(){
      chart.replaceChildren();
      const inputs=Object.values(fields).filter(input=>input.type==='number');
      if(inputs.some(input=>!input.validity.valid)||(!ftp.disabled&&!ftp.validity.valid)){
        detail.textContent=mode.value==='ftp'&&!ftp.validity.valid?'Enter a reference FTP to see target watts.':'Enter valid durations and targets to preview the workout.';
        return;
      }
      const plan=steps(values()),peak=Math.max(1,...plan.map(block=>block.watts));
      let start=0;
      for(const block of plan){
        const bar=element('span',null,chart);
        bar.style.flexGrow=String(block.end-start);bar.style.height=(8+92*block.watts/peak)+'%';
        if(block.label.startsWith('Effort'))bar.className='effort';
        bar.title=block.label+' · '+clock(block.end-start)+' · '+block.watts+' W';start=block.end;
      }
      const targets=plan.map(b=>b.watts);
      heading.textContent='Workout preview · '+clock(start);
      detail.textContent=plan.length+' steps · '+Math.min(...targets)+'–'+Math.max(...targets)+' W';
    }
    showMode(false);describe();
    mode.onchange=()=>{showMode(true);describe();};
    form.addEventListener('input',describe);
    const submit=element('button','Save workout',form);submit.className='primary';
    if(p.id){
      const remove=action(form,'Delete workout',()=>{
        if(!confirm('Delete “'+p.name+'” from your workout library?'))return;
        try{localStorage.removeItem('ride-plan:'+p.id);library();}
        catch{remove.textContent='Could not delete · retry';}
      });
    }
    form.onsubmit=e=>{
      e.preventDefault();const o=values();
      if(!o.name){fields.name.focus();return;}
      o.id=p.id||crypto.randomUUID();
      try{localStorage.setItem('ride-plan:'+o.id,JSON.stringify(o));}
      catch{submit.textContent='Could not save · retry';return;}
      if(o.unit==='ftp'){try{localStorage.setItem('ride-builder-ftp',JSON.stringify(o.ftp));}catch{}}
      library();
    };
  }

  let cadenceReadings={},cadenceSeen=false;
  function recordCadence(rpm,source){
    if(!Number.isFinite(rpm)||rpm<0)return;
    cadenceReadings[source]={rpm,at:performance.now()};cadenceSeen=true;
  }
  function cadence(){
    const now=performance.now();
    for(const source of ['bike','crank']){
      const sample=cadenceReadings[source];
      if(sample && now-sample.at<=3000)return sample.rpm;
    }
    return null;
  }
  function recordPower(w){
    if(!Number.isFinite(w))return;
    const now=performance.now();trainerSeen=true;if(ride)ride.hadTrainer=true;telemetryAt=now;
    samples=samples.filter(p=>now-p[0]<3000);samples.push([now,Math.max(0,w)]);
  }
  function power(){
    samples=samples.filter(p=>performance.now()-p[0]<=3000);
    if(performance.now()-telemetryAt<=3000 && samples.length) return Math.round(samples.reduce((s,p)=>s+p[1],0)/samples.length);
    return trainerSeen?null:Math.round(state.power);
  }
  function disconnected(){trainerSeen=true;if(ride)ride.hadTrainer=true;samples=[];telemetryAt=-Infinity;cadenceReadings={};}
  let lapKey=ghostKey();
  function loadGhost(){
    const trace=read(localStorage,lapKey,null);
    if(!Array.isArray(trace)||trace.length<2)return null;
    const finish=trace.at(-1);
    return Array.isArray(finish)&&Math.abs(finish[0]-length)<2?trace:null;
  }
  let ghost=loadGhost(), lap=null, gap=null;
  let ghostPosition=null;
  function resetLap(){lap=null;gap=null;ghostPosition=null;}
  function lapTick(oldPos,newPos,dt){
    if(newPos<oldPos){
      const total=length-oldPos+newPos, before=dt*(length-oldPos)/total;
      if(lap){
        lap.time+=before;lap.trace.push([length,lap.time]);
        ghost=lap.trace;try{localStorage.setItem(lapKey,JSON.stringify(ghost));}catch{}
        if(ride)ride.laps.push({course,reverse,s:lap.time});
      }
      lap={time:dt-before,trace:[[0,0]]};gap=null;
    }else if(lap)lap.time+=dt;
    else if(oldPos<2)lap={time:dt,trace:[[0,0]]};
    if(!lap)return;
    if(newPos-lap.trace.at(-1)[0]>=25)lap.trace.push([newPos,lap.time]);
    ghostPosition=null;
    if(!ghost || !byId('ghostToggle').checked)return;
    // Locate the previous rider at our elapsed time, independently of the time gap at our distance.
    if(lap.time<=ghost.at(-1)[1]){
      let low=0,high=ghost.length-1;
      while(high-low>1){const mid=(high+low)>>1;if(ghost[mid][1]<lap.time)low=mid;else high=mid;}
      const [x,t]=ghost[low],[y,u]=ghost[high];
      ghostPosition=x+(y-x)*Math.max(0,lap.time-t)/Math.max(.001,u-t);
    }
    let lo=0,hi=ghost.length-1;
    while(hi-lo>1){const mid=(hi+lo)>>1;if(ghost[mid][0]<newPos)lo=mid;else hi=mid;}
    const [a,ta]=ghost[lo],[b,tb]=ghost[hi];
    gap=ta+(tb-ta)*(newPos-a)/Math.max(0.01,b-a)-lap.time;
  }
  function tick(oldPos,metres,gain){
    const now=performance.now(),dt=Math.max(0,(now-previousTime)/1000);previousTime=now;
    if(!paused&&!switching&&!sightseeing&&!graphicsPaused&&!document.hidden){
      if(!openRoad)lapTick(oldPos,state.s,dt);
      if(ride){
        const w=power();
        let remaining=dt;
        while(remaining>0){
          const index=selectedIndex(),block=ride.plan[index];
          const d=block?Math.min(remaining,block.end-ride.cursor):remaining;
          if(block){
            let visit=ride.visits.at(-1);
            const watts=target(block);
            if(!visit||visit.index!==index||ride.newVisit||(visit.watts??block.watts)!==watts){
              visit={index,start:ride.s,end:ride.s,complete:false,watts};
              ride.visits.push(visit);ride.newVisit=false;
            }
            visit.end=ride.s+d;
            if(d>=block.end-ride.cursor)visit.complete=true;
            if(w!==null){const stat=ride.stats[index]??={sum:0,sec:0};stat.sum+=w*d;stat.sec+=d;}
          }
          if(w!==null){ride.energy+=w*d;ride.measured+=d;}
          ride.cursor=block&&d>=block.end-ride.cursor?block.end:ride.cursor+d;
          ride.s+=d;remaining-=d;
        }
        ride.m+=metres;currentSegment().m+=metres;ride.ascent+=Math.max(0,gain);
        if(!ride.series.length||ride.s-ride.series.at(-1)[0]>=1)ride.series.push([
          +ride.s.toFixed(2),w,trainerSeen?'trainer':'sim',+ride.m.toFixed(2),+heightAt(state.s).toFixed(1),Date.now()-Date.parse(ride.date),cadence()
        ]);
        if(now-lastCheckpoint>5000){checkpoint();lastCheckpoint=now;}
      }
    }
    if(now-lastUi>250){draw();lastUi=now;}
  }
  function draw(){
    const b=selected(),w=power();
    byId('startWorkout').hidden=Boolean(ride);
    byId('pauseWorkout').textContent=paused?'Resume':'Pause';
    byId('finishWorkout').hidden=!ride;byId('finishWorkout').disabled=saving;
    status.hidden=!ride;
    if(ride){
      byId('intervalName').textContent=(paused?'Paused · ':'')+(b?.label||(ride.plan.length?'End of workout · free ride':'Free ride'));
      byId('intervalTime').textContent=b?clock(Math.ceil(b.end-ride.cursor))+' in step':'';
      byId('workoutElapsed').textContent=clock(ride.s);
      byId('remainingLabel').hidden=!ride.plan.length;
      if(ride.plan.length)byId('workoutRemaining').textContent=clock(Math.ceil(ride.plan.at(-1).end-ride.cursor));
      const index=b?selectedIndex():ride.plan.length;
      byId('intensityControls').hidden=!b;
      if(b){
        const percent=intensity()+'%';
        if(byId('intensityValue').value!==percent)byId('intensityValue').value=percent;
        byId('intensityDown').disabled=saving||intensity()<=minIntensity;
        byId('intensityUp').disabled=saving||intensity()>=maxIntensity;
        byId('intensityReset').disabled=saving||intensity()===100;
      }
      const nav=byId('workoutSteps');nav.hidden=!ride.plan.length;
      byId('prevStep').hidden=byId('nextStep').hidden=!ride.plan.length;
      byId('prevStep').disabled=index===0||saving;
      byId('nextStep').disabled=index===ride.plan.length||saving;
      if(renderedStep!==index){
        const list=byId('upcomingSteps');list.replaceChildren();
        for(let i=index+1;i<Math.min(ride.plan.length,index+4);i++){
          const step=ride.plan[i];
          action(list,step.label+' · '+clock(step.end-ride.plan[i-1].end)+' · '+target(step)+' W',()=>jump(i));
        }
        byId('upNextLabel').textContent=list.childElementCount?'Up next':b?'Final step':'';
        renderedStep=index;
      }
      byId('targetPower').textContent=b?target(b)+' W':'—';
      byId('actualLabel').textContent=trainerSeen?'Trainer · 3 s':'Simulated power';
      byId('actualPower').textContent=w==null?'No signal':w+' W';
      byId('cadenceMetric').hidden=!cadenceSeen;
      if(cadenceSeen){const rpm=cadence();byId('cadenceValue').textContent=rpm===null?'—':Math.round(rpm)+' rpm';}
    }
    if(!byId('profile').hidden)drawElevation?.();
    const marker=byId('ghostReadout');marker.hidden=openRoad||!byId('ghostToggle').checked;
    marker.textContent=!ghost?'Ghost · ride a full lap':gap==null?'Ghost · starts at lap line':Math.abs(gap).toFixed(1)+' s '+(gap>=0?'ahead':'behind')+' of last lap';
  }
  async function finish(){
    if(!ride||saving)return;paused=true;saving=true;checkpoint();draw();
    try{await rideRecord('put',ride);const done=ride;ride=null;sessionStorage.removeItem('ride-draft');paused=false;resetLap();review(done);}
    catch{byId('sessionNotice').textContent='Save failed. Your session is paused. Choose Finish & save to retry.';}
    finally{saving=false;draw();}
  }
  function review(r){
    show(r.name);action(body,'‹ History',history);
    action(body,'Export TCX',()=>window.exportRideTcx(r));
    if(!ride&&r.plan.length)action(body,'Repeat workout',()=>start({name:r.name},r.plan));
    element('p',new Date(r.date).toLocaleString()+' · '+clock(r.s)+' · '+(r.m/1000).toFixed(2)+' km · '+Math.round(r.ascent)+' m climbed',body);
    element('p',r.segments.map(v=>names[v.course]+(v.reverse?' (reverse)':'')).join(' → '),body);
    const types=new Set(r.series.filter(p=>p[1]!=null).map(p=>p[2]));
    element('p','Average power '+(r.measured?Math.round(r.energy/r.measured)+' W':'unavailable')+' · '+(types.size===2?'Mixed trainer and simulator':types.has('trainer')?'Trainer readings':types.has('sim')?'Simulated readings':'No readings'),body);
    const c=element('canvas',null,body);c.width=650;c.height=145;c.className='reviewChart';
    const planned=[];let plannedEnd=0;
    for(const b of r.plan){planned.push([plannedEnd,b.watts],[b.end,b.watts]);plannedEnd=b.end;}
    if(r.visits){
      planned.length=0;plannedEnd=r.s;
      for(const visit of r.visits){
        const watts=visit.watts??r.plan[visit.index].watts;
        planned.push([visit.start,watts],[visit.end,watts],[visit.end,null]);
      }
    }
    const peakTarget=planned.reduce((m,p)=>Math.max(m,p[1]||0),100);
    const top=r.series.reduce((m,p)=>Math.max(m,p[1]||0),peakTarget)*1.1;
    const domain=Math.max(1,plannedEnd,r.s);plot(c,planned,c.height,top,'#ffc87d',domain);plot(c,r.series,c.height,top,'#80ddcb',domain);
    element('small','Gold · target     Mint · recorded watts     0:00 – '+clock(domain),body);
    const bests=window.ridePowerBests(r.series);
    for(const [source,results] of Object.entries(bests)){
      if(!Object.keys(results).length)continue;
      const bestsPanel=element('details',null,body);
      element('summary','Best sustained power · '+(source==='trainer'?'trainer':'simulated'),bestsPanel);
      for(const [seconds,watts] of Object.entries(results)){
        const row=element('div',null,bestsPanel);row.className='planRow';
        element('span',(seconds/60)+' min',row);element('strong',watts+' W',row);
      }
    }
    for(let i=0;i<r.plan.length;i++){
      const b=r.plan[i],v=r.stats[i],begin=i?r.plan[i-1].end:0;
      const visits=r.visits?.filter(v=>v.index===i);
      const result=visits?(visits.some(v=>v.complete)?'Complete':visits.length?'Partial':'Unridden'):(r.s>=b.end?'Complete':r.s>begin?'Partial':'Unridden');
      const row=element('div',null,body);row.className='planRow';
      const targets=visits?.map(visit=>visit.watts??b.watts);
      const low=targets?.reduce((m,w)=>Math.min(m,w),Infinity),high=targets?.reduce((m,w)=>Math.max(m,w),0);
      const label=targets?.length?(low===high?String(low):low+'–'+high):String(b.watts);
      element('span',b.label,row);element('span',label+' W target · '+(v?.sec?Math.round(v.sum/v.sec)+' W avg':'—')+' · '+result,row);
    }
    for(const section of r.parkSections||[]){
      element('p',section.name+' · '+(section.reverse?'Anticlockwise':'Clockwise')+' · '+(section.metres/1000).toFixed(2)+' km · '+clock(section.seconds)+'.'+Math.floor(section.seconds*10)%10,body);
    }
    for(const climb of r.climbs||[]){
      element('p','Col de la Core from '+climb.side+' · '+clock(climb.seconds),body);
      if(climb.splits?.length){
        const details=element('details',null,body);
        element('summary','Kilometre splits',details);
        climb.splits.forEach((time,i)=>{
          const row=element('div',null,details);row.className='planRow';
          element('span',(i+1)+' km',row);
          element('span',clock(time-(climb.splits[i-1]||0))+' split · '+clock(time)+' elapsed',row);
        });
      }
    }
    for(const l of r.laps)element('p',names[l.course]+' lap · '+clock(l.s),body);
  }
  async function history(message){
    if(typeof message!=='string')message='';

    const version=show('Ride history');
    try{
      const all=await historyEntries();
      if(version!==panelVersion||!panel.open)return;
      const legacy=read(localStorage,'golden-hour-ride-log',[]).map(r=>({
        name:names[r.c]||'Ride',date:r.t,m:r.m,s:r.s
      }));
      const entries=[...all,...legacy].sort((a,b)=>new Date(b.date)-new Date(a.date));
      if(!entries.length)element('p','Finished rides appear here.',body);
      else{
        const week=new Map(),today=new Date();
        today.setHours(0,0,0,0);
        for(let back=6;back>=0;back--){
          const date=new Date(today);date.setDate(date.getDate()-back);
          week.set(date.toDateString(),{date,m:0,s:0,rides:0});
        }
        for(const r of entries){
          const day=week.get(new Date(r.date).toDateString());
          if(day){day.m+=r.m;day.s+=r.s;day.rides++;}
        }
        const days=[...week.values()];
        const km=m=>(m/1000).toFixed(1)+' km';
        const weekTitle=element('h3','Last seven days',body);weekTitle.className='weekTitle';
        element('p',km(days.reduce((v,d)=>v+d.m,0))+' · '+clock(days.reduce((v,d)=>v+d.s,0))+' riding',body);
        const bars=element('div',null,body);bars.className='weekBars';bars.setAttribute('aria-label','Distance by day');
        const max=Math.max(1,...days.map(d=>d.m));
        const dayButtons=[],list=element('div',null,body);
        const listHeading=element('div',null,list);listHeading.className='historyHeading';
        const caption=element('h3',null,listHeading);
        const clear=action(listHeading,'All rides',()=>display(null));
        const rows=element('div',null,list);
        for(const d of days){
          const key=d.date.toDateString();
          const button=action(bars,'',()=>display(button.getAttribute('aria-pressed')==='true'?null:key));
          button.setAttribute('aria-label',d.date.toLocaleDateString(undefined,{weekday:'long',month:'short',day:'numeric'})+' · '+km(d.m)+' · '+d.rides+' rides');
          button.title=button.getAttribute('aria-label');
          const bar=element('span',null,button);bar.className='dayBar';
          bar.style.setProperty('--day-fill',d.rides?Math.max(.045,d.m/max):0);
          element('small',d.date.toLocaleDateString(undefined,{weekday:'short'}),button);
          dayButtons.push([key,button]);
        }
        function display(key){
          for(const [day,button] of dayButtons)button.setAttribute('aria-pressed',String(day===key));
          clear.hidden=!key;rows.replaceChildren();
          const visible=key?entries.filter(r=>new Date(r.date).toDateString()===key):entries;
          const total=visible.reduce((n,r)=>n+r.m,0);
          caption.textContent=(key||'All rides')+' · '+km(total);
          if(!visible.length)element('p','No rides saved on this day.',rows);
          for(const r of visible){
            const label=r.name+' · '+new Date(r.date).toLocaleDateString()+' · '+km(r.m)+' · '+clock(r.s);
            if(!r.id){element('p',label,rows);continue;}
            action(rows,label,async()=>{
              const current=++panelVersion;
              try{
                const full=await rideRecord('get',r.id);
                if(panelVersion!==current||!panel.open)return;
                if(full)review(full);else history();
              }catch{if(panelVersion===current)element('p','Could not open this ride.',rows);}
            }).className='historyRow';
          }
        }
        display(null);
      }
      const files=element('details',null,body);files.className='historyFiles';
      element('summary','Back up or restore rides',files);
      element('small','Includes saved rides, power samples and interval results. Restoring adds missing rides to this browser.',files);
      const status=element('p',message,files);status.setAttribute('role','status');
      if(message)files.open=true;
      const legacyRows=()=>read(localStorage,'golden-hour-ride-log',[]);
      if(entries.length)action(files,'Download history backup',async()=>{
        try{await window.rideHistoryFiles.download(await database,legacyRows());}
        catch{status.textContent='Could not download the ride history. Please retry.';}
      });
      const input=element('input',null,files);input.type='file';input.accept='.json,application/json';input.hidden=true;
      const restore=action(files,'Restore from file',()=>input.click());
      input.onchange=async()=>{
        const file=input.files[0];if(!file)return;
        restore.disabled=true;
        try{
          const {added,skipped}=await window.rideHistoryFiles.restore(await database,file,legacyRows(),names);
          if(panel.open&&files.isConnected)history(added+' added · '+skipped+' already saved');
        }catch{status.textContent='Could not restore this file. Choose a Golden Hour Ride history backup.';}
        finally{restore.disabled=false;input.value='';}
      };
      if(all.length||legacy.length)action(body,'Clear ride history',async()=>{
        if(!confirm('Delete all saved rides from this browser?'))return;
        try{
          const db=await database;
          await new Promise((ok,no)=>{
            const tx=db.transaction('rides','readwrite');
            tx.objectStore('rides').clear();tx.oncomplete=ok;tx.onabort=()=>no(tx.error);
          });
          localStorage.removeItem('golden-hour-ride-log');history();
        }catch{element('p','Could not clear ride history. Please retry.',body);}
      });
    }catch{element('p','Could not read saved rides on this browser.',body);}
  }
  byId('startWorkout').onclick=library;
  byId('intensityDown').onclick=()=>setIntensity(intensity()-5);
  byId('intensityUp').onclick=()=>setIntensity(intensity()+5);
  byId('intensityReset').onclick=()=>setIntensity(100);
  byId('prevStep').onclick=()=>jump((selected()?selectedIndex():ride.plan.length)-1);
  byId('nextStep').onclick=()=>jump(selectedIndex()+1);
  byId('pauseWorkout').onclick=()=>{if(!ride||saving)return;paused=!paused;previousTime=performance.now();checkpoint();draw();};
  byId('finishWorkout').onclick=finish;byId('logbtn').onclick=history;
  byId('studioClose').onclick=()=>panel.close();
  byId('ghostToggle').checked=read(localStorage,'ride-ghost-enabled',false);
  byId('ghostToggle').onchange=e=>{localStorage.setItem('ride-ghost-enabled',JSON.stringify(e.target.checked));draw();};
  byId('pwr').addEventListener('input',()=>{if(!state.trainer){trainerSeen=false;cadenceSeen=false;cadenceReadings={};if(ride)ride.hadTrainer=false;}});
  addEventListener('pagehide',checkpoint);
  addEventListener('pageshow',e=>{if(e.persisted)location.reload();});
  document.addEventListener('visibilitychange',()=>{previousTime=performance.now();if(document.hidden)checkpoint();});
  draw();
  return {tick,recordPower,recordCadence,disconnected,resetLap,refresh:draw,
    get recordingId(){return ride?.id;},
    recordSection(section){if(ride){(ride.parkSections??=[]).push(section);checkpoint();}},
    recordClimb(side,seconds,splits){if(ride){(ride.climbs??=[]).push({side,seconds,splits});checkpoint();}},
    changeDirection(back){
      reverse=back;resetLap();lapKey=ghostKey();ghost=loadGhost();
      if(ride){ride.segments.push(segment());checkpoint();}
      draw();
    }, get ghostPosition(){return ghostPosition;},get missingPower(){return trainerSeen && performance.now()-telemetryAt>3000;},get paused(){return paused||switching||sightseeing||graphicsPaused;},
    pauseForGraphics(value){graphicsPaused=value;previousTime=performance.now();if(value)checkpoint();},
    pauseForView(value){sightseeing=value;previousTime=performance.now();},
    get watts(){const b=selected();return (paused||sightseeing||graphicsPaused)&&ride?0:b?target(b):null;},
    switching(){switching=true;checkpoint();},setTrainerPending(){disconnected();cadenceSeen=false;}};
}

})();

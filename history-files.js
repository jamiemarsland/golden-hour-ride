/* Portable, local-only ride history. Restore adds missing records in one transaction. */
(() => {
  const format='golden-hour-ride-history';
  const finite=Number.isFinite;
  const nonnegative=n=>finite(n)&&n>=0;
  const list=Array.isArray;
  const date=s=>(typeof s==='string'||finite(s))&&!Number.isNaN(new Date(s).valueOf());
  function validRide(r){
    if(!r||typeof r.id!=='string'||!r.id||r.id.startsWith('legacy:')||r.legacySummary||typeof r.name!=='string'||!date(r.date)
        ||!nonnegative(r.s)||!nonnegative(r.m)||!list(r.plan)||!list(r.segments)||!list(r.series)
        ||!list(r.laps)||!list(r.stats)||!nonnegative(r.ascent))return false;
    if(!nonnegative(r.measured)||!nonnegative(r.energy)||!r.stats.every(v=>v==null||(nonnegative(v.sum)&&nonnegative(v.sec))))return false;
    if(!r.plan.every((step,i)=>step&&typeof step.label==='string'&&nonnegative(step.watts)&&finite(step.end)
        &&step.end>(i?r.plan[i-1].end:0)))return false;
    if(!r.series.every(p=>list(p)&&nonnegative(p[0])&&(p[1]==null||nonnegative(p[1]))))return false;
    if(!r.segments.every(v=>v&&typeof v.course==='string'&&nonnegative(v.m)))return false;
    if(!r.laps.every(l=>l&&typeof l.course==='string'&&nonnegative(l.s)))return false;
    if(r.visits&&!list(r.visits))return false;
    if(r.visits&&!r.visits.every(v=>v&&Number.isInteger(v.index)&&r.plan[v.index]
        &&nonnegative(v.start)&&nonnegative(v.end)&&v.end>=v.start))return false;
    if(r.climbs&&(!list(r.climbs)||!r.climbs.every(c=>c&&typeof c.side==='string'&&nonnegative(c.seconds)
        &&(!c.splits||(list(c.splits)&&c.splits.every(nonnegative))))))return false;
    if(r.parkSections&&(!list(r.parkSections)||!r.parkSections.every(s=>s&&typeof s.name==='string'
        &&nonnegative(s.metres)&&nonnegative(s.seconds))))return false;
    return true;
  }
  function validLegacy(r){
    return r&&typeof r.c==='string'&&r.t!=null&&date(r.t)&&nonnegative(r.s)&&nonnegative(r.m);
  }
  function legacyKey(r){
    return JSON.stringify([new Date(r.t).toISOString(),r.c,r.s,r.m]);
  }
  function readAll(db){
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('rides'),request=tx.objectStore('rides').getAll();
      tx.oncomplete=()=>resolve(request.result);
      tx.onabort=tx.onerror=()=>reject(tx.error);
    });
  }
  async function download(db,legacy){
    const rows=await readAll(db),seen=new Set(),older=[];
    for(const r of [...legacy,...rows.filter(r=>r.legacySummary).map(r=>r.legacySummary)]){
      if(validLegacy(r)&&!seen.has(legacyKey(r))){seen.add(legacyKey(r));older.push(r);}
    }
    const data={format,version:1,created:new Date().toISOString(),rides:rows.filter(r=>!r.legacySummary),legacy:older};
    const url=URL.createObjectURL(new Blob([JSON.stringify(data)],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download='Golden-Hour-history-'+data.created.slice(0,10)+'.json';
    document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
  }
  async function restore(db,file,localLegacy,names){
    const data=JSON.parse(await file.text());
    if(data?.format!==format||data.version!==1||!list(data.rides)||!list(data.legacy)
        ||!data.rides.every(validRide)||!data.legacy.every(validLegacy))
      throw Error('Choose a valid Golden Hour Ride history backup.');
    const knownLegacy=new Set(localLegacy.filter(validLegacy).map(legacyKey));
    const entries=data.rides.slice();
    for(const r of data.legacy){
      const key=legacyKey(r);
      if(!knownLegacy.has(key))entries.push({id:'legacy:'+key,name:names[r.c]||'Ride',date:new Date(r.t).toISOString(),m:r.m,s:r.s,legacySummary:r});
    }
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('rides','readwrite'),store=tx.objectStore('rides');
      let added=0;
      const queued=new Set();
      for(const r of entries){
        if(queued.has(r.id))continue;
        queued.add(r.id);
        const existing=store.getKey(r.id);
        existing.onsuccess=()=>{if(existing.result===undefined){store.add(r);added++;}};
      }
      tx.oncomplete=()=>resolve({added,skipped:data.rides.length+data.legacy.length-added});
      tx.onabort=tx.onerror=()=>reject(tx.error);
    });
  }
  window.rideHistoryFiles={download,restore};
})();

/* Garmin Training Center XML v2. File generation stays on the rider's device. */
window.exportRideTcx = function exportRideTcx(ride){
  const ns='http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2';
  const ext='http://www.garmin.com/xmlschemas/ActivityExtension/v2';
  const doc=document.implementation.createDocument(ns,'TrainingCenterDatabase');
  function add(parent,name,value,namespace=ns){
    const child=doc.createElementNS(namespace,name);
    if(value!==undefined)child.textContent=String(value);
    parent.appendChild(child);
    return child;
  }
  const activities=add(doc.documentElement,'Activities');
  const activity=add(activities,'Activity');activity.setAttribute('Sport','Biking');
  const date=new Date(ride.date);add(activity,'Id',date.toISOString());
  const lap=add(activity,'Lap');lap.setAttribute('StartTime',date.toISOString());
  add(lap,'TotalTimeSeconds',ride.s.toFixed(3));
  add(lap,'DistanceMeters',ride.m.toFixed(2));
  add(lap,'Calories',0); // Required by TCX; no calorie sensor or estimate.
  add(lap,'Intensity','Active');add(lap,'TriggerMethod','Manual');
  const track=ride.series.length?add(lap,'Track'):null;
  const sources=new Set();
  let previous=date.getTime()-1;
  for(const [elapsed,watts,source,metres,altitude,offset,cadence] of ride.series){
    const point=add(track,'Trackpoint');
    const timestamp=Math.max(previous+1,date.getTime()+(Number.isFinite(offset)?offset:Math.round(elapsed*1000)));
    add(point,'Time',new Date(timestamp).toISOString());previous=timestamp;
    if(Number.isFinite(altitude))add(point,'AltitudeMeters',altitude.toFixed(1));
    if(Number.isFinite(metres))add(point,'DistanceMeters',metres.toFixed(2));
    // Garmin CadenceValue_t accepts integer RPM through 254.
    // https://www8.garmin.com/xmlschemas/TrainingCenterDatabasev2.xsd
    if(Number.isFinite(cadence)&&cadence>=0&&Math.round(cadence)<=254)add(point,'Cadence',Math.round(cadence));
    if(Number.isFinite(watts)){
      sources.add(source);
      const tpx=add(add(point,'Extensions'),'ae:TPX',undefined,ext);
      add(tpx,'ae:Watts',Math.max(0,Math.min(65535,Math.round(watts))),ext);
    }
  }
  const power=sources.size>1?'trainer and simulated':sources.has('trainer')?'trainer':sources.has('sim')?'simulated':'unavailable';
  add(activity,'Notes',ride.name+' · Golden Hour Ride · Power source: '+power+'. Indoor ride with virtual distance and elevation. Calories unavailable.');
  const xml='<?xml version="1.0" encoding="UTF-8"?>\n'+new XMLSerializer().serializeToString(doc);
  const url=URL.createObjectURL(new Blob([xml],{type:'application/xml'}));
  const link=document.createElement('a');link.href=url;link.download='Golden-Hour-Ride-'+date.toISOString().replace(/[:.]/g,'-')+'.tcx';
  document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),10000);
};

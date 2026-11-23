/* Best sustained watts from contiguous recorded samples. Analyse each power source separately. */
window.ridePowerBests = function ridePowerBests(series, durations=[60,300,480,1200]) {
  const best={trainer:{},sim:{}};
  let run=[];
  function finishRun(){
    if(run.length<2){run=[];return;}
    const first=run[0][0], last=run.at(-1)[0], scores=best[run[0][2]];
    const energy=[0];
    for(let i=1;i<run.length;i++)
      energy.push(energy[i-1]+(run[i][0]-run[i-1][0])*run[i-1][1]);
    for(const duration of durations){
      if(duration<=0||last-first<duration)continue;
      let peak=0;
      // For piecewise constant power an optimum starts or ends at a sample boundary.
      for(const offset of [-duration,duration]){
        let j=0;
        for(let i=0;i<run.length;i++){
          const t=run[i][0]+offset;
          if(t<first||t>last)continue;
          while(j+1<run.length&&run[j+1][0]<=t)j++;
          const opposite=energy[j]+(t-run[j][0])*run[j][1];
          peak=Math.max(peak,Math.abs(energy[i]-opposite)/duration);
        }
      }
      scores[duration]=Math.max(scores[duration]??0,Math.round(peak));
    }
    run=[];
  }
  for(const p of series){
    if(!Array.isArray(p)||!Number.isFinite(p[0])||!Number.isFinite(p[1])||p[1]<0
        ||!Object.hasOwn(best,p[2])||!Number.isFinite(p[5])){
      finishRun();continue;
    }
    const prev=run.at(-1);
    if(prev){
      const active=p[0]-prev[0],wall=(p[5]-prev[5])/1000;
      // A pause, a hole in telemetry, or a switch of source breaks an effort.
      if(p[2]!==prev[2]||active<=0||active>3||Math.abs(wall-active)>.1)finishRun();
    }
    run.push(p);
  }
  finishRun();
  return best;
};

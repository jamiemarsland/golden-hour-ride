/* Integrate in short steps so a slow render frame covers the same road time
   as a fast one. Gradient is the signed vertical component of the tangent. */
window.advanceRideMotion=function(state,seconds,gradeAt,scenery=false){
  const mass=state.mass??80;
  let distance=0;
  const steps=Math.ceil(seconds/.04);
  if(steps===0)return distance;
  const dt=seconds/steps;
  for(let i=0;i<steps;i++){
    const v=state.v;
    state.power+=(state.target-state.power)*(-Math.expm1(-3*dt));
    if(scenery){
      state.v+=(5-v)*(-Math.expm1(-dt));
    }else{
      const grade=gradeAt(state.s+distance);
      const slope=grade<0?grade*.5:grade;
      const drive=Math.min(250,state.power/Math.max(.6,v));
      const resistance=mass*9.81*(slope+.004)+.192*v*v+40*Math.max(0,v-15);
      state.v=Math.max(0,v+(drive-resistance)*dt/mass);
    }
    distance+=(v+state.v)*.5*dt;
  }
  return distance;
};

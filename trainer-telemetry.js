/* Bluetooth SIG GATT Specification Supplement, Indoor Bike Data (0x2AD2)
   and Cycling Power Measurement (0x2A63). Offsets depend on each packet's flags.
   https://btprodspecificationrefs.blob.core.windows.net/gatt-specification-supplement/GATT_Specification_Supplement.pdf */
window.rideTrainerTelemetry={
  indoorBike(data){
    let watts=null,cadence=null;
    if(data.byteLength<2)return {watts,cadence};
    const flags=data.getUint16(0,true);
    let offset=(flags&1)?2:4;
    if(flags&2)offset+=2; // Average speed
    if(flags&4){
      if(offset+2<=data.byteLength){
        const raw=data.getUint16(offset,true);
        if(raw!==0xffff)cadence=raw/2;
      }
      offset+=2;
    }
    if(flags&8)offset+=2;  // Average cadence
    if(flags&16)offset+=3; // Total distance
    if(flags&32)offset+=2; // Resistance
    if((flags&64)&&offset+2<=data.byteLength)watts=data.getInt16(offset,true);
    return {watts,cadence};
  },
  cyclingPowerReader(){
    let previous=null,lastCrankPacket=-Infinity;
    return function read(data){
      if(data.byteLength<4)return {watts:null,cadence:null};
      const flags=data.getUint16(0,true),watts=data.getInt16(2,true);
      let offset=4;
      if(flags&1)offset++;   // Pedal power balance
      if(flags&4)offset+=2;  // Accumulated torque
      if(flags&16)offset+=6; // Wheel revolutions and last wheel event time
      let cadence=null;
      if((flags&32)&&offset+4<=data.byteLength){
        const count=data.getUint16(offset,true),ticks=data.getUint16(offset+2,true),now=performance.now();
        if(now-lastCrankPacket>3000)previous=null;
        lastCrankPacket=now;
        if(!previous || previous.count!==count || previous.ticks!==ticks){
          if(previous && now-previous.seen<64000){
            const turns=(count-previous.count)&65535,elapsed=(ticks-previous.ticks)&65535;
            // A reset can look like tens of thousands of revolutions after a
            // wrap. Reject implausible counter jumps, preserving both 16-bit wraps.
            if(elapsed && turns && turns<=elapsed/100)cadence=turns*60*1024/elapsed;
          }
          previous={count,ticks,seen:now};
        }
      }
      return {watts,cadence};
    };
  }
};

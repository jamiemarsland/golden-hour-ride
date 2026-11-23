/* Test-only FTMS indoor-bike peripheral. Power packets and control-point
   indications enter through the same event listeners as native Web Bluetooth. */
(() => {
  const power = new EventTarget(), crank=new EventTarget(), point = new EventTarget(), device = new EventTarget();
  const fixture = {watts:117,cadence:80,transmitting:true,commands:[],minimum:0,failTelemetry:false,ergCapable:true};
  function emit(characteristic,bytes){
    characteristic.value=new DataView(Uint8Array.from(bytes).buffer);
    characteristic.dispatchEvent(new Event('characteristicvaluechanged'));
  }
  power.startNotifications=async()=>{if(fixture.failTelemetry)throw Error('Notifications unavailable');};
  point.startNotifications=async()=>{};
  crank.startNotifications=async()=>{};
  fixture.crankPacket=bytes=>emit(crank,bytes);
  point.writeValueWithResponse=async bytes=>{
    const opcode=bytes[0],target=opcode===5?bytes[1]+256*bytes[2]:null;
    fixture.commands.push({opcode,target,bytes:Array.from(bytes),time:Date.now()});
    if(target!==null)fixture.watts=Math.max(0,target-3);
    setTimeout(()=>emit(point,[0x80,opcode,1]),10);
  };
  const feature={readValue:async()=>new DataView(Uint8Array.from([0,0,0,0,fixture.ergCapable?8:0,32,0,0]).buffer)};
  const range={readValue:async()=>new DataView(Uint8Array.from([fixture.minimum,0,208,7,1,0]).buffer)};
  const chars=new Map([[0x2ad9,point],[0x2ad2,power],[0x2acc,feature],[0x2ad8,range]]);
  const server={connected:false,getPrimaryService:async id=>{
    if(id==='cycling_power'&&fixture.hasCyclingPower)return {getCharacteristic:async()=>crank};
    if(id==='cycling_power'&&fixture.rejectedCyclingPower){
      return {getCharacteristic:async()=>({startNotifications:async()=>{
        fixture.cyclingPowerAttempts=(fixture.cyclingPowerAttempts||0)+1;
        throw Error('Cycling Power notifications rejected');
      }})};
    }
    if(id!==0x1826)throw Error('No Cycling Power Service');
    return {getCharacteristic:async key=>{if(!chars.has(key))throw Error('Unknown characteristic');return chars.get(key);}};
  }};
  server.connect=async()=>{server.connected=true;return server;};
  server.disconnect=()=>{server.connected=false;device.dispatchEvent(new Event('gattserverdisconnected'));};
  fixture.disconnect=server.disconnect;
  Object.assign(device,{id:'test-indoor-bike',name:'Test indoor bike',gatt:server});
  Object.defineProperty(navigator,'bluetooth',{value:{requestDevice:async()=>device,getDevices:async()=>[]}});
  setInterval(()=>{
    if(server.connected&&fixture.transmitting){
      // Mandatory speed, optional cadence and resistance fields precede instantaneous power.
      const cadence=fixture.cadence===null?[]:[(fixture.cadence*2)&255,(fixture.cadence*2)>>8];
      emit(power,[cadence.length?0x64:0x60,0,0x60,9,...cadence,0,0,fixture.watts&255,fixture.watts>>8]);
    }
  },500);
  window.testBike=fixture;
})();

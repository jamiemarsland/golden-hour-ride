/* Project the sampled road into a north-up map using uniform metres per pixel. */
window.createRouteMap=function({points,length,name,locate,direction,landmarks,openRoad,course,exportReverse}){
  const dialog=document.getElementById('routeMap'),canvas=document.getElementById('mapCanvas');
  const summary=document.getElementById('mapSummary'),ctx=canvas.getContext('2d');
  document.getElementById('mapTitle').textContent=name;
  const route=points.filter((_,i)=>i%8===0);
  route.push(openRoad?points.at(-1):points[0]);
  const bounds=route.reduce((b,p)=>[Math.min(b[0],p.x),Math.max(b[1],p.x),Math.min(b[2],p.z),Math.max(b[3],p.z)],[Infinity,-Infinity,Infinity,-Infinity]);
  const scale=Math.min((canvas.width-56)/Math.max(1,bounds[1]-bounds[0]),(canvas.height-56)/Math.max(1,bounds[3]-bounds[2]));
  const x=p=>(p.x-(bounds[0]+bounds[1])/2)*scale+canvas.width/2;
  const y=p=>(p.z-(bounds[2]+bounds[3])/2)*scale+canvas.height/2;
  const path=new Path2D();route.forEach((p,i)=>i?path.lineTo(x(p),y(p)):path.moveTo(x(p),y(p)));
  const legend=document.getElementById('mapLegend');
  const intervals=openRoad?points.length-1:points.length;
  const stops=landmarks.map((landmark,i)=>{
    const item=document.createElement('li');
    let index=0,closest=Infinity;
    if(openRoad){
      points.forEach((p,j)=>{
        const distance=(p.x-landmark.x)**2+(p.z-landmark.z)**2;
        if(distance<closest){closest=distance;index=j;}
      });
    }
    const fraction=index/intervals;
    item.textContent=landmark.label+(openRoad?' · '+(fraction*length/1000).toFixed(1)+' km':'');
    legend.append(item);
    return {number:i+1,fraction,height:points[index].y};
  });
  const figure=document.createElement('figure');
  figure.style.margin='12px 0 0';
  const caption=document.createElement('figcaption');
  caption.textContent='Full-route elevation';
  const chart=document.createElement('canvas');
  chart.id='mapElevation';chart.setAttribute('role','img');
  chart.setAttribute('aria-describedby','mapSummary mapLegend');
  chart.style.cssText='display:block;width:100%;height:110px;margin-top:4px;background:#16251e;border-radius:8px';
  figure.append(caption,chart);canvas.after(figure);
  const low=points.reduce((v,p)=>Math.min(v,p.y),Infinity);
  const high=points.reduce((v,p)=>Math.max(v,p.y),-Infinity);
  chart.setAttribute('aria-label','Full-route elevation, '+Math.round(low)+' to '+Math.round(high)+' metres. The mint marker tracks your position.');
  const profileBase=document.createElement('canvas');
  const plotTop=13,plotBottom=87,padLeft=45,padRight=12;
  const py=h=>plotBottom-(h-low)/Math.max(1,high-low)*(plotBottom-plotTop);
  let cssWidth=0,density=0;
  function elevation(fraction,height){
    const width=chart.clientWidth;
    if(!width)return;
    const dpr=Math.min(2,window.devicePixelRatio||1);
    const px=t=>padLeft+t*(width-padLeft-padRight);
    if(width!==cssWidth || dpr!==density){
      cssWidth=width;density=dpr;
      chart.width=profileBase.width=Math.round(width*dpr);
      chart.height=profileBase.height=Math.round(110*dpr);
      const bg=profileBase.getContext('2d');
      bg.setTransform(dpr,0,0,dpr,0,0);
      const line=new Path2D();
      const samples=Math.max(2,Math.round(width));
      for(let i=0;i<=samples;i++){
        const t=i/samples,idx=Math.round(t*intervals)%points.length;
        if(i===0)line.moveTo(px(t),py(points[idx].y));
        else line.lineTo(px(t),py(points[idx].y));
      }
      const area=new Path2D(line);
      area.lineTo(px(1),plotBottom);area.lineTo(px(0),plotBottom);area.closePath();
      bg.fillStyle='#394d39';bg.fill(area);bg.strokeStyle='#e3c18c';bg.lineWidth=2;bg.stroke(line);
      bg.font='11px system-ui';bg.fillStyle='#d2d9cd';bg.textAlign='right';
      bg.fillText(Math.round(high)+' m',padLeft-5,plotTop+4);
      bg.fillText(Math.round(low)+' m',padLeft-5,plotBottom);
      bg.fillText((length/1000).toFixed(1)+' km',px(1),104);
      bg.textAlign='left';bg.fillText('0 km',px(0),104);
      if(openRoad)for(const stop of stops){
        const x=px(stop.fraction),y=py(stop.height);
        bg.beginPath();bg.arc(x,y,7.5,0,Math.PI*2);bg.fillStyle='#293a2c';bg.fill();
        bg.strokeStyle='#e2c096';bg.lineWidth=1;bg.stroke();
        bg.textAlign='center';bg.fillStyle='#fff2d9';bg.fillText(String(stop.number),x,y+3.5);
      }
    }
    const fg=chart.getContext('2d');
    fg.setTransform(1,0,0,1,0,0);fg.clearRect(0,0,chart.width,chart.height);
    fg.drawImage(profileBase,0,0);fg.setTransform(dpr,0,0,dpr,0,0);
    const marker=px(fraction);
    fg.strokeStyle='#79e8c8';fg.lineWidth=1;fg.beginPath();fg.moveTo(marker,plotTop);fg.lineTo(marker,plotBottom);fg.stroke();
    fg.beginPath();fg.arc(marker,py(height),4,0,Math.PI*2);fg.fillStyle='#79e8c8';fg.fill();
  }
  let drawFrame=0,lastPaint=0;
  function paint(now){
    if(!dialog.open)return;
    if(now-lastPaint>=125 || !lastPaint){
      lastPaint=now;
      const s=locate(),fraction=Math.max(0,Math.min(1,s/length));
      const idx=Math.min(points.length-1,Math.floor(fraction*(openRoad?points.length-1:points.length)));
      const p=points[idx],screenX=x(p),screenY=y(p);
      elevation(fraction,p.y);
      ctx.clearRect(0,0,canvas.width,canvas.height);
      ctx.lineJoin='round';ctx.lineCap='round';
      ctx.lineWidth=8;ctx.strokeStyle='#14271c';ctx.stroke(path);
      ctx.lineWidth=3.25;ctx.strokeStyle='#e3c18c';ctx.stroke(path);
      ctx.font='bold 12px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';
      for(const [i,landmark] of landmarks.entries()){
        const mx=x(landmark),my=y(landmark);
        ctx.beginPath();ctx.arc(mx,my,9,0,Math.PI*2);
        ctx.fillStyle='#293a2c';ctx.fill();ctx.strokeStyle='#e2c096';ctx.lineWidth=1.4;ctx.stroke();
        ctx.fillStyle='#fff2d9';ctx.fillText(String(i+1),mx,my+.5);
      }
      const dir=direction(),next=idx+dir;
      let dx,dz;
      if(openRoad && (next<0 || next>=points.length)){
        // Continue the final road tangent when facing out of an open endpoint.
        const behind=points[idx-dir];
        dx=p.x-behind.x;dz=p.z-behind.z;
      }else{
        const ahead=points[(next+points.length)%points.length];
        dx=ahead.x-p.x;dz=ahead.z-p.z;
      }
      const bearing=Math.atan2(dz,dx);
      ctx.save();ctx.translate(screenX,screenY);ctx.rotate(bearing);
      ctx.beginPath();ctx.moveTo(10,0);ctx.lineTo(-6,-6);ctx.lineTo(-3,0);ctx.lineTo(-6,6);ctx.closePath();
      ctx.fillStyle='#6ce4c3';ctx.strokeStyle='#17291f';ctx.lineWidth=2;ctx.fill();ctx.stroke();ctx.restore();
      const origin=openRoad && landmarks[0]?' by road from '+landmarks[0].label:' along the mapped loop';
      summary.textContent=(s/1000).toFixed(1)+' km'+origin+' · '+(length/1000).toFixed(1)+' km total · '+Math.round(p.y)+' m elevation';
    }
    drawFrame=requestAnimationFrame(paint);
  }
  const downloads={
    core:[['col-de-la-core-from-seix','from Seix'],['col-de-la-core-from-bethmale','from Les Bordes-sur-Lez via Bethmale']],
    richmond:[['richmond-clockwise','clockwise'],['richmond-anticlockwise','anticlockwise']],
    leckhampton:[['leckhampton-forward','forward'],['leckhampton-reverse','reverse']]
  };
  const show=()=>{
    const link=document.getElementById('mapGpx');
    if(downloads[course]){
      const [file,label]=downloads[course][exportReverse()?1:0];
      link.href='assets/routes/'+file+'.gpx';
      link.download=file+'.gpx';
      link.textContent='Download route GPX · '+label;
      link.hidden=false;
    }
    dialog.showModal();lastPaint=0;paint(performance.now());
  };
  document.getElementById('showRouteMap').onclick=show;
  document.getElementById('mapClose').onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>cancelAnimationFrame(drawFrame));
};

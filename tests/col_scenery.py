"""Audit drawn Col roof/wall triangles and shoreline masking, with optional ride screenshots."""
import argparse
import json
import os
from pathlib import Path

from playwright.sync_api import expect,sync_playwright
from col_climbs import ROOT,instrument,local_game

AUDIT = """
const grid=new Map(),cell=16;
P.forEach((p,i)=>{
  const key=Math.floor(p.x/cell)+','+Math.floor(p.z/cell);
  if(!grid.has(key))grid.set(key,[]);
  grid.get(key).push(i);
});
const result={least:100,station:null,underRoof:0,inLane:0,triangles:0,protectedSamples:0,unmasked:0};
const seg=(p,x,z,xx,zz)=>{
  const dx=xx-x,dz=zz-z,k=Math.max(0,Math.min(1,((p.x-x)*dx+(p.z-z)*dz)/(dx*dx+dz*dz||1)));
  return Math.hypot(p.x-x-k*dx,p.z-z-k*dz);
};
for(const mesh of window.villageMeshes){
  const a=mesh.geometry.attributes.position.array;
  for(let j=0;j<a.length;j+=9){
    const ax=a[j],az=a[j+2],bx=a[j+3],bz=a[j+5],cx=a[j+6],cz=a[j+8];
    const ymin=Math.min(a[j+1],a[j+4],a[j+7]),ymax=Math.max(a[j+1],a[j+4],a[j+7]);
    result.triangles++;
    for(let gx=Math.floor((Math.min(ax,bx,cx)-6)/cell);gx<=Math.floor((Math.max(ax,bx,cx)+6)/cell);gx++){
      for(let gz=Math.floor((Math.min(az,bz,cz)-6)/cell);gz<=Math.floor((Math.max(az,bz,cz)+6)/cell);gz++){
        for(const i of grid.get(gx+','+gz)||[]){
          const p=P[i];
          const determinant=(bz-cz)*(ax-cx)+(cx-bx)*(az-cz);
          let d=Math.min(seg(p,ax,az,bx,bz),seg(p,bx,bz,cx,cz),seg(p,cx,cz,ax,az));
          if(Math.abs(determinant)>.001){
            const k=((bz-cz)*(p.x-cx)+(cx-bx)*(p.z-cz))/determinant;
            const l=((cz-az)*(p.x-cx)+(ax-cx)*(p.z-cz))/determinant;
            if(k>=0&&l>=0&&k+l<=1){d=0;if(ymax>p.y)result.underRoof++;}
          }
          if(d<result.least){result.least=d;result.station=i*LEN/N;}
          if(d<3.48&&ymax>p.y&&ymin<p.y+2.2)result.inLane++;
        }
      }
    }
  }
}
for(const [,width,line] of real.scenery.lanes){
  for(let j=1;j<line.length;j++){
    const [x,z]=line[j-1],[xx,zz]=line[j];
    const steps=Math.max(1,Math.ceil(Math.hypot(xx-x,zz-z)/3));
    for(let k=0;k<=steps;k++){
      result.protectedSamples++;
      if(!lakeSurface.contains(x+(xx-x)*k/steps,z+(zz-z)*k/steps))result.unmasked++;
    }
  }
}
let maxTerrain=-Infinity;
for(let x=lakeBounds[0];x<=lakeBounds[1];x+=2){
  for(let z=lakeBounds[2];z<=lakeBounds[3];z+=2){
    if(withinLake(x,z))maxTerrain=Math.max(maxTerrain,meshH(x,z));
  }
}
result.waterClearance=real.lakeHeight+.2-maxTerrain;
const vergeMeshes=scene.children.filter(mesh=>mesh.material===shoulderMat);
const drops=[];
let maxDrop=-Infinity,station=0,dropSide=0,maxOuterGap=-Infinity,gapStation=0,minOuterGap=Infinity,village=0,hairpin=0;
for(const mesh of vergeMeshes){
  const a=mesh.geometry.attributes.position.array;
  const outer=Math.hypot(a[0]-P[0].x,a[2]-P[0].z)>5?0:3;
  for(let i=0;i<N;i++){
    const j=i*6+outer;
    for(const fraction of [0,.5]){
      const x=a[j]+(a[j+6]-a[j])*fraction;
      const y=a[j+1]+(a[j+7]-a[j+1])*fraction;
      const z=a[j+2]+(a[j+8]-a[j+2])*fraction;
      const centre=P[i].y+(P[i+1].y-P[i].y)*fraction;
      const drop=centre-y,gap=y-meshH(x,z),dist=(i+fraction)*LEN/N;
      if(drop>maxDrop){maxDrop=drop;station=dist;dropSide=outer===0?-1:1;}
      if(gap>maxOuterGap)gapStation=dist;
      maxOuterGap=Math.max(maxOuterGap,gap);minOuterGap=Math.min(minOuterGap,gap);
      if(dist>=2700 && dist<=2770)village=Math.max(village,drop);
      if(dist>=14650 && dist<=14710)hairpin=Math.max(hairpin,drop);
      drops.push(drop);
    }
  }
}
drops.sort((a,b)=>a-b);
result.verge={maxDrop,station,dropSide,maxOuterGap,gapStation,minOuterGap,village,hairpin,p95:drops[Math.floor(drops.length*.95)]};
const banks=scene.children.filter(m=>m.material?.map===rockMap && m.material?.color?.getHex()===0xb6ad98);
let bottomGap=-Infinity,bottomStation=0,bottomSide=0,topSeam=0,lowerClearance=Infinity,nearbyStation=0,lowerIntrusions=0,bankSpan=0,transitions=0;
for(const [side,m] of banks.entries()){
  const pos=m.geometry.attributes.position.array,ix=m.geometry.index.array;
  const sh=vergeMeshes[side].geometry.attributes.position.array;
  const shOuter=side===0?0:3;
  let prev=-2;
  for(let j=0;j<ix.length;j+=6){
    const stationIndex=ix[j]/2,k=stationIndex*6;
    for(const t of [0,.25,.5,.75,1]){
      const x=pos[k+3]+t*(pos[k+9]-pos[k+3]),z=pos[k+5]+t*(pos[k+11]-pos[k+5]);
      const gap=pos[k+4]+t*(pos[k+10]-pos[k+4])-meshH(x,z);
      if(gap>bottomGap){bottomGap=gap;bottomStation=(stationIndex+t)*LEN/N;bottomSide=side;}
    }
    topSeam=Math.max(topSeam,Math.hypot(pos[k]-sh[k+shOuter],pos[k+1]-sh[k+shOuter+1],pos[k+2]-sh[k+shOuter+2]));
    if(stationIndex!==prev+1)transitions++;
    prev=stationIndex;
    for(let j2=j;j2<j+6;j2+=3){
      const a=ix[j2]*3,b=ix[j2+1]*3,c=ix[j2+2]*3;
      const ax=pos[a],az=pos[a+2],bx=pos[b],bz=pos[b+2],cx=pos[c],cz=pos[c+2];
      const determinant=(bz-cz)*(ax-cx)+(cx-bx)*(az-cz);
      for(let gx=Math.floor((Math.min(ax,bx,cx)-8)/cell);gx<=Math.floor((Math.max(ax,bx,cx)+8)/cell);gx++){
        for(let gz=Math.floor((Math.min(az,bz,cz)-8)/cell);gz<=Math.floor((Math.max(az,bz,cz)+8)/cell);gz++){
          for(const i of grid.get(gx+','+gz)||[]){
            const p=P[i];
            if(Math.abs(i-stationIndex)*LEN/N<=18 || p.y>P[stationIndex].y)continue;
            const d=Math.min(seg(p,ax,az,bx,bz),seg(p,bx,bz,cx,cz),seg(p,cx,cz,ax,az))-3.5;
            if(d<lowerClearance){lowerClearance=d;nearbyStation=stationIndex*LEN/N;}
            if(Math.abs(determinant)<.001)continue;
            for(const off of [-3.48,-3,-1.75,0,1.75,3,3.48]){
              const x=p.x+R[i].x*off,z=p.z+R[i].z*off;
              const u=((bz-cz)*(x-cx)+(cx-bx)*(z-cz))/determinant;
              const v=((cz-az)*(x-cx)+(ax-cx)*(z-cz))/determinant;
              if(u<0||v<0||u+v>1)continue;
              const y=u*pos[a+1]+v*pos[b+1]+(1-u-v)*pos[c+1];
              if(y>p.y-.02&&y<p.y+2.5)lowerIntrusions++;
            }
          }
        }
      }
    }
    bankSpan+=LEN/N;
  }
}
result.banks={bankSpan,transitions,bottomGap,bottomStation,bottomSide,topSeam,lowerClearance,nearbyStation,lowerIntrusions};
let trees=0,protectedTrunks=0,trunkRoad=Infinity;
for(const mesh of scene.children){
  if(!mesh.isInstancedMesh || mesh.geometry.type!=='CylinderGeometry' ||
     mesh.material.color?.getHex()!==0x33251a)continue;
  const buffer=mesh.instanceMatrix.array;
  for(let j=0;j<mesh.count;j++){
    trees++;
    const x=buffer[j*16+12],z=buffer[j*16+14];
    if(lakeSurface.contains(x,z))protectedTrunks++;
    const n=nearRoad(x,z);if(n)trunkRoad=Math.min(trunkRoad,n.d);
  }
}
result.trees={count:trees,protectedTrunks,trunkRoad};
return result;
"""

def run(output):
    html=instrument((ROOT/'index.html').read_text(encoding='utf8')).replace(
        'window.climbTest = {', 'window.sceneryAudit=()=>{'+AUDIT+'}; window.climbTest = {')
    source=(ROOT/'core-villages.js').read_text(encoding='utf8')+"""
const buildVillages=window.buildCoreVillages;
window.buildCoreVillages=function(args){
 const before=args.scene.children.length;
 buildVillages(args);
 window.villageMeshes=args.scene.children.slice(before);
};
"""
    with local_game() as url,sync_playwright() as p:
        browser=p.chromium.launch(executable_path=os.getenv('CHROME_PATH'),args=['--enable-unsafe-swiftshader'])
        try:
            page=browser.new_page(viewport={'width':820,'height':460})
            page.route(url+'?*',lambda r:r.fulfill(body=html,content_type='text/html; charset=utf-8'))
            page.route('**/core-villages.js',lambda r:r.fulfill(body=source,content_type='application/javascript'))
            page.goto(url+'?course=core&direction=forward',wait_until='domcontentloaded')
            page.locator('#loading').wait_for(state='detached',timeout=180000)
            result=page.evaluate('sceneryAudit()')
            print(json.dumps(result),flush=True)
            if output:
                output.mkdir(exist_ok=True,parents=True)
                for side,distances in [('Seix',[0,130,280,450,550,2570,2730,2940,14682,18560,18587,18610]),
                                      ('Bethmale',[350,1250,1630,1870,2660,3840,4560,9350])]:
                    if side=='Bethmale':page.locator('#turnAround').click()
                    for d in distances:
                        page.evaluate('s=>{ride.s=s;climbTest.frame(.016);}',d)
                        page.screenshot(path=str(output/f'{side}-{d:05d}.jpg'),quality=79,type='jpeg')
            page.locator('#showRouteMap').click()
            expect(page.locator('#mapGpx')).to_have_attribute('download','col-de-la-core-from-seix.gpx')
            assert result['banks']['bottomGap']<.03 and result['verge']['maxDrop']<.75,result
            assert result['banks']['lowerIntrusions']==0 and result['banks']['lowerClearance']>.1 and result['banks']['topSeam']<.01,result
            assert result['triangles']>20000 and result['protectedSamples']>1000
            assert result['trees']['count']>1000 and result['trees']['trunkRoad']>5,result
            assert result['trees']['protectedTrunks']==0,result
            assert result['waterClearance']>.01 and result['unmasked']==0,result
            assert result['least']>3.48 and result['inLane']==0 and result['underRoof']==0,result
        finally:browser.close()

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--screenshots',type=Path)
    run(parser.parse_args().screenshots)

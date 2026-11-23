"""Check the asphalt, verge and mapped access entrances in the rendered Richmond world."""
import os
from playwright.sync_api import sync_playwright
from col_climbs import ROOT, local_game


AUDIT = """
window.auditParkSurfaces=()=>{
  const result={minRoad:Infinity,roadHeights:[],maxOuter:-Infinity,maxInner:0,minAccess:Infinity,entrances:real.details.junctions.length};
  for(let i=0;i<N;i++){
    const j=(i+1)%N;
    for(const d of [-3.5,-1.75,0,1.75,3.5])for(const u of [0,.25,.5,.75]){
      const ax=P[i].x+d*R[i].x,az=P[i].z+d*R[i].z,bx=P[j].x+d*R[j].x,bz=P[j].z+d*R[j].z;
      const h=P[i].y+u*(P[j].y-P[i].y)-meshH(ax+u*(bx-ax),az+u*(bz-az));
      result.minRoad=Math.min(result.minRoad,h);
      if(d===3.5&&u===0)result.roadHeights.push(h);
    }
  }
  result.roadHeights.sort((a,b)=>a-b);
  result.medianEdge=result.roadHeights[Math.floor(result.roadHeights.length/2)];
  delete result.roadHeights;
  const verges=scene.children.filter(m=>m.name==='Park verge');
  result.verges=verges.length;
  for(const mesh of verges){
    const pos=mesh.geometry.attributes.position;
    const outer=mesh.geometry.attributes.color.getW(0)===0?0:2,inner=2-outer;
    for(let i=0;i<N;i++){
      const a=i*3+outer,b=a+3;
      result.maxInner=Math.max(result.maxInner,Math.abs(pos.getY(i*3+inner)-P[i].y));
      for(const u of [0,.25,.5,.75]){
        const x=pos.getX(a)+u*(pos.getX(b)-pos.getX(a)),z=pos.getZ(a)+u*(pos.getZ(b)-pos.getZ(a));
        result.maxOuter=Math.max(result.maxOuter,pos.getY(a)+u*(pos.getY(b)-pos.getY(a))-meshH(x,z));
      }
    }
  }
  const access=scene.children.filter(m=>m.name==='Park access entrances');
  result.accessMeshes=access.length;
  const weights=[[1,0,0],[0,1,0],[0,0,1],[.5,.5,0],[.5,0,.5],[0,.5,.5],[1/3,1/3,1/3],[.15,.3,.55],[.55,.15,.3],[.3,.55,.15]];
  for(const mesh of access){
    const pos=mesh.geometry.attributes.position,idx=mesh.geometry.index;
    for(let i=0;i<idx.count;i+=3){
      const a=idx.getX(i),b=idx.getX(i+1),c=idx.getX(i+2);
      for(const [u,v,w] of weights){
        const x=pos.getX(a)*u+pos.getX(b)*v+pos.getX(c)*w,z=pos.getZ(a)*u+pos.getZ(b)*v+pos.getZ(c)*w;
        const y=pos.getY(a)*u+pos.getY(b)*v+pos.getY(c)*w,ground=meshH(x,z),n=nearRoad(x,z);
        result.minAccess=Math.min(result.minAccess,y-(n?parkVergeHeight(n.i,n.side,n.y,ground):ground));
      }
    }
  }
  return result;
};
"""


def main():
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    anchor = "\ntick();\n</script>"
    assert html.count(anchor) == 1
    html = html.replace(anchor, "\ntick();\n" + AUDIT + "\n</script>")
    with local_game() as url, sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path=os.getenv("CHROME_PATH") or None)
        page = browser.new_page()
        page.route("**/?course=richmond", lambda route: route.fulfill(body=html, content_type="text/html"))
        page.goto(url + "?course=richmond")
        page.wait_for_function("typeof auditParkSurfaces==='function'", timeout=120000)
        result = page.evaluate("auditParkSurfaces()")
        browser.close()
    assert result["verges"] == result["accessMeshes"] == 2, result
    assert result["entrances"] >= 70, result
    assert result["minRoad"] > 0.035 and result["medianEdge"] < 0.18, result
    assert result["maxInner"] < 0.001 and result["maxOuter"] < 0.001, result
    assert result["minAccess"] > -0.01, result
    print(result)


if __name__ == "__main__":
    main()

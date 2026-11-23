window.makeWoodlandCrowns = function(leafCluster, mountain) {
  // Each row describes the clumps on one crown, including gaps between branches.
  // The overall height stays tied to the surveyed canopy. These are visual forms,
  // not species assignments for individual trees.
  const outlines=[
    [[53,133,90,80],[94,95,99,99],[146,57,114,122],[196,95,86,90],[174,149,111,96],[109,157,93,83]],
    [[78,143,92,101],[126,75,104,146],[160,113,101,124],[164,172,87,85],[103,182,105,82]],
    [[42,156,79,81],[90,122,102,89],[112,58,109,124],[160,94,102,88],[206,127,93,89],[171,165,77,64]],
    [[60,122,101,101],[97,60,101,124],[140,96,92,109],[187,110,102,96],[196,164,94,83],[118,172,111,99]]
  ];
  const atlas=document.createElement('canvas');atlas.width=mountain?2048:1024;atlas.height=256;
  const g=atlas.getContext('2d');
  outlines.forEach((lobes,i)=>{
    g.save();g.translate(i*256,0);g.beginPath();g.rect(2,0,252,256);g.clip();
    g.lineCap='round';
    for(const [x,y] of lobes){
      g.strokeStyle='#4e4531';g.lineWidth=6;
      g.beginPath();g.moveTo(128,249);g.quadraticCurveTo(128+(x-128)*.16,184,x,y+8);g.stroke();
    }
    for(const [x,y,w,h] of lobes){
      g.filter='brightness('+(1.15-y*.0012)+')';
      g.drawImage(leafCluster,x-w/2,y-h/2,w,h);
    }
    g.restore();
  });
  if(mountain){
    // Layer branch tips downwards from a narrow leader. Keep gaps between
    // whorls, so the far hillside reads as firs rather than solid triangles.
    for(let variant=0;variant<4;variant++){
      const centre=(variant+4)*256+128;
      const lean=[-.07,.06,-.02,.01][variant], spread=[.84,.97,.78,1.02][variant];
      g.lineCap='round';g.strokeStyle='#534e3b';g.lineWidth=4;
      g.beginPath();g.moveTo(centre,250);g.lineTo(centre+lean*130,7);g.stroke();
      for(let tier=24;tier>=0;tier--){
        const t=tier/25,y=11+t*215;
        const stem=centre+lean*(244-y)*.55;
        for(const sign of [-1,1]){
          const noise=Math.sin(tier*18.92+sign*6.13+variant*4.63);
          const reach=(7+Math.pow(t,.84)*103)*spread*(.9+.1*noise);
          const tipY=y+9+t*15+noise*4;
          g.strokeStyle='#3b4935';g.lineWidth=2+t*2;
          g.beginPath();g.moveTo(stem,y);g.quadraticCurveTo(stem+sign*reach*.53,tipY+5,stem+sign*reach,tipY);g.stroke();
          for(let j=0;j<23;j++){
            const a=j/23,x=stem+sign*reach*a,branchY=y+(tipY-y)*Math.sin(a*1.75);
            const light=31+Math.round((1-t)*10+9*Math.sin(tier*2+j*1.3));
            g.fillStyle='rgb('+light+','+(light+23)+','+(light+8)+')';
            g.beginPath();g.ellipse(x,branchY,3+(1-a)*reach*.14,3+(1-a)*(5+t*3),sign*.32,0,Math.PI*2);g.fill();
          }
        }
      }
    }
  }
  return atlas;
};

window.shadeWoodlandCrowns = function(shader, stands) {
  // The surveyed cell selects the same silhouette for all foliage and shadow
  // vertices of a tree, whichever direction the rider approaches from.
  let chooseStand='';
  if(stands){
    shader.uniforms.uForestStand={value:stands.texture};
    shader.uniforms.uForestWidth={value:stands.size};
    shader.vertexShader='uniform sampler2D uForestStand; uniform float uForestWidth;\n'+shader.vertexShader;
    chooseStand=`vec2 uvStand=instanceMatrix[3].xz/uForestWidth+vec2(.5);
      float stand=texture2D(uForestStand,clamp(uvStand,0.,1.)).r;
      bool inSurvey=all(greaterThanEqual(uvStand,vec2(0.)))&&all(lessThan(uvStand,vec2(1.)));
      bool fir=inSurvey && (stand>.8 || (stand>.3 && mod(crownCell.x+3.*crownCell.y,2.)<1.));
      if(fir)crownShape+=4.;`;
  }
  shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>',`#include <uv_vertex>
    vec2 crownCell=floor(instanceMatrix[3].xz*.25);
    float crownShape=mod(crownCell.x*7.+crownCell.y*11.+mod(crownCell.x*crownCell.y,13.),4.);
    ${chooseStand}
    vMapUv.x=(vMapUv.x+crownShape)*${stands?'.125':'.25'};`)
    .replace('#include <begin_vertex>',`#include <begin_vertex>
    float spread=crownShape<.5?1.28:(crownShape<1.5?.82:(crownShape<2.5?1.36:1.04));
    if(crownShape>=4.)spread=.82+.06*(crownShape-4.);
    transformed.xz*=spread;
    transformed.x+=(position.y-3.2)*(crownShape<1.5?-.06:.07);
    transformed.y=10.8-(10.8-position.y)*(crownShape>=4.?1.29:(crownShape<.5?.86:(crownShape<1.5?1.08:.94)));`);
};

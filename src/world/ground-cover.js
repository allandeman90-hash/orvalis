import * as THREE from 'three';
import { GeoBuilder } from '../engine/geom.js';
import { mulberry32 } from '../core/rng.js';

// Authored plant profiles, leaves and exposed roots; no image or mesh imports.
export function groundCover(kind,color='#698451') {
  const b=new GeoBuilder(),rnd=mulberry32(1461),pi=Math.PI;
  const tube=(pts,r,c,surf=9)=>{b.surfOverride=surf;const g=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p=>new THREE.Vector3(...p))),6,r,6,false);b.add(g,c);g.dispose();};
  const leaf=(x,y,z,a,L,W,c)=>{
    const points=[[0,0,0],[L*.4,L*.22,W],[L,L*.35,0],[L*.4,L*.22,-W],[L*.4,L*.31,0]],p=[];
    for(const [xx,yy,zz]of points)p.push(x+xx*Math.cos(a)-zz*Math.sin(a),y+yy,z+xx*Math.sin(a)+zz*Math.cos(a));
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setIndex([0,1,4,1,2,4,2,3,4,3,0,4,4,1,0,4,2,1,4,3,2,4,0,3]);const faces=g.toNonIndexed();faces.computeVertexNormals();b.surfOverride=8;b.add(faces,c);faces.dispose();g.dispose();
  };
  const blade=(x,z,h,r,c,lean,a)=>{b.surfOverride=-1;b.cone(r,h,3,c,x+Math.cos(a)*lean*h*.4,h/2,z+Math.sin(a)*lean*h*.4,Math.sin(a)*lean,a,-Math.cos(a)*lean);};
  const shade=(c,k)=>'#'+new THREE.Color(c).multiplyScalar(k).getHexString();
  if(kind==='bush') {
    b.surfOverride=-1;b.ico(.62,color,0,.42,0,1,.8,1,1);b.ico(.45,shade(color,1.18),.5,.34,.2,1,.8,1,0);b.ico(.42,shade(color,.86),-.45,.3,-.25,1,.8,1,0);b.ico(.3,shade(color,1.3),.05,.78,-.1,1,.8,1,0);
  }else if(kind==='fern'){
    for(let i=0;i<9;i++){const a=i*2.399;blade(Math.cos(a)*.12,Math.sin(a)*.12,.55+rnd()*.3,.11,i%2?shade(color,1.15):color,.75,a);}
  }else if(kind==='grass'||kind==='reeds'||kind==='flowers'){
    const n=kind==='grass'?11:7;
    for(let i=0;i<n;i++){const a=i*2.399,rr=.12+.3*rnd(),x=Math.cos(a)*rr,z=Math.sin(a)*rr;
      if(kind==='grass'){blade(x,z,.34+rnd()*.34,.055,i%3?color:shade(color,1.2),.28,a);continue;}
      if(kind==='reeds'){const h=1.3+rnd()*.7;blade(x,z,h,.04,'#7fa648',.1,a);b.surfOverride=-1;b.cyl(.05,.05,.26,5,'#6a4a30',x+Math.cos(a)*.04*h,h*.92,z+Math.sin(a)*.04*h);continue;}
      const h=.26+rnd()*.26;blade(x,z,h,.03,'#5fa040',.12,a);
      b.surfOverride=-1;b.ico(.075,['#ffe066','#ff7fb0','#ffffff','#b48cff','#ff9a4a'][i%5],x+Math.cos(a)*.05*h,h+.03,z+Math.sin(a)*.05*h,1,.6,1,0);
    }
  }else if(kind==='mushroom'){
    b.surfOverride=10;const stem=new THREE.LatheGeometry([[.30,0],[.38,.3],[.26,1.2],[.27,2.1]].map(p=>new THREE.Vector2(...p)),16);b.add(stem,'#bfb39a');stem.dispose();
    const cap=new THREE.LatheGeometry([[0,2.75],[.45,2.72],[1.1,2.5],[1.55,2.23],[1.65,2.07],[1.1,2.03],[.3,2.13]].map(p=>new THREE.Vector2(...p)),24);b.surfOverride=11;b.add(cap,'#c8483c');cap.dispose();
    for(let i=0;i<12;i++){const a=i*2.399,r=.3+rnd()*.9;b.ico(.10,'#c2b493',Math.cos(a)*r,2.75-r*.35,Math.sin(a)*r,1,.16,.8,1);}
  }else if(kind==='cactus'){
    const branch=(pts,r)=>tube(pts,r,'#5c9a48',9);
    branch([[0,0,0],[.02,1.2,0],[0,2.45,0],[0,2.7,0]],.31);
    for(const side of [-1,1])branch([[0,1.1,0],[side*.7,1.25,0],[side*.8,1.6,0],[side*.8,2.1,0]],.18);
    b.surfOverride=8;b.ico(.31,'#5c9a48',0,2.65,0,1,.6,1,2);
    for(let i=0;i<20;i++){const a=i*2.399;b.cone(.015,.11,4,'#c4b992',Math.cos(a)*.32,.25+i*.11,Math.sin(a)*.32,0,0,.8);}
  }else if(kind==='bones'){
    tube([[-.7,.10,0],[0,.10,.08],[.7,.11,0]],.07,'#bdb5a1',10);
    for(let i=0;i<5;i++)tube([[-.5+i*.23,.12,-.32],[-.5+i*.23,.44,0],[-.5+i*.23,.12,.35]],.035,'#bdb5a1',10);
    b.surfOverride=10;b.ico(.23,'#c8c0ae',-.8,.2,.02,1,.8,.65,2);
  }
  return b.build();
}

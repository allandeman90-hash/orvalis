// Original lofted meshes. No source model or texture from another game.
// A single indexed UV mesh is bound to an independent skeleton per entity.
import * as THREE from 'three';
import { mulberry32 } from '../core/rng.js';

let atlas;
export function organicAtlas() {
  if(atlas) return atlas;
  const c=document.createElement('canvas'); c.width=1024;c.height=512;
  const g=c.getContext('2d'),r=mulberry32(82619);
  for(let tile=0;tile<8;tile++) {
    const ox=tile%4*256,oy=Math.floor(tile/4)*256;
    g.fillStyle='#e1d9cb';g.fillRect(ox,oy,256,256);
    for(let y=0;y<256;y++)for(let x=0;x<256;x++) {
      let grain=(r()-.5)*14, v=220;
      if(tile===0) v+=8*Math.sin(y/256*Math.PI)-9*Math.cos(x/256*Math.PI*4); // skin
      if(tile===1) v+=((x%4===0||y%4===0)?-20:0)+9*Math.sin(x*.1); // cloth weave
      if(tile===2) v+=Math.sin(x*.3+y*.14)*13+Math.sin(x*.91-y*.09)*11; // fur
      if(tile===3) v+=Math.sin(x*.15)*6+(r()<.035?-40:0); // leather
      if(tile===4) v+=Math.sin(y*.7)*3+(r()<.012?-45:0); // metal scratches
      if(tile===5) v+=Math.sin(x*.08+y*.025)*16; // bone
      if(tile===6) v+=Math.sin(x*.11+y*.08)*Math.cos(y*.1)*22; // stone
      if(tile===7) v+=Math.sin(x*.05)*Math.sin(y*.07)*20; // membrane
      const k=Math.max(90,Math.min(250,v+grain));g.fillStyle=`rgb(${k},${k},${k})`;g.fillRect(ox+x,oy+y,1,1);
    }
    if(tile===1||tile===3){g.strokeStyle='#9c9489';g.lineWidth=2;g.setLineDash([3,4]);g.strokeRect(ox+7,oy+7,242,242);g.setLineDash([]);}
  }
  atlas=new THREE.CanvasTexture(c);atlas.flipY=false;atlas.colorSpace=THREE.SRGBColorSpace;atlas.anisotropy=4;
  return atlas;
}

class Sculpt {
  constructor(mat) {
    this.root=new THREE.Group();this.parts={root:this.root};this.bones=[];this.p=[];this.c=[];this.uv=[];this.si=[];this.sw=[];this.idx=[];this.seams=[];this.mat=mat;
  }
  bone(name,parent,x=0,y=0,z=0) {
    const b=new THREE.Bone();b.name=name;b.position.set(x,y,z);(parent||this.root).add(b);b.userData.index=this.bones.length;this.bones.push(b);this.parts[name]=b;return b;
  }
  // Sections follow a Catmull-Rom centreline with authored elliptical radii.
  loft(bone, rows, color, tile=1, radial=12, subdivisions=3, weights=null) {
    this.root.updateMatrixWorld(true);
    const curve=new THREE.CatmullRomCurve3(rows.map(r=>new THREE.Vector3(r[0],r[1],r[2])));
    const count=(rows.length-1)*subdivisions,base=this.p.length/3,col=new THREE.Color(color || '#8b8170');
    for(let j=0;j<=count;j++) {
      const t=j/count,section=t*(rows.length-1),a=Math.min(rows.length-2,Math.floor(section)),f=section-a;
      const center=curve.getPoint(t), tangent=curve.getTangent(t).normalize();
      const ref=Math.abs(tangent.z)>.9?new THREE.Vector3(0,1,0):new THREE.Vector3(0,0,1);
      const right=new THREE.Vector3().crossVectors(tangent,ref).normalize(),up=new THREE.Vector3().crossVectors(right,tangent).normalize();
      const rx=THREE.MathUtils.lerp(rows[a][3],rows[a+1][3],f),rz=THREE.MathUtils.lerp(rows[a][4],rows[a+1][4],f);
      this.seams.push([base+j*(radial+1),base+j*(radial+1)+radial]);
      for(let i=0;i<=radial;i++) {
        const angle=i/radial*Math.PI*2,v=center.clone().addScaledVector(right,Math.cos(angle)*rx).addScaledVector(up,Math.sin(angle)*rz).applyMatrix4(bone.matrixWorld);
        this.p.push(v.x,v.y,v.z);const shade=.94+.06*Math.sin(t*Math.PI);this.c.push(col.r*shade,col.g*shade,col.b*shade);
        this.uv.push((tile%4+.035+i/radial*.93)/4,(Math.floor(tile/4)+.035+t*.93)/2);
        const wa=weights?.[a]||bone,wb=weights?.[a+1]||bone;this.si.push(wa.userData.index,wb.userData.index,0,0);this.sw.push(1-f,f,0,0);
        if(j<count&&i<radial){const q=base+j*(radial+1)+i;this.idx.push(q,q+radial+2,q+1,q,q+radial+1,q+radial+2);}
      }
    }
  }
  volume(b,x,y,z,rx,ry,rz,color,tile=0,radial=12) {
    this.loft(b,[[x,y-ry,z,.001,.001],[x,y-ry*.65,z,rx*.72,rz*.72],[x,y,z,rx,rz],[x,y+ry*.65,z,rx*.75,rz*.75],[x,y+ry,z,.001,.001]],color,tile,radial,2);
  }
  horn(b,points,color) { this.loft(b,points.map((p,i)=>[...p,(1-i/(points.length-1))*.065+.002,(1-i/(points.length-1))*.055+.002]),color,5,8,3); }
  cloth(b,width,length,color,tile=1,wing=false,side=1,front=false) {
    this.root.updateMatrixWorld(true);const base=this.p.length/3,col=new THREE.Color(color),nx=12,ny=8;
    for(let y=0;y<=ny;y++)for(let x=0;x<=nx;x++) {
      const u=x/nx,v=y/ny;
      const p=wing?new THREE.Vector3(side*u*width,Math.sin(u*Math.PI)*.16,-v*length*(Math.sin(u*Math.PI)*.7+.15)*(1-.2*Math.sin(u*6*Math.PI))):new THREE.Vector3((u-.5)*width*(.6+v*.4),-v*length,front?.025+Math.sin(v*Math.PI)*.015+Math.cos(u*8*Math.PI)*.008:-.04-Math.sin(v*Math.PI)*.12+Math.cos(u*8*Math.PI)*.028);
      p.applyMatrix4(b.matrixWorld);this.p.push(p.x,p.y,p.z);this.c.push(col.r,col.g,col.b);this.uv.push((tile%4+.03+u*.94)/4,(Math.floor(tile/4)+.03+v*.94)/2);this.si.push(b.userData.index,0,0,0);this.sw.push(1,0,0,0);
      if(x<nx&&y<ny){const q=base+y*(nx+1)+x;this.idx.push(q,q+1,q+nx+2,q,q+nx+2,q+nx+1);}
    }
  }
  finish(height,radius,flags={}) {
    const g=new THREE.BufferGeometry();
    for(const [name,array,size] of [['position',this.p,3],['color',this.c,3],['uv',this.uv,2],['skinWeight',this.sw,4]])g.setAttribute(name,new THREE.Float32BufferAttribute(array,size));
    g.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(this.si,4));g.setIndex(this.idx);g.computeVertexNormals();
    const normal=g.attributes.normal,n=new THREE.Vector3();
    for(const [a,z] of this.seams){n.set(normal.getX(a)+normal.getX(z),normal.getY(a)+normal.getY(z),normal.getZ(a)+normal.getZ(z)).normalize();normal.setXYZ(a,n.x,n.y,n.z);normal.setXYZ(z,n.x,n.y,n.z);}
    const mesh=new THREE.SkinnedMesh(g,this.mat);mesh.name='organic_'+(flags.family||'body');mesh.castShadow=true;mesh.frustumCulled=false;
    this.root.add(mesh);this.root.updateMatrixWorld(true);mesh.bind(new THREE.Skeleton(this.bones));
    this.root.userData.art={source:'Orvalis original parametric sculpt',bones:this.bones.length,triangles:this.idx.length/3,uv:true,skinned:true};
    return {parts:this.parts,height,radius,...flags};
  }
}

function humanoid(s,mat) {
  const b=new Sculpt(mat),P={hipY:.84,legH:.82,torsoW:.62,torsoH:.64,headS:.44,armL:.65,...s.prop};b.parts.P=P;
  const skin=s.skin||'#d5a67f',body=s.body||'#70675a',legs=s.legs||'#4a4038',hair=s.hair||'#35271d';
  const hips=b.bone('body',null,0,P.hipY,0),torso=b.bone('torso',hips,0,.06,0),head=b.bone('head',torso,0,P.torsoH+.15,0);
  b.parts.hips=hips;const w=P.torsoW/2,hs=P.headS;
  b.loft(hips,[[0,-.12,0,w*.6,.12],[0,0,0,w*.86,.16],[0,.12,0,w*.7,.14]],legs,3);
  if(s.bone){
    b.loft(torso,[[0,0,-.07,.045,.045],[0,.3,-.07,.04,.04],[0,.6,-.07,.05,.05]],skin,5,8,2);
    for(let i=0;i<5;i++)for(const side of [-1,1])b.loft(torso,[[0,.53-i*.074,-.07,.025,.025],[side*w*.74,.5-i*.067,.01,.024,.024],[side*w*.63,.45-i*.064,.15,.022,.022],[side*.035,.43-i*.056,.17,.015,.018]],skin,5,8,2);
  }else b.loft(torso,[[0,-.02,0,w*.68,.14],[0,.15,0,w*.76,.15],[0,.4,0,w,.18],[0,.55,0,w*.9,.15],[0,.63,0,.09,.09]],body,s.head==='golem'?6:s.head==='treant'?3:1,16,3);
  b.loft(head,[[0,-.15,0,.075,.07],[0,-.03,0,.08,.08],[0,.01,0,.07,.06]],skin,0);
  // Authored jaw, cheekbones, brow and cranium; front is +Z.
  b.loft(head,[[0,-.04,.015,hs*.21,hs*.19],[0,.04,.015,hs*.34,hs*.29],[0,.15,0,hs*.44,hs*.36],[0,.25,-.025,hs*.43,hs*.4],[0,.34,-.025,hs*.32,hs*.33],[0,.39,-.025,.005,.005]],skin,s.bone?5:s.head==='treant'?3:0,20,3);
  if(['kobold','lizard','frog','harpy'].includes(s.head)){
    const frog=s.head==='frog';
    b.loft(head,[[0,.08,.08,hs*(frog?.5:.30),.075],[0,.075,hs*.52,hs*(frog?.47:.26),.08],[0,.07,hs*(frog?.64:.95),hs*(frog?.4:.16),.045]],skin,0,12,3);
    b.loft(head,[[0,.02,hs*.3,hs*.26,.015],[0,.018,hs*.75,hs*.20,.013]],'#483d31',3,8,2);
  }else b.volume(head,0,.12,hs*.36,.035,.068,.055,skin);
  if(s.head==='skull')for(let i=0;i<6;i++)b.volume(head,(i-2.5)*.024,.025,hs*.34,.009,.027,.016,skin,5,6);
  for(const side of [-1,1]) {
    b.volume(head,side*.085,.17,hs*.345,.044,.027,.015,s.bone?'#211e1a':'#eee8d5');
    b.volume(head,side*.085,.17,hs*.375,.014,.019,.009,s.glowEyes||s.eyes||'#403b31');
    b.volume(head,side*.082,.212,hs*.325,.059,.017,.025,hair);
    if(s.head==='goblin'||s.head==='troll')b.horn(head,[[side*.16,.12,0],[side*.3,.21,-.02],[side*.39,.25,-.03]],skin);
    else b.volume(head,side*hs*.44,.14,-.015,.036,.07,.032,skin);
    if(!s.floating) {
      const leg=b.bone(side<0?'legL':'legR',hips,side*w*.47,0,0),knee=b.bone(side<0?'kneeL':'kneeR',leg,0,-P.legH*.5,0),ankle=b.bone(side<0?'ankleL':'ankleR',knee,0,-P.legH*.42,0);
      const ls=s.bone?.38:s.birdLegs?.55:1;
      b.loft(leg,[[0,.06,0,.12*ls,.135*ls],[0,-.2,.005,.13*ls,.13*ls],[0,-.4,.015,.085*ls,.095*ls],[0,-.6,0,.087*ls,.10*ls],[0,-P.legH+.065,0,.064*ls,.067*ls]],s.bone?skin:legs,s.bone?5:1,12,3,[leg,leg,knee,knee,ankle]);
      b.volume(ankle,0,0,.055,.093,.07,.155,s.boots||'#372b22',3);
      if(!s.bone&&!s.birdLegs)b.loft(knee,[[0,-.05,0,.092,.103],[0,-.23,0,.09,.1],[0,-.34,0,.072,.082]],s.boots||'#372b22',3);
      if(s.birdLegs)for(let toe=-1;toe<=1;toe++)b.horn(ankle,[[toe*.04,0,.03],[toe*.07,-.015,.15],[toe*.09,-.03,.23]],s.boots||'#ab9560');
    }
    const arm=b.bone(side<0?'armL':'armR',torso,side*(w+.04),.49,0),elbow=b.bone(side<0?'elbowL':'elbowR',arm,0,-.32,0),hand=b.bone(side<0?'handL':'handR',elbow,0,-.31,0);
    const as=s.bone?.4:(P.armW||.2)/.2;
    b.loft(arm,[[0,.07,0,.12*as,.13*as],[side*.025,-.14,0,.10*as,.10*as],[side*.02,-.31,0,.075*as,.074*as],[0,-.48,.018,.086*as,.085*as],[0,-.61,.025,.052*as,.052*as]],s.bone?skin:s.arms||body,s.bone?5:s.head==='golem'?6:1,12,3,[arm,arm,elbow,elbow,hand]);
    b.volume(hand,0,-.035,.027,s.bigHands?.095:.07,.10,.045,s.gloves||skin,s.gloves?3:0);
    b.volume(hand,-side*.055,-.015,.06,.023,.047,.025,s.gloves||skin);
    if(s.claws)for(let i=0;i<3;i++)b.horn(hand,[[i*.03-.03,-.10,.04],[i*.035-.035,-.17,.07],[i*.035-.035,-.21,.12]],'#ccc1a3');
    if(s.bracers)b.loft(elbow,[[0,-.08,0,.09,.095],[0,-.23,0,.083,.089]],s.bracers,4,12,2);
    if(s.wingArms)b.cloth(arm,1.4,.85,s.wingArms,2,true,side);
    const shoulder=s.shoulders|| (s.pauldrons?{color:s.pauldrons}:null);
    if(shoulder){b.volume(arm,side*.025,.04,0,.18,.13,.19,shoulder.color||'#6d7752',shoulder.style==='plate'?4:3);if(['spiked','bone','winged'].includes(shoulder.style))for(let i=0;i<3;i++)b.horn(arm,[[side*.06,.1,-.1+i*.1],[side*.13,.2,-.1+i*.1],[side*.2,.3,-.1+i*.1]],shoulder.accent||'#cfbf9e');}
  }
  b.volume(head,0,.068,hs*.31,.064,.014,.012,'#865c49');
  // Class-specific ornaments and anatomical traits share the rig, not the silhouette.
  if(s.core)b.volume(torso,0,.37,.19,.095,.13,.045,s.core,4);
  if(s.head==='treant')for(const side of [-1,1])b.horn(head,[[side*.1,.3,0],[side*.21,.6,0],[side*.37,.8,-.09]],skin);
  if(s.head==='imp'||s.head==='yeti')for(const side of [-1,1])b.horn(head,[[side*.15,.27,-.02],[side*.27,.43,-.1],[side*.22,.61,-.16]],'#b5a787');
  if(s.tail){const tail=b.bone('tail',hips,0,-.06,-.13);b.loft(tail,[[0,0,0,.10,.10],[0,-.08,-.26,.08,.08],[.09,-.1,-.55,.05,.05],[.16,-.06,-.85,.005,.005]],s.tailColor||skin,0,10,4);}
  if(s.backSpikes)for(let i=0;i<4;i++)b.horn(torso,[[0,.15+i*.11,-.13],[0,.21+i*.11,-.27],[0,.28+i*.11,-.39]],s.backSpikes);
  if(s.collar||s.gorget||s.scarf||s.hoodDown)b.loft(torso,[[0,.52,0,.16,.15],[0,.61,0,.19,.17],[0,.69,-.02,.14,.13]],s.collar||s.gorget||s.scarf||s.hoodDown,s.gorget?4:1,14,2);
  if(s.pouches)for(const side of [-1,1])b.volume(hips,side*w*.85,.03,.06,.085,.10,.07,s.pouches,3);
  if(s.necklace)for(let i=0;i<9;i++){const a=i/8*Math.PI;b.volume(torso,Math.cos(a)*.19,.55-Math.sin(a)*.14,.19,.026,.031,.02,'#bdae8e',5,6);}
  if(s.circlet||s.helmet==='circlet'){b.loft(head,[[0,.22,-.025,hs*.455,hs*.425],[0,.25,-.025,hs*.46,hs*.43]],s.circlet||s.helmetAccent||'#a49065',4,20,1);b.volume(head,0,.245,hs*.41,.035,.038,.017,s.circletGem||s.gem||'#a2ad79',4);}
  if(s.backItem==='sundisc'){b.loft(torso,[[0,.50,-.23,.19,.02],[0,.7,-.23,.3,.03],[0,.92,-.23,.19,.02],[0,1,-.23,.005,.005]],s.backColors?.accent||'#bfac63',4,16,3);}
  if(s.backItem==='totem')b.loft(torso,[[0,.08,-.24,.09,.09],[0,.4,-.26,.095,.09],[0,.75,-.27,.12,.12],[0,.98,-.27,.06,.07]],'#775739',3,10,3);
  if(s.backItem==='sheaths')for(const side of [-1,1])b.loft(torso,[[side*.2,.67,-.23,.035,.045],[0,.36,-.26,.032,.038],[-side*.23,.04,-.24,.019,.025]],'#3c3029',3,8,3);
  if(s.hairStyle!==3&&!s.bone&&!['golem','treant','frog','lizard','skull','kobold'].includes(s.head)) b.loft(head,[[0,.23,-.065,hs*.45,hs*.4],[0,.31,-.055,hs*.4,hs*.39],[0,.405,-.025,.015,.015]],hair,2,20,3);
  if(s.hairStyle===2)b.loft(head,[[0,.30,.06,.032,.14],[0,.48,.02,.031,.1],[0,.52,-.05,.015,.04]],hair,2,10,3);
  if(s.hairStyle===1||s.hairStyle===4)b.loft(head,[[0,.3,-.14,.14,.05],[0,.07,-.17,.16,.05],[0,-.12,-.15,.12,.025]],hair,2);
  if(s.beard)b.loft(head,[[0,.09,.10,.13,.07],[0,-.06,.09,.11,.06],[0,-.16,.06,.02,.018]],typeof s.beard==='string'?s.beard:hair,2);
  if((s.helmet&&s.helmet!=='circlet')||s.hood) {
    const c=s.helmetColor||s.hood||body,t=s.helmet;
    b.loft(head,[[0,.2,-.045,hs*.47,hs*.43],[0,.3,-.04,hs*.45,hs*.43],[0,t==='wizard'?.82:.46,-.06,t==='wizard'?.012:.05,.035]],c,['plate','horned','crest'].includes(t)?4:1,16,4);
    if(t==='horned'||t==='antlers')for(const sign of [-1,1])b.horn(head,[[sign*.16,.32,0],[sign*.3,.49,-.04],[sign*.32,.68,-.08]],'#cdbd99');
  }
  if(s.faceMask||s.mask)b.volume(head,0,.065,.135,.14,.085,.033,s.faceMask||s.mask,1);
  if(s.skirt||s.floating){const sk=b.bone('skirt',hips);b.loft(sk,[[0,.1,0,w*.8,.17],[0,-.3,0,w,.20],[0,s.floating?-1.05:s.skirt?.style==='short'?-.38:-.78,0,w*1.12,.25]],s.skirt?.color||body,1,16,4);if(s.floating)b.parts.robe=sk;}
  if(s.cape){const cape=b.bone('cape',torso,0,.56,-.19);b.cloth(cape,.74,typeof s.cape==='object'?s.cape.len||1.3:1.3,typeof s.cape==='object'?s.cape.color:s.cape);}
  if(s.tabard){const tab=b.bone('tabard',torso,0,.45,.195);b.cloth(tab,.31,.53,s.tabard,1,false,1,true);}
  if(s.apron){const apron=b.bone('apron',torso,0,.37,.21);b.cloth(apron,.40,.91,s.apron,1,false,1,true);}
  b.loft(hips,[[0,.12,0,w*.79,.172],[0,.17,0,w*.79,.172]],s.beltColor||'#493724',3,16,1);
  if(s.wings)for(const side of [-1,1]){const wing=b.bone(side<0?'wingL':'wingR',torso,side*.2,.4,-.16);b.cloth(wing,1.2,.8,typeof s.wings==='string'?s.wings:body,7,true,side);}
  return b.finish(P.hipY+P.torsoH+.6,.38,{family:'humanoid',floating:s.floating});
}

function animal(s,mat,dragon=false) {
  const b=new Sculpt(mat),c=s.color||'#83745e',dark=s.dark||'#403831',belly=s.belly||c,L=dragon?2.2:s.len||1.2,W=dragon?1.2:s.wid||.5,H=dragon?1:s.hgt||.5,lh=dragon?1:s.legH||.5;
  const body=b.bone('body',null,0,lh+H/2,0);b.parts.torso=body;
  b.loft(body,[[0,0,-L*.55,.02,.02],[0,0,-L*.38,W*.47,H*.46],[0,0,0,W*.48,H*.43],[0,.035,L*.3,W*.52,H*.5],[0,.05,L*.5,W*.3,H*.37]],c,2,16,4);
  b.volume(body,0,-H*.2,0,W*.43,H*.24,L*.39,belly,2);
  let parent=body;b.parts.neck=[];b.parts.tailSegs=[];
  if(dragon)for(let i=0;i<3;i++){const n=b.bone('neck'+i,parent,0,i?0:.3,i?.5:1);b.loft(n,[[0,0,0,.27-i*.025,.27],[0,.05,.28,.26-i*.025,.25],[0,.1,.56,.23-i*.025,.23]],c,2);b.parts.neck.push(n);parent=n;}
  const hs=dragon?.58:s.headS||.36,head=b.bone('head',parent,0,dragon?.1:H*(s.headUp??.25)+(s.neck||0),dragon?.55:L/2);
  if(!dragon&&s.neck)b.loft(body,[[0,H*.1,L*.32,W*.3,H*.32],[0,H*.25+s.neck*.5,L*.45,W*.23,H*.26],[0,H*(s.headUp??.25)+s.neck,L*.5,hs*.37,hs*.39]],c,2,14,4);
  b.volume(head,0,.015,hs*.28,hs*.48,hs*.46,hs*.6,c,2);
  if(s.snout!==false)b.loft(head,[[0,-hs*.11,hs*.5,hs*.34,hs*.25],[0,-hs*.16,hs*.85,hs*.3,hs*.2],[0,-hs*.18,hs*.7+(s.snoutL||hs*.65),hs*.21,hs*.17]],s.snoutColor||belly,2,12,3);
  b.volume(head,0,-hs*.1,hs*.75+(s.snoutL||hs*.65),hs*.15,hs*.08,.025,dark,3);
  for(const side of [-1,1]) {
    b.volume(head,side*hs*.36,hs*.17,hs*.59,.026,.023,.025,s.eyes||'#caad64',4);
    if(s.ears&&s.ears!=='none'){const long=s.ears==='long',round=s.ears==='round';b.loft(head,[[side*hs*.33,hs*.3,0,hs*.15,.065],[side*hs*.45,hs*(long?1.1:.66),-.025,round?.075:.05,.025],[side*hs*.4,hs*(long?1.5:round?.78:.87),-.04,.004,.004]],dark,2,10,3);}
    if(s.horns||dragon)b.horn(head,[[side*hs*.35,hs*.3,0],[side*hs*.55,hs*.7,-.18],[side*hs*.5,hs,-.3]],s.horns||'#c9bd9d');
    if(s.tusks)b.horn(head,[[side*hs*.35,-.1,hs*.85],[side*hs*.48,.04,hs*1.1],[side*hs*.36,.14,hs*1.15]],'#ded2b1');
  }
  if(s.horn)b.horn(head,[[0,hs*.35,hs*.45],[0,hs*.7,hs*.6],[0,hs,hs*.7]],s.horn);
  for(const [sx,sz,name] of [[-1,1,'legFL'],[1,1,'legFR'],[-1,-1,'legBL'],[1,-1,'legBR']]) {
    if(s.bird&&sz===1){b.bone(name,body);continue;}
    const leg=b.bone(name,body,sx*W*.34,-H*.3,sz*L*.35),knee=b.bone(name+'knee',leg,0,-lh*.47,sz<0?-.07:.04);
    const r=(s.legW||W*.24)*.65;
    b.loft(leg,[[0,.04,0,r*1.5,r*1.65],[0,-lh*.3,sz<0?-.055:.01,r*1.15,r*1.25],[0,-lh*.55,sz<0?-.08:.03,r*.65,r*.7],[0,-lh*.85,.04,r*.5,r*.55],[0,-lh-H*.2+.06,.10,r*.85,r*1.3]],s.legColor||c,2,10,3,[leg,leg,knee,knee,knee]);
    b.volume(knee,0,-lh*.53-H*.2+.06,.10,r*1.0,.06,r*1.6,s.feet||dark,3);
  }
  if(s.tail!=='none'||dragon){let prev=body;const n=dragon?5:3,len=dragon?2.6:s.tail==='short'?.25:s.tailL||.65;
    for(let i=0;i<n;i++){const t=b.bone(i?'tail'+i:'tail',prev,0,i?0:H*.1,i?-len/n:-L*.49);const r=(dragon?.24:s.tail==='thick'?.15:.09)*(1-i/n);b.loft(t,[[0,0,0,r,r],[0,-.025,-len/n*.5,r*.8,r*.8],[0,-.02,-len/n,r*.5,r*.5]],c,2,10,3);b.parts.tailSegs.push(t);prev=t;}
  }
  if(s.mane)b.loft(body,[[0,H*.25,L*.15,W*.5,.15],[0,H*.4,L*.35,W*.57,.19],[0,H*.25,L*.55,W*.33,.16]],s.mane,2);
  if(s.spots)for(const side of [-1,1])for(let i=0;i<12;i++){const zz=-L*.28+(i%4)*L*.18,yy=(Math.floor(i/4)-1)*H*.2;b.volume(body,side*W*.465,yy,zz,.008,.032,.038,s.spots,2,6);}
  if(s.bird){for(const side of [-1,1])b.volume(body,side*W*.42,0,0,.065,H*.3,L*.35,c,2);b.loft(head,[[0,.03,hs*.4,.06,.06],[0,.015,hs*.7,.05,.04],[0,0,hs,.002,.002]],'#b69a4a',3,8,2);b.loft(head,[[0,hs*.35,0,.025,.09],[0,hs*.6,hs*.1,.025,.06],[0,hs*.63,hs*.18,.005,.005]],dark,0,8,2);}
  if(s.saddle)b.volume(body,0,H*.49,0,W*.5,.09,L*.22,s.saddle,3);
  if(s.shell)b.volume(body,0,H*.2,-L*.05,W*.55,H*.48,L*.49,s.shell,6);
  if(s.spikes||dragon)for(let i=0;i<6;i++)b.horn(body,[[0,H*.4,-L*.4+i*L*.16],[0,H*.7,-L*.43+i*L*.16],[0,H*.95,-L*.49+i*L*.16]],s.spikes||'#bdad89');
  if(dragon)for(const side of [-1,1]){const wing=b.bone(side<0?'wingL':'wingR',body,side*.4,.4,.25);b.cloth(wing,3,1.7,s.wing||'#846e52',7,true,side);b.horn(wing,[[0,0,0],[side*1.7,.2,0],[side*3,0,0]],c);}
  return b.finish(dragon?3.4:lh+H+hs,dragon?1.5:Math.max(W,L)*.55,{family:dragon?'drake':'quadruped'});
}

function other(s,mat) {
  const b=new Sculpt(mat),rig=s.rig,c=s.color||'#75665e',body=b.bone('body',null,0,rig==='insect'?.55:rig==='flyer'?s.hover||2.2:rig==='floater'?s.hover||1.4:0,0);b.parts.torso=body;
  if(rig==='insect') {
    b.volume(body,0,0,.16,.3,.23,.35,c,3);b.volume(body,0,s.scorpion?0:.1,-.5,s.scorpion?.35:.48,s.scorpion?.18:.4,.6,s.dark||c,3);
    b.parts.legsList=[];
    for(let i=0;i<(s.scorpion?3:4);i++)for(const side of [-1,1]){const l=b.bone('leg'+i+'_'+side,body,side*.24,0,.3-i*.24);l.userData.i=i;l.userData.side=side;b.loft(l,[[0,0,0,.065,.065],[side*.4,.22,0,.044,.044],[side*.65,.12,-.1,.035,.035],[side*.85,-.48,-.15,.009,.009]],c,3,8,3);b.parts.legsList.push(l);}
    if(s.scorpion){b.parts.tailSegs=[];let prev=body;for(let i=0;i<5;i++){const t=b.bone('tail'+i,prev,0,i?.2:0,i?-.13:-.9);b.loft(t,[[0,0,0,.11-i*.016,.1-i*.014],[0,.12,-.1,.10-i*.016,.09-i*.014],[0,.22,-.15,.09-i*.016,.08-i*.014]],c,3);b.parts.tailSegs.push(t);prev=t;}for(const side of [-1,1]){const cl=b.bone(side<0?'clawL':'clawR',body,side*.33,0,.42);b.loft(cl,[[0,0,0,.08,.08],[side*.2,0,.4,.15,.12],[side*.14,.01,.7,.03,.035]],c,3);b.horn(cl,[[side*.1,0,.4],[side*.03,0,.62],[side*.14,0,.72]],c);}}
    for(const side of [-1,1])b.volume(body,side*.13,.13,.47,.043,.04,.027,s.eyes||'#baba72',4);
  } else if(rig==='flyer') {
    b.volume(body,0,0,0,.22,.2,.38,c,2);b.volume(body,0,.14,.34,.16,.17,.19,c,2);
    if(s.beak)b.horn(body,[[0,.13,.43],[0,.12,.6],[0,.07,.74]],s.beak);
    for(const side of [-1,1]){b.volume(body,side*.095,.21,.48,.028,.025,.02,s.eyes||'#c4ad78',0);const wing=b.bone(side<0?'wingL':'wingR',body,side*.18,.06,0);b.cloth(wing,(s.span||1)*1.7,.8,s.wing||c,7,true,side);b.horn(wing,[[0,0,0],[side*(s.span||1),.14,0],[side*(s.span||1)*1.7,0,0]],c);}
  } else if(rig==='worm') {
    b.parts.segs=[];for(let i=0;i<7;i++){const seg=b.bone('segment'+i,body,0,.22,-i*.32);b.volume(seg,0,0,0,.23-Math.abs(i-2)*.025,.18,.22,c,3);b.parts.segs.push(seg);}
  } else if(rig==='floater') {
    const torso=b.bone('torso',body);b.volume(torso,0,0,0,s.kind==='wisp'?.3:.5,.65,.4,c,6);b.parts.orbit=[];
    for(let i=0;i<(s.bits??3);i++){const orb=b.bone('orbit'+i,body);orb.userData.a=i*Math.PI*2/(s.bits||3);b.volume(orb,0,0,0,.14,.22,.15,s.bitColor||c,6);b.parts.orbit.push(orb);}
  } else {
    b.loft(body,[[0,.02,0,.38,.38],[0,.14,0,.5,.46],[0,.42,0,.44,.4],[0,.7,0,.28,.26],[0,.86,0,.003,.003]],c,7,20,4);
    for(const side of [-1,1])b.volume(body,side*.14,.56,.34,.055,.07,.025,'#263321',0);
  }
  return b.finish(rig==='flyer'?(s.hover||2.2)+.4:rig==='floater'?(s.hover||1.4)+.8:1.1,.8,{family:rig,flying:rig==='flyer',floating:rig==='floater'});
}

export function buildOrganic(spec,mat) {
  mat.map=organicAtlas();mat.flatShading=false;mat.side=THREE.DoubleSide;
  return (spec.rig||'humanoid')==='humanoid'?humanoid(spec,mat):spec.rig==='quadruped'?animal(spec,mat):spec.rig==='drake'?animal(spec,mat,true):other(spec,mat);
}

import * as THREE from 'three';
import { GeoBuilder } from '../engine/geom.js';

function shape(b,points,depth,color,x=0,y=0,z=0,ry=0){const s=new THREE.Shape();points.forEach((p,i)=>i?s.lineTo(...p):s.moveTo(...p));s.closePath();const g=new THREE.ExtrudeGeometry(s,{depth,bevelEnabled:true,bevelSize:.012,bevelThickness:.009,bevelSegments:1,steps:1});b.add(g,color,x,y,z,0,ry,0);g.dispose();}
function curve(b,points,r,color){const g=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),16,r,8,false);b.add(g,color);g.dispose();}
export function craftedWeapon(type,c={}) {
  const b=new GeoBuilder(),metal=c.metal||'#b5b7ae',wood=c.wood||'#614a32',trim=c.accent||'#a98d59',gem=c.gem||'#7ba7ac';
  if(['sword','dagger','greatsword'].includes(type)) {
    const L=type==='dagger'?.5:type==='greatsword'?1.4:1,w=type==='greatsword'?.1:.065;
    b.cyl(.034,.04,.26,10,wood,0,0,0);b.ico(.06,trim,0,-.16,0,1,.7,1,1);
    curve(b,[[-.22,.1,0],[-.1,.17,0],[0,.15,0],[.1,.17,0],[.22,.1,0]],.028,trim);
    shape(b,[[-w,.2],[-w,L*.85],[0,L+.25],[w,L*.85],[w,.2]],.025,metal,0,0,-.013);
  } else if(type==='bow') {
    curve(b,[[0,-.65,-.04],[0,-.43,.19],[0,0,.10],[0,.43,.19],[0,.65,-.04]],.037,wood);
    curve(b,[[0,-.65,-.04],[0,0,-.07],[0,.65,-.04]],.006,'#bdb59e');b.cyl(.045,.045,.17,10,trim,0,0,.10);
  } else if(type==='claws') {
    for(let i=-1;i<=1;i++)curve(b,[[i*.06,0,0],[i*.06,.13,.10],[i*.055,.21,.21]],.018,metal);
  } else {
    const tall=['staff','scythe','spear'].includes(type),h=tall?1.9:.9,y=tall?.45:.3;
    b.cyl(type==='club'?.07:.033,.045,h,10,wood,0,y,0);
    const top=y+h*.5;
    if(type==='staff'||type==='scepter') {for(const sign of [-1,1])curve(b,[[0,top-.08,0],[sign*.16,top+.09,0],[sign*.09,top+.3,0]],.025,trim);b.ico(.12,gem,0,top+.16,0,1,1.4,1,1);}
    else if(type==='spear')shape(b,[[0,top+.43],[-.085,top+.14],[0,top],[.085,top+.14]],.022,metal);
    else if(type==='axe')shape(b,[[-.035,top-.28],[.21,top-.3],[.34,top-.15],[.3,top+.12],[.04,top-.01]],.045,metal);
    else if(type==='scythe')shape(b,[[0,top],[.3,top-.03],[.65,top-.2],[.83,top-.5],[.62,top-.3],[.22,top-.18],[0,top-.12]],.025,metal);
    else if(type==='pick')curve(b,[[-.36,top-.12,0],[-.18,top+.03,0],[0,top+.07,0],[.2,top+.02,0],[.4,top-.14,0]],.04,metal);
    else if(type==='warhammer'){b.cyl(.14,.14,.43,8,metal,0,top,0,0,0,Math.PI/2);b.cyl(.16,.16,.065,8,trim,.23,top,0,0,0,Math.PI/2);b.cyl(.16,.16,.065,8,trim,-.23,top,0,0,0,Math.PI/2);}
    else if(type==='torch'){b.cyl(.09,.06,.15,10,trim,0,top,0);b.ico(.1,'#daab61',0,top+.09,0,1,1.6,1,1);}
    else {b.ico(type==='club'?.13:.17,type==='club'?wood:metal,0,top,0,1,1.25,1,1);for(let i=0;i<6;i++){const a=i*Math.PI/3;b.cyl(.018,.045,.2,5,trim,Math.cos(a)*.13,top,Math.sin(a)*.13,0,0,-a);}}
  }
  return b;
}
export function craftedOffhand(type,c={}) {
  const b=new GeoBuilder(),metal=c.metal||'#bcbab0',trim=c.accent||'#ac905d',color=c.color||'#415c7d';
  if(type==='dagger')return craftedWeapon(type,c);
  if(type==='shield'){
    const pts=[[-.24,.31],[.24,.31],[.27,.06],[.17,-.25],[0,-.42],[-.17,-.25],[-.27,.06]];
    shape(b,pts,.05,trim,0,0,0,Math.PI/2);shape(b,pts.map(([x,y])=>[x*.85,y*.85]),.058,color,.012,0,0,Math.PI/2);b.ico(.08,metal,.08,.02,0,.4,1,1,1);
  }else if(type==='buckler'){b.cyl(.27,.27,.06,24,trim,0,0,0,0,0,Math.PI/2);b.ico(.25,color,.015,0,0,.22,1,1,2);b.ico(.075,metal,.085,0,0,1,1,1,1);}
  else if(type==='tome'){shape(b,[[-.14,-.17],[.14,-.17],[.14,.17],[-.14,.17]],.055,'#cfc4a5',0,0,0,Math.PI/2);for(const x of [-.015,.065])shape(b,[[-.15,-.18],[.15,-.18],[.15,.18],[-.15,.18]],.012,c.cover||'#5c3a43',x,0,0,Math.PI/2);}
  else if(type==='orb')b.ico(.16,c.gem||'#9486b3',0,.12,.05,1,1,1,2);
  else if(type==='skull'){b.ico(.15,'#c8c0a8',0,.12,.06,.8,1,1,2);b.ico(.10,'#b7ac94',0,.02,.09,.8,.7,.85,1);for(const side of [-1,1])b.ico(.033,'#282424',side*.055,.14,.19,1,1,.25,1);}
  else {b.cyl(.034,.045,.36,10,'#674e35',0,.13,0);b.ico(.13,trim,0,.3,0,1,1.2,.65,1);b.octa(.08,c.gem||'#bcb999',0,.48,0);}
  return b;
}

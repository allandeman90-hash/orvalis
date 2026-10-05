import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

const canvas=document.querySelector('canvas'),renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;
const scene=new THREE.Scene();scene.background=new THREE.Color('#111a26');scene.fog=new THREE.Fog('#111a26',10,28);
const camera=new THREE.PerspectiveCamera(32,1,.05,100);camera.position.set(4.4,2.65,7.4);
scene.add(new THREE.HemisphereLight(0xb9d9ff,0x20150f,1.65));
const key=new THREE.DirectionalLight(0xffe3c4,4.2);key.position.set(4,7,5);key.castShadow=true;key.shadow.mapSize.set(1536,1536);scene.add(key);
const rim=new THREE.DirectionalLight(0x5d8fff,3);rim.position.set(-5,4,-5);scene.add(rim);
const floor=new THREE.Mesh(new THREE.CylinderGeometry(3.4,3.7,.4,64),new THREE.MeshStandardMaterial({color:'#344354',roughness:.78,metalness:.12}));floor.position.y=-.22;floor.receiveShadow=true;scene.add(floor);
const ring=new THREE.Mesh(new THREE.TorusGeometry(2.75,.045,12,96),new THREE.MeshBasicMaterial({color:'#d5ae62'}));ring.rotation.x=Math.PI/2;ring.position.y=.015;scene.add(ring);
const grid=new THREE.GridHelper(18,36,0x506078,0x253142);grid.position.y=.02;scene.add(grid);

let root,mixer,currentAction,level=0,yaw=Math.PI+.25,pitch=.06,distance=7.8,drag=false,lastX=0,lastY=0,frames=0,lastStat=performance.now();
const clips=new Map(),cache=[];
const decode=s=>{const bin=atob(s),a=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)a[i]=bin.charCodeAt(i);return a.buffer};
const loader=new GLTFLoader();
async function loadLevel(i){
 level=i;document.querySelectorAll('[data-lod]').forEach(b=>b.classList.toggle('on',+b.dataset.lod===i));
 const oldName=currentAction?currentAction.getClip().name:'Idle',oldTime=currentAction?.time||0;
 if(root)scene.remove(root);
 let gltf=cache[i];if(!gltf){gltf=cache[i]=await loader.parseAsync(decode(window.__PILOT_GLB[i]),'');}
 root=gltf.scene;root.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});scene.add(root);
 const box=new THREE.Box3().setFromObject(root),center=box.getCenter(new THREE.Vector3());root.position.x-=center.x;root.position.z-=center.z;root.position.y-=box.min.y;
 mixer=new THREE.AnimationMixer(root);clips.clear();for(const clip of gltf.animations)clips.set(clip.name,clip);
 play(clips.has(oldName)?oldName:'Idle',oldTime);document.getElementById('meta').textContent=`LOD ${i} · ${countTriangles(root).toLocaleString('fr-FR')} triangles · ${gltf.animations.length} animations`;
 window.__pilot={ready:true,level,triangles:countTriangles(root),animations:[...clips.keys()],root};
}
function countTriangles(o){let n=0;o.traverse(x=>{if(x.isMesh){const g=x.geometry;n+=g.index?g.index.count/3:g.attributes.position.count/3;}});return Math.round(n);}
function play(name,time=0){if(!mixer||!clips.has(name))return;currentAction?.fadeOut(.18);currentAction=mixer.clipAction(clips.get(name));currentAction.reset().setLoop(name==='Death'?THREE.LoopOnce:THREE.LoopRepeat);currentAction.clampWhenFinished=true;currentAction.time=time;currentAction.fadeIn(.18).play();document.querySelectorAll('[data-action]').forEach(b=>b.classList.toggle('on',b.dataset.action===name));}
document.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>play(b.dataset.action));document.querySelectorAll('[data-lod]').forEach(b=>b.onclick=()=>loadLevel(+b.dataset.lod));
canvas.addEventListener('pointerdown',e=>{drag=true;lastX=e.clientX;lastY=e.clientY;canvas.setPointerCapture(e.pointerId)});canvas.addEventListener('pointerup',()=>drag=false);canvas.addEventListener('pointermove',e=>{if(!drag)return;yaw-=(e.clientX-lastX)*.008;pitch=Math.max(-.2,Math.min(.32,pitch+(e.clientY-lastY)*.004));lastX=e.clientX;lastY=e.clientY});canvas.addEventListener('wheel',e=>{distance=Math.max(4.3,Math.min(11,distance+Math.sign(e.deltaY)*.55));e.preventDefault()},{passive:false});
function resize(){const w=innerWidth,h=innerHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix()}addEventListener('resize',resize);resize();
const clock=new THREE.Clock();function tick(){requestAnimationFrame(tick);const dt=Math.min(.05,clock.getDelta());mixer?.update(dt);const target=new THREE.Vector3(0,1.48,0);camera.position.set(Math.sin(yaw)*distance,1.55+Math.sin(pitch)*distance*.5,Math.cos(yaw)*distance);camera.lookAt(target);renderer.render(scene,camera);frames++;const now=performance.now();if(now-lastStat>1000){document.getElementById('fps').textContent=Math.round(frames*1000/(now-lastStat))+' FPS';frames=0;lastStat=now;}}
loadLevel(0).then(()=>document.body.classList.add('ready'));tick();

import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createModel } from '../game/models.js';
// Export the actual procedural poses, not unrelated stock animation clips.
export async function exportModel(spec) {
  const model=createModel(spec);model.root.name='actor';const bones=[model.root];model.root.traverse(o=>{if(o.isBone)bones.push(o);});
  const rest=bones.map(b=>({p:b.position.clone(),q:b.quaternion.clone(),s:b.scale.clone()}));
  const clips=[];
  for(const [name,speed,action] of [['idle',0,null],['walk',3,null],['run',7,null],['attack',0,'attack'],['hit',0,'hit'],['cast',0,'cast'],['death',0,'death']]) {
    const duration=name==='death'?1:2,times=[],positions=bones.map(()=>[]),rotations=bones.map(()=>[]),scales=bones.map(()=>[]);
    model.revive();bones.forEach((b,i)=>{b.position.copy(rest[i].p);b.quaternion.copy(rest[i].q);b.scale.copy(rest[i].s);});model.t=0;model.phase=0;model.action=null;if(action==='death')model.die();else if(action)model.play(action,duration);
    for(let frame=0;frame<=60;frame++){times.push(frame/60*duration);model.update(duration/60,speed);bones.forEach((b,i)=>{positions[i].push(...b.position.toArray());rotations[i].push(...b.quaternion.toArray());scales[i].push(...b.scale.toArray());});}
    const tracks=[];bones.forEach((b,i)=>{tracks.push(new THREE.VectorKeyframeTrack(b.name+'.position',times,positions[i]),new THREE.QuaternionKeyframeTrack(b.name+'.quaternion',times,rotations[i]),new THREE.VectorKeyframeTrack(b.name+'.scale',times,scales[i]));});
    clips.push(new THREE.AnimationClip(name,duration,tracks));
  }
  model.revive();model.update(0,0);
  const result=await new GLTFExporter().parseAsync(model.root,{binary:true,animations:clips});model.dispose();return result;
}
export async function loadModel(buffer) { return new GLTFLoader().parseAsync(buffer,''); }

import { ZONES,HUBS,LANDMARKS,LANDMARK_BY_ID,ROADS } from './zones.js';
import { QUESTS,QUEST_BY_ID } from './quests.js';
import { STORY_CAMPS } from './lore.js';

const regions={
 val:['Les Vergers de Sereine','Le Phare des Veilleurs','La Ferme des Trois Sources','loup_pres'],
 terres:['Le Relais des Jarres','Les Aiguilles du Levant','Le Puits des Nomades','hyene'],
 bois:['Le Refuge des Mousses','La Clairière des Lucioles','Le Chêne des Serments','araignee'],
 canyon:['La Halte des Arpenteurs','Les Piliers Rouges','La Galerie du Vent','kobold'],
 marais:['Le Refuge des Roseaux','Le Cercle des Brumes','Les Lanternes Noyées','crapoussin'],
 coeur:['Le Camp des Archivistes','La Rotonde Brisée','Le Jardin du Roi','squelette'],
 pics:['Le Refuge du Givre','La Vigie des Neiges','Le Cercle Boréal','loup_neiges'],
 desolation:['Le Relais de Suie','Les Dents de Verre','La Forge Oubliée','chien_lave'],
 cime:['Le Bivouac des Nuages','Les Trois Paratonnerres','Le Belvédère des Échos','harpie'],
};
export const EXPEDITIONS=[];
// Every class sanctuary joins its faction's nearest settlement.
for(const sanctuary of HUBS.filter(h=>h.type==='sanctuary')){
 const nearest=HUBS.filter(h=>h.type!=='sanctuary'&&h.faction===sanctuary.faction&&h.zone===sanctuary.zone).sort((a,b)=>Math.hypot(a.x-sanctuary.x,a.z-sanctuary.z)-Math.hypot(b.x-sanctuary.x,b.z-sanctuary.z))[0];
 if(nearest)ROADS.push([sanctuary.id,nearest.id]);
}
for(const zone of ZONES){
 const names=regions[zone.id],cx=(zone.col-1)*1320,cz=(zone.row-1)*1320;
 const offsets=[[-250,-210],[310,-240],[230,290]];
 const places=offsets.map(([dx,dz],i)=>({id:`exp_${zone.id}_${i}`,name:names[i],zone:zone.id,x:cx+dx,z:cz+dz,r:22,kind:'expedition',biome:zone.biome,variant:i}));
 for(const lm of places){LANDMARKS.push(lm);LANDMARK_BY_ID[lm.id]=lm;EXPEDITIONS.push(lm);}
 const home=HUBS.filter(h=>h.zone===zone.id&&h.type!=='sanctuary').sort((a,b)=>Math.hypot(a.x-cx,a.z-cz)-Math.hypot(b.x-cx,b.z-cz))[0];
 ROADS.push([home.id,places[0].id,places[1].id,places[2].id,home.id]);
 for(const lm of places.slice(1)) STORY_CAMPS.push([lm.id,[[names[3],5]],{r:18}]);
 for(const faction of [0,1]){
  const giver=faction?'pm_forge_cendre':'pm_havrebleu';
  const q={id:`survey_${zone.id}_${faction}`,name:`Cartographier : ${zone.name}`,zone:zone.id,lvl:Math.max(3,zone.lvl[0]),faction,prereq:[],giver,turnin:giver,
   obj:places.map(l=>({t:'explore',lm:l.id,r:28,label:`Relever ${l.name}`})),gear:true,
   text:`Nos cartes s'arrêtent aux grandes routes. Relevez les trois étapes de ${zone.name}, puis rapportez vos notes. Les chemins secondaires relient chaque lieu ; les deux derniers sont occupés par la faune locale.`,
   done:'Les distances et les repères sont consignés. Ces relevés serviront aux prochains voyageurs.'};
  QUESTS.push(q);QUEST_BY_ID[q.id]=q;
 }
}

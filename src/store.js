(function(global){
'use strict';
const STORAGE_KEY='harmony-studio-v1';
const LEGACY_KEYS={lab:'my-harmony-dictionary-v1',songs:'my-song-atlas-v1'};
const clone=value=>structuredClone(value);
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
const owns=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
const viewKey=view=>{if(view==='lab')return 'lab';if(view==='songs')return 'atlas';throw Error('Choose the Song Atlas or Phrase Lab workspace.');};
function text(value,label,optional=true){if(value===undefined&&optional)return;if(typeof value!=='string')throw Error(label+' must be text.');}
function textMap(value,label){if(value===undefined)return;if(!plain(value))throw Error(label+' must be a collection of text notes.');for(const item of Object.values(value))text(item,label,false);}
function textList(value,label){if(value===undefined)return;if(!Array.isArray(value)||value.some(item=>typeof item!=='string'))throw Error(label+' must be a list of text.');}
function version(value,label){if(value!==undefined&&value!==1)throw Error(label+' uses an unsupported backup version.');}
function validateEntry(entry,H){
 H.validateEntries([entry]);
 for(const key of ['summary','analysis','useWhen','experimentDescription','variantOf'])text(entry[key],'Entry '+key);
 for(const key of ['voiceLeading','compositionTips','changeLog'])textList(entry[key],'Entry '+key);
 if(entry.bars.length>128)throw Error('A dictionary entry can contain no more than 128 bars.');
 for(const bar of entry.bars){
  if(!bar.chords.length)throw Error('Dictionary bars need chords; unmapped bars belong in Song Atlas.');
  for(const chord of bar.chords){
   if(typeof chord.beats!=='number'||!Number.isFinite(chord.beats)||Math.abs(chord.beats*4-Math.round(chord.beats*4))>1e-6)throw Error('Chord durations must use quarter-beat steps.');
   text(chord.roman,'Chord function');text(chord.comment,'Chord note');
  }
 }
 if(entry.noteGuide!==undefined&&entry.noteGuide!==null){
  if(!plain(entry.noteGuide))throw Error('An entry note guide needs its note details.');
  textList(entry.noteGuide.diatonic,'Home-key notes');
  if(!Array.isArray(entry.noteGuide.diatonic))throw Error('Home-key notes must be a list of text.');
  if(entry.noteGuide.chromatic!==undefined){if(!Array.isArray(entry.noteGuide.chromatic))throw Error('Chromatic notes must be a list.');for(const note of entry.noteGuide.chromatic){if(!plain(note))throw Error('A chromatic note is missing its description.');text(note.note,'Chromatic note',false);text(note.role,'Chromatic-note role',false);}}
 }
 if(entry.listeningExamples!==undefined){
  if(!Array.isArray(entry.listeningExamples))throw Error('Real music examples must be a list.');
  for(const example of entry.listeningExamples){if(!plain(example))throw Error('A real music example is missing its details.');text(example.title,'Music example title',false);for(const key of ['id','artist','url','location','note'])text(example[key],'Music example '+key);}
 }
 if(entry.sourceSong!==undefined){if(!plain(entry.sourceSong))throw Error('The source-song connection is unreadable.');for(const key of ['songId','sectionId','title','artist','sectionName'])text(entry.sourceSong[key],'Source song '+key);}
}
function validateLab(input,H){
 if(!plain(input))throw Error('The Phrase Lab backup is missing its collection.');
 version(input.version,'Phrase Lab');H.validateEntries(input.entries);
 input.entries.forEach(entry=>validateEntry(entry,H));
 textMap(input.notes,'Listening notes');textList(input.favorites,'Favourites');text(input.selectedId,'Selected dictionary entry');
 if(input.experiments!==undefined){if(!plain(input.experiments))throw Error('Harmony experiments must be a collection.');for(const entry of Object.values(input.experiments))validateEntry(entry,H);}
 return {...clone(input),version:1,notes:clone(input.notes||{}),favorites:clone(input.favorites||[]),selectedId:input.selectedId||input.entries[0].id,experiments:clone(input.experiments||{})};
}
function validateAtlas(input,A){
 if(!plain(input)||!Array.isArray(input.songs)||!input.songs.length||input.songs.length>100)throw Error('The Song Atlas backup must contain 1–100 songs.');
 version(input.version,'Song Atlas');const ids=new Set();
 input.songs.forEach(song=>{A.validateSong(song);if(ids.has(song.id))throw Error('Every song needs its own unique ID.');ids.add(song.id);});
 textMap(input.notes,'Song listening notes');textMap(input.sections,'Selected song sections');text(input.selectedId,'Selected song');
 return {...clone(input),version:1,notes:clone(input.notes||{}),sections:clone(input.sections||{}),selectedId:input.selectedId||input.songs[0].id};
}
function create(options){
 const {H=global.HarmonyCore,A=global.AtlasCore,onChange}=options||{};
 if(!H||typeof H.validateEntries!=='function'||!A||typeof A.validateSong!=='function')throw Error('The music engines must load before the studio collection.');
 const labSeed=Array.isArray(options.labSeed)?{entries:options.labSeed}:options.labSeed;
 const atlasSeed=Array.isArray(options.atlasSeed)?{songs:options.atlasSeed}:options.atlasSeed;
 const defaults={format:'harmony-studio',schemaVersion:1,lab:validateLab({version:1,entries:clone(labSeed.entries),notes:{},favorites:[],selectedId:labSeed.entries[0].id,experiments:{}},H),atlas:validateAtlas({version:1,songs:clone(atlasSeed.songs),notes:{},sections:{},selectedId:atlasSeed.songs[0].id},A),activeView:'songs'};
 let state=defaults,lastError='',storage,recoveryBlocked=false;
 const recovery=[],recoveryParts=new Set(),listeners=new Set();
 if(typeof onChange==='function')listeners.add(onChange);
 try{storage=owns(options,'storage')?options.storage:global.localStorage;}catch(error){lastError='Browser storage is unavailable. Changes stay in this session; back up before closing.';}
 function validateEnvelope(input){
  if(!plain(input)||input.format!=='harmony-studio'||input.schemaVersion!==1)throw Error('Choose a Harmony Studio version 1 backup.');
  if(input.activeView!==undefined&&!['songs','lab'].includes(input.activeView))throw Error('The saved workspace is unreadable.');
  return {...clone(input),format:'harmony-studio',schemaVersion:1,lab:validateLab(input.lab,H),atlas:validateAtlas(input.atlas,A),activeView:input.activeView||'songs'};
 }
 function read(key){if(!storage)return null;return storage.getItem(key);}
 function blocked(key,raw,error){recoveryBlocked=true;for(const part of key===STORAGE_KEY?['lab','songs']:key===LEGACY_KEYS.lab?['lab']:['songs'])recoveryParts.add(part);recovery.push({key,raw,error:error.message||String(error)});lastError='A saved collection could not be read. Its stored record has been kept for recovery. Import a valid backup before saving over it.';}
 let combined;
 try{combined=read(STORAGE_KEY);}catch(error){lastError='Browser storage is unavailable. Changes stay in this session; back up before closing.';}
 if(combined!==null&&combined!==undefined){try{state=validateEnvelope(JSON.parse(combined));}catch(error){blocked(STORAGE_KEY,combined,error);}}
 else for(const [view,key]of Object.entries(LEGACY_KEYS)){
  let raw;try{raw=read(key);}catch(error){lastError='Browser storage is unavailable. Changes stay in this session; back up before closing.';continue;}
  if(raw!==null&&raw!==undefined){try{state[viewKey(view)]=view==='lab'?validateLab(JSON.parse(raw),H):validateAtlas(JSON.parse(raw),A);}catch(error){blocked(key,raw,error);}}
 }
 function stats(){return {entries:state.lab.entries.length,songs:state.atlas.songs.length,experiments:Object.keys(state.lab.experiments||{}).length};}
 function emit(){const info=stats();for(const listener of listeners){try{listener(clone(info));}catch(error){/* A display listener cannot invalidate an already-saved collection. */}}}
 function persist(){
  if(recoveryBlocked)return false;
  try{if(!storage||typeof storage.setItem!=='function')throw Error('Storage is unavailable.');storage.setItem(STORAGE_KEY,JSON.stringify(state));lastError='';return true;}
  catch(error){lastError='The browser could not save this collection. Your changes are still in this session; use Back up everything before closing.';return false;}
 }
 function planImport(data){
  if(!plain(data))throw Error('Choose a Harmony Studio, Phrase Lab, or Song Atlas JSON backup.');
  if(data.format==='harmony-studio'||owns(data,'lab')||owns(data,'atlas'))return {kind:'studio',parts:['lab','songs'],candidate:validateEnvelope(data),replaces:'Both workspaces'};
  if(owns(data,'entries')&&owns(data,'songs'))throw Error('This backup mixes two older formats. Import each original backup separately.');
  if(owns(data,'entries'))return {kind:'lab',parts:['lab'],candidate:{...clone(state),lab:validateLab(data,H)},replaces:'Phrase Lab only'};
  if(owns(data,'songs'))return {kind:'atlas',parts:['songs'],candidate:{...clone(state),atlas:validateAtlas(data,A)},replaces:'Song Atlas only'};
  throw Error('This file does not contain a studio, dictionary, or song collection.');
 }
 function describe(plan){return {kind:plan.kind,parts:clone(plan.parts),replaces:plan.replaces,counts:{entries:plan.candidate.lab.entries.length,songs:plan.candidate.atlas.songs.length,experiments:Object.keys(plan.candidate.lab.experiments||{}).length}};}
 return {
  getPart(view){return clone(state[viewKey(view)]);},
  setPart(view,value){const key=viewKey(view),next=view==='lab'?validateLab(value,H):validateAtlas(value,A);state={...state,[key]:next,updatedAt:new Date().toISOString()};const saved=persist();emit();return saved;},
  getActiveView(){return state.activeView;},
  setActiveView(view){viewKey(view);state.activeView=view;const saved=persist();emit();return saved;},
  exportBackup(){return {...clone(state),format:'harmony-studio',schemaVersion:1,exportedAt:new Date().toISOString()};},
  previewBackup(data){return describe(planImport(data));},
  importBackup(data){const plan=planImport(data);state={...plan.candidate,updatedAt:new Date().toISOString()};plan.parts.forEach(part=>recoveryParts.delete(part));recoveryBlocked=recoveryParts.size>0;const saved=persist();emit();return {...describe(plan),persisted:saved};},
  subscribe(listener){if(typeof listener!=='function')throw Error('A collection subscriber must be a function.');listeners.add(listener);return ()=>listeners.delete(listener);},
  stats,getLastError:()=>lastError,getRecoveryData:()=>clone(recovery)
 };
}
global.StudioStore={create,STORAGE_KEY,LEGACY_KEYS};
if(typeof module!=='undefined'&&module.exports)module.exports=global.StudioStore;
})(typeof window!=='undefined'?window:globalThis);

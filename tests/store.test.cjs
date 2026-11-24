'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const H=require('../src/harmony-core.js');
global.HarmonyCore=H;
const A=require('../src/atlas-core.js');
const {create,STORAGE_KEY,LEGACY_KEYS}=require('../src/store.js');
const labSeed=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/library.json'),'utf8'));
const atlasSeed=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/songs.json'),'utf8'));
const clone=value=>structuredClone(value);
class MemoryStorage{
 constructor(initial={}){this.items=new Map(Object.entries(initial));this.writes=[];this.fail=false;}
 getItem(key){return this.items.has(key)?this.items.get(key):null;}
 setItem(key,value){if(this.fail)throw Error('Quota exceeded');this.items.set(key,value);this.writes.push(key);}
}
const make=storage=>create({storage,labSeed,atlasSeed,H,A});
function personalLab(excludedId){
 const entries=clone(labSeed.entries).filter(entry=>entry.id!==excludedId).reverse(),first=entries[0];
 first.listeningExamples=[{id:'test-song',title:'A song I want to remember',artist:'A recording',url:'https://example.com',location:'Verse, 1:02',note:'The melody holds over the chord change.'}];
 const experiment=clone(first);experiment.title+=' — experiment';
 return {version:1,entries,notes:{[first.id]:'My listening note',[first.id+':experiment']:'My alternative note'},favorites:[first.id],selectedId:first.id,experiments:{[first.id]:experiment}};
}
function personalAtlas(){
 const songs=clone(atlasSeed.songs),song=songs[0];song.thesis='My own expressive thread';
 return {version:1,songs,notes:{[song.id]:'Hear the return differently.'},sections:{[song.id]:song.sections.at(-1).id},selectedId:song.id};
}
function olderPersonalAtlas(){
 const original=clone(atlasSeed.songs[0]);original.thesis='My edited original song';
 const custom={...clone(original),id:'my-saved-song',title:'My own song'};
 return {version:1,songs:[custom,original],notes:{[custom.id]:'Keep my notes',[original.id]:'Keep my original-song notes'},sections:{[custom.id]:custom.sections.at(-1).id},selectedId:custom.id};
}

test('older collections gain missing default songs on load and import while saved work stays intact',()=>{
 const atlas=olderPersonalAtlas(),lab=personalLab();
 const combined={format:'harmony-studio',schemaVersion:1,lab,atlas,activeView:'lab'};
 const originalInput=clone(combined),originalSeed=clone(atlasSeed);
 const expectedIds=[...atlas.songs.map(song=>song.id),...atlasSeed.songs.slice(1).map(song=>song.id)];
 for(const mode of ['combined load','legacy load','combined import','atlas import']){
  const initial=mode==='combined load'?{[STORAGE_KEY]:JSON.stringify(combined)}
   :mode==='legacy load'?{[LEGACY_KEYS.lab]:JSON.stringify(lab),[LEGACY_KEYS.songs]:JSON.stringify(atlas)}:{};
  const storage=new MemoryStorage(initial),store=make(storage);
  if(mode==='combined import'||mode==='atlas import'){
   const input=mode==='combined import'?combined:atlas;
   const before=store.getPart('songs');
   assert.equal(store.previewBackup(input).counts.songs,expectedIds.length,mode);
   assert.deepEqual(store.getPart('songs'),before,mode);
   assert.equal(store.importBackup(input).persisted,true,mode);
  }else{
   assert.equal(storage.writes.length,0,mode);
  }
  const saved=store.getPart('songs');
  assert.deepEqual(saved.songs.map(song=>song.id),expectedIds,mode);
  assert.deepEqual(saved.songs.slice(0,atlas.songs.length),atlas.songs,mode);
  assert.deepEqual(saved.notes,atlas.notes,mode);
  assert.deepEqual(saved.sections,atlas.sections,mode);
  assert.equal(saved.selectedId,atlas.selectedId,mode);
  assert.equal(store.setActiveView('lab'),true,mode);
  const reopened=make(storage);
  assert.deepEqual(reopened.getPart('songs'),saved,mode);
  assert.deepEqual(reopened.getPart('lab'),mode==='atlas import'?store.getPart('lab'):lab,mode);
  assert.equal(reopened.getActiveView(),'lab',mode);
  assert.deepEqual(combined,originalInput,mode);
  assert.deepEqual(atlasSeed,originalSeed,mode);
 }
});

test('missing emotional-profile fields are upgraded by song and section ID without changing saved work',()=>{
 const reference=atlasSeed.songs.find(song=>song.id==='engraved-name-crowd-lu');
 assert.equal(typeof reference.tensionNote,'string');
 assert.ok(reference.sections.every(section=>Number.isInteger(section.tension)));
 const atlas=personalAtlas(),saved=atlas.songs.find(song=>song.id===reference.id);
 saved.title='My saved song title';
 saved.thesis='My own interpretation';
 delete saved.tensionNote;
 saved.sections.forEach(section=>delete section.tension);
 saved.sections[0].tension=0;
 saved.sections[0].analysis='My own section reading';
 saved.sections[1].tension=4;
 saved.sections[2].id='my-renamed-section';
 const custom={...clone(saved),id:'my-own-reading'};
 atlas.songs.reverse();
 atlas.songs.push(custom);
 atlas.notes[saved.id]='My emotional listening notes';
 atlas.sections[saved.id]=saved.sections[2].id;
 atlas.selectedId=saved.id;
 const originalSong=atlas.songs.find(song=>song.id===atlasSeed.songs[0].id);
 delete originalSong.sections[0].tension;
 const expected=clone(atlas),expectedSong=expected.songs.find(song=>song.id===reference.id);
 expectedSong.tensionNote=reference.tensionNote;
 expectedSong.sections.slice(3).forEach((section,index)=>section.tension=reference.sections[index+3].tension);
 const combined={format:'harmony-studio',schemaVersion:1,lab:personalLab(),atlas,activeView:'songs'};
 const inputBefore=clone(combined),seedBefore=clone(atlasSeed);
 for(const mode of ['combined load','legacy load','combined import','atlas import']){
  const initial=mode==='combined load'?{[STORAGE_KEY]:JSON.stringify(combined)}
   :mode==='legacy load'?{[LEGACY_KEYS.songs]:JSON.stringify(atlas)}:{};
  const storage=new MemoryStorage(initial),store=make(storage);
  if(mode==='combined import'||mode==='atlas import'){
   const input=mode==='combined import'?combined:atlas;
   const before=store.getPart('songs');
   store.previewBackup(input);
   assert.deepEqual(store.getPart('songs'),before,mode);
   store.importBackup(input);
  }else{
   assert.equal(storage.writes.length,0,mode);
  }
  assert.deepEqual(store.getPart('songs'),expected,mode);
  store.setActiveView('songs');
  assert.deepEqual(make(storage).getPart('songs'),expected,mode);
  assert.deepEqual(combined,inputBefore,mode);
  assert.deepEqual(atlasSeed,seedBefore,mode);
 }
});

test('an authored emotional-profile note and zero score survive missing-score upgrades',()=>{
 const reference=atlasSeed.songs.find(song=>song.id==='engraved-name-crowd-lu');
 for(const note of ['My personal emotional arc','']){
  const saved=clone(reference);
  saved.tensionNote=note;
  saved.sections.forEach(section=>delete section.tension);
  saved.sections[0].tension=0;
  const atlas={version:1,songs:[saved],notes:{},sections:{},selectedId:saved.id};
  const store=make(new MemoryStorage());
  store.importBackup(atlas);
  const upgraded=store.getPart('songs').songs.find(song=>song.id===saved.id);
  assert.equal(upgraded.tensionNote,note);
  assert.equal(upgraded.sections[0].tension,0);
  assert.deepEqual(upgraded.sections.slice(1).map(section=>section.tension),reference.sections.slice(1).map(section=>section.tension));
 }
});

test('emotional-profile upgrades remain available while a damaged legacy record stays protected',()=>{
 const reference=atlasSeed.songs.find(song=>song.id==='engraved-name-crowd-lu'),saved=clone(reference);
 delete saved.tensionNote;
 saved.sections.forEach(section=>delete section.tension);
 const atlas={version:1,songs:[saved],notes:{},sections:{},selectedId:saved.id},raw='{"entries":[]}';
 const storage=new MemoryStorage({[LEGACY_KEYS.lab]:raw,[LEGACY_KEYS.songs]:JSON.stringify(atlas)}),store=make(storage);
 const upgraded=store.getPart('songs').songs.find(song=>song.id===saved.id);
 assert.equal(upgraded.tensionNote,reference.tensionNote);
 assert.deepEqual(upgraded.sections.map(section=>section.tension),reference.sections.map(section=>section.tension));
 assert.match(store.getLastError(),/recovery/);
 assert.equal(store.setActiveView('songs'),false);
 assert.equal(storage.getItem(LEGACY_KEYS.lab),raw);
 assert.equal(storage.getItem(LEGACY_KEYS.songs),JSON.stringify(atlas));
 assert.equal(storage.getItem(STORAGE_KEY),null);
});

test('adding default songs keeps a full collection intact and uses only available capacity',()=>{
 function savedAtlas(count){
  return {version:1,songs:Array.from({length:count},(_,index)=>({
   id:'saved-'+index,title:'Saved song '+index,key:'F',tempo:80,meter:[4,4],duration:3,
   sections:[{id:'opening',name:'Opening',startSeconds:0,endSeconds:3,bars:[{chords:[{symbol:'F',beats:4,notes:[41,53,57,60]}]}]}]
  })),notes:{'saved-0':'Keep this note'},sections:{'saved-0':'opening'},selectedId:'saved-0'};
 }
 for(const count of [99,100]){
  const atlas=savedAtlas(count),store=make(new MemoryStorage({[LEGACY_KEYS.songs]:JSON.stringify(atlas)}));
  const saved=store.getPart('songs');
  assert.equal(saved.songs.length,100);
  assert.deepEqual(saved.songs.slice(0,count),atlas.songs);
  assert.deepEqual(saved.notes,atlas.notes);
  assert.deepEqual(saved.sections,atlas.sections);
  assert.equal(saved.selectedId,atlas.selectedId);
  if(count===99)assert.deepEqual(saved.songs[99],atlasSeed.songs[0]);
  assert.equal(new Set(saved.songs.map(song=>song.id)).size,100);
  store.importBackup(atlas);
  assert.deepEqual(store.getPart('songs'),saved);
 }
});

test('default-song additions preserve recovery blocks and remain available through storage failures',()=>{
 const atlas=olderPersonalAtlas(),lab=personalLab(),broken='{"entries":[]}';
 const storage=new MemoryStorage({[LEGACY_KEYS.lab]:broken,[LEGACY_KEYS.songs]:JSON.stringify(atlas)});
 const store=make(storage),merged=store.getPart('songs');
 assert.equal(merged.songs.length,atlas.songs.length+atlasSeed.songs.length-1);
 assert.match(store.getLastError(),/recovery/);
 assert.equal(store.setPart('songs',merged),false);
 assert.equal(storage.getItem(LEGACY_KEYS.lab),broken);
 assert.equal(storage.getItem(LEGACY_KEYS.songs),JSON.stringify(atlas));
 assert.equal(storage.getItem(STORAGE_KEY),null);
 storage.fail=true;
 assert.equal(store.importBackup(lab).persisted,false);
 assert.deepEqual(store.exportBackup().atlas,merged);
 assert.match(store.getLastError(),/still in this session/);
 storage.fail=false;
 assert.equal(store.setActiveView('songs'),true);
 assert.deepEqual(make(storage).getPart('songs'),merged);
});

test('old collections gain the chorus study and its section links on load and import',()=>{
 const studyId='engraved-name-chorus-study';
 const study=labSeed.entries.find(entry=>entry.id===studyId);
 assert.ok(study);
 const lab=personalLab(studyId),atlas=personalAtlas();
 const song=atlas.songs.find(entry=>entry.id===study.sourceSong.songId);
 const linkedSections=song.sections.filter(section=>section.relatedEntryIds?.includes(studyId));
 assert.deepEqual(linkedSections.map(section=>section.id),['chorus-one','chorus-two','chorus-answer']);
 for(const section of linkedSections) {
  section.relatedEntryIds=section.relatedEntryIds.filter(id=>id!==studyId);
  section.relatedEntryIds.push('my-related-entry');
 }
 linkedSections[0].analysis='My own chorus reading.';
 atlas.notes[song.id]='My own note on the chorus.';
 atlas.selectedId=song.id;
 atlas.sections[song.id]=linkedSections[0].id;
 atlas.songs.push({...clone(song),id:'my-variation',title:'My chorus variation',variationOf:song.id});
 const combined={format:'harmony-studio',schemaVersion:1,lab,atlas,activeView:'songs'};
 const initialInput=clone(combined);
 const expectedAtlas=clone(atlas);
 const expectedSong=expectedAtlas.songs.find(entry=>entry.id===song.id);
 for(const section of expectedSong.sections) {
  if(linkedSections.some(original=>original.id===section.id))section.relatedEntryIds.push(studyId);
 }
 const expectedLab={...lab,entries:[...lab.entries,study]};

 for(const mode of ['combined load','legacy load','combined import','workspace imports']) {
  const initial=mode==='combined load'?{[STORAGE_KEY]:JSON.stringify(combined)}
   :mode==='legacy load'?{[LEGACY_KEYS.lab]:JSON.stringify(lab),[LEGACY_KEYS.songs]:JSON.stringify(atlas)}:{};
  const storage=new MemoryStorage(initial),store=make(storage);
  if(mode==='combined import') {
   const before=store.exportBackup();
   assert.equal(store.previewBackup(combined).counts.entries,expectedLab.entries.length);
   assert.deepEqual(store.getPart('lab'),before.lab);
   assert.deepEqual(store.getPart('songs'),before.atlas);
   assert.equal(store.importBackup(combined).persisted,true);
  }else if(mode==='workspace imports') {
   const before=store.getPart('songs');
   assert.equal(store.importBackup(lab).persisted,true);
   assert.deepEqual(store.getPart('songs'),before);
   assert.equal(store.importBackup(atlas).persisted,true);
  }else{
   assert.equal(storage.writes.length,0,mode);
  }
  assert.deepEqual(store.getPart('lab'),expectedLab,mode);
  assert.deepEqual(store.getPart('songs'),expectedAtlas,mode);
  assert.deepEqual(combined,initialInput,mode);
  assert.equal(store.setActiveView('lab'),true,mode);
  const reopened=make(storage);
  assert.deepEqual(reopened.getPart('lab'),expectedLab,mode);
  assert.deepEqual(reopened.getPart('songs'),expectedAtlas,mode);
 }
});

test('the chorus upgrade preserves authored studies and respects collection limits',()=>{
 const studyId='engraved-name-chorus-study';
 const lab=personalLab();
 const study=lab.entries.find(entry=>entry.id===studyId);
 study.title='My edited study';
 const edited=make(new MemoryStorage({[LEGACY_KEYS.lab]:JSON.stringify(lab)}));
 assert.deepEqual(edited.getPart('lab'),lab);

 const fullLab=personalLab(studyId);
 const template={...clone(fullLab.entries[0]),bars:fullLab.entries[0].bars.slice(0,1)};
 while(fullLab.entries.length<1000)fullLab.entries.push({...template,id:'personal-'+fullLab.entries.length});
 const fullLinks=Array.from({length:40},(_,index)=>'personal-link-'+index);
 const atlas=personalAtlas(),song=atlas.songs.find(entry=>entry.id===study.sourceSong.songId);
 song.sections.find(section=>section.id===study.sourceSong.sectionId).relatedEntryIds=fullLinks;
 const store=make(new MemoryStorage({
  [LEGACY_KEYS.lab]:JSON.stringify(fullLab),
  [LEGACY_KEYS.songs]:JSON.stringify(atlas)
 }));
 assert.deepEqual(store.getPart('lab'),fullLab);
 assert.deepEqual(store.getPart('songs'),atlas);
 assert.equal(store.setActiveView('lab'),true);
});

test('starts with both seeded workspaces and gives callers isolated copies',()=>{
 const storage=new MemoryStorage(),store=make(storage);
 assert.deepEqual(store.stats(),{entries:labSeed.entries.length,songs:atlasSeed.songs.length,experiments:0});
 const lab=store.getPart('lab');lab.entries.reverse();lab.notes.private='Does not belong in the store yet';
 assert.equal(store.getPart('lab').entries[0].id,labSeed.entries[0].id);assert.equal(store.getPart('lab').notes.private,undefined);
 const exported=store.exportBackup();exported.atlas.songs[0].title='Not saved';assert.equal(store.getPart('songs').songs[0].title,atlasSeed.songs[0].title);
 assert.throws(()=>store.getPart('unknown'),/workspace/);
});
test('migrates both legacy keys without losing order, notes, examples, drafts or selections',()=>{
 const lab=personalLab(),atlas=personalAtlas(),storage=new MemoryStorage({[LEGACY_KEYS.lab]:JSON.stringify(lab),[LEGACY_KEYS.songs]:JSON.stringify(atlas)}),store=make(storage);
 assert.deepEqual(store.getPart('lab'),lab);assert.deepEqual(store.getPart('songs'),atlas);
 assert.equal(store.setActiveView('lab'),true);
 assert.deepEqual(storage.writes,[STORAGE_KEY]);
 assert.equal(storage.getItem(LEGACY_KEYS.lab),JSON.stringify(lab));
 const reopened=make(storage);assert.deepEqual(reopened.getPart('lab'),lab);assert.deepEqual(reopened.getPart('songs'),atlas);assert.equal(reopened.getActiveView(),'lab');
});
test('one combined backup restores both collections exactly',()=>{
 const source=make(new MemoryStorage());source.setPart('lab',personalLab());source.setPart('songs',personalAtlas());source.setActiveView('lab');
 const backup=source.exportBackup(),target=make(new MemoryStorage());
 assert.equal(backup.format,'harmony-studio');assert.equal(backup.schemaVersion,1);assert.equal(typeof backup.exportedAt,'string');
 const preview=target.previewBackup(backup);assert.equal(preview.kind,'studio');assert.deepEqual(preview.parts,['lab','songs']);assert.equal(preview.counts.experiments,1);
 const before=target.exportBackup();target.previewBackup(backup);assert.deepEqual(target.getPart('lab'),before.lab);
 const result=target.importBackup(backup);assert.equal(result.persisted,true);assert.deepEqual(target.getPart('lab'),source.getPart('lab'));assert.deepEqual(target.getPart('songs'),source.getPart('songs'));assert.equal(target.getActiveView(),'lab');
});
test('importing either older backup leaves the other workspace untouched',()=>{
 const store=make(new MemoryStorage()),atlasBefore=store.getPart('songs');
 const labResult=store.importBackup({...personalLab(),format:'my-harmony-dictionary'});assert.equal(labResult.kind,'lab');assert.deepEqual(labResult.parts,['lab']);assert.deepEqual(store.getPart('songs'),atlasBefore);
 const labBefore=store.getPart('lab'),atlasResult=store.importBackup({...personalAtlas(),format:'my-song-atlas'});assert.equal(atlasResult.kind,'atlas');assert.deepEqual(atlasResult.parts,['songs']);assert.deepEqual(store.getPart('lab'),labBefore);
});
test('malformed imports are atomic and never replace a valid collection',()=>{
 const storage=new MemoryStorage(),store=make(storage);store.setPart('lab',personalLab());store.setPart('songs',personalAtlas());const before=store.exportBackup(),raw=storage.getItem(STORAGE_KEY),writes=storage.writes.length;
 const candidates=[];
 let bad=clone(before);bad.atlas.songs.push(clone(bad.atlas.songs[0]));candidates.push(bad);
 bad=clone(before);bad.lab.favorites={wrong:true};candidates.push(bad);
 bad=clone(before);bad.lab.notes={entry:{not:'text'}};candidates.push(bad);
 bad=clone(before);bad.lab.entries[0].voiceLeading='not a list';candidates.push(bad);
 bad=clone(before);bad.lab.entries[0].listeningExamples=[null];candidates.push(bad);
 bad=clone(before);bad.lab.entries[0].bars[0].chords[0].beats='4';candidates.push(bad);
 bad=clone(before);bad.atlas.songs[0].arc=[null];candidates.push(bad);
 bad=clone(before);bad.schemaVersion=20;candidates.push(bad);
 candidates.push({entries:before.lab.entries,songs:before.atlas.songs});
 for(const candidate of candidates){assert.throws(()=>store.previewBackup(candidate));assert.throws(()=>store.importBackup(candidate));assert.deepEqual(store.getPart('lab'),before.lab);assert.deepEqual(store.getPart('songs'),before.atlas);assert.equal(storage.getItem(STORAGE_KEY),raw);}
 assert.equal(storage.writes.length,writes);
});
test('invalid setPart fails before touching the current data',()=>{
 const store=make(new MemoryStorage()),before=store.getPart('lab'),bad=clone(before);bad.entries[0].notes='unrelated metadata';bad.experiments=[];
 assert.throws(()=>store.setPart('lab',bad),/experiments/);assert.deepEqual(store.getPart('lab'),before);
});
test('quota failure keeps the current session available for a full portable backup',()=>{
 const storage=new MemoryStorage(),store=make(storage);storage.fail=true;const lab=personalLab();
 assert.equal(store.setPart('lab',lab),false);assert.deepEqual(store.getPart('lab'),lab);assert.deepEqual(store.exportBackup().lab,lab);assert.match(store.getLastError(),/still in this session/);
 storage.fail=false;assert.equal(store.setPart('songs',personalAtlas()),true);assert.equal(store.getLastError(),'');assert.deepEqual(make(storage).getPart('lab'),lab);
});
test('subscribers see committed counts and cannot mutate the collection through callback data',()=>{
 const storage=new MemoryStorage(),calls=[],store=create({storage,labSeed,atlasSeed,H,A,onChange:stats=>calls.push(stats)}),other=[];
 const unsubscribe=store.subscribe(stats=>{stats.entries=999;other.push(stats);});store.setPart('lab',personalLab());
 assert.equal(calls.length,1);assert.equal(calls[0].entries,labSeed.entries.length);assert.equal(store.stats().entries,labSeed.entries.length);unsubscribe();store.setActiveView('lab');assert.equal(other.length,1);assert.equal(calls.length,2);
});
test('a corrupted stored record is preserved rather than overwritten by view initialization',()=>{
 const raw='{"format":"harmony-studio","schemaVersion":1,"lab":null}',storage=new MemoryStorage({[STORAGE_KEY]:raw}),store=make(storage);
 assert.match(store.getLastError(),/kept for recovery/);assert.deepEqual(store.getRecoveryData(),[{key:STORAGE_KEY,raw,error:'The Phrase Lab backup is missing its collection.'}]);
 assert.equal(store.setPart('lab',personalLab()),false);assert.equal(storage.getItem(STORAGE_KEY),raw);assert.equal(store.exportBackup().lab.entries[0].id,personalLab().entries[0].id);
 const recovery=store.getRecoveryData();recovery[0].raw='mutated copy';assert.equal(store.getRecoveryData()[0].raw,raw);
 const result=store.importBackup({format:'harmony-studio',schemaVersion:1,lab:personalLab(),atlas:personalAtlas()});assert.equal(result.persisted,true);assert.deepEqual(make(storage).getPart('songs'),personalAtlas());
});
test('a malformed legacy workspace does not erase its record or the valid other workspace',()=>{
 const atlas=personalAtlas(),raw='{"entries":[]}',storage=new MemoryStorage({[LEGACY_KEYS.lab]:raw,[LEGACY_KEYS.songs]:JSON.stringify(atlas)}),store=make(storage);
 assert.deepEqual(store.getPart('songs'),atlas);assert.match(store.getLastError(),/recovery/);assert.equal(store.setPart('songs',atlas),false);assert.equal(storage.getItem(LEGACY_KEYS.lab),raw);assert.equal(storage.getItem(STORAGE_KEY),null);
 assert.equal(store.importBackup(atlas).persisted,false);assert.equal(storage.getItem(STORAGE_KEY),null);
 assert.equal(store.importBackup(personalLab()).persisted,true);assert.deepEqual(store.getPart('songs'),atlas);
});

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
function personalLab(){
 const entries=clone(labSeed.entries).reverse(),first=entries[0];
 first.listeningExamples=[{id:'test-song',title:'A song I want to remember',artist:'A recording',url:'https://example.com',location:'Verse, 1:02',note:'The melody holds over the chord change.'}];
 const experiment=clone(first);experiment.title+=' — experiment';
 return {version:1,entries,notes:{[first.id]:'My listening note',[first.id+':experiment']:'My alternative note'},favorites:[first.id],selectedId:first.id,experiments:{[first.id]:experiment}};
}
function personalAtlas(){
 const songs=clone(atlasSeed.songs),song=songs[0];song.thesis='My own expressive thread';
 return {version:1,songs,notes:{[song.id]:'Hear the return differently.'},sections:{[song.id]:song.sections.at(-1).id},selectedId:song.id};
}
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

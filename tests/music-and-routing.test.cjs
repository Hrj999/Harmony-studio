'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const H=require('../src/harmony-core.js'),A=require('../src/atlas-core.js'),R=require('../src/routing.js');
const library=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/library.json'),'utf8'));
const atlas=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/songs.json'),'utf8'));
test('every starter phrase transposes and exports without changing beat length or sounding pitch spelling',()=>{
 H.validateEntries(library.entries);
 for(const entry of library.entries)for(const key of H.keys){const delta=H.shift(entry.key,key),timeline=H.timeline(entry,delta,key);assert.equal(timeline.beats,entry.bars.length*4);for(const c of timeline.events)for(const note of c.notes){const p=H.spell(note,c.symbol,key);assert.equal((p.octave+1)*12+{C:0,D:2,E:4,F:5,G:7,A:9,B:11}[p.step]+p.alter,note);}assert.equal(Buffer.from(H.midi(entry,delta,key,entry.tempo).slice(0,4)).toString(),'MThd');assert(!H.musicxml(entry,delta,key,entry.tempo).includes('undefined'));}
});
test('a changed phrase replaces its exact song range and keeps the original and surroundings',()=>{
 const song=atlas.songs[0];A.validateSong(song);const original=structuredClone(song),section=song.sections.find(s=>!s.bars.some(b=>b.rest)),entry=A.phraseEntry(song,section,1,2);entry.bars[0].chords[0].symbol='Fmaj7';entry.bars[0].chords[0].notes=H.alterVoicing(entry.bars[0].chords[0].notes,'Fmaj7');const variation=A.applyPhraseToSong(song,entry);assert.deepEqual(song,original);assert.notEqual(variation.id,song.id);assert.equal(variation.duration,song.duration);const changed=variation.sections.find(s=>s.id===section.id);assert.equal(changed.bars[0].chords[0].symbol,'Fmaj7');assert.deepEqual(changed.bars.slice(2),section.bars.slice(2));assert.deepEqual(variation.sections.filter(s=>s.id!==section.id),song.sections.filter(s=>s.id!==section.id));assert.equal(Buffer.from(A.midi(song).slice(0,4)).toString(),'MThd');
});
test('unmapped bars cannot accidentally become a sounding Lab phrase',()=>{
 const song=atlas.songs[0];assert.throws(()=>A.phraseEntry(song,song.sections[0],1,2),/unmapped/);
});
test('full harmony plays the mapped chords immediately and keeps their song timestamps',()=>{
 for(const song of atlas.songs){
  const timeline=A.playbackEvents(song);
  const {events,duration}=A.harmonyAudition(song);
  assert.ok(timeline[0].startSeconds>0);
  assert.equal(events[0].offsetSeconds,0);
  assert.deepEqual(events.map(({offsetSeconds,...event})=>event),timeline);
  for(let i=1;i<events.length;i++){
   assert.equal(events[i].offsetSeconds,events[i-1].offsetSeconds+events[i-1].durationSeconds);
  }
  assert.equal(duration,events.at(-1).offsetSeconds+events.at(-1).durationSeconds);
  assert.ok(duration<song.duration);
 }
 const song=atlas.songs.find(song=>song.id==='engraved-name-crowd-lu');
 const {events}=A.harmonyAudition(song);
 assert.ok(events[0].startSeconds>27);
 assert.equal(events.at(-1).beats,8);
 assert.deepEqual(A.harmonyAudition({...song,sections:song.sections.filter(section=>section.id==='exposed-refrain')}),{events:[],duration:0});
});
test('Song Atlas shifts the whole arrangement and MIDI into the chosen key without changing source timing',()=>{
 for(const song of atlas.songs){
  const original=structuredClone(song);
  const reference=A.harmonyAudition(song);
  for(const key of H.keys){
   const delta=H.shift(song.key,key);
   const shifted=A.harmonyAudition(song,key);
   assert.equal(shifted.duration,reference.duration);
   assert.equal(shifted.events.length,reference.events.length);
   shifted.events.forEach((event,index)=>{
    const source=reference.events[index];
    assert.equal(event.symbol,H.transposeSymbol(source.symbol,delta,key));
    assert.deepEqual(event.notes,source.notes.map(note=>note+delta));
    assert.equal(event.startSeconds,source.startSeconds);
    assert.equal(event.offsetSeconds,source.offsetSeconds);
    assert.equal(event.durationSeconds,source.durationSeconds);
   });
  }
  assert.deepEqual(song,original);
 }
 const song=atlas.songs.find(song=>song.id==='engraved-name-crowd-lu');
 const chorus=A.buildTimeline(song,'F').events.filter(event=>event.sectionId==='chorus-one');
 assert.deepEqual(chorus.map(event=>event.symbol),['F','A7','Dm7','G7/B']);
 assert.equal(chorus[3].roman,'V7/V (B in bass)');
 const midi=Buffer.from(A.midi(song,'F'));
 assert.ok(midi.includes(Buffer.from([0xff,0x59,2,0xff,0])));
 assert.ok(midi.includes(Buffer.from('G7/B ? | V7/V (B in bass)')));
});
test('routes preserve Unicode phrase data on GitHub project subpaths and local files',()=>{
 for(const base of['https://user.github.io/harmony-studio/index.html','file:///C:/Music/Harmony%20Studio/index.html']){const entry=A.phraseEntry(atlas.songs[0],atlas.songs[0].sections[1],1,2),url=A.linkToLab(entry),target=R.fromUrl(url,base);assert.equal(target.view,'lab');const unified=R.write(target.view,target.hash),roundtrip=R.read(unified);assert.deepEqual(roundtrip,target);assert.deepEqual(JSON.parse(new URLSearchParams(roundtrip.hash.slice(1)).get('phrase')),entry);const source=R.fromUrl('OPEN-Song-Atlas.html#song=zhaomi-jinsha&section=verse-1a',base);assert.equal(source.view,'songs');assert.equal(new URLSearchParams(source.hash.slice(1)).get('section'),'verse-1a');}
});
test('large or unrelated URLs are handled without redirecting out of the studio',()=>{
 assert.throws(()=>R.read('#lab?phrase='+'x'.repeat(160*1024)),/large/);assert.equal(R.fromUrl('https://example.com/music','https://user.github.io/studio/index.html'),null);
});

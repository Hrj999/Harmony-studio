(function(global){
'use strict';
const H=global.HarmonyCore||(typeof require==='function'?require('../harmony-dictionary/core.js'):null);
if(!H)throw Error('The harmony engine is unavailable.');
const PPQ=480,EPS=.05;
const copy=value=>structuredClone(value);
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
function requireText(value,label,max=240,optional=false){if(optional&&value===undefined)return;if(typeof value!=='string'||(!optional&&!value.trim())||value.length>max)throw Error(label+' must be text'+(optional?'':', not blank')+' (up to '+max+' characters).');}
function requireId(value,label){if(typeof value!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$/.test(value))throw Error(label+' must use 1–120 letters, numbers, dashes or underscores.');}
function validateSong(song){
 if(!plain(song))throw Error('Choose a song to analyse.');
 requireId(song.id,'Song ID');requireText(song.title,'Song title',160);requireText(song.artist,'Artist',200,true);
 for(const field of ['summary','thesis','evidence','evidenceNote','melodyStatus','timingNote','analysisStatus'])requireText(song[field],'Song '+field,8000,true);
 if(song.arc!==undefined){if(!Array.isArray(song.arc)||song.arc.length>30)throw Error('The song arc must be a list of no more than 30 listening notes.');for(const step of song.arc){if(typeof step==='string')requireText(step,'Arc note',2000,true);else if(plain(step))requireText(step.text,'Arc note',2000);else throw Error('Each arc note must be text or an object with a text field.');}}
 if(song.sources!==undefined){if(!Array.isArray(song.sources)||song.sources.length>20)throw Error('Keep no more than 20 recording or analysis sources.');for(const source of song.sources){if(!plain(source))throw Error('A source is missing its details.');requireText(source.title,'Source title',240);requireText(source.url,'Source link',2000);requireText(source.note,'Source note',5000,true);}}
 if(!H.keys.includes(song.key))throw Error('Choose a supported home key.');
 if(!finite(song.tempo)||song.tempo<40||song.tempo>130)throw Error('Tempo must be between 40 and 130 BPM.');
 if(!Array.isArray(song.meter)||song.meter.length!==2||song.meter[0]!==4||song.meter[1]!==4)throw Error('This version uses four beats per bar (4/4).');
 if(!finite(song.duration)||song.duration<=0||song.duration>7200)throw Error('Song duration must be greater than zero and no longer than two hours.');
 if(!Array.isArray(song.sections)||!song.sections.length||song.sections.length>100)throw Error('Use between 1 and 100 sections.');
 const ids=new Set();let previousEnd=0,totalBars=0;
 for(const section of song.sections){
  if(!plain(section))throw Error('A song section is missing.');requireId(section.id,'Section ID');requireText(section.name,'Section name',160);
  for(const field of ['role','analysis','melodyNote','transition','labConnection','timingNote'])requireText(section[field],'Section '+field,8000,true);
  if(section.relatedEntryIds!==undefined){if(!Array.isArray(section.relatedEntryIds)||section.relatedEntryIds.length>40)throw Error('Related Lab entries must be a list of no more than 40 entry IDs.');for(const id of section.relatedEntryIds)requireText(id,'Related entry ID',240);}
  if(ids.has(section.id))throw Error('Every section needs its own unique ID.');ids.add(section.id);
  if(!finite(section.startSeconds)||!finite(section.endSeconds)||section.startSeconds<0||section.endSeconds<=section.startSeconds||section.startSeconds<previousEnd-EPS||section.endSeconds>song.duration+EPS)throw Error('Section times must run forward without overlap and stay within the recording.');
  previousEnd=section.endSeconds;
  if(!Array.isArray(section.bars)||!section.bars.length||section.bars.length>128)throw Error(section.name+': use between 1 and 128 bars.');
  totalBars+=section.bars.length;if(totalBars>1024)throw Error('Use no more than 1,024 bars in one song.');
  const span=section.bars.length*4*60/song.tempo;
  if(span>section.endSeconds-section.startSeconds+EPS)throw Error(section.name+': the written bars run beyond the section end. Check its end time or number of bars.');
  section.bars.forEach((bar,index)=>{
   if(!plain(bar)||!Array.isArray(bar.chords))throw Error(section.name+', bar '+(index+1)+': add chords or mark the bar as unmapped.');
   if(bar.rest===true){if(bar.chords.length)throw Error('An unmapped bar cannot also contain chords.');return;}
   if(!bar.chords.length)throw Error(section.name+', bar '+(index+1)+': use rest for an unmapped bar.');
   for(const chord of bar.chords){
    if(!plain(chord)||typeof chord.symbol!=='string'||chord.symbol.length>32||!finite(chord.beats)||chord.beats<=0||Math.abs(chord.beats*4-Math.round(chord.beats*4))>1e-6)throw Error(section.name+', bar '+(index+1)+': chord lengths must use quarter-beat steps.');
   }
   H.validateEntries([{id:'validation',title:section.name,key:song.key,tempo:song.tempo,moods:[],bars:[bar]}]);
  });
 }
 return song;
}
function buildTimeline(song){
 validateSong(song);const beatSeconds=60/song.tempo,events=[];let globalBar=0;
 song.sections.forEach((section,sectionIndex)=>{
  section.bars.forEach((bar,barIndex)=>{
   let withinBar=0;
   for(const chord of bar.chords){events.push({...copy(chord),sectionId:section.id,sectionIndex,barIndex,globalBar,eventIndex:events.length,startSeconds:section.startSeconds+(barIndex*4+withinBar)*beatSeconds,durationSeconds:chord.beats*beatSeconds});withinBar+=chord.beats;}
   globalBar++;
  });
 });
 return {events,duration:song.duration};
}
function playbackEvents(song){
 const out=[];
 for(const event of buildTimeline(song).events){
  const previous=out[out.length-1];
  if(event.continuation===true&&previous&&event.sectionId===previous.sectionId&&event.symbol===previous.symbol&&Math.abs(previous.startSeconds+previous.durationSeconds-event.startSeconds)<.001&&JSON.stringify(event.notes)===JSON.stringify(previous.notes)){
   previous.durationSeconds+=event.durationSeconds;previous.beats+=event.beats;previous.continuedEventIndices.push(event.eventIndex);
  }else out.push({...event,continuedEventIndices:[event.eventIndex]});
 }
 return out;
}
function formatTime(seconds){const rounded=Math.max(0,Math.floor(Number(seconds)||0));return Math.floor(rounded/60)+':'+String(rounded%60).padStart(2,'0');}
function safeURL(value){try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password?url.href:'';}catch(e){return '';}}
function phraseEntry(song,sectionOrId,fromBar1=1,toBar1){
 validateSong(song);const section=typeof sectionOrId==='string'?song.sections.find(s=>s.id===sectionOrId):song.sections.find(s=>s===sectionOrId||s.id===sectionOrId?.id);
 if(!section)throw Error('Choose a section of this song first.');
 if(toBar1===undefined)toBar1=section.bars.length;
 const from=Number(fromBar1),to=Number(toBar1);
 if(!Number.isInteger(from)||!Number.isInteger(to)||from<1||to<from||to>section.bars.length)throw Error('Choose a bar range within this section, with the first bar before the last.');
 const bars=copy(section.bars.slice(from-1,to));
 if(bars.some(bar=>bar.rest===true||!bar.chords.length))throw Error('This range includes unmapped bars. Choose a passage with chords before sending it to the Harmony Lab.');
 // Keep source analytical functions, but express explicit bass labels as scale
 // degrees so they stay true when the Lab transposes the imported passage.
 bars.forEach(bar=>bar.chords.forEach(c=>{if(typeof c.roman==='string'&&/\/\s*[A-G][#b]?(?=\s|$)/.test(c.roman)){const suffix=H.roman(c.symbol,song.key).match(/\(scale degree .+ in bass\)/);if(suffix)c.roman=c.roman.replace(/\/\s*[A-G][#b]?(?=\s|$)/,suffix[0]);}}));
 const start=section.startSeconds+(from-1)*4*60/song.tempo,end=section.startSeconds+to*4*60/song.tempo;
 const uncertain=bars.flatMap(b=>b.chords).some(c=>c.uncertain===true);
 const source=(song.sources||[]).find(s=>typeof s.url==='string'&&s.url.includes('bilibili.com')&&safeURL(s.url))||(song.sources||[]).find(s=>safeURL(s.url));
 const entry={
  id:'atlas-'+song.id+'-'+section.id+'-'+from+'-'+to,
  title:(song.title+' · '+section.name+' · bars '+from+'–'+to).slice(0,240),
  summary:'A passage from '+song.title+(song.artist?' by '+song.artist:'')+'. Keep its place in the whole song while exploring the harmony.',
  moods:Array.isArray(section.moods)?section.moods.filter(m=>typeof m==='string'):['song study'],
  key:song.key,mode:'major',tempo:song.tempo,meter:[4,4],bars,
  analysis:(section.analysis||'Add your observations about this passage.')+'\n\nWhole-song context: '+(song.thesis||song.summary||'Compare this section with the passages around it.')+'\n\nThis is a working harmonic reduction, not a verified instrument transcription.'+(uncertain?' This range includes chord colours marked for review.':''),
  voiceLeading:[],useWhen:'Compare the phrase with its surrounding sections, its melody and its later returns in the recording.',
  compositionTips:['Change one chord at a time, then return to Song Atlas to hear its larger context.','Check a melody note against the bass and inner voices before deciding which chord colour fits.'],
  noteGuide:null,
  sourceSong:{songId:song.id,sectionId:section.id,title:song.title,artist:song.artist||'',sectionName:section.name,fromBar:from,toBar:to,startSeconds:start,endSeconds:end,evidence:'working harmonic reduction'},
  listeningExamples:source?[{id:'source-'+song.id,title:song.title,artist:song.artist||'',url:safeURL(source.url),location:section.name+' · '+formatTime(start)+'–'+formatTime(end),note:'Source for this working harmonic reduction. Check the recording, including its melody and bass; chord colours marked for review remain provisional.'}]:[]
 };
 H.validateEntries([entry]);return entry;
}
function linkToLab(entry){H.validateEntries([entry]);return 'OPEN-Harmony-Lab.html#phrase='+encodeURIComponent(JSON.stringify(entry));}
function applyPhraseToSong(song,entry){
 validateSong(song);H.validateEntries([entry]);
 const source=entry.sourceSong;
 if(!plain(source)||source.songId!==song.id)throw Error('This phrase belongs to a different song. Open its source song before applying it.');
 const section=song.sections.find(item=>item.id===source.sectionId);
 if(!section)throw Error('The source section is no longer in this song.');
 const from=source.fromBar,to=source.toBar;
 if(!Number.isInteger(from)||!Number.isInteger(to)||from<1||to<from||to>section.bars.length||entry.bars.length!==to-from+1)throw Error('To compare this phrase in the song, keep the same number of bars as its original range.');
 const result=copy(song),changed=result.sections.find(item=>item.id===section.id),before=progressionText({bars:section.bars.slice(from-1,to)}),after=progressionText(entry);
 const stamp=Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,9);
 result.id=song.id.slice(0,75)+'-variation-'+stamp;
 result.title=(song.title+' · '+section.name+' — harmony variation').slice(0,160);
 result.variationOf=song.id;result.variationEntryId=entry.id;
 result.variationSource={songId:song.id,entryId:entry.id,entryTitle:entry.title};
 result.sourceThesis=song.sourceThesis||song.thesis||'';result.sourceArc=copy(song.sourceArc||song.arc||[]);
 result.summary='Your harmony variation of '+song.title+'. Only '+section.name+', bars '+from+'–'+to+', has been replaced. The source song remains unchanged.';
 result.thesis='Compare the altered passage with its surroundings and the source melody. This experiment tests a harmonic possibility; it does not claim these chords occur in the original recording.';
 result.arc=['Keep the larger form · Section times and all surrounding bars are preserved.','Hear the change in context · Compare '+section.name+', bars '+from+'–'+to+', with the source version.','Follow the melody · Check common tones, new tensions and the route into the next section.'];
 const replacement=copy(entry.bars).map((bar,index)=>({...bar,globalBar:section.bars[from-1+index].globalBar,startSeconds:section.startSeconds+(from-1+index)*4*60/song.tempo,chords:bar.chords.map(chord=>{
  const item={...chord,variation:true,comment:'Personal harmony edit; not a claim about the source recording. '+(chord.comment||'')};
  if(entry.key!==song.key)item.roman=H.roman(item.symbol,song.key);
  delete item.sourceConfidence;return item;
 })}));
 changed.bars.splice(from-1,to-from+1,...replacement);
 changed.sourceSectionAnalysis=section.sourceSectionAnalysis||section.analysis||'';
 changed.analysis='Personal harmony variation of '+song.title+', '+section.name+', bars '+from+'–'+to+'.\n\nOriginal range: '+before.slice(0,2500)+'\nYour range: '+after.slice(0,2500)+'\n\n'+(before===after?'The chord labels are unchanged; compare the arranged voicings.':'The labels above show the harmonic change. Listen to its entry, its return and any new tensions against the melody.')+' The original section analysis is retained as a source reference, not asserted for this changed progression.';
 changed.melodyNote='Compare this variation against the melody of the original recording. Listen for held notes, changed chord tones and tensions; check which resolutions still support the phrase. No new melody transcription is implied.';
 changed.transition='Listen to the bars before and after this edited range, especially the handoff into the next section. Their timing is preserved; decide whether the new harmonic direction supports that connection.';
 result.analysisStatus='Personal harmony variation — compare with source';
 validateSong(result);return result;
}
function parseSectionProgression(text,key){
 const input=String(text).trim();if(!input)throw Error('Enter a progression. Use rest for a whole unmapped bar.');
 const raw=input.split('|').map(bar=>bar.trim());if(raw.length>128)throw Error('Use no more than 128 bars in a section.');
 const out=[];let run=[];
 const flush=()=>{if(run.length){out.push(...H.parseProgression(run.join(' | '),key));run=[];}};
 raw.forEach((bar,index)=>{if(!bar)throw Error('Bar '+(index+1)+' is empty. Add a chord or write rest.');if(/^rest$/i.test(bar)){flush();out.push({rest:true,chords:[]});}else run.push(bar);});flush();return out;
}
function progressionText(section){return section.bars.map(bar=>bar.rest===true?'rest':bar.chords.map(chord=>chord.symbol+(bar.chords.length>1?':'+chord.beats:'')).join(' ')).join(' | ');}
const encode=value=>Array.from(new TextEncoder().encode(value));
function vlq(value){if(!Number.isInteger(value)||value<0||value>0x0fffffff)throw Error('MIDI timing is outside its supported range.');const result=[value&127];while(value>>=7)result.unshift((value&127)|128);return result;}
const u32=value=>[(value>>>24)&255,(value>>>16)&255,(value>>>8)&255,value&255];
function meta(kind,value){const data=typeof value==='string'?encode(value):value;return [255,kind,...vlq(data.length),...data];}
function makeTrack(events,endTick){events.sort((a,b)=>a.tick-b.tick||a.priority-b.priority);const data=[];let now=0;for(const event of events){data.push(...vlq(event.tick-now),...event.data);now=event.tick;}data.push(...vlq(endTick-now),255,47,0);return [...encode('MTrk'),...u32(data.length),...data];}
function concatenate(parts){const result=new Uint8Array(parts.reduce((sum,part)=>sum+part.length,0));let offset=0;parts.forEach(part=>{result.set(part,offset);offset+=part.length;});return result;}
function midi(song){
 validateSong(song);const secToTick=seconds=>Math.round(seconds*song.tempo/60*PPQ),endTick=secToTick(song.duration),us=Math.round(60000000/song.tempo),fifths={C:0,Db:-5,D:2,Eb:-3,E:4,F:-1,'F#':6,G:1,Ab:-4,A:3,Bb:-2,B:5};
 const control=[{tick:0,priority:0,data:meta(3,song.title+' — working harmonic reduction')},{tick:0,priority:1,data:meta(81,[(us>>>16)&255,(us>>>8)&255,us&255])},{tick:0,priority:2,data:meta(88,[4,2,24,8])},{tick:0,priority:3,data:meta(89,[fifths[song.key]&255,0])}];
 const tracks=[[],[]];tracks.forEach((track,index)=>track.push({tick:0,priority:0,data:meta(3,index?'Upper chord voices — arranged':'Bass — arranged')},{tick:0,priority:1,data:[192+index,0]}));
 song.sections.forEach(section=>control.push({tick:secToTick(section.startSeconds),priority:4,data:meta(6,section.name)}));
 buildTimeline(song).events.forEach(event=>control.push({tick:secToTick(event.startSeconds),priority:5,data:meta(6,event.symbol+(event.uncertain?' ?':'')+' | '+(event.roman||''))}));
 playbackEvents(song).forEach(event=>{
  const start=secToTick(event.startSeconds),end=Math.min(endTick,Math.max(start+1,secToTick(event.startSeconds+event.durationSeconds*.96)));
  event.notes.forEach((note,index)=>{const channel=index?1:0;tracks[channel].push({tick:start,priority:3,data:[144+channel,note,index?64:57]},{tick:end,priority:2,data:[128+channel,note,0]});});
 });
 return concatenate([[...encode('MThd'),0,0,0,6,0,1,0,3,1,224],makeTrack(control,endTick),makeTrack(tracks[0],endTick),makeTrack(tracks[1],endTick)]);
}
global.AtlasCore={validateSong,buildTimeline,playbackEvents,phraseEntry,linkToLab,applyPhraseToSong,formatTime,parseSectionProgression,progressionText,midi};
if(typeof module!=='undefined'&&module.exports)module.exports=global.AtlasCore;
})(typeof window!=='undefined'?window:globalThis);

(function(global){
'use strict';
const LIMIT=120*1024;
let callbacks=null,initialized=false,pending=null,lastHandledHash=null,dialog=null;
const $=id=>document.getElementById(id);
function text(value,max=500){return typeof value==='string'?value.trim().slice(0,max):'';}
function validId(value){if(typeof value!=='string'||value.trim().length>160)return null;const id=value.trim();return id&&!/[\u0000-\u001f\u007f]/.test(id)?id:null;}
function cleanSource(source){
  if(!source||typeof source!=='object'||Array.isArray(source))return null;
  const songId=validId(source.songId),sectionId=validId(source.sectionId);
  if(!songId||!sectionId)return null;
  const result={songId,sectionId,title:text(source.title,160),artist:text(source.artist,160),sectionName:text(source.sectionName,160)};
  if(Number.isInteger(source.fromBar)&&source.fromBar>0&&source.fromBar<=10000)result.fromBar=source.fromBar;
  if(Number.isInteger(source.toBar)&&source.toBar>0&&source.toBar<=10000)result.toBar=source.toBar;
  if(result.fromBar&&result.toBar&&result.toBar<result.fromBar)delete result.toBar;
  return result;
}
function sourceLabel(source){
  const parts=[source.title,source.artist,source.sectionName].filter(Boolean);
  if(source.fromBar)parts.push(source.toBar&&source.toBar!==source.fromBar?'bars '+source.fromBar+'–'+source.toBar:'bar '+source.fromBar);
  return parts.join(' · ')||'A passage from Song Atlas';
}
function parseIncoming(hash,core=global.HarmonyCore){
  const raw=String(hash||'').replace(/^#/,'');
  if(raw.length>LIMIT)throw Error('This phrase is too large to open from a link. Use a shorter passage.');
  const params=new URLSearchParams(raw);
  if(params.has('phrase')){
    const data=params.get('phrase');
    if(!data||data.length>LIMIT||new TextEncoder().encode(data).length>LIMIT)throw Error('This phrase is empty or too large.');
    let incoming;try{incoming=JSON.parse(data);}catch(err){throw Error('This phrase link could not be read. Send the passage from Song Atlas again.');}
    if(!incoming||typeof incoming!=='object'||Array.isArray(incoming))throw Error('This link does not contain a harmony entry.');
    // Keep the public entry fields only; a link cannot set app state or callbacks.
    const fields=['id','title','summary','moods','key','mode','tempo','meter','analysis','voiceLeading','useWhen','compositionTips','noteGuide','bars','listeningExamples'];
    const entry={};for(const key of fields)if(Object.prototype.hasOwnProperty.call(incoming,key))entry[key]=structuredClone(incoming[key]);
    if(!validId(entry.id)||typeof entry.title!=='string'||!entry.title.trim()||entry.title.length>240)throw Error('This phrase needs a valid name and identifier.');
    entry.id=entry.id.trim();entry.title=entry.title.trim();entry.mode=entry.mode||'major';entry.meter=entry.meter||[4,4];
    if(entry.mode!=='major'||!Array.isArray(entry.meter)||entry.meter[0]!==4||entry.meter[1]!==4)throw Error('The current laboratory reads passages in a major home key and 4/4. Keep another metre or mode in Song Atlas for now.');
    if(!core||typeof core.validateEntries!=='function')throw Error('The harmony reader is unavailable. Reload the laboratory and try again.');
    core.validateEntries([entry]);
    if(entry.bars.length>128)throw Error('Send a passage of no more than 128 bars.');
    if(entry.bars.some(b=>b.chords.some(c=>typeof c.beats!=='number'||!Number.isFinite(c.beats)||Math.abs(c.beats*4-Math.round(c.beats*4))>1e-6)))throw Error('The phrase has unreadable chord durations. Use quarter-beat steps.');
    for(const key of ['voiceLeading','compositionTips'])if(entry[key]!==undefined&&(!Array.isArray(entry[key])||entry[key].some(x=>typeof x!=='string')))throw Error('This phrase has unreadable listening notes.');
    for(const key of ['summary','analysis','useWhen'])if(entry[key]!==undefined&&typeof entry[key]!=='string')throw Error('This phrase has unreadable descriptive text.');
    if(entry.noteGuide!==undefined&&entry.noteGuide!==null){const guide=entry.noteGuide;if(typeof guide!=='object'||!Array.isArray(guide.diatonic)||guide.diatonic.some(n=>typeof n!=='string')||guide.chromatic!==undefined&&(!Array.isArray(guide.chromatic)||guide.chromatic.some(n=>!n||typeof n.note!=='string'||typeof n.role!=='string')))throw Error('This phrase has an unreadable note guide.');}
    const source=cleanSource(incoming.sourceSong);
    if(!source)throw Error('This phrase is missing its Song Atlas source. Send it from the atlas again.');
    entry.sourceSong=source;
    return{kind:'phrase',entry};
  }
  if(params.has('entry')){
    const id=validId(params.get('entry'));
    if(!id)throw Error('This dictionary entry link could not be read.');
    return{kind:'entry',id};
  }
  return{kind:'none'};
}
function sourceHref(source){
  const clean=cleanSource(source);if(!clean)return null;
  const params=new URLSearchParams({song:clean.songId,section:clean.sectionId});
  if(clean.fromBar)params.set('fromBar',String(clean.fromBar));
  if(clean.toBar)params.set('toBar',String(clean.toBar));
  return 'OPEN-Song-Atlas.html#'+params.toString();
}
function variationHref(entry,core=global.HarmonyCore){
  const source=cleanSource(entry&&entry.sourceSong);if(!source)return null;
  try{core.validateEntries([entry]);const payload=encodeURIComponent(JSON.stringify({...entry,sourceSong:source}));if(payload.length>LIMIT)return null;return 'OPEN-Song-Atlas.html#variation='+payload;}catch(err){return null;}
}
function announce(message){const target=$('bridge-status')||$('notice');if(target)target.textContent=message;}
function element(tag,className,content){const e=document.createElement(tag);if(className)e.className=className;if(content!==undefined)e.textContent=content;return e;}
function clearPhraseHash(){
  try{const url=new URL(global.location.href),params=new URLSearchParams(url.hash.slice(1));params.delete('phrase');url.hash=params.toString();global.history.replaceState(null,'',url.href);lastHandledHash=url.hash;}catch(err){/* Some file browsers restrict history updates; the handled hash is still remembered. */}
}
function finishImport(){pending=null;if(dialog&&dialog.open)dialog.close();clearPhraseHash();}
function ensureDialog(){
  if(dialog)return;
  dialog=element('dialog');dialog.id='bridge-import-dialog';dialog.setAttribute('aria-labelledby','bridge-import-heading');
  const head=element('div','dialog-head'),heading=element('h2',null,'Bring a song phrase into your dictionary');heading.id='bridge-import-heading';
  const close=element('button',null,'×');close.type='button';close.setAttribute('aria-label','Close phrase preview');close.addEventListener('click',finishImport);head.append(heading,close);
  const explanation=element('p','bridge-import-explanation','Keep this passage as an editable entry. Its connection to the whole song stays attached, so you can return to its context after experimenting.');
  const preview=element('div','bridge-import-preview');preview.id='bridge-import-preview';
  const duplicate=element('p','bridge-import-duplicate');duplicate.id='bridge-import-duplicate';
  const error=element('p','error');error.id='bridge-import-error';error.setAttribute('role','alert');
  const actions=element('div','bridge-import-actions'),cancel=element('button',null,'Cancel'),save=element('button','primary','Add to dictionary');cancel.type=save.type='button';cancel.addEventListener('click',finishImport);save.id='bridge-import-save';
  save.addEventListener('click',()=>{
    if(!pending)return;
    try{
      const entry=structuredClone(pending),duplicate=callbacks.hasEntry(entry.id);
      if(duplicate){entry.parentId=entry.id;entry.variantOf=entry.title;entry.id='atlas-alternative-'+(global.crypto&&global.crypto.randomUUID?global.crypto.randomUUID():Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,9));entry.title+=' — alternative';}
      const saved=callbacks.onImport(entry);finishImport();announce(saved===false?'Phrase added for this session. Use Back up library before closing to keep it.':'Song phrase added. You can edit it here and return to its place in Song Atlas.');
    }catch(err){$('bridge-import-error').textContent=err.message||'Could not add this phrase.';}
  });
  actions.append(cancel,save);dialog.append(head,explanation,preview,duplicate,error,actions);dialog.addEventListener('cancel',event=>{event.preventDefault();finishImport();});document.body.appendChild(dialog);
}
function showPreview(entry){
  ensureDialog();pending=entry;const preview=$('bridge-import-preview');preview.replaceChildren();preview.append(element('h3',null,entry.title),element('p',null,sourceLabel(entry.sourceSong)),element('p',null,entry.bars.length+' bars · '+entry.key+' major · '+entry.tempo+' BPM'));
  if(entry.summary)preview.append(element('p',null,entry.summary));
  const duplicate=callbacks.hasEntry(entry.id);$('bridge-import-duplicate').textContent=duplicate?'This passage is already in your dictionary. Saving makes a separate alternative and keeps the existing entry.':'Your existing entries stay as they are.';$('bridge-import-save').textContent=duplicate?'Save as new alternative':'Add to dictionary';$('bridge-import-error').textContent='';if(!dialog.open)dialog.showModal();
}
function consumeHash(){
  if(!callbacks)return;
  const hash=global.location.hash;if(hash===lastHandledHash)return;lastHandledHash=hash;
  try{
    const incoming=parseIncoming(hash);
    if(incoming.kind==='phrase')showPreview(incoming.entry);
    else if(incoming.kind==='entry'){
      if(callbacks.hasEntry(incoming.id))callbacks.onChoose(incoming.id);
      else announce('This entry is not in this copy of your dictionary. Restore your library backup, or open the paired Harmony Lab file.');
    }
  }catch(err){announce(err.message||'This companion link could not be opened.');}
}
function init(options){
  if(!options||typeof options.onImport!=='function'||typeof options.onChoose!=='function'||typeof options.hasEntry!=='function')throw Error('HarmonyBridge needs import, choose, and lookup callbacks.');
  callbacks=options;if(!initialized){initialized=true;global.addEventListener('hashchange',consumeHash);}consumeHash();
}
function render(options){
  const source=cleanSource(options&&options.entry&&options.entry.sourceSong),section=$('source-song');if(!section)return;section.hidden=!source;
  if(!source)return;
  $('source-song-title').textContent=source.title||'A phrase from Song Atlas';$('source-song-description').textContent=sourceLabel(source);$('source-song-link').href=sourceHref(source);
  let variation=$('source-song-variation');if(!variation){variation=element('a','bridge-link','Try this version in the whole song ↗');variation.id='source-song-variation';const row=element('p');row.appendChild(variation);$('source-song-link').insertAdjacentElement('afterend',row);}
  const href=variationHref(options.entry);variation.parentElement.hidden=!href;if(href)variation.href=href;
}
global.HarmonyBridge={cancelPending(){if(pending)finishImport();},init,render,consumeHash,parseIncoming,sourceHref,variationHref,cleanSource,sourceLabel};
if(typeof module!=='undefined'&&module.exports)module.exports=global.HarmonyBridge;
})(typeof window!=='undefined'?window:globalThis);

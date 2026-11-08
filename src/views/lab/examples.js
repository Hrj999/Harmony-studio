(function(global){
'use strict';
const $=id=>document.getElementById(id);
let context=null,editingIndex=null,editingEntry=null,initialized=false;
const undoStacks=new WeakMap();

function text(value){return typeof value==='string'?value:'';}
function listeningLink(value,strict=false){
  const raw=text(value).trim();
  if(!raw)return '';
  try{const url=new URL(raw);if(!['http:','https:'].includes(url.protocol)||!url.hostname||url.username||url.password)throw Error();return url.href;}
  catch(err){if(strict)throw Error('Use a full listening link beginning with https:// or http://.');return '';}
}
function normalizeExample(input){
  const title=text(input.title).trim();
  if(!title)throw Error('Give this example a song or work name.');
  if(title.length>160)throw Error('Keep the song or work name within 160 characters.');
  return {id:text(input.id)||'example-'+(global.crypto&&global.crypto.randomUUID?global.crypto.randomUUID():Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,9)),title,artist:text(input.artist).trim().slice(0,180),url:listeningLink(input.url,true),location:text(input.location).trim().slice(0,160),note:text(input.note).trim().slice(0,4000)};
}
function examples(entry){return Array.isArray(entry.listeningExamples)?entry.listeningExamples:[];}
function saveMessage(message){const saved=context.onSave();$('examples-status').textContent=message+(saved===false?' Use Back up library before closing to keep this change.':' Saved in this browser; included in your library backup.');}
function showEditor(index=null){
  if(!context)return;
  editingEntry=context.entry;editingIndex=index;
  const item=index===null?{}:examples(editingEntry)[index]||{};
  $('example-dialog-title').textContent=index===null?'Add a real music example':'Edit this music example';
  $('example-entry-name').textContent='For '+text(editingEntry.title);
  for(const field of ['title','artist','url','location','note'])$('example-'+field).value=text(item[field]);
  $('example-error').textContent='';$('example-dialog').showModal();
}
function removeExample(index){
  const entry=context.entry,list=examples(entry);
  if(index<0||index>=list.length)return;
  const stack=undoStacks.get(entry)||[];
  stack.push({index,item:structuredClone(list[index])});undoStacks.set(entry,stack);
  entry.listeningExamples=list.filter((_,i)=>i!==index);
  renderList();saveMessage('Example removed. You can undo it below.');
}
function undoRemoval(){
  const entry=context.entry,stack=undoStacks.get(entry)||[],removed=stack.pop();
  if(!removed)return;
  const list=[...examples(entry)];list.splice(Math.min(removed.index,list.length),0,removed.item);entry.listeningExamples=list;
  renderList();saveMessage('Example restored.');
}
function renderList(){
  const list=$('examples-list');list.replaceChildren();
  const items=examples(context.entry);
  if(!items.length){const p=document.createElement('p');p.className='small muted examples-empty';p.textContent='No music examples yet. Add a song you love, a listening link, and the passage where you hear this progression or a related colour.';list.appendChild(p);}
  items.forEach((raw,index)=>{
    const item=raw&&typeof raw==='object'?raw:{},card=document.createElement('article');card.className='music-example';
    const head=document.createElement('div');head.className='music-example-head';
    const details=document.createElement('div'),heading=document.createElement('h4'),url=listeningLink(item.url);
    if(url){const a=document.createElement('a');a.href=url;a.target='_blank';a.rel='noopener noreferrer';a.textContent=text(item.title)||'Untitled music example';a.title='Open listening link in a new tab';heading.appendChild(a);}else heading.textContent=text(item.title)||'Untitled music example';
    details.appendChild(heading);
    if(text(item.artist)){const artist=document.createElement('p');artist.className='example-artist';artist.textContent=item.artist;details.appendChild(artist);}
    const actions=document.createElement('div');actions.className='example-actions';
    for(const [label,action]of[['Edit',()=>showEditor(index)],['Remove',()=>removeExample(index)]]){const b=document.createElement('button');b.type='button';b.textContent=label;b.setAttribute('aria-label',label+' example: '+(text(item.title)||'Untitled music example'));b.addEventListener('click',action);actions.appendChild(b);}
    head.append(details,actions);card.appendChild(head);
    if(text(item.location)){const p=document.createElement('p');p.className='example-location';p.textContent='Listen at: '+item.location;card.appendChild(p);}
    if(text(item.note)){const p=document.createElement('p');p.className='example-note';p.textContent=item.note;card.appendChild(p);}
    list.appendChild(card);
  });
  $('example-undo').hidden=!(undoStacks.get(context.entry)||[]).length;
}
function init(){
  if(initialized)return;initialized=true;
  $('example-add').addEventListener('click',()=>showEditor());
  for(const id of ['example-close','example-cancel'])$(id).addEventListener('click',()=>$('example-dialog').close());
  $('example-undo').addEventListener('click',undoRemoval);
  $('example-form').addEventListener('submit',event=>{
    event.preventDefault();
    try{
      if(!context||editingEntry!==context.entry)throw Error('Choose the harmony entry again before saving this example.');
      const list=[...examples(editingEntry)],old=editingIndex===null?{}:list[editingIndex]||{};
      const input={id:old.id};for(const field of ['title','artist','url','location','note'])input[field]=$('example-'+field).value;
      const item=normalizeExample(input);
      if(editingIndex===null)list.push(item);else list[editingIndex]=item;
      editingEntry.listeningExamples=list;
      $('example-dialog').close();renderList();saveMessage('Music example saved.');
    }catch(err){$('example-error').textContent=err.message;}
  });
}
function render(options){
  init();
  if(context&&context.entry!==options.entry){$('examples-status').textContent='';if($('example-dialog').open)$('example-dialog').close();}
  context={entry:options.entry,onSave:typeof options.onSave==='function'?options.onSave:()=>true};renderList();
}
global.HarmonyExamples={init,render,normalizeExample,listeningLink};
if(typeof module!=='undefined'&&module.exports)module.exports=global.HarmonyExamples;
})(typeof window!=='undefined'?window:globalThis);

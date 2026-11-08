(function(global){
'use strict';
function createRuntime(store,onNavigate,onReplace){
 const realDocument=global.document,environments=new Map(),cleanups=new Map();
 function windowFor(view){if(environments.has(view))return environments.get(view);
  const handlers=new Map();let hash='';
  const location={get hash(){return hash;},get href(){const u=new URL(global.location.href);u.hash=hash;return u.href;},get pathname(){return global.location.pathname;},get search(){return global.location.search;},assign:url=>onNavigate(url)};
  const env={HarmonyCore:global.HarmonyCore,AtlasCore:global.AtlasCore,AudioContext:global.AudioContext,webkitAudioContext:global.webkitAudioContext,crypto:global.crypto,location,history:{replaceState:(_state,_title,url)=>{const u=new URL(url,location.href);hash=u.hash;onReplace(view,hash);}},addEventListener:(type,callback)=>{if(!handlers.has(type))handlers.set(type,new Set());handlers.get(type).add(callback);},removeEventListener:(type,callback)=>handlers.get(type)?.delete(callback),_setHash:value=>{hash=value||'';for(const callback of handlers.get('hashchange')||[])callback(new Event('hashchange'));},_dispose:()=>{for(const callback of handlers.get('pagehide')||[])callback(new Event('pagehide'));handlers.clear();}};
  environments.set(view,env);return env;
 }
 function documentFor(root){const listeners=[];cleanups.set(root,()=>listeners.forEach(([type,callback,options])=>realDocument.removeEventListener(type,callback,options)));
  return {getElementById:id=>root.getElementById(id),querySelector:selector=>root.querySelector(selector),querySelectorAll:selector=>root.querySelectorAll(selector),createElement:realDocument.createElement.bind(realDocument),createElementNS:realDocument.createElementNS.bind(realDocument),createTextNode:realDocument.createTextNode.bind(realDocument),body:root,get activeElement(){return root.activeElement;},get hidden(){return realDocument.hidden;},addEventListener:(type,callback,options)=>{listeners.push([type,callback,options]);realDocument.addEventListener(type,callback,options);},removeEventListener:(...args)=>realDocument.removeEventListener(...args)};
 }
 function storageFor(view){return {getItem:()=>JSON.stringify(store.getPart(view)),setItem:(_key,value)=>{const saved=store.setPart(view,JSON.parse(value));if(!saved)throw Error('Browser storage is unavailable; back up this session.');},removeItem:()=>{throw Error('Use Import backup to replace a workspace.');}};}
 function dispose(view,root){environments.get(view)?._dispose();environments.delete(view);cleanups.get(root)?.();cleanups.delete(root);}
 return {windowFor,documentFor,storageFor,dispose,libraryStudies:()=>store.getPart('lab').entries.map(e=>({id:e.id,title:e.title}))};
}
global.StudioRuntime={create:createRuntime};
})(typeof window!=='undefined'?window:globalThis);

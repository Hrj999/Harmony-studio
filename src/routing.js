(function(global){'use strict';
function read(hash,defaultView='songs'){const raw=String(hash||'').replace(/^#/,'');if(raw.length>150*1024)throw Error('This passage link is too large.');const split=raw.indexOf('?'),view=split<0?raw:raw.slice(0,split),query=split<0?'':raw.slice(split+1);return {view:view==='lab'?'lab':view==='songs'?'songs':defaultView,hash:query?'#'+query:''};}
function write(view,hash=''){return '#'+(view==='lab'?'lab':'songs')+(hash.replace(/^#/,'')?'?'+hash.replace(/^#/,''):'');}
function fromUrl(value,base){const url=new URL(value,base),name=url.pathname.split('/').at(-1);if(name==='OPEN-Harmony-Lab.html'||name==='Harmony-Lab.html')return{view:'lab',hash:url.hash};if(name==='OPEN-Song-Atlas.html'||name==='Song-Atlas.html')return{view:'songs',hash:url.hash};if(url.pathname===new URL(base).pathname&&url.origin===new URL(base).origin)return read(url.hash);return null;}
global.StudioRouting={read,write,fromUrl};if(typeof module!=='undefined'&&module.exports)module.exports=global.StudioRouting;
})(typeof window!=='undefined'?window:globalThis);

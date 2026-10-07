(() => {
 "use strict";
 const scales = [0,45,72,100];
 const read = key => { try { return localStorage.getItem(key); } catch (_) { return null; } };
 const write = (key,value) => { try { localStorage.setItem(key,String(value)); } catch (_) {} };
 const clamp = value => Math.max(0,Math.min(100,Math.round(Number(value)||0)));
 const key = kind => `match3_${kind}_volume`;
 const previousKey = kind => `match3_${kind}_volume_previous`;
 function get(kind) {
  const stored=read(key(kind));
  if(stored!==null)return clamp(stored);
  const old=Number(read(`match3_${kind}_level`)??3);
  return scales[Number.isInteger(old)&&old>=0&&old<=3?old:3];
 }
 function set(kind,value,savePrevious=true) {
  value=clamp(value);
  write(key(kind),value);
  if(value>0&&savePrevious)write(previousKey(kind),value);
  window.dispatchEvent(new CustomEvent('monpatch-audio-change'));
  return value;
 }
 function toggleMute(kind) {
  const current=get(kind);
  if(current>0){write(previousKey(kind),current);return set(kind,0,false);}
  return set(kind,clamp(read(previousKey(kind))??100)||100);
 }
 window.MonpatchAudio={get,set,toggleMute};
})();

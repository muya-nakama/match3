(() => {
 "use strict";
 const dialog=document.getElementById('environmentDialog');
 const audio=window.MonpatchAudio;
 function sync(){for(const kind of ['bgm','se']){
  const value=audio.get(kind);
  document.getElementById(kind+'Range').value=value;
  document.getElementById(kind+'Number').value=value;
  const mute=document.getElementById(kind+'Mute');
  mute.textContent=value===0?'🔇':'🔊';
  mute.setAttribute('aria-pressed',String(value===0));
  mute.setAttribute('aria-label',`${kind==='bgm'?'BGM':'SE'} ${value===0?'ミュート解除':'ミュート'}`);
 }}
 document.getElementById('environmentBtn').addEventListener('click',()=>{sync();dialog.showModal();});
 document.getElementById('environmentClose').addEventListener('click',()=>dialog.close());
 for(const kind of ['bgm','se']){
  const range=document.getElementById(kind+'Range'),number=document.getElementById(kind+'Number');
  range.addEventListener('input',()=>audio.set(kind,range.value));
  number.addEventListener('input',()=>{number.value=number.value.replace(/[^0-9]/g,'').slice(0,3);});
  const apply=()=>audio.set(kind,number.value===''?audio.get(kind):number.value);
  number.addEventListener('blur',apply);
  number.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();apply();number.blur();}});
  document.getElementById(kind+'Mute').addEventListener('click',()=>audio.toggleMute(kind));
 }
 window.addEventListener('monpatch-audio-change',()=>{
  sync();
  try{document.getElementById('battleGameFrame')?.contentWindow?.refreshAudioSettings?.();}catch(_){}
 });
 window.addEventListener('storage',()=>sync());
 sync();
})();

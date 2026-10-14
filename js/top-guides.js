/* 共通の説明はトップから開き、閉じた時もトップへ戻す。 */
(() => {
 const status=document.getElementById('topGuideStatus');
 const buttons=[...document.querySelectorAll('[data-top-guide]')];
 let pending=null,lastButton=null;
 function returnToTop(){
  pending=null;
  const w=battleGameFrame.contentWindow;if(w)w.__guideReturnToTop=null;
  battleGameScreen.classList.remove('show','singleModeView');
  battleGameScreen.setAttribute('aria-hidden','true');
  singleTopBackBtn?.classList.remove('show');
  gameMode='launcher';showTopPage();
  lastButton?.focus();
 }
 function open(kind){
  if(!['basic','skill','blocks'].includes(kind))return;
  if(!battleFrameReady){pending=kind;status.textContent='説明を準備しています…';return;}
  pending=null;
  if(!configureFrameForSingleMode()){status.textContent='説明を開けませんでした。もう一度お試しください。';return;}
  const w=battleGameFrame.contentWindow,d=battleGameFrame.contentDocument;
  w.__guideReturnToTop=returnToTop;gameMode='guide';status.textContent='';
  topPage.classList.remove('active');multiPage.classList.remove('active');
  singleProfileFloat?.classList.remove('show');singleTopBackBtn?.classList.remove('show');
  battleGameScreen.classList.add('show','singleModeView');
  battleGameScreen.setAttribute('aria-hidden','false');battleLoadOverlay.classList.add('hidden');
  if(kind==='blocks')w.openInfoOverlay(d.getElementById('rulesOverlay'));
  else w.openTutorial(kind==='skill'?'skill':'basic');
 }
 function failed(){if(pending){pending=null;status.textContent='説明を読み込めませんでした。ページを再読み込みしてください。';}}
 for(const button of buttons)button.addEventListener('click',()=>{lastButton=button;open(button.dataset.topGuide);});
 battleGameFrame.addEventListener('load',()=>{
  if(!pending)return;
  if(!topPage.classList.contains('active')){pending=null;return;}
  if(battleFrameReady)open(pending);else failed();
 });
 battleGameFrame.addEventListener('error',failed);
 window.MonpatchTopGuides={open,returnToTop,failed};
})();

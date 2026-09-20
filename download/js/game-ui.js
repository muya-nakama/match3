const rulesLinkBtn=document.getElementById("rulesLinkBtn");
const historyLinkBtn=document.getElementById("historyLinkBtn");
const rulesOverlay=document.getElementById("rulesOverlay");
const historyOverlay=document.getElementById("historyOverlay");

function openInfoOverlay(el){
 if(!el)return;
 playDecision();
 el.classList.add("show");
 el.setAttribute("aria-hidden","false");
}
function closeInfoOverlay(el){
 if(!el)return;
 playDecision();
 el.classList.remove("show");
 el.setAttribute("aria-hidden","true");
}
rulesLinkBtn?.addEventListener("click",()=>openInfoOverlay(rulesOverlay));
historyLinkBtn?.addEventListener("click",()=>openInfoOverlay(historyOverlay));
document.querySelectorAll("[data-close-info]").forEach(btn=>{
 btn.addEventListener("click",()=>closeInfoOverlay(btn.closest(".infoOverlay")));
});
document.querySelectorAll(".infoOverlay").forEach(overlay=>{
 overlay.addEventListener("click",e=>{
  if(e.target===overlay)closeInfoOverlay(overlay);
 });
});

const gameTitleBtn=document.getElementById("gameTitleBtn");
gameTitleBtn?.addEventListener("click",()=>{
 if(lock)return;
 playDecision();
 stopBgm();
 stopTimer();
 stopIdleWatch();
 resetMissionSuccess();
 testerMode=false;
 tutorialMode=false;
 document.getElementById("testerBadge")?.classList.remove("show");
 gameRunning=false;
 pendingFinish=false;
 selected=null;
 hintPair=null;
 resultScreen.classList.remove("show");
 titleScreen.classList.remove("hidden");
 setMsg("隣のブロックへスワイプ");
});


newBoard();
gameRunning=false;
updateTimer();
updateChain();
syncToggles();
updateMissionUI();
window.__monpatchGameReady=true;

"use strict";


/* Scoring regression baseline: f1e31c1 (v2.69.5). Audio bytes omitted. */
const AUDIO_DATA = {};
const AUDIO_VOL = {
 bgm:0.25,
 chain1:0.24, chain2:0.24, chain3:0.24, chain4:0.24,
 decision:0.22, move:0.18, cancel:0.20,
 bomb:0.24, flower:0.26, line:0.24, mission:0.26, battleInterference:0.24
};
let bgmVolume=window.MonpatchAudio.get("bgm")/100;
let seVolume=window.MonpatchAudio.get("se")/100;

const bgmAudio = new Audio(AUDIO_DATA.bgm);
bgmAudio.loop = true;
bgmAudio.preload = "auto";
bgmAudio.volume = AUDIO_VOL.bgm*bgmVolume;
let bgmRequested=false;

function playSfx(name, scale=1, delay=0){
 if(seVolume===0 || document.hidden)return;
 const run=()=>{
  if(document.hidden)return;
  try{
   const a=new Audio(AUDIO_DATA[name]);
   a.preload="auto";
   a.volume=Math.max(0,Math.min(1,(AUDIO_VOL[name]??0.35)*scale*seVolume));
   a.play().catch(()=>{});
  }catch(e){}
 };
 if(delay>0)setTimeout(run,delay); else run();
}
function playDecision(){playSfx("decision");}
function playMove(){playSfx("move");}
function playCancel(){playSfx("cancel");}
function playFlower(){playSfx("flower");}
function playChainSfx(level){
 const n=Math.min(4,Math.max(1,level|0));
 playSfx("chain"+n);
}
function startBgm(restart=true){
 bgmRequested=true;
 refreshAudioSettings();
 try{
  if(restart)bgmAudio.currentTime=0;
  bgmAudio.volume=AUDIO_VOL.bgm*bgmVolume;
  if(!document.hidden)bgmAudio.play().catch(()=>{});
 }catch(e){}
}
function stopBgm(){
 bgmRequested=false;
 try{bgmAudio.pause();bgmAudio.currentTime=0;}catch(e){}
}
document.addEventListener("visibilitychange",()=>{
 if(document.hidden){
  bgmAudio.pause();
 }else if(bgmRequested){
  refreshAudioSettings();
  bgmAudio.play().catch(()=>{});
 }
});


const RANKING_API_URL="https://script.google.com/macros/s/AKfycbwl5SwB31HQZNEVOv2ddbLjDtsgz-z8a7BXSfDkPXcQid9lyQb1At0cJ--Emip2BOsShw/exec";
const GAME_VERSION="2.69.5";
let rankingMinutes=3,rankingInterference=false;

const titleScreen=document.getElementById("titleScreen");
const startBtn=document.getElementById("startBtn");
const resultScreen=document.getElementById("resultScreen");
const retryBtn=document.getElementById("retryBtn");
const titleBtn=document.getElementById("titleBtn");
const resultScoreEl=document.getElementById("resultScore");
const resultTimeEl=document.getElementById("resultTime");
const resultInterferenceStats=document.getElementById("resultInterferenceStats");
const timerEl=document.getElementById("timer");
const chainEl=document.getElementById("chain");
const titleHintToggle=document.getElementById("titleHintToggle");
const durationSelect=document.getElementById("durationSelect");
const hudHintToggle=document.getElementById("hudHintToggle");
const interferenceToggle=document.getElementById("interferenceToggle");
const missionBox=document.getElementById("missionBox");

const ROWS=7, COLS=9, COLORS=5;
// ピカピカの得点表。個数点は実際に消えたブロックだけに付ける。
const SPECIAL_POINTS={line: [300,30],bomb:[500,50],flower:[600,60],lineLine:[1200,60],bombLine:[1600,80],flowerLine:[1800,90],bombBomb:[2000,100],flowerBomb:[2200,110],flowerFlower:[2400,120]};
function scoreSpecial(kind,count){
 const [base,perTile]=SPECIAL_POINTS[kind];
 score+=base+perTile*count;
}
function scoreKind(special){return special==="flower"?"flower":special==="bomb"?"bomb":"line";}
let B=[], score=0, selected=null, lock=false, pointerStart=null, nextId=1;
let selectedMinutes=3, remainingSeconds=180, timerId=null;
let gameRunning=false, pendingFinish=false, chainLevel=1, testerMode=false, tutorialMode=false;
let summonMode=null;
let hintEnabled=true, interferenceEnabled=false, hintPair=null, hintBusy=false;
let lastActivity=Date.now(), idleWatchId=null;
let mission=null, pendingIceAttacks=0, pendingChainAttacks=0;
let iceAttackCount=0, chainAttackCount=0;
let missionSuccessTimer=null, missionSuccessVisible=false;
const HINT_DELAY=4000, DEADLOCK_PENALTY=3, MISSION_GOAL=14, ICE_TRIGGER_CHANCE=0.025;
const COLOR_NAMES=["赤","青","緑","黄","紫"];

function chainMultiplier(){
 return chainLevel;
}
function updateChain(){
 chainEl.textContent=`×${chainMultiplier()}`;
}
function syncToggles(){
 for(const b of [titleHintToggle,hudHintToggle]){
  if(!b)continue;
  b.textContent=`ヒント ${hintEnabled?"ON":"OFF"}`;
  b.classList.toggle("on",hintEnabled);
  b.classList.toggle("off",!hintEnabled);
 }
 interferenceToggle.textContent=`妨害 ${interferenceEnabled?"ON":"OFF"}`;
 interferenceToggle.classList.toggle("on",interferenceEnabled);
 interferenceToggle.classList.toggle("off",!interferenceEnabled);
}
function markActivity(){
 lastActivity=Date.now();
 if(hintPair){hintPair=null;render();}
}
function isBlocked(t){return !!t && ((t.ice||0)>0 || !!t.chain);}
function isTrigger(t){return !!t?.trigger;}
function isMovableTile(t){return !!t && !isBlocked(t) && !isTrigger(t);}
function isMatchableNormal(t){return !!t && !t.special && !isBlocked(t) && !isTrigger(t) && t.color!=null;}
function newMission(){
 if(!interferenceEnabled){mission=null;updateMissionUI();return;}
 let goal=MISSION_GOAL;
 try{
  const n=Number(parent?.__battlePlayerCount?.()||2);
  goal=14+Math.max(0,Math.min(4,n-2))*2;
 }catch(e){}
 mission={color:rnd(COLORS),goal,progress:0};
 updateMissionUI();
}
function resetMissionSuccess(){
 if(missionSuccessTimer){clearTimeout(missionSuccessTimer);missionSuccessTimer=null;}
 missionSuccessVisible=false;
 missionBox.classList.remove("success");
}
function showMissionSuccess(){
 playSfx("mission");
 missionSuccessVisible=true;
 if(missionSuccessTimer)clearTimeout(missionSuccessTimer);
 missionBox.classList.remove("success");
 void missionBox.offsetWidth;
 missionBox.classList.add("show","success");
 missionBox.innerHTML='<div class="missionSuccessText">✨ ミッション成功！ ✨</div>';
 missionSuccessTimer=setTimeout(()=>{
  missionSuccessTimer=null;
  missionSuccessVisible=false;
  missionBox.classList.remove("success");
  updateMissionUI();
 },1000);
}
function updateMissionUI(){
 if(!interferenceEnabled || !mission){missionBox.classList.remove("show","success");missionBox.textContent="";return;}
 if(missionSuccessVisible){missionBox.classList.add("show");return;}
 missionBox.classList.remove("success");
 missionBox.classList.add("show");
 missionBox.innerHTML=`<div class="missionMain">MISSION：<span class="tile c${mission.color} missionColorOrb" role="img" aria-label="${COLOR_NAMES[mission.color]}いブロック"></span>を ${mission.goal}個消す　${mission.progress}/${mission.goal}</div><div class="missionStats"><span>🔗×${chainAttackCount}</span><span>🧊×${iceAttackCount}</span></div>`;
}
function makeSpawnTile(){
 if(interferenceEnabled && Math.random()<ICE_TRIGGER_CHANCE){
  return {color:null,special:null,id:nextId++,ice:0,chain:false,trigger:"ice"};
 }
 return make(rnd(COLORS));
}
function randomBlockerTarget(){
 const a=[];
 for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){
  const t=B[r][c];
  if(t && !isBlocked(t) && !isTrigger(t))a.push({r,c});
 }
 return a.length?a[rnd(a.length)]:null;
}
function applyRandomBlocker(kind){
 const p=randomBlockerTarget();
 if(!p)return false;
 const t=B[p.r][p.c];
 if(kind==="ice")t.ice=2;
 else if(kind==="chain")t.chain=true;
 return true;
}

function updateTimer(){
 if(testerMode || tutorialMode){
  timerEl.textContent="∞";
  return;
 }
 const m=Math.max(0,Math.floor(remainingSeconds/60));
 const s=Math.max(0,remainingSeconds%60);
 timerEl.textContent=`${m}:${String(s).padStart(2,"0")}`;
}
function stopTimer(){
 if(timerId){clearInterval(timerId);timerId=null;}
}
function finishGame(){
 if(!gameRunning && resultScreen.classList.contains("show"))return;
 stopBgm();
 gameRunning=false;
 pendingFinish=false;
 stopTimer();
 stopIdleWatch();
 resetMissionSuccess();
 selected=null;
 render();
 resultTimeEl.textContent=`${selectedMinutes}分 CHALLENGE`;
 resultScoreEl.textContent=score.toLocaleString("ja-JP");
 if(resultInterferenceStats){
  resultInterferenceStats.style.display=interferenceEnabled?"block":"none";
  resultInterferenceStats.textContent=`🔗×${chainAttackCount}　🧊×${iceAttackCount}`;
 }
 resultScreen.classList.add("show");
 prepareResultRanking();
}
function startGame(minutes=selectedMinutes){
 summonMode=null;
 testerMode=false;

 const testerBadge=document.getElementById("testerBadge");
 testerBadge?.classList.remove("show");
 selectedMinutes=minutes;
 startBgm(true);
 remainingSeconds=minutes*60;
 score=0;
 chainLevel=1;
 iceAttackCount=0;
 chainAttackCount=0;
 pendingIceAttacks=0;
 pendingChainAttacks=0;
 resetMissionSuccess();
 pendingFinish=false;
 gameRunning=true;
 lock=false;
 resultScreen.classList.remove("show");
 titleScreen.classList.add("hidden");
 newBoard(false);
 if(interferenceEnabled)newMission(); else {mission=null;updateMissionUI();}
 markActivity();
 startIdleWatch();
 updateTimer();
 updateChain();
 stopTimer();
 timerId=setInterval(()=>{
  if(!gameRunning)return;
  remainingSeconds--;
  updateTimer();
  if(remainingSeconds<=0){
   stopTimer();
   gameRunning=false;
   if(lock) pendingFinish=true;
   else finishGame();
  }
 },1000);
}

function startTesterGame(){
 testerMode=true;
 summonMode=null;

 stopTimer();
 stopIdleWatch();
 startBgm(true);
 remainingSeconds=0;
 score=0;
 chainLevel=1;
 iceAttackCount=0;
 chainAttackCount=0;
 pendingIceAttacks=0;
 pendingChainAttacks=0;
 resetMissionSuccess();
 pendingFinish=false;
 gameRunning=true;
 lock=false;
 resultScreen.classList.remove("show");
 titleScreen.classList.add("hidden");
 const badge=document.getElementById("testerBadge");
 if(badge){badge.textContent="FREE PLAY / TIME ∞";badge.classList.add("show");}
 mission=null;
 updateMissionUI();
 newBoard(false);
 selected=null;
 hintPair=null;
 updateTimer();
 updateChain();
 setMsg("フリープレイ：時間無制限");
 render();
}

durationSelect?.addEventListener("change",()=>{
 playDecision();
 selectedMinutes=Number(durationSelect.value)||3;
});
titleHintToggle?.addEventListener("click",()=>{playDecision();hintEnabled=!hintEnabled;syncToggles();markActivity();});
hudHintToggle.addEventListener("click",()=>{playDecision();hintEnabled=!hintEnabled;syncToggles();markActivity();});
interferenceToggle.addEventListener("click",()=>{playDecision();interferenceEnabled=!interferenceEnabled;syncToggles();});
syncToggles();
startBtn.addEventListener("click",()=>{playDecision();selectedMinutes=Number(durationSelect?.value||selectedMinutes)||3;startGame(selectedMinutes);});
retryBtn.addEventListener("click",()=>{playDecision();startGame(selectedMinutes);});
titleBtn.addEventListener("click",()=>{
 playDecision(); stopBgm();
 stopTimer(); stopIdleWatch(); summonMode=null; testerMode=false;
 document.getElementById("testerBadge")?.classList.remove("show");
 gameRunning=false; pendingFinish=false;

 resultScreen.classList.remove("show");
 titleScreen.classList.remove("hidden");
});



const gameMenuBtn=document.getElementById("gameMenuBtn");
const gameMenuOverlay=document.getElementById("gameMenuOverlay");
const gameMenuClose=document.getElementById("gameMenuClose");
const freePlayMenu=document.getElementById("freePlayMenu");

function refreshAudioSettings(){
 bgmVolume=window.MonpatchAudio.get("bgm")/100;
 seVolume=window.MonpatchAudio.get("se")/100;
 bgmAudio.volume=AUDIO_VOL.bgm*bgmVolume;
 for(const kind of ["bgm","se"]){
  const button=document.getElementById(kind==="bgm"?"gameBgmToggle":"gameSeToggle");
  if(!button)continue;
  const on=window.MonpatchAudio.get(kind)>0;
  button.textContent=`${kind.toUpperCase()} ${on?"オン":"オフ"}`;
  button.setAttribute("aria-pressed",String(on));
  button.classList.toggle("muted",!on);
 }
}
window.refreshAudioSettings=refreshAudioSettings;
window.addEventListener("storage",refreshAudioSettings);
window.addEventListener("monpatch-audio-change",refreshAudioSettings);

function openGameMenu(){
 playDecision();
 freePlayMenu.classList.toggle("show",testerMode);
 gameMenuOverlay.classList.add("show");
 gameMenuOverlay.setAttribute("aria-hidden","false");
 refreshAudioSettings();
}
function closeGameMenu(){
 gameMenuOverlay.classList.remove("show");
 gameMenuOverlay.setAttribute("aria-hidden","true");
}
for(const kind of ["bgm","se"]){
 document.getElementById(kind==="bgm"?"gameBgmToggle":"gameSeToggle")?.addEventListener("click",()=>{
  window.MonpatchAudio.toggleMute(kind);
  try{window.parent.dispatchEvent(new CustomEvent("monpatch-audio-change"));}catch(_){}
 });
}
gameMenuBtn?.addEventListener("click",openGameMenu);
gameMenuClose?.addEventListener("click",()=>{playDecision();closeGameMenu();});
document.querySelectorAll(".summonBtn").forEach(btn=>{
 btn.addEventListener("click",()=>{
  playDecision();
  summonMode=btn.dataset.summon;
  document.querySelectorAll(".summonBtn").forEach(b=>b.classList.toggle("active",b===btn));
  setMsg("召喚位置を盤面でタップしてください");
  closeGameMenu();
 });
});
refreshAudioSettings();



const playerNameInput=document.getElementById("playerNameInput");
const playerNameSave=document.getElementById("playerNameSave");
const playerNameStatus=document.getElementById("playerNameStatus");
const PLAYER_NAME_KEY="match3_ranking_name";

function getSavedPlayerName(){
 return (localStorage.getItem(PLAYER_NAME_KEY)||"").trim().slice(0,16);
}
function setSavedPlayerName(name){
 const clean=String(name||"").trim().slice(0,16);
 if(clean)localStorage.setItem(PLAYER_NAME_KEY,clean);
 else localStorage.removeItem(PLAYER_NAME_KEY);
 try { if(parent !== window)parent.dispatchEvent(new Event("monpatch-profile-changed")); } catch(e) {}
 return clean;
}
function syncPlayerNameUI(){
 const saved=getSavedPlayerName();
 if(playerNameInput){
  playerNameInput.value=saved;playerNameInput.hidden=!!saved;
  if(playerNameSave)playerNameSave.hidden=!!saved;
  let edit=document.getElementById("playerNameEdit");
  if(!edit){
   edit=document.createElement("button");edit.id="playerNameEdit";edit.textContent="名前を変更";
   playerNameInput.parentElement.appendChild(edit);
   edit.addEventListener("click",()=>{playerNameInput.hidden=false;if(playerNameSave)playerNameSave.hidden=false;edit.hidden=true;playerNameInput.focus();});
  }
  edit.hidden=!saved;
 }
}
function savePlayerNameFromTitle(){
 const clean=setSavedPlayerName(playerNameInput?.value||"");
 if(playerNameStatus){
  playerNameStatus.textContent=clean?`「${clean}」で保存しました`:"プレイヤーネームを未設定にしました";
 }
 if(resultRankName)resultRankName.value=clean;
 syncPlayerNameUI();
 syncResultNameUI();
}
playerNameSave?.addEventListener("click",()=>{
 playDecision();
 savePlayerNameFromTitle();
});
playerNameInput?.addEventListener("keydown",e=>{
 if(e.key==="Enter")savePlayerNameFromTitle();
});
syncPlayerNameUI();

const rankingTitleBtn=document.getElementById("rankingTitleBtn");
const rankingOverlay=document.getElementById("rankingOverlay");
const rankingCloseBtn=document.getElementById("rankingCloseBtn");
const rankingStatus=document.getElementById("rankingStatus");
const rankingBody=document.getElementById("rankingBody");
const resultRankingBox=document.getElementById("resultRankingBox");
const resultRankingTitle=document.getElementById("resultRankingTitle");
const resultRankName=document.getElementById("resultRankName");
const resultRankSubmit=document.getElementById("resultRankSubmit");
const resultRankStatus=document.getElementById("resultRankStatus");

function escapeRank(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function formatAttackCount(value,mark){
 if(value===null || value===undefined || value==="")return `${mark}×—`;
 const n=Number(value);
 return `${mark}×${Number.isFinite(n)?Math.max(0,Math.floor(n)):"—"}`;
}
let rankingLoadToken=0,legacyRankingPromise;
async function loadRanking(minutes=rankingMinutes,interference=rankingInterference){
 rankingMinutes=Number(minutes)||3;
 rankingInterference=Boolean(interference);
 const token=++rankingLoadToken,m=rankingMinutes,mode=rankingInterference;
 const legacy=document.getElementById("rankingGeneration").value==="legacy";
 document.querySelectorAll(".rankingDurationBtn").forEach(b=>b.classList.toggle("selected",Number(b.dataset.rankMin)===m));
 document.querySelectorAll(".rankingModeBtn").forEach(b=>b.classList.toggle("selected",(b.dataset.rankInterference==="1")===mode));
 rankingStatus.textContent="読み込み中...";rankingBody.innerHTML="";
 try{
  let rows;
  if(legacy){
   if(!legacyRankingPromise)legacyRankingPromise=fetch("data/ranking-legacy.json").then(r=>{if(!r.ok)throw new Error("archive");return r.json()}).catch(e=>{legacyRankingPromise=null;throw e});
   const archive=await legacyRankingPromise;
   rows=archive.ranking.filter(r=>Number(r.minutes)===m&&r.interference===mode).sort((a,b)=>b.score-a.score).map((r,i)=>({...r,rank:i+1}));
  }else{
   const data=await window.MonpatchRanking.read(RANKING_API_URL,{minutes:m,interference:mode?1:0});
   if(!data.ok)throw new Error("ranking");
   rows=Array.isArray(data.ranking)?data.ranking:[];
  }
  if(token!==rankingLoadToken)return;
  rankingStatus.textContent=`${m}分・妨害${mode?"あり":"なし"}${legacy?"・旧記録（閲覧専用）":""}`;
  rankingBody.innerHTML=rows.length?rows.slice(0,20).map(r=>`<tr><td class="rankingRank">${Number(r.rank)||""}</td><td><span class="rankPlayer">${window.MonpatchRanking.avatarMarkup(r.avatarData,r.name)}<span>${escapeRank(r.name)}${legacy?`<small class="rankRecordVersion">v${escapeRank(r.version)}</small>`:""}</span></span></td><td class="rankInterference">${mode?`${formatAttackCount(r.chainAttacks,"🔗")}<br>${formatAttackCount(r.iceAttacks,"🧊")}`:"—"}</td><td>${Number(r.score||0).toLocaleString("ja-JP")}</td></tr>`).join(""):'<tr><td colspan="4" class="rankingEmpty">まだ記録がありません</td></tr>';
 }catch(e){
  if(token!==rankingLoadToken)return;
  rankingStatus.textContent="取得できませんでした";
  rankingBody.innerHTML='<tr><td colspan="4" class="rankingEmpty">通信を確認して再選択してください</td></tr>';
 }
}
document.getElementById("rankingGeneration").addEventListener("change",()=>loadRanking());
function openRanking(m=selectedMinutes||3,interference=interferenceEnabled){rankingOverlay.classList.add("show");rankingOverlay.setAttribute("aria-hidden","false");loadRanking(m,interference)}
function closeRanking(){rankingOverlay.classList.remove("show");rankingOverlay.setAttribute("aria-hidden","true")}
rankingTitleBtn?.addEventListener("click",()=>{playDecision();openRanking(selectedMinutes||3,interferenceEnabled)});
rankingCloseBtn?.addEventListener("click",()=>{playDecision();closeRanking()});
document.querySelectorAll(".rankingDurationBtn").forEach(b=>b.addEventListener("click",()=>loadRanking(Number(b.dataset.rankMin))));
document.querySelectorAll(".rankingModeBtn").forEach(b=>b.addEventListener("click",()=>loadRanking(rankingMinutes,b.dataset.rankInterference==="1")));
function prepareResultRanking(){
 if(testerMode){resultRankingBox.style.display="none";return}
 resultRankingBox.style.display="";
 if(resultRankingTitle)resultRankingTitle.textContent=`ランキングに登録（妨害${interferenceEnabled?"あり":"なし"}）`;
 resultRankStatus.textContent="";
 syncResultNameUI();
 resultRankSubmit.disabled=false;
}
function syncResultNameUI(){
 const saved=getSavedPlayerName();
 resultRankName.value=saved;resultRankName.hidden=!!saved;
 let label=document.getElementById("resultRankSavedName"),edit=document.getElementById("resultRankNameEdit");
 if(!label){
  label=document.createElement("div");label.id="resultRankSavedName";
  edit=document.createElement("button");edit.id="resultRankNameEdit";edit.textContent="名前を変更";
  resultRankName.parentElement.before(label);resultRankName.parentElement.after(edit);
  edit.addEventListener("click",()=>{resultRankName.hidden=false;edit.hidden=true;resultRankName.focus();});
 }
 label.textContent=saved?("登録名："+saved):"";label.hidden=!saved;edit.hidden=!saved;
}
async function submitScoreToRanking(){
 if(testerMode || resultRankSubmit.disabled)return;
 const name=(resultRankName.value||"").trim().slice(0,16);
 if(!name){resultRankStatus.textContent="名前を入力してください";return}
 setSavedPlayerName(name);syncPlayerNameUI();syncResultNameUI();
 resultRankSubmit.disabled=true;resultRankStatus.textContent="送信中...";
 const submittedScore=Math.floor(score),submittedInterference=interferenceEnabled;
 try{
  const data=await window.MonpatchRanking.submit(RANKING_API_URL,{
   action:"submit",name,score:String(submittedScore),minutes:String(selectedMinutes),
   interference:submittedInterference?"1":"0",
   chainAttacks:String(submittedInterference?chainAttackCount:0),
   iceAttacks:String(submittedInterference?iceAttackCount:0),version:GAME_VERSION
  });
  const best=Number(data.bestScore||0).toLocaleString("ja-JP");
  const rank=Number(data.rank)>0?"\n現在の順位："+Number(data.rank)+"位":"";
  if(data.result==="updated")resultRankStatus.textContent="🎉 高得点を更新しました！\n"+Number(data.previousScore||0).toLocaleString("ja-JP")+"点 → "+best+"点"+rank;
  else if(data.result==="kept")resultRankStatus.textContent="高得点を維持しました\n現在："+best+"点／今回："+submittedScore.toLocaleString("ja-JP")+"点"+rank;
  else resultRankStatus.textContent="ランキングに登録しました！\nスコア："+best+"点"+rank;
 }catch(e){
  resultRankStatus.textContent=e.message||"登録できませんでした";
  resultRankSubmit.disabled=false;
 }
}
resultRankSubmit?.addEventListener("click",()=>{playDecision();submitScoreToRanking()});

const boardEl=document.getElementById("board");
const scoreEl=document.getElementById("score");
const msgEl=document.getElementById("msg");
const fxEl=document.getElementById("fx");

const rnd=n=>Math.floor(Math.random()*n);
const inside=(r,c)=>r>=0&&r<ROWS&&c>=0&&c<COLS;
const K=(r,c)=>`${r},${c}`;
const parseK=s=>s.split(",").map(Number);
const make=(color,special=null)=>({color,special,id:nextId++,ice:0,chain:false,trigger:null});
const sleep=ms=>new Promise(res=>setTimeout(res,ms));
const isLine=s=>s==="lineH"||s==="lineV";

function setMsg(s){ msgEl.textContent=s; }

function generateCleanBoard(){
 B=Array.from({length:ROWS},()=>Array(COLS).fill(null));
 for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){
  let color, guard=0;
  do{
   color=rnd(COLORS); guard++;
  }while(guard<100 && (
   (c>=2 && B[r][c-1]?.color===color && B[r][c-2]?.color===color) ||
   (r>=2 && B[r-1][c]?.color===color && B[r-2][c]?.color===color) ||
   (r>=1 && c>=1 && B[r-1][c]?.color===color && B[r][c-1]?.color===color && B[r-1][c-1]?.color===color)
  ));
  B[r][c]=make(color);
 }
}



function newBoard(resetScore=true){
 for(let tries=0;tries<200;tries++){
  generateCleanBoard();
  if(scanMatches().cells.size===0 && findValidMove())break;
 }
 if(resetScore) score=0;
 selected=null; lock=false; chainLevel=1; updateChain();
 setMsg("隣のブロックへスワイプ");
 render();
}

function render(dropMap=null, popSet=null){
 boardEl.innerHTML="";
 scoreEl.textContent=score;
 const step=getStepPx()||56;
 for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){
  const t=B[r][c];
  const d=document.createElement("div");
  d.className="tile";
  if(!t){
   d.classList.add("emptyTile");
  }else if(t?.trigger==="ice"){
   d.classList.add("iceTriggerTile","blocked");
  }else if(t?.special){
   d.classList.add("specialTile",t.special);
  }else{
   d.classList.add(`c${t.color}`);
  }
  if(isBlocked(t))d.classList.add("blocked");
  if((t?.ice||0)===2)d.classList.add("ice2");
  else if((t?.ice||0)===1)d.classList.add("ice1");
  if(t?.chain)d.classList.add("chainLocked");
  if(selected?.r===r && selected?.c===c) d.classList.add("sel");
  if(dropMap && t && dropMap.has(t.id)){
   d.classList.add("fall");
   d.style.setProperty("--fall-y",`${dropMap.get(t.id)}px`);
  }
  if(popSet?.has(K(r,c))) d.classList.add("pop");
  if(hintPair){
   const isA=hintPair.a.r===r&&hintPair.a.c===c;
   const isB=hintPair.b.r===r&&hintPair.b.c===c;
   if(isA||isB){
    const from=isA?hintPair.a:hintPair.b, to=isA?hintPair.b:hintPair.a;
    d.classList.add("hintMove");
    d.style.setProperty("--hint-x",`${(to.c-from.c)*Math.max(16,step*.28)}px`);
    d.style.setProperty("--hint-y",`${(to.r-from.r)*Math.max(16,step*.28)}px`);
   }
  }
  d.dataset.r=r; d.dataset.c=c;
  const m=document.createElement("span");
  m.className="mark";
  if(t?.trigger==="ice") m.textContent="🧊";
  else if(t?.special==="lineH") m.textContent="↔️";
  else if(t?.special==="lineV") m.textContent="↕️";
  else if(t?.special==="bomb") m.textContent="💣";
  else if(t?.special==="flower") m.textContent="🌸";
  d.appendChild(m);
  if(t?.chain){const o=document.createElement("span");o.className="blockerMark";o.textContent="⛓️";d.appendChild(o);}
  else if((t?.ice||0)>0){
   const o=document.createElement("span");
   o.className="blockerMark"+(t.ice===1?" halfSnowMark":"");
   o.textContent=(t.ice===2?"❄️":"❄");
   d.appendChild(o);
  }
  if(t)d.addEventListener("click",()=>tap(r,c));
  boardEl.appendChild(d);
 }
}

function adjacent(a,b){return Math.abs(a.r-b.r)+Math.abs(a.c-b.c)===1}
function swap(a,b){[B[a.r][a.c],B[b.r][b.c]]=[B[b.r][b.c],B[a.r][a.c]]}

async function tap(r,c){
 if(lock||!gameRunning)return;
 markActivity();

 if(testerMode && summonMode){
  const parts=summonMode.split("+");
  const p1={r,c};
  let p2=null;
  if(parts.length===2){
   if(c<COLS-1)p2={r,c:c+1};
   else if(c>0)p2={r,c:c-1};
   else {playCancel();setMsg("2個セットを置ける隣マスがありません");return;}
  }
  if(isBlocked(B[p1.r][p1.c]) || isTrigger(B[p1.r][p1.c]) ||
     (p2 && (isBlocked(B[p2.r][p2.c]) || isTrigger(B[p2.r][p2.c])))){
   playCancel();setMsg("妨害ブロックの上には召喚できません");return;
  }
  B[p1.r][p1.c]=make(null,parts[0]);
  if(p2)B[p2.r][p2.c]=make(null,parts[1]);
  summonMode=null;
  document.querySelectorAll(".summonBtn").forEach(b=>b.classList.remove("active"));
  playDecision();
  render();
  setMsg(parts.length===2?"特殊ブロック2個を召喚しました":"特殊ブロックを召喚しました");
  return;
 }

 if(!isMovableTile(B[r][c])){playCancel();selected=null;render();setMsg("そのブロックは動かせません");return;}
 if(!selected){selected={r,c};render();return}
 const a=selected,b={r,c}; selected=null; render();
 if(adjacent(a,b) && isMovableTile(B[a.r][a.c]) && isMovableTile(B[b.r][b.c])) await trySwap(a,b);
 else {selected=b;render()}
}

boardEl.addEventListener("pointerdown",e=>{
 const t=e.target.closest(".tile"); if(!t||lock||!gameRunning)return;
 markActivity();
 const rr=+t.dataset.r,cc=+t.dataset.c;if(!isMovableTile(B[rr][cc])){playCancel();return;}
 pointerStart={r:+t.dataset.r,c:+t.dataset.c,x:e.clientX,y:e.clientY};
});
boardEl.addEventListener("pointerup",e=>{
 if(!pointerStart||lock||!gameRunning)return;
 const dx=e.clientX-pointerStart.x,dy=e.clientY-pointerStart.y;
 if(Math.max(Math.abs(dx),Math.abs(dy))<18){pointerStart=null;return}
 let dr=0,dc=0;
 if(Math.abs(dx)>Math.abs(dy)) dc=dx>0?1:-1; else dr=dy>0?1:-1;
 const a={r:pointerStart.r,c:pointerStart.c};
 const b={r:a.r+dr,c:a.c+dc}; pointerStart=null;
 if(inside(b.r,b.c) && isMovableTile(B[a.r][a.c]) && isMovableTile(B[b.r][b.c])){selected=null;render();trySwap(a,b)}
 else playCancel();
});

function addAll(dst,src){for(const x of src)dst.add(x);return dst}
function allBoard(){
 const s=new Set();for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++)s.add(K(r,c));return s;
}
function lineSet(r,c,dir,thick=0){
 const s=new Set();
 if(dir==="H"){
  for(let rr=Math.max(0,r-thick);rr<=Math.min(ROWS-1,r+thick);rr++)
   for(let cc=0;cc<COLS;cc++)s.add(K(rr,cc));
 }else{
  for(let cc=Math.max(0,c-thick);cc<=Math.min(COLS-1,c+thick);cc++)
   for(let rr=0;rr<ROWS;rr++)s.add(K(rr,cc));
 }
 return s;
}
function crossSet(r,c,thick=0){const s=lineSet(r,c,"H",thick);return addAll(s,lineSet(r,c,"V",thick))}
function bombSet(r,c,radius=2){
 const s=new Set();
 for(let rr=0;rr<ROWS;rr++)for(let cc=0;cc<COLS;cc++)
  if(Math.abs(rr-r)+Math.abs(cc-c)<=radius)s.add(K(rr,cc));
 return s;
}

function bombBombSet(r,c){
 const s=new Set();
 for(let rr=0;rr<ROWS;rr++)for(let cc=0;cc<COLS;cc++){
  if(Math.abs(rr-r)+Math.abs(cc-c)<=3) s.add(K(rr,cc));
 }
 return s;
}
function effectAt(r,c,special){
 if(special==="lineH")return lineSet(r,c,"H");
 if(special==="lineV")return lineSet(r,c,"V");
 if(special==="bomb")return bombSet(r,c,2);
 return new Set([K(r,c)]);
}

function scanMatches(){
 const cells=new Set(), groups=[], squares=[];
 for(let r=0;r<ROWS;r++){
  let c=0;
  while(c<COLS){
   const color=isMatchableNormal(B[r][c]) ? B[r][c].color : null; let e=c+1;
   while(e<COLS && isMatchableNormal(B[r][e]) && B[r][e].color===color)e++;
   if(color!=null && e-c>=3){
    const g=[];for(let x=c;x<e;x++){g.push({r,c:x});cells.add(K(r,x))}
    groups.push({dir:"H",cells:g,color});
   }
   c=e;
  }
 }
 for(let c=0;c<COLS;c++){
  let r=0;
  while(r<ROWS){
   const color=isMatchableNormal(B[r][c]) ? B[r][c].color : null; let e=r+1;
   while(e<ROWS && isMatchableNormal(B[e][c]) && B[e][c].color===color)e++;
   if(color!=null && e-r>=3){
    const g=[];for(let x=r;x<e;x++){g.push({r:x,c});cells.add(K(x,c))}
    groups.push({dir:"V",cells:g,color});
   }
   r=e;
  }
 }
 for(let r=0;r<ROWS-1;r++)for(let c=0;c<COLS-1;c++){
  const color=isMatchableNormal(B[r][c]) ? B[r][c].color : null;
  if(color!=null &&
    isMatchableNormal(B[r][c+1]) && isMatchableNormal(B[r+1][c]) && isMatchableNormal(B[r+1][c+1]) &&
    B[r][c+1]?.color===color && B[r+1][c]?.color===color && B[r+1][c+1]?.color===color){
   const sq=[{r,c},{r,c:c+1},{r:r+1,c},{r:r+1,c:c+1}];
   squares.push({cells:sq,color});
   for(const p of sq)cells.add(K(p.r,p.c));
  }
 }
 return {cells,groups,squares};
}







function chooseSpecials(match,preferred=null,moveDir=null){
 const contains=(arr,p)=>p&&arr.some(q=>q.r===p.r&&q.c===p.c);
 const candidates=[];

 const addCandidate=(special,cells,color,pos,priority,shapeCells=null)=>{
  if(!cells?.length || !pos)return;
  const keys=new Set(cells.map(p=>K(p.r,p.c)));
  candidates.push({special,cells:[...cells],keys,color,pos,priority,shapeCells});
 };

 // 5個以上の直列 → 花
 for(const g of match.groups.filter(x=>x.cells.length>=5)){
  const pos=contains(g.cells,preferred) ? preferred : g.cells[Math.floor(g.cells.length/2)];
  addCandidate("flower",g.cells,g.color,pos,3);
 }

 // L/T/十字：実際に交差する横3+と縦3+の組み合わせごとに候補化
 const hs=match.groups.filter(g=>g.dir==="H");
 const vs=match.groups.filter(g=>g.dir==="V");
 for(const h of hs){
  for(const v of vs){
   if(h.color!==v.color)continue;
   const cross=h.cells.find(a=>v.cells.some(b=>a.r===b.r&&a.c===b.c));
   if(!cross)continue;
   const map=new Map();
   for(const p of [...h.cells,...v.cells])map.set(K(p.r,p.c),{r:p.r,c:p.c});
   const cells=[...map.values()];
   if(cells.length<5)continue;
   const pos=contains(cells,preferred)?preferred:cross;
   addCandidate("bomb",cells,h.color,pos,2,cells);
  }
 }

 // 2×2 → 爆弾
 for(const sq of match.squares){
  const pos=contains(sq.cells,preferred)?preferred:sq.cells[0];
  addCandidate("bomb",sq.cells,sq.color,pos,2);
 }

 // 4直列 → 矢印
 for(const g of match.groups.filter(x=>x.cells.length===4)){
  const pos=contains(g.cells,preferred)?preferred:g.cells[1];
  addCandidate(g.dir==="H"?"lineH":"lineV",g.cells,g.color,pos,1);
 }

 if(!candidates.length)return [];

 // 候補同士がセルを共有する場合は同じ成立形として扱う。
 // 同じ成立形では 花 > 爆弾 > 矢印 を優先し、独立した成立形はすべて残す。
 const parent=candidates.map((_,i)=>i);
 const find=i=>parent[i]===i?i:(parent[i]=find(parent[i]));
 const unite=(a,b)=>{
  a=find(a); b=find(b);
  if(a!==b)parent[b]=a;
 };
 for(let i=0;i<candidates.length;i++){
  for(let j=i+1;j<candidates.length;j++){
   let overlap=false;
   for(const k of candidates[i].keys){
    if(candidates[j].keys.has(k)){overlap=true;break;}
   }
   if(overlap)unite(i,j);
  }
 }

 const components=new Map();
 candidates.forEach((x,i)=>{
  const root=find(i);
  if(!components.has(root))components.set(root,[]);
  components.get(root).push(x);
 });

 const chosen=[];
 for(const list of components.values()){
  list.sort((a,b)=>{
   if(b.priority!==a.priority)return b.priority-a.priority;
   const ap=contains(a.cells,preferred)?1:0;
   const bp=contains(b.cells,preferred)?1:0;
   if(bp!==ap)return bp-ap;
   return b.cells.length-a.cells.length;
  });
  chosen.push(list[0]);
 }

 // 操作したブロックを含む生成を先頭へ。以降は盤面順で安定化。
 chosen.sort((a,b)=>{
  const ap=contains(a.cells,preferred)?1:0;
  const bp=contains(b.cells,preferred)?1:0;
  if(bp!==ap)return bp-ap;
  if(a.pos.r!==b.pos.r)return a.pos.r-b.pos.r;
  return a.pos.c-b.pos.c;
 });

 // 万一、生成位置が重なったら高優先度側だけを残す。
 const used=new Set(), result=[];
 for(const x of chosen){
  const k=K(x.pos.r,x.pos.c);
  if(used.has(k))continue;
  used.add(k);
  result.push({
   pos:{r:x.pos.r,c:x.pos.c},
   special:x.special,
   color:x.color,
   shapeCells:x.shapeCells||null
  });
 }
 return result;
}


function randomPresentColor(){
 const present=new Set();
 for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){
  const t=B[r][c];
  if(isMatchableNormal(t))present.add(t.color);
 }
 const colors=[...present];
 return colors.length ? colors[Math.floor(Math.random()*colors.length)] : Math.floor(Math.random()*COLORS);
}

function expandTriggeredSpecials(clearSet,protectedKey=null,skipFlowerKeys=null,protectedKeys=null,skipSpecialKeys=null){
 const fired=new Set(), triggers=[], flowers=[];
 const skipFlowers=skipFlowerKeys||new Set();
 const skipSpecials=skipSpecialKeys||new Set();
 const protectedSet=new Set(protectedKeys||[]);
 if(protectedKey)protectedSet.add(protectedKey);
 let changed=true;

 while(changed){
  changed=false;
  for(const s of [...clearSet]){
   if(protectedSet.has(s) || fired.has(s))continue;
   const [r,c]=parseK(s),t=B[r]?.[c];
   if(!t?.special || isBlocked(t) || isTrigger(t))continue;
   if(skipSpecials.has(s))continue;

   if(t.special==="flower"){
    if(skipFlowers.has(s))continue;
    fired.add(s);

    // 花が別の特殊効果に巻き込まれた時：
    // 盤面に存在する通常色から1色をランダムに選び、その色を花処理する。
    const targetColor=randomPresentColor();
    const targets=[];
    for(let rr=0;rr<ROWS;rr++)for(let cc=0;cc<COLS;cc++){
     const q=B[rr][cc];
     if(isMatchableNormal(q) && q.color===targetColor){
      const k=K(rr,cc);
      targets.push({r:rr,c:cc});
      if(!clearSet.has(k)){clearSet.add(k);changed=true;}
     }
    }
    flowers.push({r,c,targetColor,targets});
    continue;
   }

   fired.add(s);
   triggers.push({r,c,special:t.special});
   for(const x of effectAt(r,c,t.special)){
    if(protectedSet.has(x))continue;
    if(!clearSet.has(x)){clearSet.add(x);changed=true}
   }
  }
 }
 return {triggers,flowers};
}


function cellCenter(r,c){
 const tile=boardEl.querySelector(`.tile[data-r="${r}"][data-c="${c}"]`);
 if(!tile)return {x:0,y:0,w:0,h:0};
 const tr=tile.getBoundingClientRect(), fr=fxEl.getBoundingClientRect();
 return {x:tr.left-fr.left+tr.width/2,y:tr.top-fr.top+tr.height/2,w:tr.width,h:tr.height};
}

function clearFx(){ fxEl.innerHTML=""; }

function lineFx(r,c,special){
 const p=cellCenter(r,c), fr=fxEl.getBoundingClientRect();
 const d=document.createElement("div");
 d.className="fxBeam"+(special==="lineV"?" v":"");
 if(special==="lineH"){
  d.style.left="0px"; d.style.top=`${p.y-3}px`;
  d.style.width=`${fr.width}px`; d.style.height="6px";
 }else{
  d.style.left=`${p.x-3}px`; d.style.top="0px";
  d.style.width="6px"; d.style.height=`${fr.height}px`;
 }
 fxEl.appendChild(d);
}

function bombFx(r,c,boost=1){
 const p=cellCenter(r,c);
 const ring=document.createElement("div");
 ring.className="fxBurst";
 ring.style.left=`${p.x}px`; ring.style.top=`${p.y}px`;
 ring.style.width=`${Math.max(34,p.w*1.15*boost)}px`;
 ring.style.height=ring.style.width;
 fxEl.appendChild(ring);

 const count=12;
 for(let i=0;i<count;i++){
  const q=document.createElement("div");
  q.className="fxParticle";
  const a=(Math.PI*2*i/count)+(Math.random()*.25);
  const dist=(p.w*1.4+Math.random()*p.w)*boost;
  q.style.left=`${p.x}px`;q.style.top=`${p.y}px`;
  q.style.setProperty("--dx",`${Math.cos(a)*dist}px`);
  q.style.setProperty("--dy",`${Math.sin(a)*dist}px`);
  fxEl.appendChild(q);
 }
}

function flowerFx(origin,targets,stagger=false){
 const a=cellCenter(origin.r,origin.c);
 targets.forEach((t,i)=>{
  const b=cellCenter(t.r,t.c);
  const dx=b.x-a.x,dy=b.y-a.y;
  const len=Math.hypot(dx,dy),ang=Math.atan2(dy,dx)*180/Math.PI;
  const delay=stagger ? Math.min(90,i*10) : 0;

  const ray=document.createElement("div");
  ray.className="fxRay";
  ray.style.left=`${a.x}px`;ray.style.top=`${a.y}px`;
  ray.style.width=`${len}px`;
  ray.style.setProperty("--ang",`${ang}deg`);
  ray.style.setProperty("--ray-delay",`${delay}ms`);
  fxEl.appendChild(ray);

  const hit=document.createElement("div");
  hit.className="fxHit";
  hit.style.left=`${b.x}px`;hit.style.top=`${b.y}px`;
  hit.style.setProperty("--hit-delay",`${210+delay}ms`);
  fxEl.appendChild(hit);
 });
}

async function playFlowerPropagation(origin,targets,{stagger=false,keep=false}={}){
 clearFx();
 flowerFx(origin,targets,stagger);
 const extra=stagger?90:0;
 await sleep(330+extra);
 if(!keep)clearFx();
}

async function playFlowerPropagationDual(originA,originB,targets){
 clearFx();
 const left=[],right=[];
 targets.forEach((t,i)=>(i%2===0?left:right).push(t));
 flowerFx(originA,left,true);
 flowerFx(originB,right,true);
 await sleep(420);
 clearFx();
}

async function playTriggerFx(triggers){
 if(!triggers?.length)return;
 clearFx();
 const multi=triggers.length>1;
 triggers.forEach((t,i)=>{
  const delay=multi?Math.min(180,i*28):0;
  if(t.special==="lineH"||t.special==="lineV"){
   lineFx(t.r,t.c,t.special);
   playSfx("line",multi?0.66:1,delay);
  }else if(t.special==="bomb"){
   bombFx(t.r,t.c,1);
   playSfx("bomb",multi?0.62:1,delay);
  }
 });
 await sleep(340);
 clearFx();
}

function getStepPx(){
 const tile=boardEl.querySelector(".tile");
 if(!tile)return 60;
 const gap=parseFloat(getComputedStyle(boardEl).rowGap)||5;
 return tile.getBoundingClientRect().height+gap;
}

function collapse(){
 const step=getStepPx(), drops=new Map();
 for(let c=0;c<COLS;c++){
  const fixed=[];
  for(let r=0;r<ROWS;r++)if(B[r][c] && (isBlocked(B[r][c]) || isTrigger(B[r][c])))fixed.push(r);
  const bounds=[-1,...fixed,ROWS];
  for(let bi=0;bi<bounds.length-1;bi++){
   const top=bounds[bi]+1, bottom=bounds[bi+1]-1;
   if(top>bottom)continue;
   const survivors=[];
   for(let r=bottom;r>=top;r--)if(B[r][c])survivors.push({tile:B[r][c],old:r});
   for(let r=top;r<=bottom;r++)B[r][c]=null;
   let wr=bottom;
   for(const item of survivors){
    B[wr][c]=item.tile;
    const fall=wr-item.old;
    if(fall>0)drops.set(item.tile.id,-fall*step);
    wr--;
   }
   let spawn=1;
   while(wr>=top){
    const t=tutorialMode?makeTutorialSpawnTile(wr,c):makeSpawnTile();
    B[wr][c]=t;
    drops.set(t.id,-(wr-top+spawn)*step);
    wr--;spawn++;
   }
  }
 }
 return drops;
}

function adjacentToClear(r,c,actual){
 return actual.has(K(r-1,c))||actual.has(K(r+1,c))||actual.has(K(r,c-1))||actual.has(K(r,c+1));
}
function progressMissionForTile(t){
 if(!interferenceEnabled || !mission || !t || t.special || t.color==null)return;
 if(t.color!==mission.color)return;
 mission.progress++;
 if(mission.progress>=mission.goal){
  chainAttackCount++;
  score+=500; // 消去ミッション完了
  pendingChainAttacks++;
  showMissionSuccess();
  newMission();
 }else updateMissionUI();
}
async function clearCollapseOnly(clearSet,protectedKey=null,opts={}){
 const protectedKeys=new Set(opts.protectedKeys||[]);
 if(protectedKey)protectedKeys.add(protectedKey);
 for(const key of protectedKeys)clearSet.delete(key);

 let triggers=[], flowerTriggers=[];
 if(!opts.suppressSpecialExpansion){
  const expanded=expandTriggeredSpecials(clearSet,protectedKey,opts.skipFlowerKeys,protectedKeys,opts.skipSpecialKeys);
  triggers=expanded.triggers;
  flowerTriggers=expanded.flowers;
  for(const key of protectedKeys)clearSet.delete(key);
 }
 if(opts.manualTriggers) triggers.push(...opts.manualTriggers);

 // 爆弾・矢印の巻き込み発動
 if(triggers.length) await playTriggerFx(triggers);

 // 花の巻き込み発動：ランダム1色へ伝播線を伸ばしてから、その色を全消し。
 for(const f of flowerTriggers){
  if(!f.targets.length)continue;
  playFlower();
  setMsg(`花が巻き込まれた！ ${COLOR_NAMES[f.targetColor]}を全消し！`);
  await playFlowerPropagation({r:f.r,c:f.c},f.targets,{stagger:true});
 }

 // 氷・鎖・氷トリガーは直接消えない。まず実際に消えるセルだけを確定する。
 const actual=new Set();
 for(const s of clearSet){
  const [r,c]=parseK(s),t=B[r]?.[c];
  if(t && !isBlocked(t) && !isTrigger(t) && !protectedKeys.has(s))actual.add(s);
 }
 // 通常マッチとして隣接解除できるのは、実際に消える通常ブロックだけ。
 // 特殊生成で残したマスや、特殊効果だけで消えるマスは含めない。
 const directMatchKeys=new Set([...(opts.directMatchKeys||[])].filter(s=>{
  if(!actual.has(s))return false;
  const [r,c]=parseK(s);
  return isMatchableNormal(B[r]?.[c]);
 }));

 if(actual.size>0) playChainSfx(chainLevel);

 // 妨害が反応するのは、通常マッチで直接消えるセルへの隣接、
 // または妨害本体が特殊効果の消去範囲へ直接入った場合だけ。
 // 特殊効果で消えた通常ブロックから、隣接解除は伝播させない。
 const triggeredIce=[];
 for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){
  const t=B[r][c]; if(!t)continue;
  const directlyHitBySpecial=clearSet.has(K(r,c)) && (isBlocked(t)||isTrigger(t));
  const nextToDirectMatch=adjacentToClear(r,c,directMatchKeys);
  if(!directlyHitBySpecial && !nextToDirectMatch)continue;
  if(t.trigger==="ice"){
   triggeredIce.push({r,c});
  }else if((t.ice||0)>0){
   t.ice=Math.max(0,t.ice-1);
   score+=t.ice===0?800:600; // 完全除去と1段階解除はそれぞれ1回だけ加点
  }else if(t.chain){
   t.chain=false;
   score+=500; // チェーン解除
  }
 }

 render(null,actual);
 await sleep(135);

 // 一つの消去で同じセルを二重加点しない。通常マッチと特殊効果は分けて数える。
 const specialKind=opts.scoreKind;
 const attributed=new Set(directMatchKeys);
 // 追加発動した特殊ごとに、未計上の消去セルを割り当てる。
 // 重なる効果は最初の発動だけが個数点を受け取る。
 const extraScores=[];
 for(const trigger of triggers){
  const cells=[...effectAt(trigger.r,trigger.c,trigger.special),K(trigger.r,trigger.c)];
  const count=cells.filter(k=>actual.has(k)&&!attributed.has(k)&&(attributed.add(k),true)).length;
  extraScores.push([scoreKind(trigger.special),count]);
 }
 for(const flower of flowerTriggers){
  const cells=[K(flower.r,flower.c),...flower.targets.map(p=>K(p.r,p.c))];
  const count=cells.filter(k=>actual.has(k)&&!attributed.has(k)&&(attributed.add(k),true)).length;
  extraScores.push(["flower",count]);
 }
 const specialCount=[...actual].filter(k=>!attributed.has(k)).length;
 if(specialKind)scoreSpecial(specialKind,specialCount);
 for(const [kind,count] of extraScores)scoreSpecial(kind,count);
 for(const s of actual){
  const [r,c]=parseK(s),t=B[r]?.[c];
  if(t){
   progressMissionForTile(t);
   B[r][c]=null;
   if(directMatchKeys.has(s) || (!specialKind && !attributed.has(s)))score+=20*chainLevel;
  }
 }
 for(const p of triggeredIce){
  if(B[p.r]?.[p.c]?.trigger==="ice"){
   B[p.r][p.c]=null;
   iceAttackCount++;
   score+=600; // 相手へ送る氷ブロック解除
   pendingIceAttacks++;
  }
 }
 if(triggeredIce.length)updateMissionUI();
 render();
 await sleep(35);

 if(tutorialMode)tutorialBuildSpawnPlan();
 const drops=collapse();
 tutorialSpawnPlan=null;
 render(drops);
 await sleep(250);

 if(interferenceEnabled){
  let changed=false;
  while(pendingIceAttacks>0){pendingIceAttacks--;changed=applyRandomBlocker("ice")||changed;}
  while(pendingChainAttacks>0){pendingChainAttacks--;changed=applyRandomBlocker("chain")||changed;}
  if(changed){render();await sleep(140);}
 }else{pendingIceAttacks=0;pendingChainAttacks=0;}
}

async function resolveOneMatch(match,preferred=null,moveDir=null){
 if(match.cells.size===0)return false;

 const spawns=chooseSpecials(match,preferred,moveDir);
 const clearSet=new Set(match.cells);

 for(const spawn of spawns){
  if(spawn.shapeCells){
   for(const p of spawn.shapeCells) clearSet.add(K(p.r,p.c));
  }
 }
 const directMatchKeys=new Set(clearSet);

 const generatedKeys=new Set();

 // 同一手で独立して成立した特殊はすべて生成し、
 // 生成マスを消去対象から外して同時に残す。
 for(const spawn of spawns){
  const key=K(spawn.pos.r,spawn.pos.c);
  B[spawn.pos.r][spawn.pos.c]=make(null,spawn.special);
  generatedKeys.add(key);
  clearSet.delete(key);
 }

 await clearCollapseOnly(clearSet,null,{protectedKeys:generatedKeys,directMatchKeys});
 return true;
}

async function cascade(){
 // チュートリアルでは「その操作で起きる効果」だけを見せる。
 // 落下後に偶然そろったブロックの連鎖は処理しない。
 if(tutorialMode){
  scheduleStableCheck();
  return;
 }
 for(let i=0;i<30;i++){
  const m=scanMatches();
  if(m.cells.size===0){scheduleStableCheck();return;}
  chainLevel++;
  updateChain();
  await resolveOneMatch(m,null);
 }
 // Safety valve: never freeze indefinitely if a pathological refill loops.
 setMsg("連鎖が長いため一度停止しました");
}


function randomPositions(count){
 const all=[];
 for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++)all.push({r,c});
 for(let i=all.length-1;i>0;i--){
  const j=Math.floor(Math.random()*(i+1));
  [all[i],all[j]]=[all[j],all[i]];
 }
 return all.slice(0,Math.min(count,all.length));
}

async function specialCombo(a,b,oldA,oldB){
 const center=b;

 if(oldA.special==="flower" && oldB.special==="flower"){
  setMsg("花＋花：盤面全消し！");
  const targets=[];
  for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++)targets.push({r,c});
  // 2つの花を伝播元にし、盤面全体へ線が伸びてから全消し。
  playFlower();
  await playFlowerPropagationDual(a,b,targets);
  await clearCollapseOnly(allBoard(),null,{
   scoreKind:"flowerFlower",suppressSpecialExpansion:false,
   skipSpecialKeys:new Set([K(a.r,a.c),K(b.r,b.c)])
  });
  await cascade();
  return true;
 }

 if(oldA.special==="flower" || oldB.special==="flower"){
  const flowerWasA=oldA.special==="flower";
  const flowerPos=flowerWasA?b:a;  // 交換後の花
  const otherPos=flowerWasA?a:b;  // 交換後の相手
  const other=flowerWasA?oldB:oldA;

  // 花＋通常ブロック：入れ替えた通常ブロックの色を全消し
  if(!other.special){
   const targetColor=other.color;
   const targets=[];
   const clearSet=new Set([K(flowerPos.r,flowerPos.c),K(otherPos.r,otherPos.c)]);
   for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){
    if(!B[r][c]?.special && B[r][c]?.color===targetColor){
     targets.push({r,c});
     clearSet.add(K(r,c));
    }
   }
   playFlower();
   await playFlowerPropagation(flowerPos,targets,{stagger:true});
   setMsg("花：入れ替えた色を全消し！");
   await clearCollapseOnly(clearSet,null,{scoreKind:"flower",suppressSpecialExpansion:false,skipFlowerKeys:new Set([K(flowerPos.r,flowerPos.c)])});
   await cascade();
   return true;
  }

  // 花＋特殊：花＋矢印は縦横を1本ごとにランダム化して6本。
  // 花＋爆弾はランダム8か所で爆発。
  const clearSet=new Set([K(flowerPos.r,flowerPos.c),K(otherPos.r,otherPos.c)]);

  if(isLine(other.special)){
   const centers=randomPositions(6);
   setMsg("花＋列消し：縦横ランダム6本発動！");
   const fx=centers.map(p=>({
    r:p.r, c:p.c,
    special:Math.random()<0.5 ? "lineH" : "lineV"
   }));
   for(const t of fx)addAll(clearSet,effectAt(t.r,t.c,t.special));
   playFlower();
   await playFlowerPropagation(flowerPos,centers,{stagger:true});
   await playTriggerFx(fx);
  }else if(other.special==="bomb"){
   const centers=randomPositions(8);
   setMsg("花＋爆弾：ランダム8か所発動！");
   const fx=centers.map(p=>({r:p.r,c:p.c,special:"bomb"}));
   for(const p of centers)addAll(clearSet,bombSet(p.r,p.c,2));
   playFlower();
   await playFlowerPropagation(flowerPos,centers,{stagger:true});
   await playTriggerFx(fx);
  }

  await clearCollapseOnly(clearSet,null,{
   scoreKind:isLine(other.special)?"flowerLine":"flowerBomb",suppressSpecialExpansion:false,
   skipSpecialKeys:new Set([K(flowerPos.r,flowerPos.c),K(otherPos.r,otherPos.c)])
  });
  await cascade();
  return true;
 }

 if(isLine(oldA.special)&&isLine(oldB.special)){
  setMsg("列＋列：十字消し！");
  playSfx("line");
  clearFx(); lineFx(center.r,center.c,"lineH"); lineFx(center.r,center.c,"lineV");
  await sleep(340); clearFx();
  await clearCollapseOnly(crossSet(center.r,center.c,0),null,{
   scoreKind:"lineLine",suppressSpecialExpansion:false,
   skipSpecialKeys:new Set([K(a.r,a.c),K(b.r,b.c)])
  });
  await cascade(); return true;
 }
 if(oldA.special==="bomb"&&oldB.special==="bomb"){
  setMsg("爆弾＋爆弾：ひし形範囲爆発！");
  playSfx("bomb",1.15);
  clearFx(); bombFx(center.r,center.c,1.8); await sleep(380); clearFx();
  await clearCollapseOnly(bombBombSet(center.r,center.c),null,{
   scoreKind:"bombBomb",suppressSpecialExpansion:false,
   skipSpecialKeys:new Set([K(a.r,a.c),K(b.r,b.c)])
  });
  await cascade(); return true;
 }
 if((oldA.special==="bomb"&&isLine(oldB.special))||(oldB.special==="bomb"&&isLine(oldA.special))){
  setMsg("列＋爆弾：太い十字！");
  playSfx("line",0.8); playSfx("bomb",0.8,35);
  clearFx();
  // 3行＋3列を視覚化
  for(let d=-1;d<=1;d++){
   if(inside(center.r+d,center.c)) lineFx(center.r+d,center.c,"lineH");
   if(inside(center.r,center.c+d)) lineFx(center.r,center.c+d,"lineV");
  }
  await sleep(360); clearFx();
  await clearCollapseOnly(crossSet(center.r,center.c,1),null,{
   scoreKind:"bombLine",suppressSpecialExpansion:false,
   skipSpecialKeys:new Set([K(a.r,a.c),K(b.r,b.c)])
  });
  await cascade(); return true;
 }
 return false;
}


function wouldSwapWork(a,b){
 if(!adjacent(a,b))return false;
 const ta=B[a.r][a.c],tb=B[b.r][b.c];
 if(!isMovableTile(ta)||!isMovableTile(tb))return false;
 if(ta.special || tb.special)return true;
 swap(a,b);
 const ok=scanMatches().cells.size>0;
 swap(a,b);
 return ok;
}
function findValidMove(){
 for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){
  const a={r,c};
  for(const [dr,dc] of [[0,1],[1,0]]){
   const b={r:r+dr,c:c+dc};
   if(inside(b.r,b.c)&&wouldSwapWork(a,b))return {a,b};
  }
 }
 return null;
}
async function handleDeadlock(){
 if(lock||!gameRunning)return;
 lock=true;
 try{
  setMsg(`手詰まり！ 盤面リセット / TIME -${DEADLOCK_PENALTY}秒`);
  remainingSeconds=Math.max(0,remainingSeconds-DEADLOCK_PENALTY);
  updateTimer();
  await sleep(420);
  newBoard(false);
  if(interferenceEnabled)newMission();
  markActivity();
  if(remainingSeconds<=0)finishGame();
 }finally{lock=false;}
}
async function showHint(move){
 if(!move||hintBusy||lock||!gameRunning||!hintEnabled)return;
 hintBusy=true;
 const token=lastActivity;
 hintPair=move;render();
 await sleep(560);
 if(token===lastActivity){hintPair=null;render();lastActivity=Date.now();}
 hintBusy=false;
}
function scheduleStableCheck(){
 if(!gameRunning || tutorialMode)return;
 setTimeout(async()=>{
  if(!gameRunning||lock)return;
  const move=findValidMove();
  if(!move)await handleDeadlock();
 },120);
}
function startIdleWatch(){
 stopIdleWatch();
 idleWatchId=setInterval(async()=>{
  if(!gameRunning||lock||hintBusy)return;
  if(Date.now()-lastActivity<HINT_DELAY)return;
  const move=findValidMove();
  if(!move){await handleDeadlock();return;}
  if(hintEnabled)await showHint(move);
  else lastActivity=Date.now();
 },350);
}
function stopIdleWatch(){if(idleWatchId){clearInterval(idleWatchId);idleWatchId=null;}}

async function trySwap(a,b){
 if(lock||!gameRunning)return;
 markActivity();
 if(!isMovableTile(B[a.r][a.c]) || !isMovableTile(B[b.r][b.c])){setMsg("そのブロックは動かせません");return;}
 chainLevel=1; updateChain();
 lock=true;
 try{
  const oldA=B[a.r][a.c], oldB=B[b.r][b.c];
  swap(a,b); playMove(); render(); await sleep(90);

  // 特殊＋特殊、花＋通常ブロックを一度だけ判定する。
  if((oldA?.special && oldB?.special) || oldA?.special==="flower" || oldB?.special==="flower"){
   if(await specialCombo(a,b,oldA,oldB)){setMsg("隣のブロックへスワイプ");return}
  }

  // 単独の列消し／爆弾は、同色マッチを作らなくても交換しただけで発動
  const aIsActive=oldA?.special && oldA.special!=="flower";
  const bIsActive=oldB?.special && oldB.special!=="flower";
  if(aIsActive !== bIsActive){
   const specialTile=aIsActive?oldA:oldB;
   const pos=aIsActive?b:a;       // 交換後の特殊ブロック位置
   const movedNormalPos=aIsActive?a:b;  // 特殊と入れ替わって動いた通常ブロックの位置
   const clearSet=effectAt(pos.r,pos.c,specialTile.special);
   clearSet.add(K(pos.r,pos.c));

   // v2.6:
   // 特殊ブロックを動かした同じ操作で通常色のマッチも成立した場合、
   // 特殊効果と通常マッチを「同じ消去タイミング」にまとめる。
   // さらに、そのマッチが新しい特殊を作る場合は生成位置を保護して残す。
   const madeMatch=scanMatches();
   const triggerMoveDir = (a.r===b.r) ? "H" : "V";
   const madeSpecials=chooseSpecials(madeMatch,movedNormalPos,triggerMoveDir);
   const directMatchKeys=new Set(madeMatch.cells);

   // まず、同時成立した通常マッチを特殊効果の消去範囲に合流。
   for(const k of madeMatch.cells){
    clearSet.add(k);
   }

   for(const madeSpecial of madeSpecials){
    if(madeSpecial.shapeCells){
     for(const p of madeSpecial.shapeCells){
      const key=K(p.r,p.c);
      clearSet.add(key);
      directMatchKeys.add(key);
     }
    }
   }

   const generatedKeys=new Set();

   // 特殊発動と同じ操作で成立した通常マッチも、独立成立分をすべて生成。
   for(const madeSpecial of madeSpecials){
    const key=K(madeSpecial.pos.r,madeSpecial.pos.c);
    B[madeSpecial.pos.r][madeSpecial.pos.c]=make(null,madeSpecial.special);
    generatedKeys.add(key);
    clearSet.delete(key);
   }

   if(madeSpecials.length){
    const names=madeSpecials.map(s=>
     s.special==="bomb" ? "💣" :
     (s.special==="lineH" ? "↔️" :
      s.special==="lineV" ? "↕️" :
      s.special==="flower" ? "🌸" : "特殊")
    ).join(" ");
    setMsg(`${specialTile.special==="bomb"?"爆弾":"列消し"}発動！＋ ${names}生成！`);
   }else{
    setMsg(specialTile.special==="bomb" ? "爆弾発動！" : "列消し発動！");
   }

   await clearCollapseOnly(clearSet,null,{scoreKind:scoreKind(specialTile.special),protectedKeys:generatedKeys,directMatchKeys});
   await cascade();
   setMsg("隣のブロックへスワイプ");
   scheduleStableCheck();
   return;
  }

  const m=scanMatches();
  if(m.cells.size===0){
   swap(a,b); playCancel(); render(); setMsg("消えないので元に戻ります");
   await sleep(130); setMsg("隣のブロックへスワイプ");
   scheduleStableCheck();
   return;
  }

  const moveDir = (a.r===b.r) ? "H" : "V";
  await resolveOneMatch(m,b,moveDir);
  await cascade();
  setMsg("隣のブロックへスワイプ");
  scheduleStableCheck();
 }catch(err){
  console.error(err);
  setMsg("エラーを検出しました。やり直しで復帰できます");
 }finally{
  lock=false;
  clearFx();
  if(pendingFinish) finishGame();
 }
}




const testerBtn=document.getElementById("testerBtn");
testerBtn?.addEventListener("click",()=>{
 playDecision();
 startTesterGame();
});

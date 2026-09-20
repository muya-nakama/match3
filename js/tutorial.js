const tutorialOverlay=document.getElementById("tutorialOverlay");
const tutorialBoardHost=document.getElementById("tutorialBoardHost");
const tutorialStepEl=document.getElementById("tutorialStep");
const tutorialTextEl=document.getElementById("tutorialText");
const tutorialFooter=document.getElementById("tutorialFooter");
const tutorialPauseBtn=document.getElementById("tutorialPauseBtn");
const tutorialExitBtn=document.getElementById("tutorialExitBtn");
const tutorialReplayBtn=document.getElementById("tutorialReplayBtn");
const tutorialDoneBtn=document.getElementById("tutorialDoneBtn");
const tutorialDoneActions=document.getElementById("tutorialDoneActions");

const tutorialBoardWrap=document.querySelector(".app .boardWrap");
const tutorialBoardHome=tutorialBoardWrap?.parentNode||null;
const tutorialBoardNext=tutorialBoardWrap?.nextSibling||null;

let tutorialToken=0;
let tutorialSavedInterference=false;
let tutorialPaused=false;
let tutorialPauseResolvers=[];

function tutorialBaseBoard(){
 // Fixed arrangement, but these are the real game tiles used by the main engine.
 B=Array.from({length:ROWS},(_,r)=>
  Array.from({length:COLS},(_,c)=>make((r*2+c*3)%COLORS))
 );
}
function tutorialBreakAllMatches(){
 // チュートリアルでは説明対象以外に3個以上の並びを残さない。
 for(let guard=0;guard<40;guard++){
  const match=scanMatches();
  if(!match || match.cells.size===0)return;
  let fixed=false;
  const keys=[...match.cells];
  for(const key of keys){
   const [r,c]=parseK(key);
   const t=B[r]?.[c];
   if(!t || t.special || isBlocked(t) || isTrigger(t) || t.color==null)continue;
   const original=t.color;
   let bestColor=original, bestSize=match.cells.size;
   for(let d=1;d<COLORS;d++){
    t.color=(original+d)%COLORS;
    const next=scanMatches();
    const size=next.cells.size;
    if(!next.cells.has(key) && size<bestSize){
     bestColor=t.color;
     bestSize=size;
     if(size===0)break;
    }
   }
   t.color=bestColor;
   if(bestColor!==original){fixed=true;break;}
   t.color=original;
  }
  if(!fixed)return;
 }
}
let tutorialSpawnPlan=null;

function tutorialCloneTile(t){
 if(!t)return null;
 return {
  color:t.color,
  special:t.special,
  id:t.id,
  ice:t.ice||0,
  chain:!!t.chain,
  trigger:t.trigger||null
 };
}
function tutorialCloneBoard(src){
 return src.map(row=>row.map(t=>tutorialCloneTile(t)));
}
function tutorialPlanKey(r,c){return `${r},${c}`;}

function tutorialBoardHasAnyMatch(board){
 const live=B;
 B=board;
 let has=false;
 try{
  const m=scanMatches();
  has=!!(m && m.cells && m.cells.size);
 }finally{
  B=live;
 }
 return has;
}

function tutorialBuildSpawnPlan(){
 // 「盤面の上に待機している補充ブロック」まで、collapse と同じ順序で
 // 仮想盤面へすべて配置してから、完成盤面に消える組み合わせがないか検査する。
 for(let seed=0;seed<80;seed++){
  const sim=tutorialCloneBoard(B);
  const plan=new Map();

  for(let c=0;c<COLS;c++){
   const fixed=[];
   for(let r=0;r<ROWS;r++){
    const t=sim[r][c];
    if(t && (isBlocked(t)||isTrigger(t)))fixed.push(r);
   }
   const bounds=[-1,...fixed,ROWS];

   for(let bi=0;bi<bounds.length-1;bi++){
    const top=bounds[bi]+1, bottom=bounds[bi+1]-1;
    if(top>bottom)continue;

    const survivors=[];
    for(let r=bottom;r>=top;r--){
     if(sim[r][c])survivors.push(sim[r][c]);
    }
    for(let r=top;r<=bottom;r++)sim[r][c]=null;

    let wr=bottom;
    for(const tile of survivors){
     sim[wr][c]=tile;
     wr--;
    }

    while(wr>=top){
     // seed ごとに候補をずらすが、完全に決定論的。
     let placed=false;
     for(let attempt=0;attempt<COLORS;attempt++){
      const color=(wr*2+c*3+seed+attempt)%COLORS;
      const test={color,special:null,id:-1,ice:0,chain:false,trigger:null};
      sim[wr][c]=test;

      // 途中段階でも、この1個によって明白な通常3直線を作らない色を優先。
      const same=(rr,cc)=>rr>=0&&rr<ROWS&&cc>=0&&cc<COLS &&
        sim[rr][cc] && !sim[rr][cc].special &&
        !isBlocked(sim[rr][cc]) && !isTrigger(sim[rr][cc]) &&
        sim[rr][cc].color===color;

      const h =
        (same(wr,c-1)&&same(wr,c-2)) ||
        (same(wr,c-1)&&same(wr,c+1)) ||
        (same(wr,c+1)&&same(wr,c+2));
      const v =
        (same(wr-1,c)&&same(wr-2,c)) ||
        (same(wr-1,c)&&same(wr+1,c)) ||
        (same(wr+1,c)&&same(wr+2,c));

      if(!h && !v){
       plan.set(tutorialPlanKey(wr,c),color);
       placed=true;
       break;
      }
     }
     if(!placed){
      const color=(wr*2+c*3+seed)%COLORS;
      sim[wr][c]={color,special:null,id:-1,ice:0,chain:false,trigger:null};
      plan.set(tutorialPlanKey(wr,c),color);
     }
     wr--;
    }
   }
  }

  // 盤面外から落ちてくる全ブロックを置き終えた「最終盤面」ごと検査。
  // 3直線だけでなく、ゲーム本体の scanMatches が拾う2×2/L/T等もここで弾く。
  if(!tutorialBoardHasAnyMatch(sim)){
   tutorialSpawnPlan=plan;
   return true;
  }
 }

 // ここへ来ることは通常ない。失敗してもランダムには戻さず決定論的に補充する。
 tutorialSpawnPlan=new Map();
 return false;
}

function makeTutorialSpawnTile(r,c){
 const key=tutorialPlanKey(r,c);
 let color=tutorialSpawnPlan?.get(key);
 if(color===undefined)color=(r*2+c*3)%COLORS;
 return make(color);
}
function tutorialResetState(){
 tutorialSpawnPlan=null;
 score=0;
 selected=null;
 hintPair=null;
 chainLevel=1;
 pendingFinish=false;
 lock=false;
 updateChain();
}
function tutorialSetText(step,text){
 tutorialStepEl.textContent=`STEP ${step} / 10`;
 tutorialTextEl.innerHTML=text;
}
function tutorialShowBoard(msg=""){
 render();
 if(msg)setMsg(msg);
}
function findSpecialPosition(kind){
 for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){
  if(B[r][c]?.special===kind)return {r,c};
 }
 return null;
}
function findAdjacentMovableNormal(pos){
 const cand=[
  {r:pos.r,c:pos.c+1},
  {r:pos.r+1,c:pos.c},
  {r:pos.r,c:pos.c-1},
  {r:pos.r-1,c:pos.c}
 ];
 for(const p of cand){
  if(!inside(p.r,p.c))continue;
  const t=B[p.r][p.c];
  if(t && !t.special && isMovableTile(t))return p;
 }
 return null;
}
async function tutorialWait(ms,token){
 let remaining=ms;
 const slice=50;
 while(remaining>0){
  if(token!==tutorialToken)return false;
  if(tutorialPaused){
   await new Promise(resolve=>tutorialPauseResolvers.push(resolve));
   continue;
  }
  const step=Math.min(slice,remaining);
  await sleep(step);
  remaining-=step;
 }
 return token===tutorialToken;
}
async function tutorialWaitUntilResumed(token){
 while(tutorialPaused){
  if(token!==tutorialToken)return false;
  await new Promise(resolve=>tutorialPauseResolvers.push(resolve));
 }
 return token===tutorialToken;
}
function setTutorialPaused(paused){
 tutorialPaused=paused;
 tutorialOverlay.classList.toggle("paused",paused);
 tutorialPauseBtn.textContent=paused ? "再開" : "一時停止";
 if(!paused){
  const resolvers=[...tutorialPauseResolvers];
  tutorialPauseResolvers.length=0;
  resolvers.forEach(r=>r());
 }
}
function tutorialHighlightPair(a,b){
 render();
 for(const p of [a,b]){
  const el=boardEl.querySelector(`.tile[data-r="${p.r}"][data-c="${p.c}"]`);
  el?.classList.add("tutorialFocus");
 }
}
async function tutorialAutoSwap(a,b,token){
 if(token!==tutorialToken)return false;

 // ヒント演出は使わない。
 // 動かす2マスだけを光らせ、実際の移動はゲーム本体の trySwap に任せる。
 tutorialHighlightPair(a,b);
 if(!await tutorialWait(650,token))return false;
 render();
 if(!await tutorialWait(120,token))return false;
 if(!await tutorialWaitUntilResumed(token))return false;

 await trySwap(a,b);
 if(token!==tutorialToken)return false;
 if(!await tutorialWait(650,token))return false;
 return token===tutorialToken;
}
function tutorialCleanSpecialBoard(special, pos={r:3,c:4}, other=null){
 tutorialBaseBoard();
 B[pos.r][pos.c]=make(null,special);
 if(other){
  B[other.r][other.c]=make(
   other.color===undefined ? ((other.r*2+other.c*3)%COLORS) : other.color,
   other.special||null
  );
 }
 tutorialResetState();
 tutorialShowBoard();
}
function tutorialComboBoard(leftSpecial,rightSpecial){
 tutorialBaseBoard();
 B[3][4]=make(null,leftSpecial);
 B[3][5]=make(null,rightSpecial);
 tutorialResetState();
 tutorialShowBoard();
}

async function tutorialStep1(token){
 tutorialSetText(1,"同じ色のブロックを縦か横に3つ以上そろえると、そろったブロックが消えます。");
 tutorialBaseBoard();
 B[3][2]=make(0); B[3][3]=make(0);
 B[2][4]=make(0); B[3][4]=make(2);
 tutorialResetState(); tutorialShowBoard();
 await tutorialWait(850,token);
 return tutorialAutoSwap({r:2,c:4},{r:3,c:4},token);
}

async function tutorialStep2(token){
 tutorialSetText(2,"同じ色を4つ一直線にそろえると、矢印ブロックが生成されます。生成された矢印をそのまま動かすと、その向きの1列をまとめて消去します。");
 tutorialBaseBoard();

 // スワップ前はマッチなし。操作後だけ横4になるよう左右端まで固定する。
 // c0/c5 を青以外にして、5個直線へ伸びないことも保証する。
 B[3][0]=make(3);
 B[3][1]=make(1);
 B[3][2]=make(1);
 B[3][3]=make(3);
 B[3][4]=make(1);
 B[3][5]=make(2);
 B[2][3]=make(1);

 tutorialResetState(); tutorialShowBoard();
 await tutorialWait(800,token);
 if(!await tutorialAutoSwap({r:2,c:3},{r:3,c:3},token))return false;

 const arrowPos=findSpecialPosition("lineH") || findSpecialPosition("lineV");
 if(!arrowPos){
  setMsg("矢印生成を確認できなかったため次へ進みます");
  return true;
 }
 const arrowTarget=findAdjacentMovableNormal(arrowPos);
 if(!arrowTarget)return true;
 await tutorialWait(850,token);
 await tutorialAutoSwap(arrowPos,arrowTarget,token);
 return true;
}

async function tutorialStep3(token){
 tutorialSetText(3,"同じ色を5つ一直線にそろえると、花ブロックが生成されます。生成された花をそのまま通常ブロックと入れ替えると、その色のブロックを盤面からすべて消します。");
 tutorialBaseBoard();

 // スワップ前は2+2。操作後だけ横5になるよう両端も固定する。
 B[3][0]=make(1);
 B[3][1]=make(4);
 B[3][2]=make(4);
 B[3][3]=make(2);
 B[3][4]=make(4);
 B[3][5]=make(4);
 B[3][6]=make(0);
 B[2][3]=make(4);

 tutorialResetState(); tutorialShowBoard();
 await tutorialWait(800,token);
 if(!await tutorialAutoSwap({r:2,c:3},{r:3,c:3},token))return false;

 const flowerPos=findSpecialPosition("flower");
 if(!flowerPos){
  setMsg("花生成を確認できなかったため次へ進みます");
  return true;
 }
 const flowerTarget=findAdjacentMovableNormal(flowerPos);
 if(!flowerTarget)return true;
 await tutorialWait(850,token);
 await tutorialAutoSwap(flowerPos,flowerTarget,token);
 return true;
}

async function tutorialStep4(token){
 tutorialSetText(4,"同じ色を2×2にそろえると、爆弾が生成されます。生成された爆弾をそのまま動かすと、爆弾を中心とした範囲をまとめて消去します。");
 tutorialBaseBoard();
 B[2][2]=make(0);
 B[2][3]=make(2); B[2][4]=make(2); B[2][5]=make(1);
 B[3][2]=make(4); B[3][3]=make(2); B[3][4]=make(0); B[3][5]=make(3);
 B[4][3]=make(1); B[4][4]=make(2);
 tutorialResetState(); tutorialShowBoard();
 await tutorialWait(800,token);
 if(!await tutorialAutoSwap({r:4,c:4},{r:3,c:4},token))return false;

 // 生成された爆弾をそのまま使って続ける。
 const bombPos=findSpecialPosition("bomb");
 if(!bombPos)return false;
 const bombTarget=findAdjacentMovableNormal(bombPos);
 if(!bombTarget)return false;
 await tutorialWait(850,token);
 return tutorialAutoSwap(bombPos,bombTarget,token);
}

async function tutorialStep5(token){
 tutorialSetText(5,"特殊ブロック同士が隣り合っている時は、2つを入れ替えるとコンボが発生します。まずは爆弾＋矢印。太い十字状にまとめて消去します。");
 tutorialComboBoard("bomb","lineH");
 await tutorialWait(1000,token);
 return tutorialAutoSwap({r:3,c:4},{r:3,c:5},token);
}

async function tutorialStep6(token){
 tutorialSetText(6,"花＋矢印では、盤面のいくつかの場所で矢印が発動し、縦や横の列をまとめて消去します。");
 tutorialComboBoard("flower","lineH");
 await tutorialWait(1000,token);
 return tutorialAutoSwap({r:3,c:4},{r:3,c:5},token);
}

async function tutorialStep7(token){
 tutorialSetText(7,"花＋爆弾では、盤面のいくつかの場所で爆弾が発動し、広い範囲をまとめて消去します。");
 tutorialComboBoard("flower","bomb");
 await tutorialWait(1000,token);
 return tutorialAutoSwap({r:3,c:4},{r:3,c:5},token);
}

async function tutorialStep8(token){
 tutorialSetText(8,"花＋花では、盤面全体のブロックを一気に消去します。");
 tutorialComboBoard("flower","flower");
 await tutorialWait(1000,token);
 return tutorialAutoSwap({r:3,c:4},{r:3,c:5},token);
}

async function tutorialStep9(token){
 tutorialSetText(9,"<b>鎖</b><br>ミッションクリアで相手に送られる妨害ブロックです。動かすことができず、3つ揃っても消えません。<br><br><b>消し方</b><br>隣接したブロックが消える、または特殊ブロックの効果が当たると消去できます。");
 tutorialBaseBoard();
 // 鎖の左隣にだけ3個消しが成立する固定盤面。
 B[3][1]=make(0); B[3][2]=make(0); B[3][3]=make(2);
 B[2][3]=make(0);
 B[3][4]=make(3); B[3][4].chain=true;
 tutorialResetState(); tutorialShowBoard("鎖の隣で3個消しを作ります");
 await tutorialWait(1000,token);
 return tutorialAutoSwap({r:2,c:3},{r:3,c:3},token);
}

async function tutorialStep10(token){
 tutorialSetText(10,"<b>氷</b><br>妨害用のブロック <span class='tutorialInlineTile tile c1'><span class='blockerMark'>🧊</span></span> を消すことで相手に送れる妨害ブロックです。動かすことができず、3つ揃っても消えません。<br><br><b>消し方</b><br>隣接したブロックを1回消すと氷が欠け、2回消すと完全に消去できます。また、特殊ブロックの効果は鎖と同じように働きます。");
 tutorialBaseBoard();
 B[3][1]=make(0); B[3][2]=make(0); B[3][3]=make(2);
 B[2][3]=make(0);
 B[3][4]=make(3); B[3][4].ice=2;
 tutorialResetState(); tutorialShowBoard("1回目：隣接したブロックを消して氷を欠けさせます");
 await tutorialWait(1000,token);
 if(!await tutorialAutoSwap({r:2,c:3},{r:3,c:3},token))return false;

 if(!await tutorialWait(850,token))return false;

 // 2回目は同じ氷を1段階欠けた状態で安全な固定盤面に置き直す。
 tutorialBaseBoard();
 B[3][4]=make(3); B[3][4].ice=1;
 B[3][5]=make(1); B[3][6]=make(1); B[3][7]=make(2);
 B[2][7]=make(1);
 tutorialResetState(); tutorialShowBoard("2回目：もう一度隣接したブロックを消して完全に解除します");
 await tutorialWait(1000,token);
 return tutorialAutoSwap({r:2,c:7},{r:3,c:7},token);
}

async function runTutorial(){
 const token=++tutorialToken;
 setTutorialPaused(false);
 tutorialDoneActions.classList.remove("show");
 tutorialFooter.textContent="盤面は自動で動きます。説明を読みたい時は「一時停止」を押してください。";
 const steps=[tutorialStep1,tutorialStep2,tutorialStep3,tutorialStep4,tutorialStep5,tutorialStep6,tutorialStep7,tutorialStep8,tutorialStep9,tutorialStep10];

 for(const fn of steps){
  if(token!==tutorialToken)return;
  let ok=false;
  try{
   ok=await fn(token);
  }catch(err){
   console.error("tutorial step failed",err);
   ok=false;
  }
  if(token!==tutorialToken)return;
  if(!ok){
   setMsg("このSTEPの実演を続行できなかったため、次へ進みます");
   if(!await tutorialWait(650,token))return;
  }else{
   if(!await tutorialWait(450,token))return;
  }
 }

 if(token!==tutorialToken)return;
 tutorialStepEl.textContent="COMPLETE";
 tutorialTextEl.textContent="チュートリアルは以上です。基本の消し方、特殊ブロック、鎖・氷の解除方法を確認しました。";
 tutorialFooter.textContent="「もう一度見る」で最初から再生できます。";
 tutorialDoneActions.classList.add("show");
}

function openTutorial(){
 playDecision();
 stopTimer();
 stopIdleWatch();
 tutorialSavedInterference=interferenceEnabled;
 interferenceEnabled=false;
 mission=null; updateMissionUI();

 tutorialMode=true;
 testerMode=false;
 setTutorialPaused(false);
 gameRunning=true;
 pendingFinish=false;
 selected=null;
 hintPair=null;
 lock=false;
 score=0;
 chainLevel=1;

 titleScreen.classList.add("hidden");
 resultScreen.classList.remove("show");
 document.getElementById("testerBadge")?.classList.remove("show");

 if(tutorialBoardWrap && tutorialBoardHost){
  tutorialBoardHost.appendChild(tutorialBoardWrap);
 }

 tutorialOverlay.classList.add("show");
 tutorialOverlay.setAttribute("aria-hidden","false");
 startBgm(true);
 updateTimer();
 updateChain();
 runTutorial();
}

async function closeTutorial(){
 tutorialToken++;
 setTutorialPaused(false);
 while(lock) await sleep(60);

 tutorialMode=false;
 gameRunning=false;
 selected=null;
 hintPair=null;
 clearFx();
 stopBgm();
 stopTimer();
 stopIdleWatch();

 if(tutorialBoardWrap && tutorialBoardHome){
  if(tutorialBoardNext && tutorialBoardNext.parentNode===tutorialBoardHome)
   tutorialBoardHome.insertBefore(tutorialBoardWrap,tutorialBoardNext);
  else
   tutorialBoardHome.appendChild(tutorialBoardWrap);
 }

 interferenceEnabled=tutorialSavedInterference;
 syncToggles();
 mission=null; updateMissionUI();

 tutorialOverlay.classList.remove("show");
 tutorialOverlay.setAttribute("aria-hidden","true");
 tutorialDoneActions.classList.remove("show");
 titleScreen.classList.remove("hidden");

 newBoard(false);
 gameRunning=false;
 updateTimer();
}

tutorialPauseBtn?.addEventListener("click",()=>{
 playDecision();
 setTutorialPaused(!tutorialPaused);
});
tutorialLinkBtn?.addEventListener("click",openTutorial);
tutorialExitBtn?.addEventListener("click",async()=>{playDecision();await closeTutorial();});
tutorialDoneBtn?.addEventListener("click",async()=>{playDecision();await closeTutorial();});
tutorialReplayBtn?.addEventListener("click",async()=>{
 playDecision();
 tutorialToken++;
 setTutorialPaused(false);
 while(lock)await sleep(60);
 runTutorial();
});

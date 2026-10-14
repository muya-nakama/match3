/* 固定の準備条件だけを用意し、盤面効果と反射判定は対戦と共通の処理で実演する。 */
(() => {
 const R=window.MonpatchRules;
 let active=false,savedSkill=false,pausedAt=null,pausedTotal=0,ticker=null,shield=null;
 const clock=()=>Date.now()-pausedTotal-(pausedAt===null?0:Date.now()-pausedAt);
 const seal=R.createAttackSeal(clock);
 const status=document.getElementById('skillTutorialStatus');
 const titles={A:'縦・横の2マスに鎖が付きます。鎖の付いたブロックは動かせません。',B:'斜めの2マスに鎖が付きます。',C:'盤面の3マスに鎖が付きます。',D:'ブロックの配置が変わります。特殊ブロックや妨害の状態は引き継がれます。',E:'自分のスコアが10％減ります。見本では100,000点から90,000点になります。',F:'30秒間、攻撃が使えなくなります。反射防御は使えます。',G:'3×3マスが8秒間見えなくなります。時間が過ぎると元に戻ります。',H:'10秒間、特殊ブロックを動かせなくなります。ほかの効果に巻き込まれた時の発動は止まりません。'};
 function paintStatus(){
  if(!active)return;
  const remaining=seal.remaining();
  const defense=shield&&clock()<shield.until&&shield.left>0?`反射防御：残り${shield.left}回・${Math.ceil((shield.until-clock())/1000)}秒`:'反射防御：なし';
  status.textContent=`スコア：${score.toLocaleString('ja-JP')}\n攻撃：${remaining?`封印中（あと${remaining}秒）`:'使用可能'} ／ 反射防御：使用可能\n${defense}\n${msgEl.textContent}`;
 }
 function resetBoard(){
  tutorialBaseBoard();
  // 初期マッチを作らず、配置変更と封印を見分けられる特殊ブロックを置く。
  B[1][2]=make(null,'lineH');B[3][4]=make(null,'bomb');B[5][6]=make(null,'flower');
  tutorialResetState();score=100000;shield=null;seal.reset();
  window.MonpatchSkillGame.start({clock});
  tutorialShowBoard('攻撃が届く前の盤面');paintStatus();
 }
 function setup(enabled){
  if(!enabled){cleanup();return;}
  active=true;savedSkill=!!window.__skillMode;window.__skillMode=true;
  pausedAt=null;pausedTotal=0;
  tutorialOverlay.classList.add('skillTutorial');
  tutorialOverlay.querySelector('.tutorialTitle').textContent='個別妨害チュートリアル';
  tutorialExitBtn.hidden=true;status.hidden=false;
  tutorialFooter.textContent='攻撃を受ける側の画面を自動で実演します。所持玉は減りません。終了後はメニューへ戻ります。';
  tutorialDoneActions.classList.remove('show');
  ticker=setInterval(paintStatus,100);
 }
 function pause(paused){
  if(!active)return;
  if(paused&&pausedAt===null)pausedAt=Date.now();
  if(!paused&&pausedAt!==null){pausedTotal+=Date.now()-pausedAt;pausedAt=null;}
 }
 function cleanup(){
  if(!active)return;
  active=false;if(ticker)clearInterval(ticker);ticker=null;
  window.MonpatchSkillGame.reset();window.__skillMode=savedSkill;
  seal.reset();shield=null;pausedAt=null;
  tutorialOverlay.classList.remove('skillTutorial');
  tutorialOverlay.querySelector('.tutorialTitle').textContent='基本動作';
  tutorialExitBtn.hidden=false;status.hidden=true;
 }
 async function run(token){
  try{
   let step=0;
   for(const pattern of Object.keys(R.patterns)){
    if(token!==tutorialToken||!active)return;
    resetBoard();const cfg=R.patterns[pattern];
    tutorialStepEl.textContent=`STEP ${++step} / 10　${pattern}：${cfg.name}`;
    tutorialTextEl.textContent=titles[pattern];
    if(!await tutorialWait(1800,token))return;
    if(pattern==='F'){seal.receive();playSfx('battleInterference');setMsg('攻撃が30秒間封印されました。防御は使えます。');}
    else if(!window.MonpatchSkillGame.apply({id:`tutorial-v1-${pattern}`,pattern}))throw new Error('妨害の実演を開始できませんでした');
    paintStatus();
    const seconds=['F','G','H'].includes(pattern)?cfg.duration:4;
    if(!await tutorialWait(seconds*1000+400,token))return;
    window.MonpatchSkillGame.paint();paintStatus();
    if(['F','G','H'].includes(pattern)){setMsg('効果の時間が終了しました');if(!await tutorialWait(1300,token))return;}
   }
   resetBoard();
   tutorialStepEl.textContent='STEP 9 / 10　反射防御';
   tutorialTextEl.textContent='玉1個で、30秒間・最大2回の反射防御を先に展開できます。展開中かどうかは相手に見えません。反射された攻撃は、もう一度反射できません。';
   shield={until:clock()+R.shieldSeconds*1000,left:R.shieldHits};paintStatus();
   for(let hit=1;hit<=2;hit++){
    if(!await tutorialWait(2200,token))return;
    const reaction=R.shieldReaction(shield,{pattern:'A',reflected:false},clock());
    if(!reaction.reflect)throw new Error('反射の実演を開始できませんでした');
    setMsg(reaction.exhausted?'反射防御を使い切りました（相手にも通知されます）':'攻撃を跳ね返しました（残り1回）');
    if(reaction.exhausted)playSfx('battleInterference');paintStatus();
   }
   if(!await tutorialWait(2500,token))return;
   resetBoard();
   tutorialStepEl.textContent='STEP 10 / 10　跳ね返された攻撃';
   tutorialTextEl.textContent='今度は、跳ね返された攻撃を受ける側の見本です。反射防御があっても防げません。スコア減少は、最初に攻撃した時のスコアを基準にします。';
   shield={until:clock()+R.shieldSeconds*1000,left:R.shieldHits};paintStatus();
   for(let hit=1;hit<=2;hit++){
    if(!await tutorialWait(2200,token))return;
    const event={id:`tutorial-v1-reflected-${hit}`,pattern:'E',reflected:true,baseScore:100000};
    if(R.shieldReaction(shield,event,clock()).reflect)throw new Error('反射済み攻撃が再反射されました');
    window.MonpatchSkillGame.apply(event);paintStatus();
   }
   if(!await tutorialWait(3000,token))return;
   tutorialStepEl.textContent='COMPLETE';
   tutorialTextEl.textContent='実演は以上です。未使用の玉は、正常終了なら全部、リタイア・通信切断なら半分（端数切り捨て）戻ります。';
   setMsg('チュートリアル終了');
   if(await tutorialWait(4500,token))await closeTutorial();
  }catch(error){
   console.error('skill tutorial failed',error);
   tutorialStepEl.textContent='実演を停止しました';tutorialTextEl.textContent='チュートリアルを再度開いてください。';
   if(await tutorialWait(3000,token))await closeTutorial();
  }
 }
 window.MonpatchSkillTutorial={setup,pause,cleanup,run};
 document.getElementById('skillTutorialLinkBtn')?.addEventListener('click',()=>openTutorial('skill'));
})();

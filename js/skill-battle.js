/* 固有妨害対戦。選択と防御は端末内のみ、発動済み攻撃だけを同期する。 */
(() => {
  const R=window.MonpatchRules,D=window.MonpatchDaily;
  let round='', pattern='A',left=0,shield=null,nextAttack=0;
  let preparing=null,sending=false,received=new Set(),reactions=new Map(),receiving=Promise.resolve(),hudTimer=null;
  const isSkill=(room=currentRoomData)=>room?.mode==='skill';
  const now=()=>Date.now()+serverTimeOffset;
  const attackSeal=R.createAttackSeal(now);
  function roundKey(room=currentRoomData){return `${currentRoomCode}/${room?.startAt||0}`;}
  function prepare(){
    if(!isSkill())return Promise.resolve();
    const key=roundKey();if(round===key)return preparing||Promise.resolve();
    round=key;pattern=document.getElementById('skillPattern').value;left=0;shield=null;nextAttack=0;attackSeal.reset();received=new Set();reactions=new Map();receiving=Promise.resolve();
    preparing=D.reserve(key,document.getElementById('skillCarry').value).then(s=>{left=s.left;}).catch(e=>{round='';throw e;}).finally(()=>{preparing=null;});
    return preparing;
  }
  function controls(){
    const d=battleGameFrame.contentDocument;if(!d)return;
    let panel=d.getElementById('skillControls');
    if(!panel){panel=d.createElement('section');panel.id='skillControls';panel.style.cssText='width:min(100%,520px);margin:5px auto;padding:8px;border:1px solid #62708a;border-radius:10px;box-sizing:border-box';panel.innerHTML='<div id="skillOwnState" style="font-size:12px;white-space:pre-line"></div><div style="display:flex;gap:8px"><button id="skillAttackBtn" type="button">攻撃</button><button id="skillGuardBtn" type="button">反射防御</button></div><div id="skillNotice" role="status" style="font-size:12px;white-space:pre-line"></div>';d.getElementById('__battleHud')?.before(panel);d.getElementById('skillAttackBtn').addEventListener('click',attack);d.getElementById('skillGuardBtn').addEventListener('click',guard);}
    panel.hidden=!isSkill();
    if(!isSkill())return;
    const cfg=R.patterns[pattern],t=now();if(shield&&shield.until<=t)shield=null;
    d.getElementById('skillOwnState').textContent=`${pattern}：${cfg.name}　残り玉 ${left}個\n${shield?`反射防御 ${shield.left}/2回・残り${Math.ceil((shield.until-t)/1000)}秒`:'反射防御なし'}${attackSeal.remaining()?'　攻撃封印 '+attackSeal.remaining()+'秒':''}`;
    const atk=d.getElementById('skillAttackBtn');atk.textContent=nextAttack>t?`攻撃：あと${Math.ceil((nextAttack-t)/1000)}秒`:`攻撃（玉${cfg.cost}個）`;
    atk.disabled=sending||!battleStarted||finalScoreSubmitted||left<cfg.cost||t<nextAttack||attackSeal.remaining()>0;
    d.getElementById('skillGuardBtn').disabled=sending||!battleStarted||finalScoreSubmitted||left<1;
  }
  function notice(message){const d=battleGameFrame.contentDocument;if(d?.getElementById('skillNotice'))d.getElementById('skillNotice').textContent=message;}
  function start(){if(hudTimer)clearInterval(hudTimer);controls();hudTimer=setInterval(controls,150);}
  function stop(){if(hudTimer)clearInterval(hudTimer);hudTimer=null;shield=null;try{battleGameFrame.contentWindow?.MonpatchSkillGame?.reset();}catch(_){};}
  function eventData(target,group,extra={}){const id=firebase.database().ref(`rooms/${currentRoomCode}/attacks`).push().key;return {id,group,fromUid:currentUser.uid,toUid:target,kind:'skill',pattern,round:Number(currentRoomData.startAt),reflected:false,createdAt:firebase.database.ServerValue.TIMESTAMP,...extra};}
  async function send(events){const updates={updatedAt:firebase.database.ServerValue.TIMESTAMP};for(const e of events)updates[`attacks/${e.id}`]=e;await firebase.database().ref(`rooms/${currentRoomCode}`).update(updates);}
  async function attack(){
    if(sending||!isSkill()||!battleStarted||finalScoreSubmitted)return;
    const cfg=R.patterns[pattern],t=now();if(left<cfg.cost||t<nextAttack||attackSeal.remaining()>0)return;
    const targets=Object.entries(currentRoomData.players||{}).filter(([uid,p])=>uid!==currentUser.uid&&!p.finished&&!p.forfeited).map(([uid])=>uid);
    if(!targets.length)return;
    sending=true;controls();const key=round;let spent=false;
    try{
      left=await D.spend(key,cfg.cost);spent=true;
      const group=crypto.randomUUID(),baseScore=Number(safeFrameEval('score',0))||0;
      await send(targets.map(uid=>eventData(uid,group,{baseScore})));
      nextAttack=now()+cfg.cooldown*1000;notice('全員へ'+cfg.name+'を発動しました。');
    }catch(e){if(spent){await D.refund(key,cfg.cost);left=D.read().active?.left||0;}notice('攻撃を送信できませんでした。'+e.message);}
    finally{sending=false;controls();}
  }
  async function guard(){
    if(sending||!isSkill()||!battleStarted||finalScoreSubmitted||left<1)return;
    sending=true;controls();
    try{left=await D.spend(round,1);shield={until:now()+R.shieldSeconds*1000,left:R.shieldHits};notice('反射防御を展開しました（相手には非公開）。');}
    catch(e){notice(e.message);}finally{sending=false;controls();}
  }
  function receive(event){
    if(!isSkill()||event.kind!=='skill'||event.round!==Number(currentRoomData.startAt)||received.has(event.id))return;
    received.add(event.id);
    // 盤面がアニメ中でも、到着時点で反射判定。キュー待ちで盾の期限を変えない。
    const reaction=reactions.get(event.id)||R.shieldReaction(shield,event,now());reactions.set(event.id,reaction);
    receiving=receiving.then(async()=>{
      if(reaction.reflect){
        const reflected=eventData(event.fromUid,event.group,{id:event.id+'_r',pattern:event.pattern,baseScore:event.baseScore,reflected:true});
        await send([reflected]);
        if(reaction.exhausted){
          await firebase.database().ref(`rooms/${currentRoomCode}/skillNotices/${event.id}`).set({uid:currentUser.uid,name:getLocalPlayerName()||'Player',round:event.round,text:'反射防御を使い切りました',createdAt:firebase.database.ServerValue.TIMESTAMP});
        }
        await acknowledge(event.id);controls();
      }else{
        if(event.pattern==='F'){
          attackSeal.receive();notice('攻撃が30秒間封印されました。防御は使えます。');await acknowledge(event.id);controls();
        }else attackQueue.push({key:event.id,...event});
      }
    }).catch(e=>{received.delete(event.id);notice('妨害の受信を再試行しています。');setTimeout(()=>{if(battleStarted)receive(event);},1000);console.error(e);});
  }
  async function acknowledge(id){if(currentRoomCode)await firebase.database().ref(`rooms/${currentRoomCode}/attacks/${id}`).remove();}
  async function settle(forfeit=false){if(!round)return;const key=round;const returned=await D.settle(key,forfeit);left=0;stop();return returned;}
  function beforeResult(room){if(isSkill(room))return settle(!!room.players?.[currentUser?.uid]?.forfeited);}
  let noticeRef=null,connectionWatching=false;
  function watchConnection(){
    if(connectionWatching)return;connectionWatching=true;let wasConnected=false;
    firebase.database().ref('.info/connected').on('value',snap=>{
      if(snap.val()===true){wasConnected=true;return;}
      if(!wasConnected||!isSkill()||!battleStarted||finalScoreSubmitted)return;
      // このモードは切断理由による救済なし。通信復帰前にローカルも停止する。
      finalScoreSubmitted=true;notice('通信が切れたためリタイアしました。');
      try{battleGameFrame.contentWindow.eval('stopTimer();stopIdleWatch();stopBgm();gameRunning=false;pendingFinish=false;');}catch(_){}
      settle(true).catch(console.error);
      firebase.database().ref(`rooms/${currentRoomCode}/players/${currentUser.uid}`).update({forfeited:true,finished:true,score:-1,finalScore:-1,disconnectReason:'connection',disconnectedAt:firebase.database.ServerValue.TIMESTAMP,updatedAt:firebase.database.ServerValue.TIMESTAMP}).catch(console.error);
    });
  }
  function listenNotices(){watchConnection();if(noticeRef)noticeRef.off();noticeRef=firebase.database().ref(`rooms/${currentRoomCode}/skillNotices`);noticeRef.on('child_added',snap=>{const n=snap.val();if(n?.round===Number(currentRoomData?.startAt)){notice(`${n.name||'Player'}：${n.text}`);try{battleGameFrame.contentWindow?.playSfx('battleInterference');}catch(_){}}});}
  function detach(){if(noticeRef)noticeRef.off();noticeRef=null;stop();}
  function setupLobby(){
    const select=document.getElementById('skillPattern');
    for(const [id,cfg] of Object.entries(R.patterns)){const opt=document.createElement('option');opt.value=id;opt.textContent=`${id}：${cfg.name}`;select.append(opt);}
    select.value='A';
    const desc=()=>{const c=R.patterns[select.value];document.getElementById('skillDescription').textContent=`${c.description} ／ 攻撃後${c.cooldown}秒（仮設定）`;};select.addEventListener('change',desc);desc();
    document.getElementById('normalModeBtn').addEventListener('click',()=>selectMode('normal'));
    document.getElementById('skillModeBtn').addEventListener('click',()=>selectMode('skill'));
    document.getElementById('modeChoiceBack').addEventListener('click',()=>{if(!currentRoomCode)showModeChoices();});
    document.getElementById('dailyRecover').addEventListener('click',async()=>{
      try{const active=D.read().active;if(!active)return;const [code,start]=active.round.split('/');const snap=await firebase.database().ref('rooms/'+code).once('value');const r=snap.val(),me=r?.players?.[currentUser?.uid];if(r&&Number(r.startAt)===Number(start)&&['countdown','playing'].includes(r.status)&&me&&!me.finished)throw new Error('その対戦が続いています。終了後に精算してください。');await D.settle(active.round,!r||Number(r.startAt)!==Number(start)||!me||me.forfeited||!me.finished);document.getElementById('dailyStatus').textContent='残っていた玉を精算しました。';}
      catch(e){document.getElementById('dailyStatus').textContent=e.message;}
    });
  }
  function showModeChoices(){document.getElementById('multiModeChoices').hidden=false;document.getElementById('multiLobbyView').hidden=true;}
  function selectMode(mode){window.__selectedBattleMode=mode;document.getElementById('multiModeChoices').hidden=true;document.getElementById('multiLobbyView').hidden=false;document.getElementById('skillLobbySettings').hidden=mode!=='skill';document.getElementById('battleModeLabel').textContent=mode==='skill'?'個別妨害対戦':'通常対戦';D.render();}
  function lobby(room){const locked=!!room&&!['waiting','results'].includes(room.status);document.getElementById('skillPattern').disabled=locked;document.getElementById('skillCarry').disabled=locked;document.getElementById('modeChoiceBack').hidden=!!currentRoomCode;}
  window.MonpatchSkillBattle={isSkill,prepare,start,stop,receive,settle,beforeResult,listenNotices,detach,showModeChoices,lobby};
  window.__selectedBattleMode='normal';setupLobby();
})();

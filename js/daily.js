(() => {
  const R=window.MonpatchRules;
  const candidates=[];
  const add=(id,label,metric,goal=1,counted=false)=>candidates.push({id,label,metric,goal,counted});
  add('play','シングルを1回プレイ','play');
  ['赤','青','緑','黄','紫'].forEach((c,i)=>add('color'+i,c+'を30個消す','color'+i,30,true));
  add('makeLine','矢印を2個作る','makeLine',2,true);
  add('makeBomb','爆弾を2個作る','makeBomb',2,true);
  add('makeFlower','花を1個作る','makeFlower',1,true);
  add('useLine','矢印を2回発動する','useLine',2,true);
  add('useBomb','爆弾を1回発動する','useBomb',1,true);
  add('useFlower','花を1回発動する','useFlower',1,true);
  add('combo','特殊ブロックを1回合成する','combo',1,true);
  add('ice','氷を3個完全解除する','ice',3,true);
  add('chain','鎖を3個解除する','chain',3,true);
  add('score20','1回で20,000点を達成','best',20000);
  add('score40','1回で40,000点を達成','best',40000);
  add('score80','1回で80,000点を達成','best',80000);
  add('total50','累計50,000点を獲得','total',50000);
  add('total100','累計100,000点を獲得','total',100000);
  add('rank','ランキングへ送信（更新不要）','rank');
  add('finish','シングルを最後までプレイ','finish');
  add('with','妨害ありで最後までプレイ','with');
  add('without','妨害なしで最後までプレイ','without');
  add('noHint','ヒントOFFで最後までプレイ','noHint');
  add('chain2','2連鎖を達成','maxChain',2);
  add('chain3','3連鎖を達成','maxChain',3);
  // 同一指標の重複も避ける。先頭1枠は固定、個数指定は最大2件。
  function missions(day=R.dayKey()) {
    const rnd=R.random('monpatch-daily-v1:'+day);
    const pool=candidates.slice(1);
    for(let i=pool.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];}
    const out=[candidates[0]],seen=new Set(['play']);let counted=0;
    for(const m of pool){if(seen.has(m.metric)||(m.counted&&counted>=2))continue;out.push(m);seen.add(m.metric);if(m.counted)counted++;if(out.length===5)break;}
    return out;
  }
  const key=()=> 'match3_daily_v1_'+window.MonpatchIdentity.getId();
  function read(now=Date.now()) {
    let s; try{s=JSON.parse(localStorage.getItem(key())||'null');}catch(_){throw new Error('保存データを読み込めません。');}
    if(!s)s={points:0,items:0};
    s.points=Math.max(0,Math.min(R.pointLimit,Math.floor(Number(s.points)||0)));
    s.items=Math.max(0,Math.min(R.itemLimit,Math.floor(Number(s.items)||0)));
    const day=R.dayKey(now); if(s.day!==day){s.day=day;s.metrics={};s.awarded=[];s.bonus=false;}
    s.metrics=s.metrics||{};s.awarded=s.awarded||[];
    return s;
  }
  async function change(fn,now=Date.now()) {
    const job=()=>{const s=read(now);const result=fn(s);localStorage.setItem(key(),JSON.stringify(s));render();return result;};
    return navigator.locks ? navigator.locks.request('monpatch-inventory',job) : job();
  }
  function award(s) {
    for(const m of missions(s.day))if((s.metrics[m.metric]||0)>=m.goal&&!s.awarded.includes(m.id)){s.points=Math.min(R.pointLimit,s.points+10);s.awarded.push(m.id);}
  }
  function record(metric,n=1,max=false) {
    const at=Date.now();
    return change(s=>{s.metrics[metric]=max?Math.max(s.metrics[metric]||0,n):(s.metrics[metric]||0)+n;award(s);},at).catch(showError);
  }
  function claim() { return change(s=>{award(s);if(s.bonus||s.awarded.length!==5)throw new Error('5件すべて達成すると受け取れます。');if(s.items>=R.itemLimit)throw new Error('玉が10個あります。空きを作ってから受け取ってください。');s.items++;s.bonus=true;}); }
  function exchange() {return change(s=>{if(s.points<R.exchangeCost)throw new Error('50pt必要です。');if(s.items>=R.itemLimit)throw new Error('玉の所持上限は10個です。');s.points-=R.exchangeCost;s.items++;});}
  // 持込時に予約し、使用分を記録。終了処理の重複で玉を増やさない。
  function reserve(round,count) {return change(s=>{count=Math.min(R.carryLimit,Math.max(0,Math.floor(Number(count)||0)));if(s.active){if(s.active.round===round)return s.active;throw new Error('別の対戦に玉を持ち込んでいます。');}if(s.items<count)throw new Error('玉が足りません。');s.items-=count;s.active={round,left:count};return {...s.active};});}
  function spend(round,cost) {return change(s=>{if(!s.active||s.active.round!==round||s.active.left<cost)throw new Error('玉が足りません。');s.active.left-=cost;return s.active.left;});}
  function refund(round,cost) {return change(s=>{if(s.active?.round===round)s.active.left=Math.min(R.carryLimit,s.active.left+cost);});}
  function settle(round,forfeit) {return change(s=>{if(s.active?.round!==round)return 0;const returned=forfeit?Math.floor(s.active.left/2):s.active.left;s.items=Math.min(R.itemLimit,s.items+returned);s.active=null;return returned;});}
  function showError(e){const el=document.getElementById('dailyStatus');if(el)el.textContent=e.message||String(e);console.error(e);}
  function render(){
    const list=document.getElementById('dailyList');if(!list)return;
    try{
      const s=read();document.getElementById('dailyWallet').textContent=`${s.points}/1500pt　玉 ${s.items}/10個`;
      list.replaceChildren();
      for(const m of missions(s.day)){const li=document.createElement('li');const n=Math.min(m.goal,s.metrics[m.metric]||0);li.textContent=`${s.awarded.includes(m.id)?'✓':'・'} ${m.label}　${n}/${m.goal}　10pt`;list.append(li);}
      document.getElementById('dailyClaim').disabled=s.bonus||s.awarded.length!==5||s.items>=10;
      document.getElementById('dailyClaim').textContent=s.bonus?'全達成ボーナス受取済み':'全達成ボーナス：玉1個を受取';
      document.getElementById('dailyExchange').disabled=s.points<50||s.items>=10;
      const carry=document.getElementById('skillCarry');if(carry&&!s.active){for(const option of carry.options)option.disabled=Number(option.value)>s.items;if(Number(carry.value)>s.items)carry.value=String(Math.min(s.items,R.carryLimit));}
    }catch(e){showError(e);}
  }
  window.MonpatchDaily={candidates,missions,read,record,claim,exchange,reserve,spend,refund,settle,render};
  document.getElementById('dailyClaim')?.addEventListener('click',()=>claim().catch(showError));
  document.getElementById('dailyExchange')?.addEventListener('click',()=>exchange().catch(showError));
  window.addEventListener('storage',render);setInterval(render,15000);render();
})();

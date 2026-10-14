/* v2.70 調整用の仮値。キャラクター素材に依存しない共通ルール。 */
(() => {
  const patterns = {
    A: {name:'隣接妨害', count:2, cost:1, cooldown:20, description:'縦か横に隣接する2マスへ鎖'},
    B: {name:'斜め妨害', count:2, cost:1, cooldown:20, description:'斜めに並ぶ2マスへ鎖'},
    C: {name:'ランダム妨害', count:3, cost:1, cooldown:25, description:'ランダムな3マスへ鎖'},
    D: {name:'盤面配置変更', cost:1, cooldown:60, description:'状態を保ったまま盤面を並べ替え'},
    E: {name:'スコア割合減少', ratio:0.10, cost:2, cooldown:40, description:'スコアを10％減少（玉2個）'},
    F: {name:'攻撃封印', duration:30, cost:1, cooldown:40, description:'30秒間、攻撃のみを封印'},
    G: {name:'視界妨害', size:3, duration:8, cost:1, cooldown:30, description:'3×3マスを8秒間隠す'},
    H: {name:'特殊ブロック封印', duration:10, cost:1, cooldown:45, description:'10秒間、特殊ブロックの操作を封印'}
  };
  function dayKey(now=Date.now()) { return new Date(now + 6*3600000).toISOString().slice(0,10); }
  function random(seed) {
    let n=2166136261; for(const c of String(seed)) n=Math.imul(n^c.charCodeAt(0),16777619);
    return () => { n+=0x6D2B79F5; let t=n; t=Math.imul(t^(t>>>15),t|1); t^=t+Math.imul(t^(t>>>7),t|61); return ((t^(t>>>14))>>>0)/4294967296; };
  }
  function shieldReaction(shield,event,now) {
    if(event.reflected || !shield || now>=shield.until || shield.left<=0) return {reflect:false,exhausted:false};
    shield.left--; return {reflect:true,exhausted:shield.left===0};
  }
  function createAttackSeal(clock=()=>Date.now()) {
    let until=0;
    return {receive(){until=Math.max(until,clock()+patterns.F.duration*1000);},remaining(){return Math.max(0,Math.ceil((until-clock())/1000));},reset(){until=0;}};
  }
  window.MonpatchRules={patterns,dayKey,random,shieldReaction,createAttackSeal,shieldSeconds:30,shieldHits:2,pointLimit:1500,itemLimit:10,carryLimit:2,exchangeCost:50};
})();

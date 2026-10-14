/* 盤面効果。通常モードでの得点・消去処理には変更を加えない。 */
(() => {
  const R=window.MonpatchRules;
  let sealedUntil=0, masks=[], effectTimer=null;
  let clock=()=>Date.now();
  window.__skillHasTemporarySeal=()=>window.__skillMode&&clock()<sealedUntil;
  window.__skillSpecialSealed=t=>window.__skillMode && !!t?.special && clock()<sealedUntil;
  function reset(){sealedUntil=0;masks=[];clock=()=>Date.now();if(effectTimer)clearInterval(effectTimer);effectTimer=null;}
  function paint(){
    const now=clock();masks=masks.filter(m=>m.until>now);
    for(const el of boardEl.children){const r=Number(el.dataset.r),c=Number(el.dataset.c);el.classList.toggle('skillMasked',masks.some(m=>r>=m.r&&r<m.r+m.size&&c>=m.c&&c<m.c+m.size));el.classList.toggle('skillSealed',!!B[r]?.[c]?.special&&now<sealedUntil);}
  }
  const style=document.createElement('style');style.textContent='.tile.skillMasked{background:#152030!important;border-color:#52617a!important}.tile.skillMasked>*{visibility:hidden}.tile.skillMasked:after{content:"?";position:absolute;inset:0;display:grid;place-items:center;color:#8fa1b9}.tile.skillSealed{outline:2px solid #bd7aff;outline-offset:-2px}';document.head.append(style);
  function start(options={}){reset();clock=options.clock||(()=>Date.now());effectTimer=setInterval(()=>{if(window.__skillMode)paint();},150);}
  function eligible(r,c){return inside(r,c)&&B[r]?.[c]&&!isBlocked(B[r][c])&&!isTrigger(B[r][c]);}
  function chain(pattern,rnd){
    let choices=[];
    if(pattern==='A'||pattern==='B'){
      const dirs=pattern==='A'?[[1,0],[0,1]]:[[1,1],[1,-1]];
      for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++)for(const [dr,dc] of dirs)if(eligible(r,c)&&eligible(r+dr,c+dc))choices.push([{r,c},{r:r+dr,c:c+dc}]);
      if(choices.length)choices=choices[Math.floor(rnd()*choices.length)];
    }else{
      for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++)if(eligible(r,c))choices.push({r,c});
      for(let i=choices.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[choices[i],choices[j]]=[choices[j],choices[i]];}
      choices=choices.slice(0,R.patterns[pattern].count);
    }
    for(const p of choices)B[p.r][p.c].chain=true;
  }
  function shuffle(rnd){
    const positions=[];for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++)if(eligible(r,c))positions.push({r,c});
    const original=positions.map(p=>B[p.r][p.c]);let chosen=original.slice(),quality=Infinity;
    // 最初からマッチさせない・手詰まりにしない配置を優先。既存状態/IDを保持する。
    for(let k=0;k<120;k++){
      const tiles=original.slice();for(let i=tiles.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[tiles[i],tiles[j]]=[tiles[j],tiles[i]];}
      positions.forEach((p,i)=>B[p.r][p.c]=tiles[i]);
      if(scanMatches().cells.size||!findValidMove())continue;
      // 特殊作成の候補となる同色隣接を少なくする仮調整。
      let q=0;for(const p of positions){const t=B[p.r][p.c];if(t.special)continue;for(const [dr,dc] of [[1,0],[0,1]])if(B[p.r+dr]?.[p.c+dc]?.color===t.color)q++;}
      if(q<quality){quality=q;chosen=tiles.slice();}
    }
    positions.forEach((p,i)=>B[p.r][p.c]=chosen[i]);
  }
  function apply(event){
    if(!window.__skillMode||!gameRunning||lock)return false;
    const cfg=R.patterns[event.pattern];if(!cfg)return true;
    const rnd=R.random(event.id),now=clock();
    if(['A','B','C'].includes(event.pattern))chain(event.pattern,rnd);
    if(event.pattern==='D')shuffle(rnd);
    if(event.pattern==='E'){
      const base=event.reflected?Number(event.baseScore)||0:score;
      score=Math.max(0,score-Math.floor(base*cfg.ratio));
    }
    if(event.pattern==='G'){masks.push({r:Math.floor(rnd()*(ROWS-cfg.size+1)),c:Math.floor(rnd()*(COLS-cfg.size+1)),size:cfg.size,until:now+cfg.duration*1000});}
    if(event.pattern==='H')sealedUntil=Math.max(sealedUntil,now+cfg.duration*1000);
    selected=null;hintPair=null;render();paint();playSfx('battleInterference');setMsg(cfg.name+(event.reflected?'（反射）':''));
    return true;
  }
  window.MonpatchSkillGame={apply,start,reset,paint};
})();

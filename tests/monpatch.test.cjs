const vm=require('vm'),fs=require('fs'),assert=require('assert');
const root=require('path').resolve(__dirname,'..')+'/';
function doc(html){
 const {document,window}=require('linkedom').parseHTML(html);
 document.ids=new Map([...document.querySelectorAll('[id]')].map(e=>[e.id,e]));
 const proto=window.HTMLElement.prototype,old=proto.addEventListener;
 if(!proto.__qaPatched){proto.__qaPatched=true;proto.addEventListener=function(n,f,...a){(this.listeners??={})[n]??=[];this.listeners[n].push(f);return old.call(this,n,f,...a)};proto.showModal=function(){this.open=true};proto.close=function(){this.open=false};proto.focus=function(){};proto.blur=function(){};proto.getBoundingClientRect=function(){return{width:504,height:392,left:0,top:0}};proto.getClientRects=function(){return[{}]};}
 for(const sel of document.querySelectorAll('select'))Object.defineProperty(sel,'value',{configurable:true,get(){return this._value??this.querySelector('option')?.value??''},set(v){this._value=v}});
 return document;
}
function context(html,parent){let n=123456789;const store=new Map();const math=Object.create(Math);math.random=()=>{n^=n<<13;n^=n>>>17;n^=n<<5;return(n>>>0)/4294967296};const c=vm.createContext({console,Math:math,Date,JSON,Set,Map,Array,Object,Number,String,Promise,Error,Uint8Array,URLSearchParams,AbortController,structuredClone,document:doc(html),localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)},navigator:{locks:{request:async(k,f)=>f()}},crypto:require('crypto').webcrypto,Audio:class{play(){return Promise.resolve()}pause(){}},CustomEvent:class{},getComputedStyle:()=>({getPropertyValue:()=> '56',gap:'0',width:'504px'}),setInterval:()=>1,clearInterval(){},setTimeout:(f,t)=>{if(t<1000)queueMicrotask(f);return 1},clearTimeout(){},queueMicrotask,addEventListener(){},dispatchEvent(){},scrollTo(){},isSecureContext:true});for(const [id,e] of c.document.ids)c[id]=e;c.window=c;c.parent=parent||c;c.eval=s=>vm.runInContext(s,c);return c;}
function load(c,n,source){vm.runInContext(source??fs.readFileSync(root+n,'utf8'),c,{filename:n});}
const html=fs.readFileSync(root+'game.html','utf8');
const main=context(fs.readFileSync(root+'index.html','utf8'));load(main,'js/player-identity.js');load(main,'js/skill-rules.js');load(main,'js/daily.js');load(main,'js/audio-settings.js');load(main,'js/app.js');load(main,'js/profile.js');
const game=context(html,main);main.document.getElementById('battleGameFrame').contentWindow=game;main.document.getElementById('battleGameFrame').contentDocument=game.document;load(game,'js/audio-settings.js');load(game,'js/player-identity.js');load(game,'js/ranking-client.js');load(game,'js/skill-rules.js');load(game,'js/game-core.js');load(game,'js/tutorial.js');load(game,'js/skill-game.js');load(game,'js/skill-tutorial.js');load(game,'js/game-ui.js');
// Real main/iframe shared boundary; Firebase mock logs all sent messages.
let writes=[];class Ref{constructor(p=''){this.path=p;this.key=p.split('/').pop()}child(p){return new Ref(this.path+'/'+p)}push(v){const r=this.child('e_'+writes.length+'_'+Math.random().toString(36).slice(2));if(v)r.set(v);return r}set(v){writes.push({path:this.path,value:v});return Promise.resolve()}update(v){writes.push({path:this.path,value:v});return Promise.resolve()}remove(){writes.push({path:this.path,value:null});return Promise.resolve()}on(){}off(){}once(){return Promise.resolve({val:()=>null,exists:()=>false})}onDisconnect(){return{update:async()=>{},cancel:async()=>{}}}transaction(f){return Promise.resolve({committed:false,snapshot:{val:()=>null}})}}function database(){return{ref:p=>new Ref(p)}}database.ServerValue={TIMESTAMP:1};main.firebase={database,initializeApp(){},auth:()=>({signInAnonymously:async()=>({user:{uid:"me",getIdToken:async()=>""}})})};
load(main,'js/chat.js');load(main,'js/multi.js');load(main,'js/skill-battle.js');load(main,'js/single.js');load(main,'js/environment.js');load(main,'js/bootstrap.js');
const run=(s,c=main)=>vm.runInContext(s,c);const flush=()=>new Promise(r=>setImmediate(r));
(async()=>{let count=0;const D=main.MonpatchDaily,R=main.MonpatchRules;
assert.equal(R.dayKey(Date.parse('2026-10-13T17:59:59Z')),'2026-10-13');assert.equal(R.dayKey(Date.parse('2026-10-13T18:00:00Z')),'2026-10-14');count+=2;
for(let i=0;i<2000;i++){const day=new Date(Date.UTC(2026,0,1+i)).toISOString().slice(0,10),m=D.missions(day);assert.equal(m.length,5);assert.equal(m[0].id,'play');assert(m.filter(x=>x.counted).length<=2);assert.equal(new Set(m.map(x=>x.metric)).size,5);assert.equal(JSON.stringify(m),JSON.stringify(D.missions(day)));}count+=2000;
for(const m of D.missions())await D.record(m.metric,m.goal);assert.equal(D.read().points,50);for(const m of D.missions())await D.record(m.metric,m.goal);assert.equal(D.read().points,50);await D.claim();await D.exchange();assert.equal(D.read().items,2);assert.equal(D.read().points,0);count+=4;
await D.reserve('test/1',2);await D.spend('test/1',1);await D.settle('test/1',true);assert.equal(D.read().items,0);count++;
const setState=fn=>{const s=D.read();fn(s);main.localStorage.setItem('match3_daily_v1_'+main.MonpatchIdentity.getId(),JSON.stringify(s))};
setState(s=>s.items=2);await D.reserve('test/2',2);await D.settle('test/2',true);assert.equal(D.read().items,1);setState(s=>s.items=2);await D.reserve('test/3',2);await D.spend('test/3',1);await D.settle('test/3',false);await D.settle('test/3',false);assert.equal(D.read().items,1);count+=2;
setState(s=>{s.items=10;s.bonus=false;s.points=1500});await assert.rejects(D.claim());await assert.rejects(D.exchange());count+=2;
setState(s=>s.day='2020-01-01');assert.equal(D.read().awarded.length,0);assert.equal(D.read().points,1500);assert.equal(D.read().items,10);count++;
const sh={until:Date.now()+30000,left:2};assert(R.shieldReaction(sh,{},Date.now()).reflect);assert(R.shieldReaction(sh,{},Date.now()).exhausted);assert(!R.shieldReaction(sh,{},Date.now()).reflect);const sh2={until:Date.now()+30000,left:2};assert(!R.shieldReaction(sh2,{reflected:true},Date.now()).reflect);assert.equal(sh2.left,2);count+=4;
console.log('daily/calendar/inventory:',count,'checks,',D.candidates.length,'candidates');
run('window.__isBattleMode=true;window.__skillMode=true;interferenceEnabled=false;startGame(3);stopTimer();stopIdleWatch();MonpatchSkillGame.start()',game);
for(const pattern of ['A','B','C']){run('generateCleanBoard();lock=false;',game);game.MonpatchSkillGame.apply({id:'test'+pattern,pattern});const a=run('B.flatMap((row,r)=>row.flatMap((t,c)=>t.chain?[{r,c}]:[]))',game);assert.equal(a.length,R.patterns[pattern].count);if(pattern==='A')assert.equal(Math.abs(a[0].r-a[1].r)+Math.abs(a[0].c-a[1].c),1);if(pattern==='B'){assert.equal(Math.abs(a[0].r-a[1].r),1);assert.equal(Math.abs(a[0].c-a[1].c),1)}}
run("generateCleanBoard();B[0][0].chain=true;B[1][1].ice=2;B[2][2]=make(null,'flower');",game);const before=run('JSON.stringify(B.flat().map(t=>JSON.stringify(t)).sort())',game);game.MonpatchSkillGame.apply({id:'D',pattern:'D'});assert.equal(run('JSON.stringify(B.flat().map(t=>JSON.stringify(t)).sort())',game),before);assert.equal(run('scanMatches().cells.size',game),0);
run('score=100000',game);game.MonpatchSkillGame.apply({id:'E',pattern:'E'});assert.equal(run('score',game),90000);run('score=100000',game);for(let i=0;i<2;i++)game.MonpatchSkillGame.apply({id:'Er'+i,pattern:'E',reflected:true,baseScore:100000});assert.equal(run('score',game),80000);run('score=500',game);game.MonpatchSkillGame.apply({id:'Er3',pattern:'E',reflected:true,baseScore:100000});assert.equal(run('score',game),0);
game.MonpatchSkillGame.apply({id:'G',pattern:'G'});assert.equal(game.document.getElementById('board').children.filter(e=>e.classList.contains('skillMasked')).length,9);game.MonpatchSkillGame.apply({id:'H',pattern:'H'});assert(!run('isMovableTile(B.flat().find(t=>t.special))',game));assert(run('__skillHasTemporarySeal()',game));run('finishGame()',game);assert.equal(game.document.getElementById('resultRankingBox').style.display,'none');console.log('A/B/C/D/E/G/H board effects: passed');
// Exercise actual network send, private shield, F, and immutable reflection base.
run("currentUser={uid:'me'};currentRoomCode='123456';currentRoomData={mode:'skill',startAt:100,players:{me:{},other:{},third:{}}};gameMode='battle';battleStarted=true;finalScoreSubmitted=false;",main);main.document.getElementById('skillPattern').value='E';main.document.getElementById('skillCarry').value='2';setState(s=>{s.items=2;s.active=null});await main.MonpatchSkillBattle.prepare();run('injectBattleHudIntoFrame()');main.MonpatchSkillBattle.start();run('gameRunning=true;score=100000;lock=false;',game);
await game.document.getElementById('skillAttackBtn').listeners.click[0]();assert.equal(D.read().active.left,0);let multicast=writes.find(w=>w.value&&Object.keys(w.value).filter(k=>k.startsWith('attacks/')).length===2);assert(multicast,'multicast');const out=Object.entries(multicast.value).filter(([k])=>k.startsWith('attacks/')).map(([,v])=>v);assert(out.every(e=>e.baseScore===100000&&e.pattern==='E'&&!e.reflected));assert.equal(new Set(out.map(e=>e.group)).size,1);await main.MonpatchSkillBattle.settle(false);
run("currentRoomData.startAt=200;finalScoreSubmitted=false;",main);main.document.getElementById('skillPattern').value='A';setState(s=>s.items=2);main.document.getElementById('skillCarry').value='2';await main.MonpatchSkillBattle.prepare();await game.document.getElementById('skillGuardBtn').listeners.click[0]();assert.equal(D.read().active.left,1);const start=writes.length;const event={id:'attack1',kind:'skill',pattern:'E',fromUid:'other',toUid:'me',round:200,baseScore:100000};main.MonpatchSkillBattle.receive(event);main.MonpatchSkillBattle.receive(event);main.MonpatchSkillBattle.receive({...event,id:'attack2'});await flush();await flush();const reflects=writes.slice(start).flatMap(w=>Object.entries(w.value||{}).filter(([k])=>k.startsWith('attacks/')).map(([,v])=>v));assert.equal(reflects.length,2);assert(reflects.every(e=>e.reflected&&e.toUid==='other'&&e.baseScore===100000));assert.equal(writes.slice(start).filter(w=>w.path.includes('skillNotices')).length,1);
main.MonpatchSkillBattle.receive({...event,id:'reflected',reflected:true});await flush();assert.equal(run('attackQueue.length',main),1);main.MonpatchSkillBattle.receive({...event,id:'seal',pattern:'F'});await flush();assert(game.document.getElementById('skillAttackBtn').disabled);assert(!game.document.getElementById('skillGuardBtn').disabled);console.log('multicast/private shield/F/no rereflection: passed');await main.MonpatchSkillBattle.settle(true);
// Single progression and exclusion with real game hooks.
run("gameMode='single';",main);run('window.__isBattleMode=false;window.__skillMode=false;MonpatchSkillGame.reset();startGame(1);stopTimer();stopIdleWatch()',game);await flush();let played=D.read().metrics.play;assert(played>=1);run("startTesterGame();gameDaily('play');tutorialMode=true;gameDaily('play');tutorialMode=false;window.__isBattleMode=true;gameDaily('play')",game);await flush();assert.equal(D.read().metrics.play,played);console.log('single/free/tutorial/battle exclusion: passed');
// Deterministic regression against pre-change source on real swaps.
const old=context(html);load(old,'js/audio-settings.js');load(old,'js/player-identity.js');load(old,'js/ranking-client.js');load(old,'js/game-core.js',fs.readFileSync(root+'tests/fixtures/game-core-v2.69.5.js','utf8'));load(old,'js/tutorial.js');load(old,'js/game-ui.js');
run('window.__isBattleMode=false;window.__skillMode=false;MonpatchSkillGame.reset();testerMode=false;tutorialMode=false;interferenceEnabled=false',game);
for(let i=0;i<24;i++){const seed=i+43,setup=`nextId=1;Math.random=(()=>{let s=${seed};return()=>{s=Math.imul(1664525,s)+1013904223|0;return(s>>>0)/4294967296;}})();startGame(3);stopTimer();stopIdleWatch();`;run(setup,old);run(setup,game);for(let j=0;j<3;j++){await run('(async()=>{const m=findValidMove();if(m)await trySwap(m.a,m.b)})()',old);await run('(async()=>{const m=findValidMove();if(m)await trySwap(m.a,m.b)})()',game);}assert.equal(run('JSON.stringify({score,B})',old),run('JSON.stringify({score,B})',game),'normal regression seed '+seed)}console.log('normal scoring/board regression: 24 seeds × 3 swaps passed');
run('window.__isBattleMode=true;window.__skillMode=false;testerMode=false;prepareResultRanking()',game);assert.notEqual(game.document.getElementById('resultRankingBox').style.display,'none');console.log('normal ranking preserved: passed');

// Actual main page bootstrap and mode UI against real HTML DOM.
await flush();await main.document.getElementById('battleGameFrame').listeners.load[0]();
assert(run('battleFrameReady'));
for(const fn of main.document.getElementById('multiModeBtn').listeners.click)fn();
assert.equal(main.document.getElementById('multiModeChoices').hidden,false);
main.document.getElementById('skillModeBtn').listeners.click[0]();assert.equal(main.document.getElementById('skillLobbySettings').hidden,false);
main.document.getElementById('normalModeBtn').listeners.click[0]();assert.equal(main.document.getElementById('skillLobbySettings').hidden,true);
// Room mode mismatch refuses participation before writing any player data.
const savedOnce=Ref.prototype.once;
Ref.prototype.once=function(){if(this.path.startsWith('blockedUsers/'))return savedOnce.call(this);return Promise.resolve({exists:()=>true,val:()=>({status:'waiting',mode:'skill',players:{}})})};
run("window.__selectedBattleMode='normal'",main);await assert.rejects(run("joinRoom('654321','me')",main),/別の対戦モード/);
Ref.prototype.once=function(){if(this.path.startsWith('blockedUsers/'))return savedOnce.call(this);return Promise.resolve({exists:()=>true,val:()=>({status:'waiting',players:{}})})};
run("window.__selectedBattleMode='skill'",main);await assert.rejects(run("joinRoom('654321','me')",main),/別の対戦モード/);
Ref.prototype.once=savedOnce;
console.log('real DOM/bootstrap/mode separation: passed');
// Run the entire new demonstration twice through the real effects and tutorial clock.
let demoTime=Date.now();game.Date=class extends Date{static now(){return demoTime}};
const realApply=game.MonpatchSkillGame.apply;let captures=[],pauseG=false,pauseH=false;
game.MonpatchSkillGame.apply=e=>{const ok=realApply(e);captures.push({event:e.pattern,reflected:!!e.reflected,score:run('score',game),board:run('JSON.stringify(B.map(row=>row.map(({color,special,chain,ice})=>({color,special,chain,ice}))))',game)});if(e.pattern==='D')assert.equal(run('scanMatches().cells.size',game),0);return ok};
game.demoTick=ms=>{
 if(!pauseG&&game.document.querySelectorAll('.skillMasked').length){pauseG=true;run('setTutorialPaused(true)',game);demoTime+=60000;game.MonpatchSkillGame.paint();assert.equal(game.document.querySelectorAll('.skillMasked').length,9);run('setTutorialPaused(false)',game);}
 if(!pauseH&&run('__skillHasTemporarySeal()',game)){pauseH=true;run('setTutorialPaused(true)',game);demoTime+=60000;assert(run('__skillHasTemporarySeal()',game));run('setTutorialPaused(false)',game);}
 demoTime+=ms;return Promise.resolve();
};
game.setTimeout=(f,ms)=>{game.demoTick(ms);queueMicrotask(f);return 1};
run('trySwap=()=>{throw new Error("unexpected tutorial swap")};',game);
const wallet=JSON.stringify(D.read()),writesBefore=writes.length;
const realDemoRun=game.MonpatchSkillTutorial.run;game.MonpatchSkillTutorial.run=token=>game.lastDemo=realDemoRun(token);
async function demo(){
 captures=[];pauseG=false;pauseH=false;
 game.document.getElementById('skillTutorialLinkBtn').listeners.click[0]();
 assert(game.document.getElementById('tutorialOverlay').classList.contains('show'));
 assert(game.document.getElementById('tutorialExitBtn').hidden);
 await game.lastDemo;
 assert(pauseG&&pauseH,'paused timed effects were exercised');
 assert.equal(game.document.getElementById('tutorialOverlay').classList.contains('show'),false);
 assert.equal(run('tutorialMode',game),false);assert.equal(game.__skillMode,false);
 assert.equal(game.document.querySelectorAll('.skillMasked,.skillSealed').length,0);
 assert.equal(JSON.stringify(D.read()),wallet);assert.equal(writes.length,writesBefore);
 return JSON.stringify(captures);
}
const first=await demo();assert.equal(await demo(),first,'fixed demo repeats exactly');
const demoEvents=JSON.parse(first);assert.equal(demoEvents.length,9);assert.equal(demoEvents.find(e=>e.event==='E'&&!e.reflected).score,90000);assert.deepEqual(demoEvents.filter(e=>e.reflected).map(e=>e.score),[90000,80000]);
let sealTime=0;const testSeal=R.createAttackSeal(()=>sealTime);testSeal.receive();assert.equal(testSeal.remaining(),30);sealTime=30000;assert.equal(testSeal.remaining(),0);
// Cancellation clears tutorial state and makes the pending auto-run inert.
run('tutorialMode=true;gameRunning=true;lock=false;MonpatchSkillTutorial.setup(true);',game);
await run('closeTutorial()',game);assert.equal(game.__skillMode,false);
console.log('skill tutorial: full replay ×2, fixed board, G/H pause, F expiry, cleanup, wallet/network isolation passed');
console.log('ALL CHECKS PASSED');
})().catch(e=>{console.error(e);process.exitCode=1});

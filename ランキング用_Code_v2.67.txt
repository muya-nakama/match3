/*
 * モンパッチ 2.67 ランキング。既存のスプレッドシートに紐づくApps Scriptへ配置。
 * 旧タブは変更せず、RankingV2・PlayersV2を自動作成する。
 * IDはブラウザ単位の匿名識別子。本人認証・不正スコア防止は提供しない。
 */
const RANK_SHEET = 'RankingV2';
const PLAYER_SHEET = 'PlayersV2';
const RANK_HEADERS = ['playerId','minutes','interference','score','chainAttacks','iceAttacks','version','updatedAt'];
const PLAYER_HEADERS = ['playerId','name','avatarData','updatedAt'];

function setupRankingV2() {
  const lock=LockService.getScriptLock();lock.waitLock(20000);
  try { sheets_(); } finally { lock.releaseLock(); }
}
function sheets_() {
  const props=PropertiesService.getScriptProperties();
  const savedId=props.getProperty("RANKING_SPREADSHEET_ID");
  const ss=savedId?SpreadsheetApp.openById(savedId):SpreadsheetApp.getActiveSpreadsheet();
  if(!ss)throw new Error('スプレッドシートからsetupRankingV2を先に実行してください。');
  if(!savedId)props.setProperty('RANKING_SPREADSHEET_ID',ss.getId());
  function sheet(name,headers) {
    let s=ss.getSheetByName(name);
    if(!s){s=ss.insertSheet(name);s.appendRow(headers);s.setFrozenRows(1);}
    const actual=s.getRange(1,1,1,headers.length).getValues()[0];
    if(actual.join('|')!==headers.join('|'))throw new Error(name+'の見出しが一致しません。');
    return s;
  }
  return {ranks:sheet(RANK_SHEET,RANK_HEADERS),players:sheet(PLAYER_SHEET,PLAYER_HEADERS)};
}
function rows_(s,n) {return s.getLastRow()>1?s.getRange(2,1,s.getLastRow()-1,n).getValues():[];}
function int_(v,min,max) {
  const n=Number(v);
  if(!Number.isSafeInteger(n)||n<min||n>max)throw new Error('数値の範囲が正しくありません。');
  return n;
}
function id_(v) {
  if(!/^[a-zA-Z0-9_-]{20,80}$/.test(String(v||'')))throw new Error('IDが正しくありません。');
  return String(v);
}
function avatar_(v) {
  v=String(v||'');
  if(v.length>30000 || (v && !/^data:image\/(webp|jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(v)))throw new Error('アイコン画像が正しくありません。');
  return v;
}
function mode_(v) {
  if(v!=='0'&&v!=='1')throw new Error('妨害モードが正しくありません。');
  return Number(v);
}
function ranking_(s,minutes,interference,limit) {
  const profiles={};
  rows_(s.players,4).forEach(p=>{profiles[p[0]]={name:String(p[1]).replace(/^'/,''),avatarData:avatar_(p[2])};});
  // 行が手動複製されていても同じID・モードは最高点の1件に集約。
  const best={};
  rows_(s.ranks,8).forEach(r=>{
    if(Number(r[1])!==minutes||Number(r[2])!==interference)return;
    const id=String(r[0]); if(!best[id]||Number(r[3])>Number(best[id][3]))best[id]=r;
  });
  return Object.keys(best).map(id=>{
    const r=best[id],p=profiles[id]||{name:'Player',avatarData:''};
    return {playerId:id,name:p.name,avatarData:p.avatarData,score:Number(r[3]),chainAttacks:Number(r[4]),iceAttacks:Number(r[5]),updatedAt:String(r[7])};
  }).sort((a,b)=>b.score-a.score||a.updatedAt.localeCompare(b.updatedAt)||a.playerId.localeCompare(b.playerId))
    .map((r,i)=>Object.assign(r,{rank:i+1})).slice(0,limit);
}
function submit_(p) {
  const playerId=id_(p.playerId),name=String(p.name||'').trim().slice(0,16);
  if(!name)throw new Error('名前を入力してください。');
  const avatar=avatar_(p.avatarData),minutes=int_(p.minutes,1,10),interference=mode_(p.interference);
  const score=int_(p.score,0,1000000000),chain=int_(p.chainAttacks||0,0,1000000),ice=int_(p.iceAttacks||0,0,1000000);
  const s=sheets_(),now=new Date().toISOString(),profiles=rows_(s.players,4);
  const profileIndex=profiles.findIndex(r=>r[0]===playerId);
  // 常にテキストとして保存し、名前先頭の「=」等を式として実行させない。
  const profile=[playerId,"'"+name,avatar,now];
  if(profileIndex<0)s.players.appendRow(profile);
  else s.players.getRange(profileIndex+2,1,1,4).setValues([profile]);
  const all=rows_(s.ranks,8),matches=[];
  all.forEach((r,i)=>{if(r[0]===playerId&&Number(r[1])===minutes&&Number(r[2])===interference)matches.push({row:i+2,data:r});});
  matches.sort((a,b)=>Number(b.data[3])-Number(a.data[3]));
  const old=matches[0],previous=old?Number(old.data[3]):0;
  const result=!old?'registered':score>previous?'updated':'kept';
  if(!old)s.ranks.appendRow([playerId,minutes,interference,score,interference?chain:0,interference?ice:0,String(p.version||'').slice(0,24),now]);
  else if(score>previous)s.ranks.getRange(old.row,1,1,8).setValues([[playerId,minutes,interference,score,interference?chain:0,interference?ice:0,String(p.version||'').slice(0,24),now]]);
  matches.slice(1).sort((a,b)=>b.row-a.row).forEach(r=>s.ranks.deleteRow(r.row));
  SpreadsheetApp.flush();
  const ranked=ranking_(s,minutes,interference,Number.MAX_SAFE_INTEGER);
  return {ok:true,schema:2,result:result,bestScore:Math.max(score,previous),previousScore:previous,submittedScore:score,rank:ranked.find(r=>r.playerId===playerId).rank};
}
function doPost(e) {
  const p=e.parameter||{};
  let result,requestId;
  try {
    requestId=id_(p.requestId);
    const lock=LockService.getScriptLock();lock.waitLock(20000);
    try {
      const cache=CacheService.getScriptCache(),key='submit:'+requestId;
      const cached=cache.get(key);
      result=cached?JSON.parse(cached):submit_(p);
      cache.put(key,JSON.stringify(result),600);
    }finally{lock.releaseLock();}
  }catch(err){
    result={ok:false,error:String(err.message||err)};
    if(requestId)CacheService.getScriptCache().put('submit:'+requestId,JSON.stringify(result),600);
  }
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}
function doGet(e) {
  const p=e.parameter||{};let result;
  try {
    if(p.action==='status'){
      const cached=CacheService.getScriptCache().get('submit:'+id_(p.requestId));
      result=cached?JSON.parse(cached):{ok:true,pending:true,schema:2};
    }else if(p.action==='submit'){
      result={ok:false,schema:2,error:'ゲームを最新版へ更新してください。'};
    }else{
      const minutes=int_(p.minutes||3,1,10),interference=mode_(p.interference||'0');
      const lock=LockService.getScriptLock();lock.waitLock(20000);
      try {result={ok:true,schema:2,ranking:ranking_(sheets_(),minutes,interference,50)};}
      finally{lock.releaseLock();}
    }
  }catch(err){result={ok:false,error:String(err.message||err)};}
  const json=JSON.stringify(result).replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
  if(p.callback){
    if(!/^[A-Za-z_$][\w$]{0,100}$/.test(p.callback))return ContentService.createTextOutput('Invalid callback');
    return ContentService.createTextOutput(p.callback+'('+json+');').setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

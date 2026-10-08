/* Chat 2.69. Server-only Firebase writes ensure every delivered message is archived. */
const CHAT_LOG_SHEET = 'ChatLogs';
const CHAT_BLOCK_SHEET = 'ChatBlocks';
const CHAT_HEADERS = ['日付','時刻','ルーム','Firebase UID','ランキングID','名前','本文','messageId','roomSession','createdAt'];
const CHAT_BLOCK_HEADERS = ['Firebase UID','ブロック','理由','更新日時'];
const CHAT_DB = 'https://match3-battle-53092-default-rtdb.asia-southeast1.firebasedatabase.app';
const CHAT_API_KEY = 'AIzaSyD6zij-aWSCb7k8C-DrrcbBcQ0mO3bHl-M';

function chatSheets_() {
  const base = sheets_(), ss = base.ranks.getParent();
  function sheet(name, headers) {
    let s = ss.getSheetByName(name);
    if (!s) {
      s = ss.insertSheet(name); s.appendRow(headers); s.setFrozenRows(1);
      s.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#eeeeee');
    }
    if (s.getRange(1, 1, 1, headers.length).getValues()[0].join('|') !== headers.join('|')) throw new Error(name + 'の見出しが一致しません。');
    return s;
  }
  return { logs: sheet(CHAT_LOG_SHEET, CHAT_HEADERS), blocks: sheet(CHAT_BLOCK_SHEET, CHAT_BLOCK_HEADERS) };
}
function firebaseAdmin_(path, method, data) {
  const options = { method: method || 'get', headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true };
  if (data !== undefined) { options.contentType = 'application/json'; options.payload = JSON.stringify(data); }
  const result = UrlFetchApp.fetch(CHAT_DB + '/' + path + '.json', options);
  if (result.getResponseCode() < 200 || result.getResponseCode() >= 300) throw new Error('Firebase管理通信に失敗しました。管理アカウントの権限とappsscript.jsonを確認してください。');
  return JSON.parse(result.getContentText());
}
function chatUid_(token) {
  if (typeof token !== 'string' || token.length < 100 || token.length > 5000) throw new Error('認証を確認できません。再入室してください。');
  const response = UrlFetchApp.fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + CHAT_API_KEY, {
    method: 'post', contentType: 'application/json', payload: JSON.stringify({ idToken: token }), muteHttpExceptions: true
  });
  if (response.getResponseCode() !== 200) throw new Error('認証が切れています。再入室してください。');
  const user = JSON.parse(response.getContentText()).users;
  if (!user || user.length !== 1 || user[0].disabled) throw new Error('認証を確認できません。');
  const uid = String(user[0].localId || '');
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid)) throw new Error('認証IDが正しくありません。');
  return uid;
}
function chatBlocked_(blocks, uid) {
  return rows_(blocks, 4).some(r => String(r[0]) === uid && (r[1] === true || String(r[1]).toLowerCase() === 'true'));
}
function chatSend_(p, uid) {
  if (PropertiesService.getScriptProperties().getProperty('CHAT_READY') !== '1') throw new Error('チャットは準備中です。');
  const roomCode = String(p.roomCode || ''), session = String(p.session || '');
  if (!/^\d{6}$/.test(roomCode) || !/^\d{10,16}$/.test(session)) throw new Error('ルームを確認できません。');
  const text = String(p.text || '').trim();
  if (!text || Array.from(text).length > 200) throw new Error('本文は1〜200文字で入力してください。');
  const sheets = chatSheets_();
  if (chatBlocked_(sheets.blocks, uid) || firebaseAdmin_('blockedUsers/' + uid)) throw new Error('このIDはマルチ対戦の利用が制限されています。');
  const room = firebaseAdmin_('rooms/' + roomCode);
  if (!room || String(room.createdAt) !== session || !room.players || !room.players[uid] || room.players[uid].forfeited) throw new Error('このルームには参加していません。');
  if (room.status !== 'waiting' && room.status !== 'results') throw new Error('対戦中はチャットを送信できません。');
  const logs = sheets.logs;
  const found = logs.getLastRow() > 1 ? logs.getRange(2, 8, logs.getLastRow() - 1, 1).createTextFinder(id_(p.requestId)).matchEntireCell(true).findNext() : null;
  let message;
  if (found) {
    const saved = logs.getRange(found.getRow(), 1, 1, 10).getValues()[0];
    if (String(saved[3]) !== uid || String(saved[2]) !== roomCode || String(saved[8]) !== session || untext_(saved[6]) !== text) throw new Error('再送内容が一致しません。');
    message = { uid, name: untext_(saved[5]), text, session, createdAt: Number(saved[9]) };
    // Use the original millisecond timestamp kept in the delivery record when present.
    const existing = firebaseAdmin_('roomChats/' + roomCode + '/' + p.requestId);
    if (existing) message = existing;
  } else {
    const cache = CacheService.getScriptCache(), rate = 'chatRate:' + uid;
    if (cache.get(rate)) throw new Error('連続送信は少し待ってからお願いします。');
    const now = new Date(), date = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy-MM-dd');
    const time = Utilities.formatDate(now, 'Asia/Tokyo', 'HH:mm');
    const name = String(room.players[uid].name || 'Player').slice(0, 16);
    const playerId = /^[a-zA-Z0-9_-]{20,80}$/.test(String(room.players[uid].playerId || '')) ? String(room.players[uid].playerId) : '';
    const last = logs.getLastRow();
    if (last <= 1 || String(logs.getRange(last, 1).getValue()) !== date) {
      if (last > 2) { const group = logs.getRowGroup(last, 1); if (group) group.collapse(); }
      logs.appendRow([date, '', '', '', '', '', '▼ この日の発言', '', '', '']);
      logs.getRange(logs.getLastRow(), 1, 1, 10).setBackground('#eeeeee').setFontWeight('bold');
    }
    logs.appendRow([date, time, roomCode, uid, playerId, "'" + name, "'" + text, p.requestId, session, now.getTime()]);
    const row = logs.getLastRow();
    logs.getRange(row, 1, 1, 9).setNumberFormat('@');
    logs.getRange(row, 7).setWrap(true);
    const todayRows = logs.getRange(2, 1, row - 1, 8).getValues();
    let header = 2;
    for (let i = todayRows.length - 1; i >= 0; i--) {
      if (String(todayRows[i][0]) === date && !todayRows[i][3] && !todayRows[i][7]) { header = i + 2; break; }
    }
    if (row > header + 1) {
      const currentGroup = logs.getRowGroup(header + 1, 1);
      if (currentGroup) currentGroup.remove();
    }
    logs.getRange(header + 1, 1, row - header, 9).shiftRowGroupDepth(1);
    SpreadsheetApp.flush();
    cache.put(rate, '1', 3);
    message = { uid, name, text, session, createdAt: now.getTime() };
  }
  // Logging comes first. Delivery failures can be retried with the same messageId.
  firebaseAdmin_('roomChats/' + roomCode + '/' + p.requestId, 'put', message);
  return { ok: true, chatProtocol: 1, messageId: p.requestId };
}
function untext_(v) { return String(v || '').replace(/^'/, ''); }
function chatRulesSafe_(rules) {
  const ban = "!root.child('blockedUsers').child(auth.uid).exists()";
  function grantsSafe(node, forbidWrites, room) {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return true;
    return Object.keys(node).every(key => {
      const value = node[key];
      if (key === '.write' && forbidWrites) return value === false;
      if (room && (key === '.read' || key === '.write') && value !== false) {
        return typeof value === 'string' && value.includes(ban) && value.includes('auth != null');
      }
      return key[0] === '.' || grantsSafe(value, forbidWrites, room);
    });
  }
  return rules && rules['.read'] === false && rules['.write'] === false &&
    rules.rooms && !rules.rooms['.read'] && !rules.rooms['.write'] && rules.rooms.$room &&
    typeof rules.rooms.$room['.read'] === 'string' && typeof rules.rooms.$room['.write'] === 'string' &&
    grantsSafe(rules.rooms, false, true) &&
    rules.roomChats && !rules.roomChats['.write'] && rules.roomChats.$room && rules.roomChats.$room['.write'] === false &&
    grantsSafe(rules.roomChats, true, false) &&
    rules.blockedUsers && !rules.blockedUsers['.write'] && rules.blockedUsers.$uid && rules.blockedUsers.$uid['.write'] === false &&
    grantsSafe(rules.blockedUsers, true, false);
}

function setupMonpatchChat() {
  setupRankingV2();
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const s = chatSheets_();
    s.logs.setColumnWidths(1, 3, 110); s.logs.setColumnWidth(4, 230); s.logs.setColumnWidth(5, 250);
    s.logs.setColumnWidth(6, 130); s.logs.setColumnWidth(7, 360); s.logs.hideColumns(8, 3);
    s.blocks.setColumnWidth(1, 250); s.blocks.setColumnWidth(2, 110); s.blocks.setColumnWidth(3, 300); s.blocks.setColumnWidth(4, 180);
    s.blocks.getRange(2, 2, s.blocks.getMaxRows() - 1, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
    // Stop setup rather than activating chat if the owner cannot access Firebase.
    firebaseAdmin_('blockedUsers');
    const rules = firebaseAdmin_('.settings/rules').rules;
    if (!chatRulesSafe_(rules)) {
      throw new Error('先にdatabase.rules.jsonのFirebaseルールを反映してください。');
    }
    syncChatBlocks_();
    if (!ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'monpatchBlockEdit')) {
      ScriptApp.newTrigger('monpatchBlockEdit').forSpreadsheet(s.blocks.getParent()).onEdit().create();
    }
    PropertiesService.getScriptProperties().setProperty('CHAT_READY', '1');
  } finally { lock.releaseLock(); }
}
function onOpen() {
  SpreadsheetApp.getUi().createMenu('モンパッチ管理')
    .addItem('選択した発言のIDをブロック', 'blockSelectedChatPlayer')
    .addItem('ブロック一覧をFirebaseへ反映', 'syncChatBlocks').addToUi();
}
function blockSelectedChatPlayer() {
  const ss = SpreadsheetApp.getActiveSpreadsheet(), range = ss.getActiveRange();
  if (!range || range.getSheet().getName() !== CHAT_LOG_SHEET || range.getRow() < 2) throw new Error('ChatLogsで発言の行を選択してください。');
  const uid = String(range.getSheet().getRange(range.getRow(), 4).getValue());
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid)) throw new Error('発言の行を選択してください。');
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const s = chatSheets_().blocks, rows = rows_(s, 4), index = rows.findIndex(r => String(r[0]) === uid);
    const row = [uid, true, '管理者によるブロック', Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm')];
    if (index < 0) s.appendRow(row); else s.getRange(index + 2, 1, 1, 4).setValues([row]);
    SpreadsheetApp.flush(); syncChatBlocks_();
  } finally { lock.releaseLock(); }
}
function monpatchBlockEdit(e) {
  if (!e || !e.range || e.range.getSheet().getName() !== CHAT_BLOCK_SHEET || e.range.getLastRow() < 2) return;
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const sheet = e.range.getSheet();
    const now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm');
    for (let row = Math.max(2, e.range.getRow()); row <= e.range.getLastRow(); row++) {
      if (sheet.getRange(row, 1).getValue()) sheet.getRange(row, 4).setValue(now);
    }
    SpreadsheetApp.flush(); syncChatBlocks_();
  } finally { lock.releaseLock(); }
}
function syncChatBlocks() {
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try { syncChatBlocks_(); } finally { lock.releaseLock(); }
}
function syncChatBlocks_() {
  const desired = {};
  rows_(chatSheets_().blocks, 4).forEach(r => {
    const uid = String(r[0] || '');
    if (uid && !/^[A-Za-z0-9_-]{1,128}$/.test(uid)) throw new Error('ChatBlocksのFirebase UIDが正しくありません。');
    if (uid && (r[1] === true || String(r[1]).toLowerCase() === 'true')) desired[uid] = true;
  });
  const existing = firebaseAdmin_('blockedUsers') || {}, patch = {};
  Object.keys(existing).forEach(uid => { if (!desired[uid]) patch[uid] = null; });
  Object.keys(desired).forEach(uid => { patch[uid] = true; });
  if (Object.keys(patch).length) firebaseAdmin_('blockedUsers', 'patch', patch);
  // Remove blocked participants while retaining the scores of forfeited players in an ongoing match.
  const rooms = firebaseAdmin_('rooms') || {};
  Object.keys(rooms).forEach(code => {
    const room = rooms[code]; if (!room || !room.players) return;
    const changes = {}, banned = Object.keys(room.players).filter(uid => desired[uid]);
    if (!banned.length) return;
    const ongoing = room.status === 'playing' || room.status === 'countdown';
    banned.forEach(uid => {
      if (ongoing) {
        changes['players/' + uid + '/forfeited'] = true; changes['players/' + uid + '/finished'] = true;
        changes['players/' + uid + '/score'] = -1; changes['players/' + uid + '/finalScore'] = -1;
      } else changes['players/' + uid] = null;
    });
    const remaining = Object.keys(room.players).filter(uid => !desired[uid]).sort((a, b) => (Number(room.players[a].joinOrder) || 9999) - (Number(room.players[b].joinOrder) || 9999));
    if (!remaining.length) { firebaseAdmin_('rooms/' + code, 'delete'); firebaseAdmin_('roomChats/' + code, 'delete'); return; }
    if (desired[room.hostUid]) changes.hostUid = remaining[0];
    firebaseAdmin_('rooms/' + code, 'patch', changes);
  });
}

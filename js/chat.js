/* Chat async: Firebase delivery first, server-side batch archiving. */
(() => {
  'use strict';
  const box = document.getElementById('roomChat');
  const list = document.getElementById('roomChatMessages');
  const form = document.getElementById('roomChatForm');
  const input = document.getElementById('roomChatInput');
  const button = document.getElementById('roomChatSend');
  const status = document.getElementById('roomChatStatus');
  let ref = null, code = '', generation = 0, session = '', active = false;
  let blocked = false, banRef = null, sending = false, pending = null;
  let avatars = new Map();
  let visibleIds = new Set(), archivedMessages = null, queuedMessages = null, queueRef = null;
  function showPending() {
    list.querySelector('.chatPending')?.remove();
    if (!sending || !pending || visibleIds.has(pending.requestId)) return;
    const row = document.createElement('div'); row.className = 'chatMessage chatPending';
    const meta = document.createElement('div'); meta.className = 'chatMeta'; meta.textContent = '自分 ・ 送信中…';
    const text = document.createElement('div'); text.className = 'chatText'; text.textContent = pending.text;
    row.append(meta, text); list.append(row); list.scrollTop = list.scrollHeight;
  }
  function notice(text) { status.textContent = text; }
  function controls() { input.disabled = button.disabled = !active || blocked || sending; }
  async function sendRequest(payload) {
    if (payload.tried) {
      for (const path of ['chatArchiveQueue/', 'roomChats/']) {
        const saved = (await firebase.database().ref(path + payload.roomCode + '/' + payload.requestId).once('value')).val();
        if (saved && saved.uid === currentUser.uid && saved.text === payload.text && String(saved.session) === payload.session) return;
      }
    }
    payload.tried = true;
    const message = {
      uid: currentUser.uid, name: getLocalPlayerName() || 'Player',
      playerId: window.MonpatchIdentity.getId(), text: payload.text,
      session: payload.session, createdAt: firebase.database.ServerValue.TIMESTAMP
    };
    const patch = {};
    patch['chatArchiveQueue/' + payload.roomCode + '/' + payload.requestId] = message;
    patch['chatSendTimes/' + currentUser.uid] = firebase.database.ServerValue.TIMESTAMP;
    await firebase.database().ref().update(patch);
  }
  function place(destination) {
    const target = document.getElementById(destination === 'results' ? 'battleResultChat' : 'roomChatLobby');
    if (target && box.parentElement !== target) target.appendChild(box);
    const phase = document.getElementById('roomChatPhase');
    if (phase) phase.textContent = destination === 'results' ? '対戦後' : '待機中';
  }
  function render() {
    const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 55;
    const messages = [];
    visibleIds = new Set();
    const merged = new Map();
    [archivedMessages, queuedMessages].filter(Boolean).forEach(snapshot => snapshot.forEach(child => { merged.set(child.key, child); }));
    [...merged.values()].sort((a, b) => Number(a.val().createdAt) - Number(b.val().createdAt)).slice(-80).forEach(child => {
      const m = child.val();
      if (m && String(m.session) === session) {
        messages.push({ ...m, id: child.key }); visibleIds.add(child.key);
      }
    });
    list.replaceChildren();
    messages.forEach(m => {
      const row = document.createElement('div'); row.className = 'chatMessage';
      const meta = document.createElement('div'); meta.className = 'chatMeta';
      const time = new Date(Number(m.createdAt)).toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' });
      meta.textContent = `${String(m.name || 'Player')} ・ ${time}`;
      if (sending && pending?.requestId === m.id) meta.textContent += ' ・ 送信中…';
      const text = document.createElement('div'); text.className = 'chatText'; text.textContent = String(m.text || '');
      const avatar = document.createElement('div'); avatar.className = 'chatAvatar';
      const image = avatars.get(m.uid);
      if (image) {
        const img = document.createElement('img'); img.src = image; img.alt = String(m.name || 'Player') + 'のアイコン';
        avatar.append(img);
      } else avatar.textContent = Array.from(String(m.name || 'Player')).slice(0, 2).join('');
      const body = document.createElement('div'); body.className = 'chatBody'; body.append(meta, text);
      row.append(avatar, body); list.append(row);
    });
    if (!messages.length) list.textContent = 'まだ発言はありません。';
    showPending();
    if (nearBottom) list.scrollTop = list.scrollHeight;
  }
  function stop() {
    generation++; place('lobby'); avatars.clear();
    if (ref) ref.off(); if (queueRef) queueRef.off(); queueRef = null; archivedMessages = queuedMessages = null; ref = null; code = ''; session = ''; active = false;
    box.hidden = true; list.replaceChildren(); visibleIds.clear(); input.value = ''; pending = null; controls();
  }
  async function start(roomCode, room) {
    const sameRoom = code === roomCode && session === String(room.createdAt);
    if (!sameRoom) stop();
    let avatarsChanged = false;
    const participants = { ...(room.results || {}), ...(room.players || {}) };
    Object.entries(participants).forEach(([uid, player]) => {
      const raw = String(player.avatarData || '');
      const image = raw.length <= 300000 && /^data:image\/(webp|jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(raw) ? raw : '';
      if (avatars.get(uid) !== image) { avatars.set(uid, image); avatarsChanged = true; }
    });
    if (sameRoom) { if (avatarsChanged) render(); return; }
    code = roomCode; session = String(room.createdAt); box.hidden = false;
    const mine = generation;
    notice('チャットを確認しています…');
    try {
      const config = await firebase.database().ref('chatConfig/asyncEnabled').once('value');
      const info = { chatProtocol: 1, ready: config.val() === true };
      if (mine !== generation) return;
      if (info.chatProtocol !== 1 || !info.ready) { notice('チャットは準備中です。'); return; }
      if (blocked) { notice('このIDはマルチ対戦の利用が制限されています。'); return; }
      active = true; controls(); notice('1回200文字まで。発言は保存後、管理用ログへ順次記録されます。');
      ref = firebase.database().ref('roomChats/' + code).orderByChild('createdAt').limitToLast(80);
      const denied = () => {
        if (mine !== generation) return;
        active = false; controls(); notice('チャットに接続できません。再入室してください。');
      };
      ref.on('value', snap => { if (mine === generation) { archivedMessages = snap; render(); } }, denied);
      queueRef = firebase.database().ref('chatArchiveQueue/' + code).orderByChild('createdAt').limitToLast(80);
      queueRef.on('value', snap => { if (mine === generation) { queuedMessages = snap; render(); } }, denied);
    } catch (_) { if (mine === generation) notice('チャットに接続できません。再入室してください。'); }
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!active || blocked || sending || !currentUser || !code) return;
    const text = input.value.trim();
    if (!text || text.length > 200) { notice('本文は1〜200文字で入力してください。'); return; }
    const mine = generation;
    if (!pending || pending.text !== text || pending.roomCode !== code) {
      pending = { action: 'chatSend', requestId: 'c_' + crypto.randomUUID().replace(/-/g, ''), roomCode: code, session, text };
    }
    const payload = pending;
    sending = true; controls(); showPending(); notice('送信しています…');
    try {
      await sendRequest(payload);
      if (mine !== generation) return;
      input.value = ''; pending = null; notice('送信しました。'); render();
    } catch (error) { if (mine === generation) notice(String(error.code || '').includes('PERMISSION_DENIED') ? '送信が許可されませんでした。部屋への接続状態を確認してください。' : '送信できませんでした。接続を確認して再送してください。'); }
    finally { sending = false; controls(); showPending(); }
  });
  async function assertAllowed() {
    if (blocked) throw new Error('このIDはマルチ対戦の利用が制限されています。');
    let snap;
    try { snap = await firebase.database().ref('blockedUsers/' + currentUser.uid).once('value'); }
    catch (error) {
      // Older rules may not expose this new path. Room rules enforce the ban after deployment.
      if (String(error.code || '').toUpperCase().includes('PERMISSION_DENIED')) return;
      throw error;
    }
    if (snap.exists()) throw new Error('このIDはマルチ対戦の利用が制限されています。');
  }
  function watchBan(user) {
    if (banRef) banRef.off();
    banRef = firebase.database().ref('blockedUsers/' + user.uid);
    banRef.on('value', snap => {
      blocked = snap.exists(); controls();
      if (blocked && currentRoomCode) {
        try { battleGameFrame.contentWindow.eval('stopBgm();stopTimer();stopIdleWatch();gameRunning=false;pendingFinish=false;'); } catch (_) {}
        resetLobbyUI(); showMultiPage(); setMessage('このIDはマルチ対戦の利用が制限されています。');
      }
      refreshEntryButtons();
    }, () => { /* Before rules deployment the existing game remains usable. */ });
  }
  window.MonpatchChat = { start, stop, place, watchBan, assertAllowed, isBlocked: () => blocked };
})();

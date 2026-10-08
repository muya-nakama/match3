/* Chat 2.69: archive through Apps Script, receive through Firebase. */
(() => {
  'use strict';
  const API = 'https://script.google.com/macros/s/AKfycbwl5SwB31HQZNEVOv2ddbLjDtsgz-z8a7BXSfDkPXcQid9lyQb1At0cJ--Emip2BOsShw/exec';
  const box = document.getElementById('roomChat');
  const list = document.getElementById('roomChatMessages');
  const form = document.getElementById('roomChatForm');
  const input = document.getElementById('roomChatInput');
  const button = document.getElementById('roomChatSend');
  const status = document.getElementById('roomChatStatus');
  let ref = null, code = '', generation = 0, session = '', active = false;
  let blocked = false, banRef = null, sending = false, pending = null;
  function notice(text) { status.textContent = text; }
  function controls() { input.disabled = button.disabled = !active || blocked || sending; }
  function rpc(params) {
    return new Promise((resolve, reject) => {
      const callback = '__chat_' + crypto.randomUUID().replace(/-/g, '');
      const script = document.createElement('script');
      const clean = () => { clearTimeout(timer); delete window[callback]; script.remove(); };
      const timer = setTimeout(() => { clean(); reject(new Error('保存結果を確認できませんでした。')); }, 10000);
      window[callback] = data => { clean(); resolve(data); };
      script.onerror = () => { clean(); reject(new Error('チャットの通信に失敗しました。')); };
      script.src = API + '?' + new URLSearchParams({ ...params, callback, _: Date.now() });
      document.body.appendChild(script);
    });
  }
  async function sendRequest(payload) {
    const token = await currentUser.getIdToken();
    const body = new URLSearchParams({ ...payload, idToken: token });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);
    try { await fetch(API, { method: 'POST', mode: 'no-cors', credentials: 'omit', body, signal: controller.signal }); }
    finally { clearTimeout(timer); }
    const end = Date.now() + 30000;
    while (Date.now() < end) {
      const result = await rpc({ action: 'status', requestId: payload.requestId });
      if (!result.pending) {
        if (!result.ok) throw new Error(result.error || '送信できませんでした。');
        if (result.chatProtocol !== 1) throw new Error('チャットは準備中です。');
        return result;
      }
      await new Promise(resolve => setTimeout(resolve, 800));
    }
    throw new Error('保存結果を確認できませんでした。同じ本文で再送すると重複を防げます。');
  }
  function render(snapshot) {
    const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 55;
    const messages = [];
    snapshot.forEach(child => {
      const m = child.val();
      if (m && String(m.session) === session) messages.push(m);
    });
    list.replaceChildren();
    messages.forEach(m => {
      const row = document.createElement('div'); row.className = 'chatMessage';
      const meta = document.createElement('div'); meta.className = 'chatMeta';
      const time = new Date(Number(m.createdAt)).toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' });
      meta.textContent = `${String(m.name || 'Player')} ・ ${time}`;
      const text = document.createElement('div'); text.className = 'chatText'; text.textContent = String(m.text || '');
      row.append(meta, text); list.append(row);
    });
    if (!messages.length) list.textContent = 'まだ発言はありません。';
    if (nearBottom) list.scrollTop = list.scrollHeight;
  }
  function stop() {
    generation++;
    if (ref) ref.off(); ref = null; code = ''; session = ''; active = false;
    box.hidden = true; list.replaceChildren(); input.value = ''; pending = null; controls();
  }
  async function start(roomCode, room) {
    if (code === roomCode && session === String(room.createdAt)) return;
    stop(); code = roomCode; session = String(room.createdAt); box.hidden = false;
    const mine = generation;
    notice('チャットを確認しています…');
    try {
      const info = await rpc({ action: 'chatInfo' });
      if (mine !== generation) return;
      if (info.chatProtocol !== 1 || !info.ready) { notice('チャットは準備中です。'); return; }
      if (blocked) { notice('このIDはマルチ対戦の利用が制限されています。'); return; }
      active = true; controls(); notice('1回200文字まで。発言は管理用ログに保存されます。');
      ref = firebase.database().ref('roomChats/' + code).orderByChild('createdAt').limitToLast(80);
      ref.on('value', snap => { if (mine === generation) render(snap); }, () => {
        if (mine !== generation) return;
        active = false; controls(); notice('チャットに接続できません。再入室してください。');
      });
    } catch (_) { if (mine === generation) notice('チャットに接続できません。再入室してください。'); }
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!active || blocked || sending || !currentUser || !code) return;
    const text = input.value.trim();
    if (!text || Array.from(text).length > 200) { notice('本文は1〜200文字で入力してください。'); return; }
    const mine = generation;
    if (!pending || pending.text !== text || pending.roomCode !== code) {
      pending = { action: 'chatSend', requestId: 'c_' + crypto.randomUUID().replace(/-/g, ''), roomCode: code, session, text };
    }
    const payload = pending;
    sending = true; controls(); notice('発言を保存しています…');
    try {
      await sendRequest(payload);
      if (mine !== generation) return;
      input.value = ''; pending = null; notice('送信しました。');
    } catch (error) { if (mine === generation) notice(error.message || '送信に失敗しました。'); }
    finally { sending = false; controls(); }
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
  window.MonpatchChat = { start, stop, watchBan, assertAllowed, isBlocked: () => blocked };
})();

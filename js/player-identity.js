(() => {
  const key = 'match3_player_id';
  let id = '', stored = false;
  function getId() {
    if (stored) return id;
    try {
      const saved = localStorage.getItem(key);
      if (/^[a-zA-Z0-9_-]{20,80}$/.test(saved || '')) id = saved;
      if (!id) {
        const bytes = new Uint8Array(16); crypto.getRandomValues(bytes);
        id = 'p_' + Array.from(bytes, n => n.toString(16).padStart(2, '0')).join('');
      }
      localStorage.setItem(key, id); stored = true; return id;
    } catch (_) { throw new Error('ランキング用IDを保存できません。ブラウザの保存設定を確認してください。'); }
  }
  window.MonpatchIdentity = { getId };
})();

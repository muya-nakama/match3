    const PLAYER_NAME_KEY = "match3_ranking_name";
    const PLAYER_AVATAR_KEY = "match3_profile_avatar";

    function getLocalAvatar() {
      return localStorage.getItem(PLAYER_AVATAR_KEY) || "";
    }

    function setLocalAvatar(dataUrl) {
      if (dataUrl) localStorage.setItem(PLAYER_AVATAR_KEY, dataUrl);
      else localStorage.removeItem(PLAYER_AVATAR_KEY);
      syncAvatarUI();
    }

    function syncAvatarUI() {
      const dataUrl = getLocalAvatar();
      if (dataUrl) {
        battleAvatarPreview.innerHTML = `<img src="${dataUrl}" alt="プレイヤーアイコン">`;
        battleAvatarStatus.textContent = "保存済みの画像を使用します";
      } else {
        battleAvatarPreview.textContent = "未設定";
        battleAvatarStatus.textContent = "未設定時は名前の先頭2文字を表示します";
      }
    }

    function loadImageFromFile(file) {
      return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
          URL.revokeObjectURL(url);
          resolve(img);
        };
        img.onerror = () => {
          URL.revokeObjectURL(url);
          reject(new Error("画像を読み込めませんでした。"));
        };
        img.src = url;
      });
    }

    async function makeAvatarDataUrl(file) {
      if (!file || !file.type.startsWith("image/")) {
        throw new Error("画像ファイルを選択してください。");
      }

      const img = await loadImageFromFile(file);
      const side = Math.min(img.naturalWidth, img.naturalHeight);
      const sx = Math.floor((img.naturalWidth - side) / 2);
      const sy = Math.floor((img.naturalHeight - side) / 2);

      const canvas = document.createElement("canvas");
      canvas.width = 128;
      canvas.height = 128;

      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, sx, sy, side, side, 0, 0, 128, 128);

      let dataUrl = canvas.toDataURL("image/webp", 0.72);

      // 目安として約60KBを超えた場合はJPEGへ落としてさらに圧縮。
      if (dataUrl.length > 80000) {
        dataUrl = canvas.toDataURL("image/jpeg", 0.62);
      }

      if (dataUrl.length > 100000) {
        throw new Error("画像を十分に小さくできませんでした。別の画像を選んでください。");
      }

      return dataUrl;
    }



    function getLocalPlayerName() {
      return (localStorage.getItem(PLAYER_NAME_KEY) || "").trim().slice(0, 16);
    }

    function saveLocalPlayerName(name) {
      const clean = String(name || "").trim().slice(0, 16);
      if (clean) localStorage.setItem(PLAYER_NAME_KEY, clean);
      else localStorage.removeItem(PLAYER_NAME_KEY);
      return clean;
    }

    function syncBattlePlayerNameUI() {
      const saved = getLocalPlayerName();
      battlePlayerNameInput.value = saved;
      battlePlayerNameStatus.textContent = saved
        ? `保存済み: ${saved}`
        : "プレイヤーネームを入力してください";
      refreshEntryButtons();
    }

    function refreshEntryButtons() {
      const hasName = !!getLocalPlayerName();
      const authReady = !!currentUser;
      const gameReady = !!battleFrameReady;
      createRoomBtn.disabled = !(hasName && authReady && gameReady);
      joinRoomBtn.disabled = !(hasName && authReady && gameReady);
    }

    function saveBattlePlayerName() {
      const clean = saveLocalPlayerName(battlePlayerNameInput.value);
      battlePlayerNameStatus.textContent = clean
        ? `「${clean}」で保存しました`
        : "名前が未設定です";
      refreshEntryButtons();
      return clean;
    }

    function roomPlayerData(name, joinOrder) {
      return {
        name,
        avatarData: getLocalAvatar() || "",
        ready: false,
        connected: true,
        score: 0,
        joinOrder,
        joinedAt: firebase.database.ServerValue.TIMESTAMP
      };
    }

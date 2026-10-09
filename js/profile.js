    const PLAYER_NAME_KEY = "match3_ranking_name";
    const PLAYER_AVATAR_KEY = "match3_profile_avatar";

    function getLocalAvatar() {
      const value=localStorage.getItem(PLAYER_AVATAR_KEY)||"";
      return /^data:image\/(webp|jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(value)?value:"";
    }

    function setLocalAvatar(dataUrl) {
      if (dataUrl) localStorage.setItem(PLAYER_AVATAR_KEY, dataUrl);
      else localStorage.removeItem(PLAYER_AVATAR_KEY);
      syncAvatarUI();
      refreshPageProfiles();
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

    async function makeAvatarDataUrl(file) {
      return window.cropPlayerIcon(file);
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
      battlePlayerNameInput.closest(".playerNameSetup").classList.toggle("hasSavedName", !!saved);
      document.getElementById("profileNameEditor").hidden = !!saved;
      document.getElementById("profileNameEdit").hidden = !saved;
      battlePlayerNameStatus.textContent = saved
        ? saved
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
      syncBattlePlayerNameUI();
      refreshPageProfiles();
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

    document.getElementById("profileNameEdit")?.addEventListener("click", () => {
      battlePlayerNameInput.closest(".playerNameSetup").classList.remove("hasSavedName");
      document.getElementById("profileNameEditor").hidden = false;
      document.getElementById("profileNameEdit").hidden = true;
      battlePlayerNameInput.focus();
    });
    window.addEventListener("monpatch-profile-changed", () => {
      syncBattlePlayerNameUI(); syncAvatarUI(); refreshPageProfiles();
    });

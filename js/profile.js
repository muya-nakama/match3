    const profileDialog = document.getElementById("profileDialog");
    const profileButton = document.getElementById("singleProfileFloat");
    function openProfileEditor() {
      profileDialog.hidden = false;
      profileButton.setAttribute("aria-expanded", "true");
      syncBattlePlayerNameUI(); syncAvatarUI();
      battlePlayerNameInput.focus();
    }
    function closeProfileEditor() {
      profileDialog.hidden = true;
      profileButton.setAttribute("aria-expanded", "false");
      profileButton.focus();
    }
    profileButton.addEventListener("click", openProfileEditor);
    document.getElementById("profileClose").addEventListener("click", closeProfileEditor);
    profileDialog.addEventListener("click", event => { if (event.target === profileDialog) closeProfileEditor(); });
    document.addEventListener("keydown", event => {
      if (profileDialog.hidden || document.querySelector(".iconCropModal")) return;
      if (event.key === "Escape") { event.preventDefault(); closeProfileEditor(); }
      if (event.key === "Tab") {
        const items = [...profileDialog.querySelectorAll("button,input")].filter(el => !el.hidden && el.getClientRects().length && !el.disabled);
        const first=items[0], last=items[items.length-1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    });
    async function syncRoomProfile(patch) {
      if (!currentRoomCode || !currentUser || !currentRoomData?.players?.[currentUser.uid]) return;
      try {
        await firebase.database().ref(`rooms/${currentRoomCode}/players/${currentUser.uid}`).transaction(player => {
          if (!player) return;
          return {...player, ...patch};
        });
      } catch (error) {
        console.error("room profile update failed", error);
        battlePlayerNameStatus.textContent = "端末に保存しました。部屋への反映は次の入室時になります。";
      }
    }
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
      syncRoomProfile({avatarData: getLocalAvatar()});
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
      battlePlayerNameInput.closest(".playerNameSetup").classList.remove("hasSavedName");
      document.getElementById("profileNameEditor").hidden = !!saved && profileDialog.hidden;
      document.getElementById("profileNameEdit").hidden = true;
      battlePlayerNameStatus.textContent = saved
        ? saved
        : "プレイヤーネームを入力してください";
      refreshEntryButtons();
    }

    function refreshEntryButtons() {
      const hasName = !!getLocalPlayerName();
      const authReady = !!currentUser;
      const gameReady = !!battleFrameReady;
      const allowed = !window.MonpatchChat?.isBlocked();
      createRoomBtn.disabled = !(hasName && authReady && gameReady && allowed);
      joinRoomBtn.disabled = !(hasName && authReady && gameReady && allowed);
    }

    function saveBattlePlayerName() {
      const clean = saveLocalPlayerName(battlePlayerNameInput.value);
      battlePlayerNameStatus.textContent = clean
        ? `「${clean}」で保存しました`
        : "名前が未設定です";
      syncBattlePlayerNameUI();
      refreshPageProfiles();
      syncRoomProfile({name: clean || "Player"});
      return clean;
    }

    function roomPlayerData(name, joinOrder) {
      return {
        name,
        playerId: window.MonpatchIdentity.getId(),
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

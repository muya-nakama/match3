    async function start() {
      try {
        firebase.initializeApp(firebaseConfig);
        onlineStatus.textContent = "接続中…";
        onlineStatus.className = "value status warn";

        firebase.database().ref(".info/serverTimeOffset").on("value", snap => {
          serverTimeOffset = Number(snap.val()) || 0;
        });

        const credential = await firebase.auth().signInAnonymously();
        const user = credential.user;
        currentUser = user;

        onlineStatus.textContent = "オンライン";
        onlineStatus.className = "value status ok";
        uidEl.textContent = String(user.uid).slice(0, 6) + "…";

        refreshEntryButtons();
        setMessage("準備完了。名前を確認して、部屋を作るか6桁番号を入力して参加してください。");

        createRoomBtn.addEventListener("click", async () => {
          if (!getLocalPlayerName()) {
            setMessage("プレイヤーネームを保存してから部屋を作ってください。");
            return;
          }
          createRoomBtn.disabled = true;
          joinRoomBtn.disabled = true;
          setMessage("部屋を作成しています…");

          try {
            const code = await createUniqueRoom(user.uid);
            showRoom(code, "部屋を作成しました。ルームIDを共有して参加者を待ってください。");
          } catch (err) {
            console.error(err);
            setMessage("部屋作成に失敗しました: " + (err && err.message ? err.message : err));
          } finally {
            createRoomBtn.disabled = false;
            joinRoomBtn.disabled = false;
          }
        });

        joinRoomBtn.addEventListener("click", async () => {
          if (!getLocalPlayerName()) {
            setMessage("プレイヤーネームを保存してから参加してください。");
            return;
          }
          const code = joinCodeInput.value.trim();
          createRoomBtn.disabled = true;
          joinRoomBtn.disabled = true;
          setMessage("部屋へ参加しています…");

          try {
            const joinedCode = await joinRoom(code, user.uid);
            showRoom(joinedCode, "部屋 " + joinedCode + " に参加しました。");
          } catch (err) {
            console.error(err);
            setMessage("参加に失敗しました: " + (err && err.message ? err.message : err));
          } finally {
            createRoomBtn.disabled = false;
            joinRoomBtn.disabled = false;
          }
        });

        copyRoomBtn.addEventListener("click", async () => {
          if (!currentRoomCode) return;

          try {
            await copyText(currentRoomCode);
            setMessage("ルームID " + currentRoomCode + " をコピーしました。");
          } catch (err) {
            console.error(err);
            setMessage("コピーに失敗しました。ルームIDは " + currentRoomCode + " です。");
          }
        });

        shareRoomBtn?.addEventListener("click", async () => {
          if (!currentRoomCode) return;

          const shareText = `モンパッチ\nルームID: ${currentRoomCode}`;

          try {
            if (navigator.share) {
              await navigator.share({
                title: "モンパッチ",
                text: shareText
              });
            } else {
              await copyText(currentRoomCode);
              setMessage("共有機能が使えないため、ルームIDをコピーしました。");
            }
          } catch (err) {
            if (err && err.name === "AbortError") return;
            console.error(err);
            try {
              await copyText(currentRoomCode);
              setMessage("共有に失敗したため、ルームIDをコピーしました。");
            } catch (_) {
              setMessage("共有に失敗しました。");
            }
          }
        });

        leaveRoomBtn.addEventListener("click", async () => {
          if (!currentRoomCode || !currentUser) return;

          const leavingCode = currentRoomCode;
          leaveRoomBtn.disabled = true;
          readyBtn.disabled = true;
          startBattleBtn.disabled = true;
          setMessage("部屋から退出しています…");

          try {
            const result = await leaveRoom(leavingCode, currentUser.uid);
            resetLobbyUI();

            if (result.roomDeleted) {
              setMessage("退出しました。参加者が0人になったため、部屋 " + leavingCode + " は削除されました。");
            } else if (result.newHostUid) {
              setMessage("退出しました。次の入室者へホストを引き継ぎました。");
            } else {
              setMessage("部屋 " + leavingCode + " から退出しました。");
            }
          } catch (err) {
            console.error(err);
            leaveRoomBtn.disabled = false;
            setMessage("退出に失敗しました: " + (err && err.message ? err.message : err));
          }
        });

        readyBtn.addEventListener("click", async () => {
          if (!currentRoomCode || !currentRoomData || !currentUser) return;
          if (currentRoomData.status !== "waiting") return;

          const me = currentRoomData.players && currentRoomData.players[currentUser.uid];
          if (!me) return;

          try {
            await firebase.database()
              .ref("rooms/" + currentRoomCode + "/players/" + currentUser.uid + "/ready")
              .set(!me.ready);
          } catch (err) {
            console.error(err);
            setMessage("準備状態の更新に失敗しました。");
          }
        });

        startBattleBtn.addEventListener("click", async () => {
          if (!currentRoomCode || !currentRoomData || !currentUser) return;
          if (!isHost(currentRoomData)) return;
          if (currentRoomData.status !== "waiting") return;
          if (playerCount(currentRoomData) < 2 || playerCount(currentRoomData) > 6) return;
          if (!allPlayersReady(currentRoomData)) return;

          const startAt = Date.now() + serverTimeOffset + 5000;

          try {
            const roomRef = firebase.database().ref("rooms/" + currentRoomCode);
            const updates = {
              status: "countdown",
              startAt,
              attacks: null,
              results: null,
              resultAt: null
            };
            Object.keys(currentRoomData.players || {}).forEach(uid => {
              updates[`players/${uid}/score`] = 0;
              updates[`players/${uid}/finished`] = false;
              updates[`players/${uid}/returned`] = false;
              updates[`players/${uid}/finalScore`] = null;
              updates[`players/${uid}/forfeited`] = false;
              updates[`players/${uid}/disconnectedAt`] = null;
            });
            await roomRef.update(updates);
            setMessage("開始カウントダウンを送信しました。");
          } catch (err) {
            console.error(err);
            setMessage("開始処理に失敗しました。");
          }
        });

      } catch (err) {
        console.error(err);
        onlineStatus.textContent = "接続エラー";
        onlineStatus.className = "value status bad";
        setMessage("オンライン接続に失敗しました: " + (err && err.message ? err.message : err));
      }
    }

    function bindLocalControls() {
      battleAvatarInput?.addEventListener("change", async () => {
        const file = battleAvatarInput.files && battleAvatarInput.files[0];
        if (!file) return;
        battleAvatarStatus.textContent = "画像を処理しています…";
        try {
          const dataUrl = await makeAvatarDataUrl(file);
          setLocalAvatar(dataUrl);
          battleAvatarStatus.textContent = "アイコン画像を保存しました";
        } catch (err) {
          console.error(err);
          battleAvatarStatus.textContent = err?.message || "画像の処理に失敗しました";
        } finally {
          battleAvatarInput.value = "";
        }
      });
      battleAvatarRemove?.addEventListener("click", () => {
        setLocalAvatar("");
        battleAvatarStatus.textContent = "画像を解除しました";
      });
      battlePlayerNameSave?.addEventListener("click", saveBattlePlayerName);
      battlePlayerNameInput?.addEventListener("keydown", e => {
        if (e.key === "Enter") saveBattlePlayerName();
      });
      battlePlayerNameInput?.addEventListener("input", () => {
        battlePlayerNameStatus.textContent = "変更する場合は保存してください";
      });
      singleModeBtn?.addEventListener("click", enterSingleMode);
    }

    let onlineStartRequested = false;
    function startOnlineFeatures() {
      if (onlineStartRequested || window.__monpatchOnlineAllowed !== true) return;
      if (typeof firebase === "undefined") return;
      onlineStartRequested = true;
      start();
    }

    bindLocalControls();
    syncBattlePlayerNameUI();
    syncAvatarUI();
    loadBundledBattleGame();
    // Firebase匿名認証はモード選択前に全体で開始する。
    // シングル/マルチのどちらを選んでも同じ currentUser / UID を使用する。
    startOnlineFeatures();
    window.addEventListener("monpatch-online-state", startOnlineFeatures);

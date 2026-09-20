    function setGameLoadGate(state, text) {
      if (gameLoadGate) gameLoadGate.className = `gameLoadGate ${state}`.trim();
      if (gameLoadGateText) gameLoadGateText.textContent = text;
      if (gameReloadBtn) gameReloadBtn.hidden = state !== "failed";
    }

    function markGameLoadFailed(message="ゲーム本体の読み込みに失敗しました") {
      battleFrameReady = false;
      if (battleLoadTimer) clearTimeout(battleLoadTimer);
      battleLoadTimer = null;
      setGameLoadGate("failed", message);
      if (battleLoadOverlay) battleLoadOverlay.textContent = message;
      refreshEntryButtons();
    }

    function loadBundledBattleGame(isRetry=false) {
      if (!battleGameFrame) return;
      battleFrameReady = false;
      refreshEntryButtons();
      setGameLoadGate("loading", isRetry
        ? "ゲーム本体を再読み込みしています…"
        : "ゲーム本体を読み込んでいます…");
      if (battleLoadOverlay) battleLoadOverlay.textContent = "ゲームを準備しています…";
      if (battleLoadTimer) clearTimeout(battleLoadTimer);

      try {
        battleLoadAttempt++;
        const suffix = isRetry ? `?retry=${battleLoadAttempt}` : "";
        // トップ表示中から裏で読み込み、シングル開始・対戦開始時の端末差を抑える。
        battleGameFrame.src = `game.html${suffix}`;
        battleLoadTimer = setTimeout(() => {
          if (!battleFrameReady) markGameLoadFailed("ゲーム本体の読み込みが完了しませんでした");
        }, 20000);
      } catch (e) {
        console.error("game load failed", e);
        markGameLoadFailed();
      }
    }

    battleGameFrame.addEventListener("load", () => {
      let gameReady = false;
      try {
        gameReady = battleGameFrame.contentWindow?.__monpatchGameReady === true;
      } catch (e) {
        console.error("game ready check failed", e);
      }
      if (!gameReady) {
        markGameLoadFailed();
        return;
      }

      battleFrameReady = true;
      if (battleLoadTimer) clearTimeout(battleLoadTimer);
      battleLoadTimer = null;
      setGameLoadGate("ready", "ゲーム本体の準備完了");
      refreshEntryButtons();

      if (gameMode === "single") {
        configureFrameForSingleMode();
      } else if (gameMode === "battle") {
        configureFrameForBattleMode();
        injectBattleHudIntoFrame();
        if (currentRoomData) renderBattleHud(currentRoomData);
      }

      if (battleLoadOverlay) battleLoadOverlay.textContent = "ゲーム準備完了";
    });

    battleGameFrame.addEventListener("error", () => markGameLoadFailed());
    gameReloadBtn?.addEventListener("click", () => loadBundledBattleGame(true));


    function configureFrameForSingleMode() {
      try {
        const w = battleGameFrame.contentWindow;
        const d = battleGameFrame.contentDocument;
        if (!w || !d) return false;

        gameMode = "single";
        if (gameModeTitle) gameModeTitle.textContent = "モンパッチ シングル";

        // 対戦用パッチが残っている場合は元へ戻す。
        try {
          if (typeof w.__battleOriginalApplyRandomBlocker === "function") {
            w.applyRandomBlocker = w.__battleOriginalApplyRandomBlocker;
          }
          w.__battlePatched = false;
        } catch(e) {}

        // ソロ版UIを復帰
        const gameTitleBtn = d.getElementById("gameTitleBtn");
        const resultBtns = d.querySelector(".resultBtns");
        const resultRankingBox = d.getElementById("resultRankingBox");
        const resultLabel = d.querySelector(".resultLabel");

        if (gameTitleBtn) {
          const topBtn = gameTitleBtn.cloneNode(true);
          topBtn.textContent = "総合トップへ";
          topBtn.style.display = "";
          gameTitleBtn.replaceWith(topBtn);
          topBtn.addEventListener("click", (ev) => {
            ev.preventDefault();
            ev.stopImmediatePropagation();
            if (parent && typeof parent.__returnToOverallTop === "function") {
              parent.__returnToOverallTop();
            }
          });
        }
        if (resultBtns) resultBtns.style.display = "";
        if (resultRankingBox) resultRankingBox.style.display = "";
        if (resultLabel) resultLabel.textContent = "FINAL SCORE";
        const hudTools = d.querySelector(".hudTools");
        if (hudTools) hudTools.style.display = "";

        // タイトル画面へ戻した状態で開始
        try {
          w.eval(`
            stopBgm();
            stopTimer();
            stopIdleWatch();
            gameRunning=false;
            pendingFinish=false;
            resultScreen.classList.remove("show");
            titleScreen.classList.remove("hidden");
            if (typeof syncToggles==="function") syncToggles();
          `);
        } catch(e) {}

        return true;
      } catch(e) {
        console.error("single mode configure failed", e);
        return false;
      }
    }

    multiTopBackFixed?.addEventListener("click", async () => {
      await returnToOverallTop();
      multiTopBackFixed?.classList.remove("show");
      topPage?.classList.add("active");
      multiPage?.classList.remove("active");
      window.scrollTo({ top: 0, behavior: "auto" });
    });

    singleTopBackBtn?.addEventListener("click", async () => {
      await returnToOverallTop();
      singleProfileFloat?.classList.remove("show");
      singleTopBackBtn?.classList.remove("show");
      battleGameScreen?.classList.remove("singleModeView");
      topPage?.classList.add("active");
      multiPage?.classList.remove("active");
      window.scrollTo({ top: 0, behavior: "auto" });
    });

    if (multiModeBtn) {
      multiModeBtn.addEventListener("click", () => {
        multiTopBackFixed?.classList.add("show");
      });
    }

    function enterSingleMode() {
      refreshPageProfiles();
      topPage?.classList.remove("active");
      multiPage?.classList.remove("active");
      singleProfileFloat?.classList.add("show");
      singleTopBackBtn?.classList.add("show");
      multiTopBackFixed?.classList.remove("show");
      battleGameScreen?.classList.add("singleModeView");
      battleRoomMini.textContent = "SINGLE MODE";
      battleGameScreen.classList.add("show");
      battleGameScreen.setAttribute("aria-hidden", "false");
      battleLoadOverlay.classList.remove("hidden");
      battleLoadOverlay.textContent = "シングルモードを準備しています…";

      const tryOpen = () => {
        if (!battleFrameReady) {
          setTimeout(tryOpen, 120);
          return;
        }

        if (!configureFrameForSingleMode()) {
          setTimeout(tryOpen, 180);
          return;
        }

        battleLoadOverlay.classList.add("hidden");
      };

      tryOpen();
    }

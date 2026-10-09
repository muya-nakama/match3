    function playerCount(room) {
      return room && room.players ? Object.keys(room.players).length : 0;
    }

    window.__battlePlayerCount = function() {
      return playerCount(currentRoomData);
    };

    function allPlayersReady(room) {
      if (!room || !room.players) return false;
      const entries = Object.entries(room.players);
      if (entries.length < 2) return false;

      return entries.every(([uid, p]) => {
        if (uid === room.hostUid) return true;
        return !!(p && p.ready === true);
      });
    }

    async function armBattleDisconnect(code=currentRoomCode) {
      if (!code || !currentUser) return;
      const key = `${code}/${currentUser.uid}`;
      if (battleDisconnectArmedFor === key) return;

      if (battleDisconnectRef) {
        try { await battleDisconnectRef.onDisconnect().cancel(); } catch (e) {}
      }

      battleDisconnectRef = firebase.database().ref(`rooms/${code}/players/${currentUser.uid}`);
      await battleDisconnectRef.onDisconnect().update({
        forfeited: true,
        finished: true,
        score: -1,
        finalScore: -1,
        disconnectedAt: firebase.database.ServerValue.TIMESTAMP
      });
      battleDisconnectArmedFor = key;
    }

    async function cancelBattleDisconnect() {
      if (battleDisconnectRef) {
        try { await battleDisconnectRef.onDisconnect().cancel(); } catch (e) {}
      }
      battleDisconnectRef = null;
      battleDisconnectArmedFor = "";
    }

    function isHost(room) {
      return !!(room && currentUser && room.hostUid === currentUser.uid);
    }

    function displayName(name) {
      const text = String(name || "Player");
      const chars = Array.from(text);
      return chars.length <= 5 ? text : chars.slice(0, 4).join("") + "…";
    }

    function avatarText(name) {
      const chars = Array.from(String(name || "?"));
      return chars.slice(0, 2).join("");
    }

    function renderPlayers(room) {
      const players = (room && room.players) || {};
      const entries = Object.entries(players).sort((a, b) => {
        const ao = Number(a[1] && a[1].joinOrder) || Number.MAX_SAFE_INTEGER;
        const bo = Number(b[1] && b[1].joinOrder) || Number.MAX_SAFE_INTEGER;
        return ao - bo;
      });

      const readyTotal = entries.filter(([uid, p]) => uid === room.hostUid || (p && p.ready === true)).length;
      readyCount.textContent = `準備完了 ${readyTotal}/${entries.length}`;

      const slots = [];

      entries.slice(0, 6).forEach(([uid, p]) => {
        const rawName = p && p.name ? p.name : "Player";
        const shownName = displayName(rawName);
        const hostBadge = room.hostUid === uid ? '<span class="hostFlag" title="ホスト">⚑</span>' : '';
        const readyBadge = p && p.ready ? '<span class="readyCheck" title="準備完了">✓</span>' : '';
        const meLabel = currentUser && currentUser.uid === uid ? '自分' : '&nbsp;';

        slots.push(`
          <div class="playerSlot">
            <div class="avatarWrap">
              <div class="avatarCircle">${p && p.avatarData
                ? `<img src="${p.avatarData}" alt="${shownName}">`
                : avatarText(rawName)}</div>
              ${hostBadge}
              ${readyBadge}
            </div>
            <div class="playerName">${shownName}</div>
            <div class="playerMe">${meLabel}</div>
          </div>
        `);
      });

      for (let i = slots.length; i < 6; i++) {
        slots.push(`
          <div class="playerSlot">
            <div class="avatarWrap">
              <div class="avatarCircle empty">＋</div>
            </div>
            <div class="playerName">&nbsp;</div>
            <div class="playerMe">&nbsp;</div>
          </div>
        `);
      }

      playersList.innerHTML = slots.join("");
      playersBox.style.display = "block";
    }

    function updateLobbyButtons(room) {
      if (!currentUser || !room) return;

      const me = room.players && room.players[currentUser.uid];
      const waiting = room.status === "waiting";
      const total = playerCount(room);
      const readyTotal = room.players
        ? Object.entries(room.players).filter(([uid, p]) => uid === room.hostUid || (p && p.ready === true)).length
        : 0;

      leaveRoomBtn.style.display = "block";
      leaveRoomBtn.disabled = !me;
      leaveRoomBtn.textContent = "ゲーム終了";

      if (isHost(room)) {
        readyBtn.style.display = "none";

        startBattleBtn.style.display = "block";
        startBattleBtn.textContent = `開始（${readyTotal}/${total}）`;

        const canStart =
          waiting &&
          total >= 2 &&
          total <= 6 &&
          readyTotal === total;

        startBattleBtn.disabled = !canStart;
      } else {
        startBattleBtn.style.display = "none";

        readyBtn.style.display = "block";
        readyBtn.disabled = !me || !waiting;
        readyBtn.textContent = me && me.ready ? "準備解除" : "準備";
      }
    }


    function safeFrameEval(expr, fallback=null) {
      try {
        const w = battleGameFrame.contentWindow;
        if (!w) return fallback;
        return w.eval(expr);
      } catch (e) {
        return fallback;
      }
    }

    function injectBattleHudIntoFrame() {
      try {
        const d = battleGameFrame.contentDocument;
        if (!d || d.getElementById("__battleHud")) return;

        const style = d.createElement("style");
        style.id = "__battleHudStyle";
        style.textContent = `
          #__battleHud{
            width:min(100%,520px);
            margin:5px auto 2px;
            display:flex;
            gap:2px;
            justify-content:center;
            align-items:start;
            padding:3px 2px;
            box-sizing:border-box;
          }
          .__bhPlayer{
            flex:1 1 0;
            min-width:0;
            text-align:center;
            color:#fff;
            font-family:inherit;
          }
          .__bhAvatar{
            width:28px;
            height:28px;
            margin:0 auto 2px;
            border-radius:50%;
            overflow:hidden;
            display:flex;
            align-items:center;
            justify-content:center;
            background:#263444;
            border:1px solid rgba(255,255,255,.18);
            font-size:9px;
            font-weight:1000;
          }
          .__bhAvatar img{width:100%;height:100%;object-fit:cover;display:block}
          .__bhName{
            height:13px;
            line-height:13px;
            overflow:hidden;
            white-space:nowrap;
            text-overflow:ellipsis;
            font-size:8px;
            font-weight:900;
            color:#c8d4e2;
          }
          .__bhScore{
            height:14px;
            line-height:14px;
            font-size:9px;
            font-weight:1000;
            font-variant-numeric:tabular-nums;
            color:#fff;
          }
        `;
        d.head.appendChild(style);

        const hud = d.createElement("div");
        hud.id = "__battleHud";
        const boardWrap = d.querySelector(".boardWrap");
        const app = d.querySelector(".app");
        if (boardWrap && app) boardWrap.insertAdjacentElement("afterend", hud);
        else if (app) app.appendChild(hud);
      } catch (e) {
        console.error("HUD inject failed", e);
      }
    }

    function renderBattleHud(room=currentRoomData) {
      if (gameMode !== "battle") return;
      if (!room || !room.players) return;
      injectBattleHudIntoFrame();

      try {
        const hud = battleGameFrame.contentDocument.getElementById("__battleHud");
        if (!hud) return;

        const entries = Object.entries(room.players)
          .sort((a,b)=>(Number(a[1]?.joinOrder)||9999)-(Number(b[1]?.joinOrder)||9999))
          .slice(0,6);

        hud.innerHTML = entries.map(([uid,p]) => {
          const raw = p?.name || "Player";
          const name = displayName(raw);
          const avatar = p?.avatarData
            ? `<img src="${p.avatarData}" alt="">`
            : avatarText(raw);
          const sc = Number(p?.score || 0).toLocaleString("ja-JP");
          return `<div class="__bhPlayer">
            <div class="__bhAvatar">${avatar}</div>
            <div class="__bhName">${name}</div>
            <div class="__bhScore">${sc}</div>
          </div>`;
        }).join("");
      } catch (e) {
        console.error("HUD render failed", e);
      }
    }

    function pickAttackTargetUid() {
      if (!currentUser || !currentRoomData?.players) return null;
      const others = Object.entries(currentRoomData.players)
        .filter(([uid,p]) => uid !== currentUser.uid && p)
        .map(([uid]) => uid);
      if (!others.length) return null;
      return others[Math.floor(Math.random() * others.length)];
    }

    window.__battleSendAttack = async function(kind) {
      if (gameMode !== "battle" || !battleStarted || !currentRoomCode || !currentUser) return false;
      if (kind !== "ice" && kind !== "chain") return false;

      const targetUid = pickAttackTargetUid();
      if (!targetUid) return false;

      try {
        const ref = firebase.database().ref(`rooms/${currentRoomCode}/attacks`).push();
        await ref.set({
          id: ref.key,
          fromUid: currentUser.uid,
          toUid: targetUid,
          kind,
          createdAt: firebase.database.ServerValue.TIMESTAMP
        });
        return true;
      } catch (e) {
        console.error("attack send failed", e);
        return false;
      }
    };

    async function applyIncomingAttack(event) {
      if (!event || !event.kind) return false;
      const w = battleGameFrame.contentWindow;
      if (!w) return false;

      try {
        const running = !!w.eval("gameRunning");
        const busy = !!w.eval("lock");
        if (!running || busy) return false;

        if (typeof w.__battleOriginalApplyRandomBlocker !== "function") return false;
        const changed = w.__battleOriginalApplyRandomBlocker(event.kind);
        if (changed && typeof w.render === "function") w.render();
        else if (changed) w.eval("render()");
        if (changed && typeof w.playSfx === "function") w.playSfx("battleInterference");
        return true;
      } catch (e) {
        console.error("incoming attack apply failed", e);
        return false;
      }
    }

    function startAttackListener() {
      if (attackRef) attackRef.off();
      attackQueue = [];
      if (!currentRoomCode || !currentUser) return;

      attackRef = firebase.database().ref(`rooms/${currentRoomCode}/attacks`);
      attackRef.on("child_added", snap => {
        const ev = snap.val();
        if (!ev || ev.toUid !== currentUser.uid) return;
        attackQueue.push({ key:snap.key, ...ev });
      });

      if (attackFlushTimer) clearInterval(attackFlushTimer);
      attackFlushTimer = setInterval(async () => {
        if (!attackQueue.length || !battleStarted) return;

        const ev = attackQueue[0];
        const applied = await applyIncomingAttack(ev);
        if (!applied) return;

        attackQueue.shift();
        try {
          await firebase.database().ref(`rooms/${currentRoomCode}/attacks/${ev.key}`).remove();
        } catch (e) {
          console.error("attack remove failed", e);
        }
      }, 80);
    }

    function stopBattleRuntime() {
      if (scoreSyncTimer) { clearInterval(scoreSyncTimer); scoreSyncTimer = null; }
      if (battleStateTimer) { clearInterval(battleStateTimer); battleStateTimer = null; }
      if (attackFlushTimer) { clearInterval(attackFlushTimer); attackFlushTimer = null; }
      if (attackRef) { attackRef.off(); attackRef = null; }
      attackQueue = [];
    }

    async function syncOwnScore(force=false) {
      if (!battleStarted || !currentRoomCode || !currentUser) return;
      const sc = Number(safeFrameEval("score", 0)) || 0;
      if (!force && sc === lastSyncedScore) return;
      lastSyncedScore = sc;

      try {
        await firebase.database()
          .ref(`rooms/${currentRoomCode}/players/${currentUser.uid}/score`)
          .set(sc);
      } catch (e) {
        console.error("score sync failed", e);
      }
    }

    async function submitFinalScore() {
      if (finalScoreSubmitted || !currentRoomCode || !currentUser) return;
      const busy = !!safeFrameEval("lock", false);
      if (busy) return;

      finalScoreSubmitted = true;
      const sc = Number(safeFrameEval("score", 0)) || 0;
      lastSyncedScore = sc;

      try {
        await firebase.database()
          .ref(`rooms/${currentRoomCode}/players/${currentUser.uid}`)
          .update({
            score: sc,
            finalScore: sc,
            finished: true,
            returned: false
          });
      } catch (e) {
        finalScoreSubmitted = false;
        console.error("final score submit failed", e);
      }
    }

    function startScoreAndFinishWatch() {
      if (scoreSyncTimer) clearInterval(scoreSyncTimer);
      if (battleStateTimer) clearInterval(battleStateTimer);

      lastSyncedScore = -1;
      finalScoreSubmitted = false;

      scoreSyncTimer = setInterval(() => syncOwnScore(false), SCORE_SYNC_MS);

      battleStateTimer = setInterval(() => {
        if (!battleStarted || finalScoreSubmitted) return;
        const running = !!safeFrameEval("gameRunning", false);
        const busy = !!safeFrameEval("lock", false);
        const remain = Number(safeFrameEval("remainingSeconds", 0));

        if ((!running || remain <= 0) && !busy) submitFinalScore();
      }, 120);
    }

    async function maybeFinalizeResults(room) {
      if (!currentRoomCode || !room || room.status !== "playing" || !room.players) return;
      const entries = Object.entries(room.players);
      if (entries.length < 2 || !entries.every(([,p]) => p && p.finished === true)) return;

      const roomRef = firebase.database().ref(`rooms/${currentRoomCode}`);
      try {
        await roomRef.transaction(current => {
          if (!current || current.status !== "playing" || !current.players) return;
          const ps = Object.entries(current.players);
          if (ps.length < 2 || !ps.every(([,p]) => p && p.finished === true)) return;

          const sorted = ps.slice().sort((a,b) => {
            const ar = a[1]?.forfeited === true;
            const br = b[1]?.forfeited === true;
            if (ar !== br) return ar ? 1 : -1;
            const ds = Number(b[1]?.finalScore || b[1]?.score || 0) - Number(a[1]?.finalScore || a[1]?.score || 0);
            if (ds) return ds;
            return (Number(a[1]?.joinOrder)||9999) - (Number(b[1]?.joinOrder)||9999);
          });

          const results = {};
          let lastScore = null;
          let lastRank = 0;
          sorted.forEach(([uid,p], idx) => {
            const score = Number(p?.finalScore || p?.score || 0);
            const rank = (lastScore !== null && score === lastScore) ? lastRank : idx + 1;
            lastScore = score;
            lastRank = rank;
            results[uid] = {
              rank,
              score,
              forfeited: p?.forfeited === true,
              name: p?.name || "Player",
              avatarData: p?.avatarData || ""
            };
          });

          Object.values(current.players).forEach(p => {
            p.ready = false;
            p.returned = false;
          });

          current.results = results;
          current.status = "results";
          current.resultAt = Date.now() + serverTimeOffset;
          return current;
        });
      } catch (e) {
        console.error("result finalize failed", e);
      }
    }

    function showBattleResults(room) {
      if (!room?.results) return;
      resultsShownForRound = true;
      stopBattleRuntime();

      const rows = Object.entries(room.results)
        .sort((a,b)=>(Number(a[1]?.rank)||999)-(Number(b[1]?.rank)||999));

      battleResultRows.innerHTML = rows.map(([uid,r]) => {
        const raw = r?.name || "Player";
        const av = r?.avatarData
          ? `<img src="${r.avatarData}" alt="">`
          : avatarText(raw);
        return `<div class="battleResultRow">
          <div class="battleResultRank">${Number(r?.rank)||"-"}位</div>
          <div class="battleResultAvatar">${av}</div>
          <div class="battleResultName">${displayName(raw)}${uid===currentUser?.uid ? "（自分）" : ""}</div>
          <div class="battleResultScore">${r?.forfeited ? "リタイア" : Number(r?.score||0).toLocaleString("ja-JP")}</div>
        </div>`;
      }).join("");

      battleResultOverlay.classList.add("show");
      battleResultOverlay.setAttribute("aria-hidden","false");
    }

    async function returnToOverallTop() {
      // 内蔵ゲームを停止
      try {
        const w = battleGameFrame.contentWindow;
        if (w) {
          w.eval(`
            stopBgm();
            stopTimer();
            stopIdleWatch();
            gameRunning=false;
            pendingFinish=false;
          `);
        }
      } catch(e) {}

      // 対戦中/対戦結果から戻る場合は部屋から退出して総合トップへ。
      if (currentRoomCode && currentUser) {
        const leavingCode = currentRoomCode;
        try {
          await leaveRoom(leavingCode, currentUser.uid);
        } catch (e) {
          console.error("leave room on overall-top failed", e);
        }
      }

      resetLobbyUI();
      showTopPage();
      if (gameModeTitle) gameModeTitle.textContent = "モンパッチ";
      if (battleRoomMini) battleRoomMini.textContent = "ROOM ------";
      window.scrollTo({ top: 0, behavior: "auto" });
    }

    window.__returnToOverallTop = returnToOverallTop;

    battleReturnBtn.addEventListener("click", returnToOverallTop);
    function configureFrameForBattleMode() {
      try {
        const d = battleGameFrame.contentDocument;
        if (!d) return;

        gameMode = "battle";
        singleProfileFloat?.classList.remove("show");
        battleGameScreen?.classList.remove("singleModeView");
        if (gameModeTitle) gameModeTitle.textContent = "モンパッチ Battle";

        // 対戦時はソロ専用導線を隠す
        const gameTitleBtn = d.getElementById("gameTitleBtn");
        const resultBtns = d.querySelector(".resultBtns");
        const resultRankingBox = d.getElementById("resultRankingBox");
        const resultLabel = d.querySelector(".resultLabel");

        if (gameTitleBtn) gameTitleBtn.style.display = "none";
        if (resultBtns) resultBtns.style.display = "none";
        if (resultRankingBox) resultRankingBox.style.display = "none";
        if (resultLabel) resultLabel.textContent = "FINAL SCORE / 対戦結果を集計中...";
        const hudTools = d.querySelector(".hudTools");
        if (hudTools) hudTools.style.display = "none";
      } catch(e) {
        console.error("battle mode configure failed", e);
      }
    }

    async function enterBattleGame(startAt) {
      if (battleStarted) return;
      battleStarted = true;

      configureFrameForBattleMode();
      battleRoomMini.textContent = `ROOM ${currentRoomCode || "------"}`;
      battleGameScreen.classList.add("show");
      battleGameScreen.setAttribute("aria-hidden", "false");

      // ホストだけ部屋状態を playing に更新
      if (currentRoomCode && currentRoomData && isHost(currentRoomData)) {
        try {
          await firebase.database().ref("rooms/" + currentRoomCode).update({
            status: "playing",
            startedAt: startAt || firebase.database.ServerValue.TIMESTAMP
          });
        } catch (e) {
          console.error("room playing update failed", e);
        }
      }

      const startInsideFrame = () => {
        try {
          const w = battleGameFrame.contentWindow;
          if (!w) throw new Error("game frame unavailable");

          if (typeof w.startGame !== "function") {
            throw new Error("startGame がまだ利用できません");
          }

          // ソロ版の妨害生成ロジックは利用するが、
          // 自分の盤面へ置く代わりにFirebaseへ送信する。
          w.eval(`
            if (!window.__battlePatched) {
              window.__battleOriginalApplyRandomBlocker = applyRandomBlocker;
              applyRandomBlocker = function(kind) {
                try { parent.__battleSendAttack(kind); } catch(e) {}
                return false;
              };
              window.__battlePatched = true;
            }
            interferenceEnabled = true;
            syncToggles();
          `);

          injectBattleHudIntoFrame();
          w.startGame(BATTLE_MINUTES);
          renderBattleHud(currentRoomData);
          startAttackListener();
          startScoreAndFinishWatch();
          battleLoadOverlay.classList.add("hidden");
        } catch (err) {
          console.error(err);
          battleLoadOverlay.classList.remove("hidden");
          battleLoadOverlay.textContent = "ゲーム本体の準備待ち…";

          // iframe読み込みが少し遅い端末向けに再試行
          setTimeout(startInsideFrame, 300);
        }
      };

      startInsideFrame();
    }

    function runCountdown(startAt) {
      if (countdownTimer) {
        clearInterval(countdownTimer);
        countdownTimer = null;
      }

      countdownBox.classList.add("show");

      function tick() {
        const now = Date.now() + serverTimeOffset;
        const remain = startAt - now;

        if (remain <= 0) {
          countdownText.textContent = "START!";
          setMessage("START!");
          clearInterval(countdownTimer);
          countdownTimer = null;
          enterBattleGame(startAt);
          return;
        }

        const sec = Math.ceil(remain / 1000);
        countdownText.textContent = String(sec);
      }

      tick();
      countdownTimer = setInterval(tick, 100);
    }

    function stopCountdown() {
      if (countdownTimer) {
        clearInterval(countdownTimer);
        countdownTimer = null;
      }
      countdownText.textContent = "—";
      countdownBox.classList.remove("show");
    }

    function watchRoom(code) {
      if (currentRoomRef) currentRoomRef.off();

      currentRoomRef = firebase.database().ref("rooms/" + code);
      currentRoomRef.on("value", snap => {
        if (!snap.exists()) {
          currentRoomData = null;
          setMessage("この部屋は削除されました。");
          return;
        }

        const room = snap.val();
        currentRoomData = room;

        renderPlayers(room);
        updateLobbyButtons(room);
        renderBattleHud(room);

        if (room.status === "countdown" && Number(room.startAt)) {
          armBattleDisconnect(code).catch(e => console.error("disconnect guard failed", e));
          runCountdown(Number(room.startAt));
        } else if (room.status === "playing") {
          armBattleDisconnect(code).catch(e => console.error("disconnect guard failed", e));
          stopCountdown();
          enterBattleGame(Number(room.startAt) || Date.now() + serverTimeOffset);
          maybeFinalizeResults(room);
        } else if (room.status === "results") {
          stopCountdown();
          if (room.results) showBattleResults(room);
        } else if (room.status === "waiting") {
          stopCountdown();
          if (resultsShownForRound) {
            resultsShownForRound = false;
            battleResultOverlay.classList.remove("show");
            battleResultOverlay.setAttribute("aria-hidden","true");
            battleGameScreen.classList.remove("show");
            battleGameScreen.setAttribute("aria-hidden","true");
            battleStarted = false;
          }
        }
      });
    }

    function showRoom(code, message) {
      joinRoomArea?.classList.add("hiddenByRoom");
      currentRoomCode = code;
      roomCodeEl.textContent = code;
      roomBox.classList.add("show");
      readyBtn.style.display = "block";
      leaveRoomBtn.style.display = "block";
      watchRoom(code);
      setMessage(message);
    }

    async function createUniqueRoom(uid) {
      const db = firebase.database();

      for (let attempt = 0; attempt < 20; attempt++) {
        const code = randomRoomCode();
        const roomRef = db.ref("rooms/" + code);

        const result = await roomRef.transaction(current => {
          if (current !== null) return;

          return {
            createdAt: firebase.database.ServerValue.TIMESTAMP,
            status: "waiting",
            hostUid: uid,
            startAt: null,
            nextJoinOrder: 1,
            players: {
              [uid]: roomPlayerData(getLocalPlayerName() || "ゲスト", 1)
            }
          };
        });

        if (result.committed) {
          // UI版でもホストが必ず1人目として入室済みになるよう明示的に保証する。
          const hostPlayerRef = roomRef.child("players/" + uid);
          const hostSnap = await hostPlayerRef.once("value");

          if (!hostSnap.exists()) {
            await hostPlayerRef.set(roomPlayerData(getLocalPlayerName() || "ゲスト", 1));
          }

          // ホスト情報と入室順カウンタも念のため保証。
          await roomRef.update({
            hostUid: uid,
            nextJoinOrder: 1
          });

          return code;
        }
      }

      throw new Error("空いている部屋番号を作成できませんでした。");
    }

    async function joinRoom(code, uid) {
      if (!/^\d{6}$/.test(code)) {
        throw new Error("部屋番号は6桁の数字で入力してください。");
      }

      const roomRef = firebase.database().ref("rooms/" + code);

      // 1. まずサーバーから部屋を明示的に取得
      const initialSnap = await roomRef.once("value");

      if (!initialSnap.exists()) {
        throw new Error("その部屋は見つかりません。");
      }

      const initialRoom = initialSnap.val() || {};

      if (initialRoom.status !== "waiting") {
        throw new Error("その部屋は参加受付中ではありません。");
      }

      const initialPlayers = initialRoom.players || {};

      // 同じUIDですでに入室済みなら、そのまま成功扱い
      if (initialPlayers[uid]) {
        return code;
      }

      if (Object.keys(initialPlayers).length >= 6) {
        throw new Error("この部屋は6人で満員です。");
      }

      // 2. 入室順位だけを独立したtransactionで採番
      // whole-room transactionを避け、別ブラウザ初回参加時のnull誤判定を防ぐ
      const orderRef = roomRef.child("nextJoinOrder");
      const orderResult = await orderRef.transaction(current => {
        const n = Number(current);
        return Number.isFinite(n) && n >= 0 ? n + 1 : 1;
      });

      if (!orderResult.committed) {
        throw new Error("入室順位の取得に失敗しました。");
      }

      const newOrder = Number(orderResult.snapshot.val());

      // 3. 採番中に部屋が閉じられていないか再確認
      const latestSnap = await roomRef.once("value");

      if (!latestSnap.exists()) {
        throw new Error("参加処理中に部屋が閉じられました。");
      }

      const latestRoom = latestSnap.val() || {};

      if (latestRoom.status !== "waiting") {
        throw new Error("その部屋は参加受付中ではありません。");
      }

      const latestPlayers = latestRoom.players || {};

      if (latestPlayers[uid]) {
        return code;
      }

      if (Object.keys(latestPlayers).length >= 6) {
        throw new Error("この部屋は6人で満員です。");
      }

      // 4. 自分のプレイヤーデータだけを書き込む
      await roomRef.child("players/" + uid).set(
        roomPlayerData(getLocalPlayerName() || "ゲスト", newOrder)
      );

      return code;
    }

    async function leaveRoom(code, uid) {
      await cancelBattleDisconnect();
      const roomRef = firebase.database().ref("rooms/" + code);
      let roomDeleted = false;
      let newHostUid = null;
      let forfeited = false;

      const result = await roomRef.transaction(room => {
        if (room === null) {
          roomDeleted = true;
          return null;
        }

        room.players = room.players || {};

        if (!room.players[uid]) {
          return room;
        }

        if (room.status === "countdown" || room.status === "playing") {
          room.players[uid].forfeited = true;
          room.players[uid].finished = true;
          room.players[uid].score = -1;
          room.players[uid].finalScore = -1;
          room.players[uid].disconnectedAt = Date.now() + serverTimeOffset;
          forfeited = true;
          return room;
        }

        delete room.players[uid];

        const remainingEntries = Object.entries(room.players);

        if (remainingEntries.length === 0) {
          roomDeleted = true;
          return null;
        }

        if (room.hostUid === uid || !room.players[room.hostUid]) {
          remainingEntries.sort((a, b) => {
            const ao = Number(a[1] && a[1].joinOrder) || Number.MAX_SAFE_INTEGER;
            const bo = Number(b[1] && b[1].joinOrder) || Number.MAX_SAFE_INTEGER;
            return ao - bo;
          });

          newHostUid = remainingEntries[0][0];
          room.hostUid = newHostUid;
        }

        return room;
      });

      if (!result.committed && !roomDeleted) {
        throw new Error("退出処理に失敗しました。");
      }

      return { roomDeleted, newHostUid, forfeited };
    }

    function resetLobbyUI() {
      cancelBattleDisconnect();
      joinRoomArea?.classList.remove("hiddenByRoom");
      if (currentRoomRef) {
        currentRoomRef.off();
        currentRoomRef = null;
      }

      stopBattleRuntime();
      currentRoomCode = null;
      currentRoomData = null;
      battleStarted = false;
      gameMode = "launcher";
      finalScoreSubmitted = false;
      resultsShownForRound = false;
      battleResultOverlay.classList.remove("show");
      battleResultOverlay.setAttribute("aria-hidden","true");
      battleGameScreen.classList.remove("show");
      battleGameScreen.setAttribute("aria-hidden", "true");
      battleLoadOverlay.classList.remove("hidden");
      battleLoadOverlay.textContent = battleFrameReady ? "ゲーム準備完了" : "ゲームを準備しています…";

      roomCodeEl.textContent = "------";
      roomBox.classList.remove("show");

      playersList.innerHTML = "";
      readyCount.textContent = "準備完了 0/0";
      playersBox.style.display = "none";

      readyBtn.style.display = "none";
      readyBtn.disabled = true;

      startBattleBtn.style.display = "none";
      startBattleBtn.disabled = true;

      leaveRoomBtn.style.display = "none";
      leaveRoomBtn.disabled = true;

      stopCountdown();

      joinCodeInput.value = "";
      refreshEntryButtons();
    }

    async function copyText(text) {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return;
      }

      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }

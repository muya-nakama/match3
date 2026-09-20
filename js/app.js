    const firebaseConfig = {
      apiKey: "AIzaSyD6zij-aWSCb7k8C-DrrcbBcQ0mO3bHl-M",
      authDomain: "match3-battle-53092.firebaseapp.com",
      databaseURL: "https://match3-battle-53092-default-rtdb.asia-southeast1.firebasedatabase.app/",
      projectId: "match3-battle-53092",
      storageBucket: "match3-battle-53092.firebasestorage.app",
      messagingSenderId: "980764398973",
      appId: "1:980764398973:web:1db93bb561942e6fa52814"
    };
    const onlineStatus = document.getElementById("onlineStatus");
    const topPage = document.getElementById("topPage");
    const multiPage = document.getElementById("multiPage");
    const multiModeBtn = document.getElementById("multiModeBtn");
    const multiTopBackFixed = document.getElementById("multiTopBackFixed");
    const multiLobbyMount = document.getElementById("multiLobbyMount");
    const multiControlsSource = document.getElementById("multiControlsSource");
    const multiMiniProfile = document.getElementById("multiMiniProfile");
    const singleProfileFloat = document.getElementById("singleProfileFloat");
    const singleTopBackBtn = document.getElementById("singleTopBackBtn");

    function profileMarkup(){
      const name = localStorage.getItem("match3_ranking_name") || "Player";
      const av = localStorage.getItem("match3_profile_avatar") || "";
      const initials = Array.from(name).slice(0,2).join("");
      return (av
        ? `<div class="miniProfileAvatar"><img src="${av}" alt=""></div>`
        : `<div class="miniProfileAvatar">${initials}</div>`) +
        `<div class="miniProfileName">${name}</div>`;
    }
    function refreshPageProfiles(){
      const html=profileMarkup();
      if(multiMiniProfile) multiMiniProfile.innerHTML=html;
      if(singleProfileFloat) singleProfileFloat.innerHTML=html;
    }
    function showTopPage(){
      topPage?.classList.add("active");
      multiPage?.classList.remove("active");
      singleProfileFloat?.classList.remove("show");
      battleGameScreen?.classList.remove("singleModeView");
      window.scrollTo({top:0,behavior:"auto"});
    }
    function showMultiPage(){
      refreshPageProfiles();
      topPage?.classList.remove("active");
      multiPage?.classList.add("active");
      singleProfileFloat?.classList.remove("show");
      window.scrollTo({top:0,behavior:"auto"});
    }
    function prepareThreePageLayout(){
      if(multiControlsSource && multiLobbyMount){
        const connection=document.querySelector(".connectionCompact");
        if(connection) multiLobbyMount.appendChild(connection);
        while(multiControlsSource.firstChild) multiLobbyMount.appendChild(multiControlsSource.firstChild);
        multiControlsSource.remove();
      }
      refreshPageProfiles();
    }
    setTimeout(prepareThreePageLayout,0);
    multiModeBtn?.addEventListener("click", showMultiPage);
    multiTopBackFixed?.addEventListener("click", async()=>{
      if(currentRoomCode && currentUser){
        try{ await leaveRoom(currentRoomCode,currentUser.uid); }catch(e){ console.error(e); }
        resetLobbyUI();
      }
      multiTopBackFixed?.classList.remove("show");
      showTopPage();
    });
const uidEl = document.getElementById("uid");
    const battlePlayerNameInput = document.getElementById("battlePlayerNameInput");
    const battlePlayerNameSave = document.getElementById("battlePlayerNameSave");
    const battlePlayerNameStatus = document.getElementById("battlePlayerNameStatus");
    const battleAvatarInput = document.getElementById("battleAvatarInput");
    const battleAvatarPreview = document.getElementById("battleAvatarPreview");
    const battleAvatarRemove = document.getElementById("battleAvatarRemove");
    const battleAvatarStatus = document.getElementById("battleAvatarStatus");
    const singleModeBtn = document.getElementById("singleModeBtn");
    const createRoomBtn = document.getElementById("createRoomBtn");
    const joinRoomBtn = document.getElementById("joinRoomBtn");
    const joinRoomArea = document.getElementById("joinRoomArea");
    const joinCodeInput = document.getElementById("joinCodeInput");
    const roomBox = document.getElementById("roomBox");
    const roomCodeEl = document.getElementById("roomCode");
    const copyRoomBtn = document.getElementById("copyRoomBtn");
    const shareRoomBtn = document.getElementById("shareRoomBtn");
    const playersBox = document.getElementById("playersBox");
    const playersList = document.getElementById("playersList");
    const readyCount = document.getElementById("readyCount");
    const readyBtn = document.getElementById("readyBtn");
    const startBattleBtn = document.getElementById("startBattleBtn");
    const leaveRoomBtn = document.getElementById("leaveRoomBtn");
    const countdownBox = document.getElementById("countdownBox");
    const countdownText = document.getElementById("countdownText");
    const messageEl = document.getElementById("message");
    const battleGameScreen = document.getElementById("battleGameScreen");
    const battleGameFrame = document.getElementById("battleGameFrame");
    const battleLoadOverlay = document.getElementById("battleLoadOverlay");
    const gameLoadGate = document.getElementById("gameLoadGate");
    const gameLoadGateText = document.getElementById("gameLoadGateText");
    const gameReloadBtn = document.getElementById("gameReloadBtn");
    const battleRoomMini = document.getElementById("battleRoomMini");
    const gameModeTitle = document.getElementById("gameModeTitle");
    const battleResultOverlay = document.getElementById("battleResultOverlay");
    const battleResultRows = document.getElementById("battleResultRows");
    const battleReturnBtn = document.getElementById("battleReturnBtn");

    let currentUser = null;
    let currentRoomCode = null;
    let currentRoomRef = null;
    let currentRoomData = null;
    let serverTimeOffset = 0;
    let countdownTimer = null;
    let battleFrameReady = false;
    let battleLoadTimer = null;
    let battleLoadAttempt = 0;
    let battleStarted = false;
    let gameMode = "launcher"; // launcher | single | battle
    let scoreSyncTimer = null;
    let battleStateTimer = null;
    let attackFlushTimer = null;
    let attackRef = null;
    let attackQueue = [];
    let finalScoreSubmitted = false;
    let lastSyncedScore = -1;
    let resultsShownForRound = false;
    let battleDisconnectRef = null;
    let battleDisconnectArmedFor = "";
    const BATTLE_MINUTES = 3;
    const SCORE_SYNC_MS = 700;

    function setMessage(text) {
      messageEl.textContent = text;
    }

    function randomRoomCode() {
      return String(Math.floor(100000 + Math.random() * 900000));
    }

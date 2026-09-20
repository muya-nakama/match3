(() => {
  "use strict";
  const APP_VERSION = "2.62.0";
  const statusEl = document.getElementById("pwaStatus");
  const multiBtn = document.getElementById("multiModeBtn");
  const installBtn = document.getElementById("installPwaBtn");
  let deferredInstall = null;

  window.__monpatchOnlineAllowed = false;

  function notifyOnlineState() {
    window.dispatchEvent(new CustomEvent("monpatch-online-state", {
      detail: { allowed: window.__monpatchOnlineAllowed }
    }));
    if (typeof refreshEntryButtons === "function") refreshEntryButtons();
  }

  function showStatus(html, kind = "") {
    if (!statusEl) return;
    statusEl.className = `pwaStatus show ${kind}`.trim();
    statusEl.innerHTML = html;
  }

  function allowOnline() {
    window.__monpatchOnlineAllowed = true;
    if (multiBtn) multiBtn.disabled = false;
    if (statusEl) statusEl.className = "pwaStatus";
    notifyOnlineState();
  }

  function useOfflineMode() {
    window.__monpatchOnlineAllowed = false;
    if (multiBtn) multiBtn.disabled = true;
    showStatus("<strong>通信ができません。</strong><br>現在はシングルプレイのみプレイできます（ランキング対象外）。", "error");
    notifyOnlineState();
  }

  function requireUpdate() {
    window.__monpatchOnlineAllowed = false;
    if (multiBtn) multiBtn.disabled = true;
    showStatus('<strong>新しいバージョンがあります。</strong><br>更新が完了するまで、オンラインランキングとマルチ対戦は利用できません。<button id="pwaUpdateBtn" type="button">更新して再読み込み</button>', "error");
    document.getElementById("pwaUpdateBtn")?.addEventListener("click", updateAndReload);
    notifyOnlineState();
  }

  async function updateAndReload() {
    const button = document.getElementById("pwaUpdateBtn");
    if (button) { button.disabled = true; button.textContent = "更新中…"; }
    try {
      const registration = await navigator.serviceWorker.getRegistration("./");
      await registration?.update();
      const names = await caches.keys();
      await Promise.all(names.filter(name => name.startsWith("monpatch-download-")).map(name => caches.delete(name)));
      location.reload();
    } catch (error) {
      console.error(error);
      showStatus('<strong>更新に失敗しました。</strong><br>通信状態を確認して、もう一度お試しください。<button id="pwaUpdateBtn" type="button">更新して再読み込み</button>', "error");
      document.getElementById("pwaUpdateBtn")?.addEventListener("click", updateAndReload);
    }
  }

  async function verifyVersion() {
    if (!navigator.onLine) { useOfflineMode(); return; }
    try {
      const response = await fetch(`version.json?t=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`version ${response.status}`);
      const remote = await response.json();
      if (remote.version !== APP_VERSION) { requireUpdate(); return; }
      allowOnline();
    } catch (error) {
      console.warn("online verification failed", error);
      useOfflineMode();
    }
  }

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js", { scope: "./" }).catch(console.error);
  }
  window.addEventListener("online", verifyVersion);
  window.addEventListener("offline", useOfflineMode);
  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    deferredInstall = event;
    installBtn?.classList.add("show");
  });
  installBtn?.addEventListener("click", async () => {
    if (!deferredInstall) return;
    deferredInstall.prompt();
    await deferredInstall.userChoice;
    deferredInstall = null;
    installBtn.classList.remove("show");
  });
  verifyVersion();
})();

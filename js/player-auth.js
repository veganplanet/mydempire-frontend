(function () {
  "use strict";

  const PROD_API = "https://mydempire-backend-1.onrender.com";
  const LOCAL_API = "http://localhost:10000";
  const SESSION_KEY = "mde_player_session";
  const SESSION_USER_KEY = "mde_player_session_user";
  const SESSION_EXPIRY_KEY = "mde_player_session_expiry";
  const nativeFetch = window.fetch.bind(window);

  function apiBase() {
    return location.hostname === "localhost" || location.hostname === "127.0.0.1"
      ? LOCAL_API
      : PROD_API;
  }

  function clearSession() {
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_USER_KEY);
    sessionStorage.removeItem(SESSION_EXPIRY_KEY);
  }

  function token() {
    const expiresAt = Date.parse(sessionStorage.getItem(SESSION_EXPIRY_KEY) || "");
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      clearSession();
      return "";
    }
    return sessionStorage.getItem(SESSION_KEY) || "";
  }

  async function jsonRequest(path, options) {
    const response = await nativeFetch(apiBase() + path, options);
    let data = {};
    try { data = await response.json(); } catch (_) { data = {}; }
    if (!response.ok || !data.success) {
      throw new Error(data.error || "Secure login request failed.");
    }
    return data;
  }

  function signWithKeychain(username, challenge) {
    return new Promise((resolve, reject) => {
      if (!window.hive_keychain) {
        reject(new Error("Hive Keychain not installed or enabled."));
        return;
      }
      window.hive_keychain.requestSignBuffer(username, challenge, "Posting", (response) => {
        if (!response || !response.success) {
          reject(new Error(response?.message || "Login cancelled."));
          return;
        }
        const signature = typeof response.result === "string"
          ? response.result
          : response.result?.signature || response.signature || response.result?.signatures?.[0] || "";
        const normalizedSignature = String(signature).trim();
        if (!normalizedSignature) {
          reject(new Error("Hive Keychain returned an empty signature."));
          return;
        }
        resolve(normalizedSignature);
      });
    });
  }

  function showStarterWelcome(grant) {
    if (!grant || grant.granted !== true) return Promise.resolve();

    return new Promise((resolve) => {
      const old = document.getElementById("mde-starter-welcome");
      if (old) old.remove();

      const blueprint = String(grant.blueprintTier || "B1").replace("_", " ");
      const overlay = document.createElement("div");
      overlay.id = "mde-starter-welcome";
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      overlay.innerHTML = `
        <div class="mde-starter-card">
          <div class="mde-starter-crown">👑</div>
          <div class="mde-starter-kicker">WELCOME TO MYDEMPIRE</div>
          <h2>Your first empire assets are ready!</h2>
          <p class="mde-starter-intro">Start building your empire with these welcome assets.</p>
          <div class="mde-starter-rewards">
            <div><span>🌱</span><strong>1 L1 Frontier</strong></div>
            <div><span>📜</span><strong>1 ${blueprint} Blueprint</strong></div>
            <div><span>💰</span><strong>${Number(grant.empAmount || 100)} EMP</strong></div>
          </div>
          <p class="mde-starter-tip">Build your first factory, then explore MydEmpire and try an Imperial Crate.</p>
          <button type="button" class="mde-starter-button">Start Building My Empire</button>
        </div>`;

      const style = document.createElement("style");
      style.id = "mde-starter-welcome-style";
      style.textContent = `
        #mde-starter-welcome{position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(8,20,31,.78);backdrop-filter:blur(5px)}
        .mde-starter-card{width:min(470px,92vw);box-sizing:border-box;padding:30px 28px;border:1px solid rgba(244,185,66,.65);border-radius:20px;background:linear-gradient(145deg,#fffdf7,#eef8f6);box-shadow:0 24px 70px rgba(0,0,0,.35);text-align:center;color:#102a43;font-family:inherit}
        .mde-starter-crown{font-size:46px;line-height:1;margin-bottom:8px}.mde-starter-kicker{font-size:12px;font-weight:900;letter-spacing:1.8px;color:#0b7285}.mde-starter-card h2{margin:8px 0 8px;font-size:25px}.mde-starter-intro,.mde-starter-tip{color:#52606d;line-height:1.5}
        .mde-starter-rewards{display:grid;gap:9px;margin:20px 0;text-align:left}.mde-starter-rewards div{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:11px;background:#fff;border:1px solid #dce8e5}.mde-starter-rewards span{font-size:22px}
        .mde-starter-button{width:100%;margin-top:8px;padding:13px 18px;border:0;border-radius:11px;background:#0b7285;color:#fff;font-size:15px;font-weight:900;cursor:pointer;box-shadow:0 7px 18px rgba(11,114,133,.24)}.mde-starter-button:hover{background:#085f70}
      `;

      document.head.appendChild(style);
      document.body.appendChild(overlay);
      overlay.querySelector(".mde-starter-button").addEventListener("click", () => {
        overlay.remove();
        style.remove();
        resolve();
      }, { once: true });
    });
  }

  async function signIn(value) {
    const username = String(value || "").trim().replace(/^@/, "").toLowerCase();
    if (!username) throw new Error("Enter your Hive username.");
    clearSession();

    const challenge = await jsonRequest("/auth/challenge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username }),
    });
    const signature = await signWithKeychain(username, challenge.challenge);
    alert("Signature received. Verifying login...");
    const verified = await jsonRequest("/auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, challengeId: challenge.challengeId, signature }),
    });

    sessionStorage.setItem(SESSION_KEY, verified.token);
    sessionStorage.setItem(SESSION_USER_KEY, verified.username);
    sessionStorage.setItem(SESSION_EXPIRY_KEY, verified.expiresAt);
    await showStarterWelcome(verified.starterGrant);
    return verified;
  }

  function isMydEmpireApi(input) {
    try {
      const raw = input instanceof Request ? input.url : String(input);
      const url = new URL(raw, location.href);
      return url.origin === new URL(apiBase()).origin;
    } catch (_) { return false; }
  }

  window.fetch = function authenticatedFetch(input, init) {
    const sessionToken = token();
    if (!sessionToken || !isMydEmpireApi(input)) return nativeFetch(input, init);
    const options = Object.assign({}, init || {});
    const inherited = input instanceof Request && !options.headers ? input.headers : options.headers;
    const headers = new Headers(inherited || {});
    if (!headers.has("Authorization")) headers.set("Authorization", "Bearer " + sessionToken);
    options.headers = headers;
    return nativeFetch(input, options);
  };

  window.MDEAuth = Object.freeze({
    signIn,
    clearSession,
    getToken: token,
    getUsername() { return token() ? sessionStorage.getItem(SESSION_USER_KEY) || "" : ""; },
  });
})();

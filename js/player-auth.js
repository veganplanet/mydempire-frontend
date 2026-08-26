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
    try {
      data = await response.json();
    } catch (_) {
      data = {};
    }
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

      window.hive_keychain.requestSignBuffer(
        username,
        challenge,
        "Posting",
        (response) => {
          if (!response || !response.success) {
            reject(new Error(response?.message || "Login cancelled."));
            return;
          }

          const signature =
            typeof response.result === "string"
              ? response.result
              : response.result?.signature || response.signature || "";

          if (!/^[a-f0-9]{130}$/i.test(signature)) {
            reject(new Error("Hive Keychain returned an invalid signature."));
            return;
          }
          resolve(signature);
        },
      );
    });
  }

  async function signIn(value) {
    const username = String(value || "")
      .trim()
      .replace(/^@/, "")
      .toLowerCase();

    if (!username) throw new Error("Enter your Hive username.");
    clearSession();

    const challenge = await jsonRequest("/auth/challenge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username }),
    });
    const signature = await signWithKeychain(username, challenge.challenge);
    const verified = await jsonRequest("/auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username,
        challengeId: challenge.challengeId,
        signature,
      }),
    });

    sessionStorage.setItem(SESSION_KEY, verified.token);
    sessionStorage.setItem(SESSION_USER_KEY, verified.username);
    sessionStorage.setItem(SESSION_EXPIRY_KEY, verified.expiresAt);
    return verified;
  }

  function isMydEmpireApi(input) {
    try {
      const raw = input instanceof Request ? input.url : String(input);
      const url = new URL(raw, location.href);
      return url.origin === new URL(apiBase()).origin;
    } catch (_) {
      return false;
    }
  }

  window.fetch = function authenticatedFetch(input, init) {
    const sessionToken = token();
    if (!sessionToken || !isMydEmpireApi(input)) {
      return nativeFetch(input, init);
    }

    const options = Object.assign({}, init || {});
    const inherited =
      input instanceof Request && !options.headers ? input.headers : options.headers;
    const headers = new Headers(inherited || {});
    if (!headers.has("Authorization")) {
      headers.set("Authorization", "Bearer " + sessionToken);
    }
    options.headers = headers;
    return nativeFetch(input, options);
  };

  window.MDEAuth = Object.freeze({
    signIn,
    clearSession,
    getToken: token,
    getUsername() {
      return token() ? sessionStorage.getItem(SESSION_USER_KEY) || "" : "";
    },
  });
})();

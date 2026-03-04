// js/home.js
console.log("✅ home.js LOADED v1");

let username = localStorage.getItem("mde_username") || null;

function renderWalletUI() {
  const walletDisplay = document.getElementById("walletDisplay");
  const status = document.getElementById("status");

  if (username) {
    if (walletDisplay) walletDisplay.innerText = "Connected: @" + username;
    if (status) status.innerText = "✅ Connected: @" + username;

    document.querySelectorAll('[data-nav="dashboard"]').forEach((el) => {
      el.style.display = "inline-flex";
    });
  } else {
    if (walletDisplay) walletDisplay.innerText = "";
    document.querySelectorAll('[data-nav="dashboard"]').forEach((el) => {
      el.style.display = "none";
    });
  }
}

function connectWallet() {
  const status = document.getElementById("status");

  if (!window.hive_keychain) {
    alert("Hive Keychain not detected.");
    if (status) status.innerText = "❌ Hive Keychain not detected.";
    return;
  }

  // ✅ Compatible handshake
  window.hive_keychain.requestHandshake(function (resp) {
    console.log("Handshake resp:", resp);

    const detected =
      (resp && resp.username) ||
      (resp && resp.result && resp.result.username) ||
      null;

    if (!detected) {
      const user = prompt("Enter your Hive username (without @):");
      if (!user) return;
      username = user.trim().replace("@", "");
    } else {
      username = String(detected).trim().replace("@", "");
    }

    localStorage.setItem("mde_username", username);
    renderWalletUI();
  });
}

function disconnectWallet() {
  localStorage.removeItem("mde_username");
  username = null;
  renderWalletUI();
  const status = document.getElementById("status");
  if (status) status.innerText = "Disconnected.";
}

// expose for onclick buttons
window.connectWallet = connectWallet;
window.disconnectWallet = disconnectWallet;

document.addEventListener("DOMContentLoaded", () => {
  renderWalletUI();
});

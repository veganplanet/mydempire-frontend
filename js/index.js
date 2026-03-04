// js/index.js
const backend =
  window.location.hostname === "localhost"
    ? "http://localhost:10000"
    : "https://mydempire-backend-1.onrender.com";
window.backend = backend;

let username = localStorage.getItem("mde_username") || null;
function renderWalletUI() {
  const chip = document.getElementById("walletChip");
  const chipText = document.getElementById("walletChipText");
  const walletDisplay = document.getElementById("walletDisplay");

  if (username) {
    if (chip) chip.style.display = "inline-flex";
    if (chipText) chipText.textContent = "Connected: @" + username;
    if (walletDisplay) walletDisplay.innerText = "Connected: @" + username;

    document.querySelectorAll('[data-nav="dashboard"]').forEach((el) => {
      el.style.display = "inline-flex";
    });
  } else {
    if (chip) chip.style.display = "none";
    if (walletDisplay) walletDisplay.innerText = "";

    document.querySelectorAll('[data-nav="dashboard"]').forEach((el) => {
      el.style.display = "none";
    });
  }
}

function disconnectWallet() {
  localStorage.removeItem("mde_username");
  username = null;
  renderWalletUI();
  const status = document.getElementById("status");
  if (status) status.innerText = "Disconnected.";
}

async function connectWallet() {
  const status = document.getElementById("status");

  if (!window.hive_keychain) {
    alert("Hive Keychain not detected. Please install/enable it.");
    if (status) status.innerText = "❌ Hive Keychain not detected.";
    return;
  }

  // ✅ Ask Keychain for installed accounts (auto-detect)
  window.hive_keychain.requestGetAccounts(function (resp) {
    if (!resp || resp.success === false) {
      alert("Unable to read Keychain accounts. Please unlock Keychain and try again.");
      if (status) status.innerText = "❌ Please unlock Hive Keychain.";
      return;
    }

    const accounts = resp.result || [];

    if (!accounts.length) {
      alert("No accounts found in Hive Keychain. Please add your account in the extension.");
      if (status) status.innerText = "❌ No Keychain account found.";
      return;
    }

    // ✅ Use the first account (simple + common)
    username = accounts[0];

    localStorage.setItem("mde_username", username);
    renderWalletUI();

    if (status) status.innerText = "✅ Connected: @" + username;
  });
}

async function purchase() {
  try {
    if (!username) {
      alert("Connect wallet first.");
      return;
    }

    const packs = parseInt(document.getElementById("packCount").value, 10);

    if (!Number.isFinite(packs) || packs <= 0) {
      alert("Invalid pack amount.");
      return;
    }

    document.getElementById("status").innerText = "Creating order...";

    const orderRes = await fetch(`${backend}/create-order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, packs })
    });

    const orderData = await orderRes.json();

    if (!orderRes.ok) {
      showError(orderData.error || "Order creation failed.");
      return;
    }

    const orderId = orderData.order.id;
    const totalAmount = Number(orderData.order.hive_amount);

    document.getElementById("status").innerText = "Waiting for Hive transfer...";

    window.hive_keychain.requestTransfer(
      username,
      "mydempiregain",
      totalAmount.toFixed(3),
      "MydEmpire Pack Purchase",
      "HIVE",
      async function (response) {
        if (!response || !response.success) {
          showError("Transfer cancelled.");
          return;
        }

        document.getElementById("status").innerText = "Confirming payment...";

        const confirmRes = await fetch(`${backend}/confirm-payment`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderId,
            txid: response.result.id
          })
        });

        const confirmData = await confirmRes.json();

        if (!confirmRes.ok) {
          showError(confirmData.error || "Payment confirmation failed.");
          return;
        }

        document.getElementById("status").innerText =
          "✅ Purchase successful! Redirecting to dashboard...";

        setTimeout(() => {
          window.location.href = "player-dashboard.html?user=" + encodeURIComponent(username);
        }, 1200);
      }
    );

  } catch (err) {
    showError("Unexpected error occurred.");
    console.error(err);
  }
}

function showError(message) {
  document.getElementById("status").innerText = "❌ " + message;
}

document.addEventListener("DOMContentLoaded", () => {
  // Expose functions for onclick="" buttons
  window.connectWallet = connectWallet;
  window.disconnectWallet = disconnectWallet;
  window.purchase = purchase;

  renderWalletUI();
});

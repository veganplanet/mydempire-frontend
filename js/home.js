// js/home.js
console.log("✅ home.js LOADED v1");
window.SELECTED_USERNAME = window.SELECTED_USERNAME || null;
let username = localStorage.getItem("mde_username") || null;

function renderWalletUI() {
  const walletDisplay = document.getElementById("walletDisplay");
  const status = document.getElementById("status");

  if (username) {

    SELECTED_USERNAME = username; // ✅ ADD THIS

    if (walletDisplay) walletDisplay.innerText = "Connected: @" + username;
    if (status) status.innerText = "✅ Connected: @" + username;

    document.querySelectorAll('[data-nav="dashboard"]').forEach((el) => {
      el.style.display = "inline-flex";
    });

  } else {
    SELECTED_USERNAME = null; // ✅ optional (good practice)
    if (walletDisplay) walletDisplay.innerText = "";
    if (status) status.innerText = "Ready ✅";
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
// ============================
// BUY PACKS (Homepage)
// ============================



// Call this after wallet connect success
function setConnectedUser(username) {
  SELECTED_USERNAME = username;
  const status = document.getElementById("status");
  if (status) status.textContent = `Connected ✅ ${username}`;
}

// Main button function (your onclick="purchase()")
async function purchase() {
  try {
    if (!SELECTED_USERNAME) {
      alert("Please connect wallet first ✅");
      return;
    }

    const qtyEl = document.getElementById("packCount");
    const packs = parseInt(qtyEl?.value || "1", 10);

    if (!packs || packs < 1) {
      alert("Enter valid pack quantity (min 1)");
      return;
    }

    // ✅ IMPORTANT: API_BASE must be your backend URL on production
    // Example: https://YOUR-RENDER-BACKEND.onrender.com
    const API_BASE = window.API_BASE = "https://mydempire-backend-1.onrender.com";

    // 1) Create order on backend
    const orderRes = await fetch(`${API_BASE}/create-order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: SELECTED_USERNAME, packs }),
    });

    const orderData = await orderRes.json();
    if (!orderRes.ok || !orderData?.success) {
      alert(orderData?.error || "Create order failed");
      return;
    }

    // server usually returns { orderId, hive_amount, memo, to }
    const { orderId, hive_amount, memo, to } = orderData;

    // 2) Ask Hive Keychain transfer
    if (!window.hive_keychain) {
      alert("Hive Keychain not found ❌");
      return;
    }

    window.hive_keychain.requestTransfer(
      SELECTED_USERNAME,
      to || "mydempiregain",                 // fallback if backend didn't send
      `${hive_amount} HIVE`,                  // Keychain expects "X.XXX HIVE"
      memo || `MYDEMPIRE_ORDER_${orderId}`,   // fallback memo
      "HIVE",
      async function (response) {
        if (!response?.success) {
          alert("Transaction cancelled or failed ❌");
          console.error("Keychain response:", response);
          return;
        }

        // txid formats vary — handle safely
        const txid =
          response?.result?.id ||
          response?.result?.tx_id ||
          response?.result?.trx_id ||
          response?.id ||
          response?.txid;

        if (!txid) {
          alert("Transfer succeeded but txid not found. Check console.");
          console.error("Keychain response (no txid):", response);
          return;
        }

        // 3) Confirm payment on backend (mints packs)
        const confirmRes = await fetch(`${API_BASE}/confirm-payment`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId, txid }),
        });

        const confirmData = await confirmRes.json();
        if (!confirmRes.ok || !confirmData?.success) {
          alert(confirmData?.error || "Confirm payment failed ❌");
          return;
        }

        alert("✅ Packs purchased & minted successfully!");
      }
    );
  } catch (err) {
    console.error("purchase() error:", err);
    alert("Something went wrong. Check console ❌");
  }
}
// ============================
// BUY PACK FUNCTION
// ============================

async function buyPack() {

  if (!SELECTED_USERNAME) {
    alert("Please connect wallet first");
    return;
  }

  const packs = parseInt(document.getElementById("packCount").value || "1");

  console.log("Buying packs:", packs);
  console.log("User:", SELECTED_USERNAME);

  alert(`Buying ${packs} pack(s) from @${SELECTED_USERNAME}`);
}
// ✅ DEBUG: confirm home.js is updated
console.log("✅ buyPack function injected");

// ✅ GLOBAL buyPack (must be global for onclick="")
window.buyPack = function (qty) {
  console.log("✅ buyPack clicked", qty);

  if (!window.SELECTED_USERNAME && typeof SELECTED_USERNAME === "undefined") {
    alert("Please connect wallet first ✅");
    return;
  }

  // supports both patterns: SELECTED_USERNAME variable OR window.SELECTED_USERNAME
  const user = window.SELECTED_USERNAME || (typeof SELECTED_USERNAME !== "undefined" ? SELECTED_USERNAME : null);

  alert(`Buying ${qty} pack(s) for @${user}`);
};
// ✅ Make functions callable from onclick=""
window.connectWallet = window.connectWallet || async function () {
  alert("connectWallet() is not wired yet — paste your connect logic here");
};

window.buyPack = async function (qty) {
  if (!window.SELECTED_USERNAME) {
    alert("Please connect wallet first ✅");
    return;
  }
  alert(`Buying ${qty} pack(s) for @${window.SELECTED_USERNAME}`);
};

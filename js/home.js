// js/home.js
console.log("✅ home.js LOADED (clean build)");

// =====================================================
// CONFIG
// =====================================================
window.API_BASE = "https://mydempire-backend-1.onrender.com";

// Global selected user (used by buyPack)
window.SELECTED_USERNAME = window.SELECTED_USERNAME || null;

// Local state (persisted)
let username = localStorage.getItem("mde_username") || null;

// =====================================================
// UI HELPERS
// =====================================================
function setStatus(text) {
  const status = document.getElementById("status");
  if (status) status.innerText = text;
}

function renderWalletUI() {
  const walletDisplay = document.getElementById("walletDisplay");
  const connectBtn = document.getElementById("connectBtn");
  const disconnectBtn = document.getElementById("disconnectBtn");

  if (username) {
    window.SELECTED_USERNAME = username;

    if (walletDisplay) walletDisplay.innerText = `Connected: @${username}`;
    setStatus(`✅ Connected: @${username}`);

    if (connectBtn) connectBtn.style.display = "none";
    if (disconnectBtn) disconnectBtn.style.display = "inline-flex";

    // Optional: show dashboard nav items when connected
    document.querySelectorAll('[data-nav="dashboard"]').forEach((el) => {
      el.style.display = "inline-flex";
    });
  } else {
    window.SELECTED_USERNAME = null;

    if (walletDisplay) walletDisplay.innerText = "";
    setStatus("Ready ✅");

    if (connectBtn) connectBtn.style.display = "inline-flex";
    if (disconnectBtn) disconnectBtn.style.display = "none";

    document.querySelectorAll('[data-nav="dashboard"]').forEach((el) => {
      el.style.display = "none";
    });
  }
}

// =====================================================
// WALLET CONNECT / DISCONNECT
// =====================================================
function connectWallet() {
  if (!window.hive_keychain) {
    alert("Hive Keychain not detected ❌");
    setStatus("❌ Hive Keychain not detected.");
    return;
  }

  setStatus("Connecting…");

  // Handshake (response can be undefined; that's normal)
  window.hive_keychain.requestHandshake(function () {
    console.log("✅ Keychain handshake called");

    window.hive_keychain.requestGetAccounts(function (res) {
      console.log("getAccounts:", res);

      if (!res || !res.success || !res.data || !res.data.length) {
        alert("Failed to get accounts from Keychain ❌");
        setStatus("❌ Wallet connection failed.");
        return;
      }

      username = res.data[0];
      localStorage.setItem("mde_username", username);
      window.SELECTED_USERNAME = username;

      renderWalletUI();
    });
  });
}

function disconnectWallet() {
  localStorage.removeItem("mde_username");
  username = null;
  window.SELECTED_USERNAME = null;

  renderWalletUI();
  setStatus("Disconnected.");
}

// =====================================================
// BUY PACKS FLOW (create-order → keychain transfer → confirm)
// =====================================================
async function buyPack(qty) {
  try {
    const packs = parseInt(qty || "1", 10);

    console.log("🛒 buyPack clicked", {
      packs,
      user: window.SELECTED_USERNAME,
      api: window.API_BASE,
    });

    if (!window.SELECTED_USERNAME) {
      alert("Please connect wallet first ✅");
      return;
    }

    if (!packs || packs < 1) {
      alert("Invalid pack quantity ❌");
      return;
    }

    if (!window.hive_keychain) {
      alert("Hive Keychain not found ❌");
      return;
    }

    // 1) Create order on backend
    const res = await fetch(`${window.API_BASE}/create-order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: window.SELECTED_USERNAME, packs }),
    });

    console.log("📡 create-order status:", res.status);

    let data = null;
    try {
      data = await res.json();
    } catch (e) {
      console.error("create-order JSON parse failed:", e);
    }

    console.log("create-order response:", data);

    if (!res.ok || !data || !data.success) {
      alert((data && data.error) ? data.error : "Create order failed ❌");
      return;
    }

    const orderId = data.orderId;
    const to = data.to || "mydempiregain";
    const memo = data.memo || `MYDEMPIRE_ORDER_${orderId}`;
    const hive_amount = data.hive_amount;

    // ✅ Keychain amount must be "X.XXX" ONLY
    const raw = String(hive_amount);
    const clean = raw.replace(/[^\d.]/g, ""); // removes " HIVE" if present
    const num = Number(clean);

    if (!Number.isFinite(num)) {
      alert("Invalid hive amount from backend ❌");
      console.log("Bad hive_amount:", hive_amount);
      return;
    }

    const amount = num.toFixed(3);

    console.log("➡️ calling requestTransfer", { to, amount, memo, orderId });

    // 2) Keychain popup transfer
    window.hive_keychain.requestTransfer(
      window.SELECTED_USERNAME,
      to,
      amount,
      memo,
      "HIVE",
      async function (response) {
        console.log("✅ keychain response:", response);

        if (!response || !response.success) {
          alert("Transaction cancelled ❌");
          return;
        }

        const txid =
          response?.result?.id ||
          response?.result?.tx_id ||
          response?.result?.trx_id ||
          response?.id;

        if (!txid) {
          alert("Transfer done but txid missing ❌ (check console)");
          return;
        }

        // 3) Confirm payment on backend (mints packs)
        const cRes = await fetch(`${window.API_BASE}/confirm-payment`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId, txid }),
        });

        console.log("📡 confirm-payment status:", cRes.status);

        let cData = null;
        try {
          cData = await cRes.json();
        } catch (e) {
          console.error("confirm-payment JSON parse failed:", e);
        }

        console.log("confirm-payment response:", cData);

        if (!cRes.ok || !cData || !cData.success) {
          alert((cData && cData.error) ? cData.error : "Confirm payment failed ❌");
          return;
        }

        alert("✅ Packs minted successfully!");
      }
    );
  } catch (err) {
    console.error("buyPack error:", err);
    alert("Unexpected error ❌ Check console.");
  }
}

// =====================================================
// EXPOSE FOR onclick="" BUTTONS
// =====================================================
window.connectWallet = connectWallet;
window.disconnectWallet = disconnectWallet;
window.buyPack = buyPack;

// =====================================================
// INIT
// =====================================================
document.addEventListener("DOMContentLoaded", () => {
  renderWalletUI();
});

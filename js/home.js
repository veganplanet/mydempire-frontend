// js/home.js
console.log("✅ home.js LOADED (homepage wallet + buy)");

// ======================
// CONFIG
// ======================
window.API_BASE = "https://mydempire-backend-1.onrender.com";

// Global selected user (used everywhere)
window.SELECTED_USERNAME = window.SELECTED_USERNAME || null;

// Local username (persisted)
let username = localStorage.getItem("mde_username") || null;

// ======================
// UI HELPERS
// ======================
function setStatus(text) {
  const el = document.getElementById("status");
  if (el) el.innerText = text;
}

function renderWalletUI() {
  const walletDisplay = document.getElementById("walletDisplay");
  const connectBtn = document.getElementById("connectBtn");
  const walletChip = document.getElementById("walletChip");
  const walletChipText = document.getElementById("walletChipText");

  if (username) {
    window.SELECTED_USERNAME = username;

    if (walletDisplay) walletDisplay.innerText = `Connected: @${username}`;
    setStatus(`✅ Connected: @${username}`);

    if (connectBtn) connectBtn.style.display = "none";
    if (walletChip) walletChip.style.display = "inline-flex";
    if (walletChipText) walletChipText.innerText = `@${username}`;

    // show dashboard link
    document.querySelectorAll('[data-nav="dashboard"]').forEach((el) => {
      el.style.display = "inline-flex";
    });
  } else {
    window.SELECTED_USERNAME = null;

    if (walletDisplay) walletDisplay.innerText = "";
    setStatus("Ready ✅");

    if (connectBtn) connectBtn.style.display = "block";
    if (walletChip) walletChip.style.display = "none";
    if (walletChipText) walletChipText.innerText = "";

    document.querySelectorAll('[data-nav="dashboard"]').forEach((el) => {
      el.style.display = "none";
    });
  }
}

// ======================
// CONNECT / DISCONNECT
// ======================
function connectWallet() {
  if (!window.hive_keychain) {
    alert("Hive Keychain not detected ❌");
    setStatus("❌ Hive Keychain not detected.");
    return;
  }

  setStatus("Connecting…");

  window.hive_keychain.requestHandshake(function () {
    console.log("✅ Keychain handshake called");

    // If Keychain supports requestGetAccounts, use it
    if (typeof window.hive_keychain.requestGetAccounts === "function") {
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
      return;
    }

    // Fallback if requestGetAccounts not available
    const typed = prompt("Keychain connected ✅\nEnter your Hive username (without @):");
    if (!typed) {
      setStatus("❌ Wallet not selected.");
      return;
    }

    username = typed.replace("@", "").trim();
    localStorage.setItem("mde_username", username);
    window.SELECTED_USERNAME = username;
    renderWalletUI();
  });
}

function disconnectWallet() {
  localStorage.removeItem("mde_username");
  username = null;
  window.SELECTED_USERNAME = null;
  renderWalletUI();
  setStatus("Disconnected.");
}

// ======================
// BUY PACKS
// ======================
async function buyPack(qty) {
  try {
    const packs = parseInt(qty || "1", 10);

    if (!window.SELECTED_USERNAME) {
      alert("Please connect wallet first ✅");
      return;
    }
    if (!window.hive_keychain) {
      alert("Hive Keychain not found ❌");
      return;
    }
    if (!packs || packs < 1) {
      alert("Invalid pack quantity ❌");
      return;
    }

    setStatus("Creating order…");

    // 1) Create order
    const res = await fetch(`${window.API_BASE}/create-order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: window.SELECTED_USERNAME, packs }),
    });

    console.log("📡 create-order status:", res.status);

    const data = await res.json();
    console.log("create-order response:", data);

    if (!res.ok || !data?.success) {
      setStatus("❌ Create order failed.");
      alert(data?.error || "Create order failed ❌");
      return;
    }

    const { orderId, to, hive_amount, memo } = data;

    // Keychain needs amount like "3.000" (no 'HIVE' text)
    const raw = String(hive_amount);
    const clean = raw.replace(/[^\d.]/g, "");
    const num = Number(clean);

    if (!Number.isFinite(num)) {
      setStatus("❌ Invalid amount from server.");
      alert("Invalid hive amount from backend ❌");
      console.log("Bad hive_amount:", hive_amount);
      return;
    }

    const amount = num.toFixed(3);
    setStatus("Waiting for Keychain approval…");

    // 2) Keychain transfer
    window.hive_keychain.requestTransfer(
      window.SELECTED_USERNAME,
      to || "mydempiregain",
      amount,
      memo || `MYDEMPIRE_ORDER_${orderId}`,
      "HIVE",
      async function (response) {
        console.log("🧾 Keychain response:", response);

        if (!response || !response.success) {
          const msg = response?.message || response?.error || "Transaction cancelled";
          setStatus("❌ " + msg);
          alert("❌ " + msg);
          return;
        }

        const txid =
          response?.result?.id ||
          response?.result?.tx_id ||
          response?.result?.trx_id ||
          response?.id;

        if (!txid) {
          setStatus("❌ txid missing.");
          alert("Transfer done but txid missing ❌ (check console)");
          return;
        }

        setStatus("Confirming payment…");

        // 3) Confirm payment
        const cRes = await fetch(`${window.API_BASE}/confirm-payment`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId, txid }),
        });

        console.log("📡 confirm-payment status:", cRes.status);

        const cData = await cRes.json();
        console.log("confirm-payment response:", cData);

        if (!cRes.ok || !cData?.success) {
          setStatus("❌ Confirm payment failed.");
          alert(cData?.error || "Confirm payment failed ❌");
          return;
        }

        setStatus("✅ Packs minted successfully!");
        alert("✅ Packs minted successfully!");
      }
    );
  } catch (err) {
    console.error("buyPack error:", err);
    setStatus("❌ Unexpected error.");
    alert("Unexpected error ❌ Check console.");
  }
}

// ======================
// EXPOSE FOR onclick=""
// ======================
window.connectWallet = connectWallet;
window.disconnectWallet = disconnectWallet;
window.buyPack = buyPack;

// ======================
// INIT
// ======================
document.addEventListener("DOMContentLoaded", () => {
  renderWalletUI();
});

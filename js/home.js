// js/home.js
console.log("✅ home.js LOADED v1");
window.SELECTED_USERNAME = window.SELECTED_USERNAME || null;
let username = localStorage.getItem("mde_username") || null;

function renderWalletUI() {
  const walletDisplay = document.getElementById("walletDisplay");
  const status = document.getElementById("status");

  if (username) {

    window.SELECTED_USERNAME = username;

    if (walletDisplay) walletDisplay.innerText = "Connected: @" + username;
    if (status) status.innerText = "✅ Connected: @" + username;

    document.querySelectorAll('[data-nav="dashboard"]').forEach((el) => {
      el.style.display = "inline-flex";
    });

  } else {
    window.SELECTED_USERNAME = null;
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

  if (status) status.innerText = "Connecting…";

  // Handshake (resp can be undefined, that's OK)
  window.hive_keychain.requestHandshake(function () {
    console.log("✅ Keychain handshake called");

    // Now actually get the account
    window.hive_keychain.requestGetAccounts(function (res) {
      console.log("getAccounts:", res);

      if (!res || !res.success || !res.data || !res.data.length) {
        alert("Failed to get accounts from Keychain ❌");
        if (status) status.innerText = "❌ Wallet connection failed.";
        return;
      }

      // Pick first account
      username = res.data[0];

      // Save + set global (important for buyPack)
      localStorage.setItem("mde_username", username);
      window.SELECTED_USERNAME = username;

      renderWalletUI();
    });
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
    window.API_BASE = "https://mydempire-backend-1.onrender.com";

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

// ✅ Make functions callable from onclick=""
window.connectWallet = window.connectWallet || async function () {
  alert("connectWallet() is not wired yet — paste your connect logic here");
};

window.API_BASE = "https://mydempire-backend-1.onrender.com";

window.buyPack = async function (qty) {
  try {
    const packs = parseInt(qty || "1", 10);

    if (!window.SELECTED_USERNAME) return alert("Please connect wallet first ✅");
    if (!window.hive_keychain) return alert("Hive Keychain not found ❌");
    if (!packs || packs < 1) return alert("Invalid pack quantity ❌");

    // 1) Create order
    const res = await fetch(`${window.API_BASE}/create-order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: window.SELECTED_USERNAME, packs }),
    });

    const data = await res.json();
    console.log("create-order:", data);

    if (!res.ok || !data?.success) {
      alert(data?.error || "Create order failed ❌");
      return;
    }

    const { orderId, to, hive_amount, memo } = data;

    // ✅ Keychain needs "X.XXX" only (no currency text)
    const amount = Number(hive_amount).toFixed(3);

    // 2) Keychain popup
    window.hive_keychain.requestTransfer(
      window.SELECTED_USERNAME,
      to || "mydempiregain",
      amount,
      memo || `MYDEMPIRE_ORDER_${orderId}`,
      "HIVE",
      async (response) => {
        console.log("keychain response:", response);

        if (!response?.success) return alert("Transaction cancelled ❌");

        const txid = response?.result?.id || response?.id;
        if (!txid) return alert("txid missing ❌");

        // 3) Confirm payment (mint)
        const cRes = await fetch(`${window.API_BASE}/confirm-payment`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId, txid }),
        });

        const cData = await cRes.json();
        console.log("confirm-payment:", cData);

        if (!cRes.ok || !cData?.success) {
          alert(cData?.error || "Confirm payment failed ❌");
          return;
        }

        alert("✅ Packs minted successfully!");
      }
    );
  } catch (e) {
    console.error("buyPack error:", e);
    alert("Unexpected error ❌ Check console");
  }
};

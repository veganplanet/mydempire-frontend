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

function updateDashboardLinks() {
  const dashboardLinks = document.querySelectorAll('[data-nav="dashboard"]');

  dashboardLinks.forEach((el) => {
    if (username) {
      el.href = `player-dashboard.html?user=${encodeURIComponent(username)}`;
      el.style.display = "inline-flex";
    } else {
      el.href = "player-dashboard.html";
      el.style.display = "none";
    }
  });
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
  } else {
    window.SELECTED_USERNAME = null;

    if (walletDisplay) walletDisplay.innerText = "";
    setStatus("Ready ✅");

    if (connectBtn) connectBtn.style.display = "block";
    if (walletChip) walletChip.style.display = "none";
    if (walletChipText) walletChipText.innerText = "";
  }

  updateDashboardLinks();
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

    // Best case: Keychain returns accounts automatically
    if (typeof window.hive_keychain.requestGetAccounts === "function") {
      window.hive_keychain.requestGetAccounts(function (res) {
        console.log("getAccounts:", res);

        const accounts = res?.data || res?.accounts || [];
        if (!res || !res.success || !accounts.length) {
          alert("Keychain did not return accounts ❌");
          setStatus("❌ Wallet connection failed.");
          return;
        }

        username = String(accounts[0]).replace("@", "").trim().toLowerCase();
        localStorage.setItem("mde_username", username);
        localStorage.setItem("hiveUsername", username);
        window.SELECTED_USERNAME = username;

        renderWalletUI();
setTimeout(() => {
  location.reload();
}, 150);
      });
      return;
    }

    // Fallback: prompt username + Keychain signature
    const typed = prompt("Enter your Hive username (without @):");
    if (!typed) {
      setStatus("❌ Wallet not selected.");
      return;
    }

    const u = typed.replace("@", "").trim().toLowerCase();

    if (typeof window.hive_keychain.requestSignBuffer !== "function") {
      alert("Your Keychain version cannot sign messages. Please update Keychain ❌");
      setStatus("❌ Keychain update needed.");
      return;
    }

    const nonce = Math.random().toString(36).slice(2);
    const challenge = `MYDEMPIRE_CONNECT:${u}:${Date.now()}:${nonce}`;

    setStatus("Approve Keychain signature…");

    window.hive_keychain.requestSignBuffer(
      u,
      challenge,
      "Posting",
      function (resp) {
        console.log("signBuffer resp:", resp);

        if (!resp || !resp.success) {
          const msg = resp?.message || resp?.error || "Signature rejected/cancelled";
          alert("❌ " + msg);
          setStatus("❌ Connection cancelled.");
          return;
        }

        username = u;
        localStorage.setItem("mde_username", username);
        localStorage.setItem("hiveUsername", username);
        window.SELECTED_USERNAME = username;

        renderWalletUI();
setTimeout(() => {
  location.reload();
}, 150);
      }
    );
  });
}

function disconnectWallet() {
  localStorage.removeItem("mde_username");
  localStorage.removeItem("hiveUsername");
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

   const window.SELECTED_USERNAME =
  activeUser ||
  localStorage.getItem("mde_username") ||
  localStorage.getItem("hiveUsername");

if (!activeUser) {
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
      body: JSON.stringify({
        username: activeUser,
        packs
      }),
    });

    console.log("📡 create-order status:", res.status);

    const data = await res.json();
    console.log("create-order response:", data);

    if (!res.ok || !data?.success || !data?.order) {
      setStatus("❌ Create order failed.");
      alert(data?.error || "Create order failed ❌");
      return;
    }

    // ✅ Correctly read nested order
    const order = data.order;
    const orderId = order.id;
    const hiveAmountRaw = order.hive_amount;

    const num = Number(hiveAmountRaw);
    if (!Number.isFinite(num) || num <= 0) {
      setStatus("❌ Invalid amount from server.");
      alert("Invalid hive amount from backend ❌");
      console.log("Bad hive_amount:", hiveAmountRaw);
      return;
    }

    const amount = num.toFixed(3);
    const to = "mydempiregain";
    const memo = `MYDEMPIRE_ORDER_${orderId}`;

    console.log("Parsed order:", order);
    console.log("amount:", amount);
    console.log("memo:", memo);

    setStatus("Waiting for Keychain approval…");

    // 2) Keychain transfer
    window.hive_keychain.requestTransfer(
      activeUser,
      to,
      amount,
      memo,
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

        updateDashboardLinks();
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

// ============================
// BUY PACK
// ============================

async function buyPack(qty) {

  const username = localStorage.getItem("mde_username");

  if (!username) {
    alert("Please connect wallet first.");
    return;
  }

  const packs = parseInt(qty || "1", 10);

  if (!packs || packs < 1) {
    alert("Invalid pack quantity.");
    return;
  }

  if (!window.hive_keychain) {
    alert("Hive Keychain not found.");
    return;
  }

  try {
    const statusEl = document.getElementById("status");
    if (statusEl) statusEl.textContent = "Creating order...";

    // STEP 1 — create order (this is where wallet cap is enforced)
    const orderRes = await fetch(
      "https://mydempire-backend-1.onrender.com/create-order",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          username: username,
          packs: packs
        })
      }
    );

    const created = await orderRes.json();
    console.log("create-order:", created);

    if (!orderRes.ok || !created.success || !created.order) {
      alert(created.error || "Create order failed.");
      if (statusEl) statusEl.textContent = created.error || "Create order failed.";
      return;
    }

    const order = created.order;
    const orderId = order.id;
    const amount = Number(order.hive_amount).toFixed(3);
    const memo = `MYDEMPIRE_ORDER_${orderId}`;
    const to = "mydempiregain";

    if (statusEl) statusEl.textContent = "Waiting for Keychain approval...";

    // STEP 2 — transfer
    window.hive_keychain.requestTransfer(
      username,
      to,
      amount,
      memo,
      "HIVE",
      async function (response) {
        console.log("keychain response:", response);

        if (!response || !response.success) {
          alert("Transaction cancelled.");
          if (statusEl) statusEl.textContent = "Transaction cancelled.";
          return;
        }

        const txid =
          response?.result?.id ||
          response?.result?.tx_id ||
          response?.result?.trx_id ||
          response?.id;

        if (!txid) {
          alert("Transaction completed but txid missing.");
          if (statusEl) statusEl.textContent = "txid missing.";
          return;
        }

        if (statusEl) statusEl.textContent = "Confirming payment...";

        // STEP 3 — confirm payment
        const confirmRes = await fetch(
          "https://mydempire-backend-1.onrender.com/confirm-payment",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              orderId: orderId,
              txid: txid
            })
          }
        );

        const confirmed = await confirmRes.json();
        console.log("confirm-payment:", confirmed);

        if (!confirmRes.ok || !confirmed.success) {
          alert(confirmed.error || "Payment confirmation failed.");
          if (statusEl) statusEl.textContent = confirmed.error || "Payment confirmation failed.";
          return;
        }

        if (statusEl) statusEl.textContent = "✅ Packs minted successfully!";
        alert("✅ Packs minted successfully!");
      }
    );

  } catch (err) {
    console.error("buyPack error:", err);
    alert("Unexpected error.");
    const statusEl = document.getElementById("status");
    if (statusEl) statusEl.textContent = "Unexpected error.";
  }
}

// expose for onclick in index.html
window.buyPack = buyPack;

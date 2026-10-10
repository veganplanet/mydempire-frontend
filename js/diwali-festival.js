
const DIWALI_LOCAL_API = "http://localhost:10000";
const DIWALI_PROD_API = "https://mydempire-backend-1.onrender.com";
const DIWALI_API_BASE =
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1"
    ? DIWALI_LOCAL_API
    : DIWALI_PROD_API;

let diwaliEvent = null;
let diwaliPlayer = null;
let selectedDiwaliGoods = new Set();
let diwaliCountdownTimer = null;

function getDiwaliUsername() {
  const authUsername =
    window.MDEAuth && typeof window.MDEAuth.getUsername === "function"
      ? window.MDEAuth.getUsername()
      : "";

  return String(
    authUsername ||
      localStorage.getItem("hiveUsername") ||
      localStorage.getItem("mde_username") ||
      localStorage.getItem("username") ||
      "",
  )
    .replace(/^@/, "")
    .trim()
    .toLowerCase();
}

function diwaliHeaders() {
  const username = getDiwaliUsername();
  return {
    "Content-Type": "application/json",
    "x-mde-actor": username,
  };
}

function escapeDiwaliHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setDiwaliText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function showDiwaliStatus(id, value) {
  setDiwaliText(id, value || "");
}

function formatDiwaliDate(value, withYear = true) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: withYear ? "numeric" : undefined,
    timeZone: "UTC",
  }).format(date);
}

function formatDiwaliDateRange(event) {
  if (!event) return "1–7 Nov 2026";
  return (
    formatDiwaliDate(event.starts_at, true) +
    " – " +
    formatDiwaliDate(new Date(new Date(event.ends_at).getTime() - 1), true)
  );
}

function diwaliStatusLabel(status) {
  if (status === "LIVE") return "🟢 LIVE";
  if (status === "ENDED") return "🔴 ENDED";
  return "🟡 UPCOMING";
}

function formatDiwaliCountdown(milliseconds) {
  const safe = Math.max(0, Number(milliseconds || 0));
  const totalSeconds = Math.floor(safe / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) {
    return (
      String(days).padStart(2, "0") +
      "d " +
      String(hours).padStart(2, "0") +
      "h " +
      String(minutes).padStart(2, "0") +
      "m"
    );
  }

  return (
    String(hours).padStart(2, "0") +
    ":" +
    String(minutes).padStart(2, "0") +
    ":" +
    String(seconds).padStart(2, "0")
  );
}

async function fetchDiwaliJson(path, options = {}) {
  const response = await fetch(DIWALI_API_BASE + path, {
    cache: "no-store",
    ...options,
  });
  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.error || "Diwali Festival request failed.");
  }

  return data;
}

function startDiwaliCountdown(event) {
  clearInterval(diwaliCountdownTimer);

  if (!event) return;

  const label = document.getElementById("diwali-countdown-label");
  const value = document.getElementById("diwali-countdown");
  const note = document.getElementById("diwali-countdown-note");

  function update() {
    const status = event.status;
    let target = null;
    let labelText = "Festival clock";
    let noteText = "All times are shown in UTC.";

    if (status === "UPCOMING") {
      target = new Date(event.starts_at).getTime();
      labelText = "Festival begins in";
      noteText = "The first Daily Diwali Basket opens at 00:00 UTC on 1 Nov 2026.";
    } else if (status === "LIVE" && event.next_draw_at) {
      target = new Date(event.next_draw_at).getTime();
      labelText = "Next draw in";
      noteText = "Daily winners are selected automatically at 00:00 UTC.";
    } else {
      labelText = "Festival complete";
      noteText = "Thank you for celebrating Diwali with MydEmpire.";
    }

    if (label) label.textContent = labelText;
    if (note) note.textContent = noteText;

    if (!target) {
      if (value) value.textContent = "✨";
      return;
    }

    const remaining = target - Date.now();
    if (value) value.textContent = formatDiwaliCountdown(remaining);
  }

  update();
  diwaliCountdownTimer = setInterval(update, 1000);
}

function renderDiwaliEvent(event) {
  diwaliEvent = event;
  setDiwaliText("diwali-event-status", diwaliStatusLabel(event.status));
  setDiwaliText("diwali-event-dates", formatDiwaliDateRange(event));
  startDiwaliCountdown(event);
  renderDiwaliDays(event.days || []);
  renderDiwaliBasket();
}

function renderDiwaliDays(days) {
  const container = document.getElementById("diwali-days-grid");
  if (!container) return;

  const today = new Date().toISOString().slice(0, 10);
  container.innerHTML = (days || [])
    .map((day) => {
      const isToday = day.event_date === today && diwaliEvent?.status === "LIVE";
      const nftWinner = day.nft_winner
        ? "@" + escapeDiwaliHtml(day.nft_winner)
        : day.nft_status === "NO_PARTICIPANTS"
          ? "No entries"
          : day.nft_status === "NOT_DRAWN"
            ? "Draw at 00:00 UTC"
            : "Processing";
      const hiveWinner = day.hive_winner
        ? "@" + escapeDiwaliHtml(day.hive_winner)
        : day.hive_status === "NO_ELIGIBLE"
          ? "Needs another player"
          : day.hive_status === "NOT_DRAWN"
            ? "Draw at 00:00 UTC"
            : "Processing";

      return (
        '<article class="diwali-day-card' +
        (isToday ? " live" : "") +
        '">' +
        '<div class="diwali-day-top"><span>Day ' +
        escapeDiwaliHtml(day.day) +
        '</span><span>' +
        escapeDiwaliHtml(formatDiwaliDate(day.event_date, false)) +
        "</span></div>" +
        "<h3>" +
        (isToday ? "Today’s draw" : "Daily draw") +
        "</h3>" +
        '<div class="diwali-winner-line"><span>🪔 NFT</span><strong>' +
        nftWinner +
        "</strong></div>" +
        '<div class="diwali-winner-line"><span>💰 15 HIVE</span><strong>' +
        hiveWinner +
        "</strong></div>" +
        '<div class="diwali-winner-line"><span>Entries</span><strong>' +
        escapeDiwaliHtml(day.participants || 0) +
        "</strong></div>" +
        "</article>"
      );
    })
    .join("");
}

function renderDiwaliPlayer() {
  const username = getDiwaliUsername();
  const loginNote = document.getElementById("diwali-login-note");
  const playerApp = document.getElementById("diwali-player-app");

  if (!username || !diwaliPlayer) {
    if (loginNote) {
      loginNote.classList.remove("hidden");
      loginNote.textContent =
        "Connect your Hive account to load your Goods and submit a Daily Diwali Basket.";
    }
    if (playerApp) playerApp.classList.add("hidden");
    renderDiwaliNfts([]);
    return;
  }

  if (loginNote) loginNote.classList.add("hidden");
  if (playerApp) playerApp.classList.remove("hidden");

  setDiwaliText(
    "diwali-player-days",
    String(diwaliPlayer.days_completed || 0) + " / 7 days",
  );
  setDiwaliText(
    "diwali-basket-date",
    "UTC day: " + String(diwaliPlayer.today_event_date || "—"),
  );

  const availableIds = new Set(
    (diwaliPlayer.inventory || []).map((good) => Number(good.id)),
  );
  selectedDiwaliGoods = new Set(
    Array.from(selectedDiwaliGoods).filter((id) => availableIds.has(Number(id))),
  );

  renderDiwaliInventory();
  renderDiwaliBasket();
  renderDiwaliNfts(diwaliPlayer.sealed_nfts || []);
}

function renderDiwaliInventory() {
  const container = document.getElementById("diwali-inventory");
  const status = document.getElementById("diwali-inventory-status");
  if (!container || !diwaliPlayer) return;

  const basketSubmitted = Boolean(diwaliPlayer.today_basket);
  const eventLive = diwaliEvent?.status === "LIVE";
  const goods = Array.isArray(diwaliPlayer.inventory)
    ? diwaliPlayer.inventory
    : [];

  if (!goods.length) {
    container.innerHTML =
      '<div class="diwali-login-note">No available Goods found. Produce or claim Goods, then return here.</div>';
    if (status) status.textContent = "";
    return;
  }

  container.innerHTML = goods
    .map((good) => {
      const selected = selectedDiwaliGoods.has(Number(good.id));
      const disabled = basketSubmitted || !eventLive;
      return (
        '<button type="button" class="diwali-good-card' +
        (selected ? " selected" : "") +
        '" data-good-id="' +
        escapeDiwaliHtml(good.id) +
        '"' +
        (disabled ? " disabled" : "") +
        ">" +
        '<span class="diwali-good-name">' +
        escapeDiwaliHtml(good.product_name || "Good #" + good.id) +
        "</span>" +
        '<span class="diwali-good-meta"><span>' +
        escapeDiwaliHtml(good.product_level || "Good") +
        " · " +
        escapeDiwaliHtml(good.quality || "Standard") +
        '</span><span class="diwali-good-pv">' +
        escapeDiwaliHtml(Number(good.final_value || 0).toLocaleString()) +
        " PV</span></span>" +
        "</button>"
      );
    })
    .join("");

  container.querySelectorAll("[data-good-id]").forEach((card) => {
    card.addEventListener("click", () => {
      const id = Number(card.dataset.goodId);
      if (selectedDiwaliGoods.has(id)) selectedDiwaliGoods.delete(id);
      else selectedDiwaliGoods.add(id);
      renderDiwaliInventory();
      renderDiwaliBasket();
    });
  });

  if (status) {
    status.textContent = basketSubmitted
      ? "✅ Today’s basket is submitted. You can enter again tomorrow."
      : !eventLive
        ? diwaliEvent?.status === "UPCOMING"
          ? "The event opens on 1 Nov 2026 at 00:00 UTC."
          : "The event has ended."
        : "Any rarity and quality is accepted. Goods are consumed only after submission.";
  }
}

function renderDiwaliBasket() {
  const countEl = document.getElementById("diwali-selected-count");
  const pvEl = document.getElementById("diwali-selected-pv");
  const progress = document.getElementById("diwali-progress-bar");
  const help = document.getElementById("diwali-basket-help");
  const submit = document.getElementById("diwali-submit-basket");

  if (!countEl || !pvEl || !help || !submit) return;

  const goods = Array.isArray(diwaliPlayer?.inventory)
    ? diwaliPlayer.inventory
    : [];
  const selected = goods.filter((good) => selectedDiwaliGoods.has(Number(good.id)));
  const totalPv = selected.reduce(
    (total, good) => total + Number(good.final_value || 0),
    0,
  );
  const count = selected.length;
  const submitted = Boolean(diwaliPlayer?.today_basket);
  const eventLive = diwaliEvent?.status === "LIVE";

  countEl.textContent = String(count);
  pvEl.textContent = Number(totalPv).toLocaleString();
  if (progress) progress.style.width = Math.min(100, (totalPv / 250) * 100) + "%";

  let message = "Select at least 3 Goods and reach 250 PV.";
  if (submitted) {
    message = "✅ Submitted for today. Come back after the next UTC midnight.";
  } else if (!eventLive) {
    message =
      diwaliEvent?.status === "UPCOMING"
        ? "The basket opens on 1 Nov 2026 at 00:00 UTC."
        : "The festival has ended.";
  } else if (count < 3) {
    message = "Select " + String(3 - count) + " more Good(s).";
  } else if (totalPv < 250) {
    message = "Add " + Number(250 - totalPv).toLocaleString() + " more PV.";
  } else {
    message = "Ready. Submitting will consume these Goods for today’s entry.";
  }

  help.textContent = message;
  submit.disabled = submitted || !eventLive || count < 3 || totalPv < 250;
}

function renderDiwaliNfts(nfts) {
  const container = document.getElementById("diwali-nft-list");
  if (!container) return;

  if (!getDiwaliUsername()) {
    container.innerHTML =
      '<div class="diwali-muted">Connect your account to see your sealed NFT.</div>';
    return;
  }

  if (!Array.isArray(nfts) || !nfts.length) {
    container.innerHTML =
      '<div class="diwali-muted">No sealed Diwali NFT is currently held by this account.</div>';
    return;
  }

  container.innerHTML = nfts
    .map((nft) => {
      const serial = String(nft.serial_number || 0).padStart(3, "0") + "/007";
      const opened = Boolean(nft.opened);
      return (
        '<article class="diwali-nft-card">' +
        '<span class="diwali-chip">DIWALI_2026</span>' +
        "<strong>Imperial Deepa · " +
        escapeDiwaliHtml(serial) +
        "</strong>" +
        "<p>" +
        (opened
          ? "Opened. Bonus revealed: " + escapeDiwaliHtml(nft.bonus_label)
          : "Sealed reward. Guaranteed: 500 EMP · 1 Fragment · 2 SMP.") +
        "</p>" +
        (opened
          ? ""
          : '<button type="button" class="diwali-secondary-btn" data-open-nft="' +
            escapeDiwaliHtml(nft.id) +
            '">Open sealed NFT</button>') +
        "</article>"
      );
    })
    .join("");

  container.querySelectorAll("[data-open-nft]").forEach((button) => {
    button.addEventListener("click", () => openDiwaliNft(button.dataset.openNft));
  });
}

async function loadDiwaliEvent() {
  try {
    const data = await fetchDiwaliJson("/diwali-festival/state?t=" + Date.now());
    renderDiwaliEvent(data.event);
  } catch (error) {
    setDiwaliText("diwali-event-status", "Unavailable");
    showDiwaliStatus("diwali-nft-status", error.message);
  }
}

async function loadDiwaliPlayer() {
  const username = getDiwaliUsername();
  if (!username) {
    renderDiwaliPlayer();
    return;
  }

  try {
    const data = await fetchDiwaliJson(
      "/diwali-festival/player/" + encodeURIComponent(username) + "?t=" + Date.now(),
      { headers: diwaliHeaders() },
    );
    diwaliEvent = data.event;
    diwaliPlayer = data.player;
    renderDiwaliEvent(data.event);
    renderDiwaliPlayer();
  } catch (error) {
    renderDiwaliPlayer();
    showDiwaliStatus("diwali-inventory-status", error.message);
  }
}

async function submitDiwaliBasket() {
  const username = getDiwaliUsername();
  if (!username || !diwaliPlayer) return;

  const selected = (diwaliPlayer.inventory || []).filter((good) =>
    selectedDiwaliGoods.has(Number(good.id)),
  );
  const totalPv = selected.reduce(
    (total, good) => total + Number(good.final_value || 0),
    0,
  );

  if (selected.length < 3 || totalPv < 250) return;

  const confirmed = window.confirm(
    "Submit " +
      selected.length +
      " Goods worth " +
      Number(totalPv).toLocaleString() +
      " PV for today’s Diwali Basket?\\n\\nThe selected Goods will be consumed.",
  );
  if (!confirmed) return;

  const button = document.getElementById("diwali-submit-basket");
  if (button) {
    button.disabled = true;
    button.textContent = "Submitting...";
  }
  showDiwaliStatus("diwali-inventory-status", "Recording your Daily Diwali Basket...");

  try {
    const data = await fetchDiwaliJson(
      "/diwali-festival/basket/" + encodeURIComponent(username),
      {
        method: "POST",
        headers: diwaliHeaders(),
        body: JSON.stringify({
          goods_ids: selected.map((good) => Number(good.id)),
        }),
      },
    );

    selectedDiwaliGoods.clear();
    const milestoneText = (data.submission?.milestones || [])
      .map((reward) => reward.key === "THREE_DAYS" ? "50 EMP milestone unlocked" : "7-day milestone unlocked")
      .join(" · ");

    showDiwaliStatus(
      "diwali-inventory-status",
      "✅ Basket submitted: " +
        Number(data.submission?.total_pv || totalPv).toLocaleString() +
        " PV." +
        (milestoneText ? " " + milestoneText + "." : ""),
    );
    await loadDiwaliPlayer();
    await loadDiwaliEvent();
  } catch (error) {
    showDiwaliStatus("diwali-inventory-status", error.message);
    renderDiwaliBasket();
  } finally {
    if (button) button.textContent = "Submit Daily Basket";
  }
}

async function openDiwaliNft(nftId) {
  const username = getDiwaliUsername();
  if (!username || !nftId) return;

  const confirmed = window.confirm(
    "Open this sealed Diwali NFT now? The hidden bonus will be revealed and the NFT will be marked opened.",
  );
  if (!confirmed) return;

  showDiwaliStatus("diwali-nft-status", "Opening sealed NFT...");
  try {
    const data = await fetchDiwaliJson(
      "/diwali-festival/nft/" +
        encodeURIComponent(username) +
        "/" +
        encodeURIComponent(nftId) +
        "/open",
      {
        method: "POST",
        headers: diwaliHeaders(),
      },
    );
    const reward = data.reward || {};
    const bonus = reward.bonus?.asset
      ? reward.bonus.label
      : "No additional bonus";
    showDiwaliStatus(
      "diwali-nft-status",
      "✅ NFT opened: 500 EMP, 1 Imperial Fragment, 2 SMP, and " + bonus + ".",
    );
    await loadDiwaliPlayer();
  } catch (error) {
    showDiwaliStatus("diwali-nft-status", error.message);
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  document
    .getElementById("diwali-submit-basket")
    ?.addEventListener("click", submitDiwaliBasket);

  await loadDiwaliEvent();
  await loadDiwaliPlayer();
});

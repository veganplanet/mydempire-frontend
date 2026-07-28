// ==============================================
// 🏛 IMPERIAL TRADE FAIR — FRONTEND FOUNDATION
// ==============================================

const TRADE_FAIR_LOCAL_API = "http://localhost:10000";
const TRADE_FAIR_PROD_API = "https://mydempire-backend-1.onrender.com";

const TRADE_FAIR_API_BASE =
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1"
    ? TRADE_FAIR_LOCAL_API
    : TRADE_FAIR_PROD_API;

let tradeFairState = null;
let tradeFairDrawGoods = [];
let selectedTradeFairDrawGoods = new Set();
let tradeFairCountdownInterval = null;

function getTradeFairUsername() {
  return (
    localStorage.getItem("hiveUsername") ||
    localStorage.getItem("mde_username") ||
    localStorage.getItem("username") ||
    ""
  )
    .replace("@", "")
    .trim()
    .toLowerCase();
}

function setTradeFairText(id, value) {
  const element = document.getElementById(id);

  if (element) {
    element.textContent = value;
  }
}

function formatTradeFairDate(value) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function getTradeFairTotalCompletions(contracts) {
  if (!Array.isArray(contracts)) {
    return 0;
  }

  return contracts.reduce((total, contract) => {
    return total + Number(contract.completed_count || 0);
  }, 0);
}

function renderTradeFairEventState(data) {
  tradeFairState = data;

  if (!data.event_exists || !data.event) {
    setTradeFairText("trade-fair-event-status", "No Event");

    setTradeFairText(
      "trade-fair-event-period",
      "No Imperial Trade Fair event is currently configured.",
    );

    setTradeFairText("trade-fair-ticket-status", "Not Available");
    setTradeFairText("trade-fair-total-completions", "0");
    setTradeFairText("trade-fair-countdown", "--");

    setTradeFairText("trade-fair-countdown-note", "No active event window.");

    return;
  }

  const event = data.event;

  const databaseStatus = String(event.database_status || event.status || "")
    .trim()
    .toUpperCase();

  const backendTimingStatus = String(event.timing_status || "")
    .trim()
    .toUpperCase();

  const now = Date.now();
  const startsAtTime = new Date(event.starts_at).getTime();
  const endsAtTime = new Date(event.ends_at).getTime();

  let timingStatus = "DRAFT";

  if (
    databaseStatus === "ENDED" ||
    backendTimingStatus === "ENDED" ||
    (Number.isFinite(endsAtTime) && now >= endsAtTime)
  ) {
    timingStatus = "ENDED";
  } else if (
    databaseStatus === "ACTIVE" &&
    Number.isFinite(startsAtTime) &&
    Number.isFinite(endsAtTime) &&
    now >= startsAtTime &&
    now < endsAtTime
  ) {
    timingStatus = "LIVE";
  } else if (Number.isFinite(startsAtTime) && now < startsAtTime) {
    timingStatus = "UPCOMING";
  }

  let statusLabel = "⚪ DRAFT";

  if (timingStatus === "LIVE") {
    statusLabel = "🟢 LIVE";
  } else if (timingStatus === "UPCOMING") {
    statusLabel = "🟡 UPCOMING";
  } else if (timingStatus === "ENDED") {
    statusLabel = "🔴 ENDED";
  }

  event.timing_status = timingStatus;

  setTradeFairText("trade-fair-event-status", statusLabel);

  setTradeFairText(
    "trade-fair-event-period",
    `${formatTradeFairDate(event.starts_at)} → ${formatTradeFairDate(
      event.ends_at,
    )}`,
  );

  const ticketOwned = Boolean(data.ticket?.owned);
  const ticketCount = Number(data.ticket?.owned_count || 0);

  setTradeFairText(
    "trade-fair-ticket-status",
    ticketOwned ? `Owned (${ticketCount})` : "Not Owned",
  );

  const totalCompletions = getTradeFairTotalCompletions(data.contracts);

  setTradeFairText("trade-fair-total-completions", String(totalCompletions));

  updateTradeFairContractCards(data.contracts || []);
  startTradeFairCountdown(event);
}

function updateTradeFairContractCards(contracts) {
  const contractMap = new Map();

  contracts.forEach((contract) => {
    contractMap.set(String(contract.key || "").toUpperCase(), contract);
  });

  const timingStatus = String(
    tradeFairState?.event?.timing_status || "",
  ).toUpperCase();

  const eventIsLive = timingStatus === "LIVE";

  document.querySelectorAll(".trade-fair-contract-card").forEach((card) => {
    const tier = String(card.dataset.tier || "").toUpperCase();
    const contract = contractMap.get(tier);

    if (!contract) {
      card.disabled = true;
      return;
    }

    const completed = Number(contract.completed_count || 0);

    const cap = Number(
      contract.completion_cap ||
        contract.active_cap ||
        contract.normal_cap ||
        0,
    );

    const capReached = completed >= cap && cap > 0;

    const capText = card.querySelector(".trade-fair-contract-cap");

    if (capText) {
      capText.textContent = `Completed ${completed} / ${cap}`;
    }

    card.disabled = !eventIsLive || capReached;

    if (capReached) {
      card.classList.add("trade-fair-contract-complete");
    } else {
      card.classList.remove("trade-fair-contract-complete");
    }
  });

  if (!eventIsLive) {
    selectedTradeFairTier = "";
    selectedTradeFairFoodIds = [];
    selectedTradeFairPharmaIds = [];

    resetTradeFairPreview();

    const container = document.getElementById("trade-fair-goods-container");

    if (container) {
      container.className = "trade-fair-empty";
      container.textContent =
        timingStatus === "UPCOMING"
          ? "Contracts will become available when the event starts."
          : "Contracts are not currently available.";
    }
  }
}

function formatTradeFairCountdown(milliseconds) {
  const safeMilliseconds = Math.max(Number(milliseconds || 0), 0);

  const totalSeconds = Math.floor(safeMilliseconds / 1000);

  const days = Math.floor(totalSeconds / 86400);

  const hours = Math.floor((totalSeconds % 86400) / 3600);

  const minutes = Math.floor((totalSeconds % 3600) / 60);

  const seconds = totalSeconds % 60;

  return (
    `${String(days).padStart(2, "0")}d ` +
    `${String(hours).padStart(2, "0")}h ` +
    `${String(minutes).padStart(2, "0")}m ` +
    `${String(seconds).padStart(2, "0")}s`
  );
}

function startTradeFairCountdown(event) {
  clearInterval(tradeFairCountdownInterval);

  const timingStatus = String(event.timing_status || "").toUpperCase();

  const startsAt = new Date(event.starts_at).getTime();
  const endsAt = new Date(event.ends_at).getTime();

  function updateCountdown() {
    const now = Date.now();

    if (timingStatus === "UPCOMING") {
      const remaining = startsAt - now;

      if (remaining <= 0) {
        clearInterval(tradeFairCountdownInterval);
        loadTradeFairState();
        return;
      }

      setTradeFairText(
        "trade-fair-countdown",
        formatTradeFairCountdown(remaining),
      );

      setTradeFairText(
        "trade-fair-countdown-note",
        "Until the Imperial Trade Fair opens.",
      );

      return;
    }

    if (timingStatus === "LIVE") {
      const remaining = endsAt - now;

      if (remaining <= 0) {
        clearInterval(tradeFairCountdownInterval);
        loadTradeFairState();
        return;
      }

      setTradeFairText(
        "trade-fair-countdown",
        formatTradeFairCountdown(remaining),
      );

      setTradeFairText(
        "trade-fair-countdown-note",
        "Until the Imperial Trade Fair closes.",
      );

      return;
    }

    if (timingStatus === "ENDED") {
      setTradeFairText("trade-fair-countdown", "Event Ended");

      setTradeFairText(
        "trade-fair-countdown-note",
        "The 72-hour Trade Fair window has closed.",
      );

      return;
    }

    setTradeFairText("trade-fair-countdown", "Not Active");

    setTradeFairText(
      "trade-fair-countdown-note",
      "The event is still in draft status.",
    );
  }

  updateCountdown();

  tradeFairCountdownInterval = setInterval(updateCountdown, 1000);
}
async function loadTradeFairDrawGoods() {
  const username = getTradeFairUsername();

  const loadButton = document.getElementById("trade-fair-draw-load-btn");

  const statusEl = document.getElementById("trade-fair-draw-status");

  if (!username) {
    if (statusEl) {
      statusEl.textContent = "Please connect your Hive account first.";
    }

    return;
  }

  if (loadButton) {
    loadButton.disabled = true;
    loadButton.textContent = "Loading Goods...";
  }

  try {
    const response = await fetch(
      `${TRADE_FAIR_API_BASE}/imperial-trade-fair/draw-goods/${encodeURIComponent(
        username,
      )}`,
      {
        headers: getTradeFairActorHeaders(),
      },
    );

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || "Unable to load available Goods.");
    }

    tradeFairDrawGoods = Array.isArray(data.goods) ? data.goods : [];
    const playerLuckyWeight = Number(data.totals?.player_lucky_weight) || 0;

    selectedTradeFairDrawGoods.clear();

    renderTradeFairDrawGoods();
    await loadTradeFairDrawLeaderboard();

    if (statusEl) {
      if (playerLuckyWeight > 0) {
        statusEl.textContent = `Your total Lucky Draw weight is ${playerLuckyWeight.toFixed(3)}.`;
      } else {
        statusEl.textContent =
          tradeFairDrawGoods.length > 0
            ? "Select the Goods you want to burn for Lucky Draw weight."
            : "You have no available Goods.";
      }
    }
  } catch (error) {
    console.error("Trade Fair Draw Goods error:", error);

    if (statusEl) {
      statusEl.textContent = error.message || "Unable to load available Goods.";
    }
  } finally {
    if (loadButton) {
      loadButton.disabled = false;
      loadButton.textContent = "Load Available Goods";
    }
  }
}
async function loadTradeFairDrawLeaderboard() {
  const username = getTradeFairUsername();

  if (!username) {
    return;
  }

  const summaryEl = document.getElementById("trade-fair-draw-summary");

  const bodyEl = document.getElementById("trade-fair-draw-leaderboard-body");

  if (!summaryEl || !bodyEl) {
    console.error("Lucky Draw leaderboard HTML elements not found.");
    return;
  }

  summaryEl.textContent = "Loading Lucky Draw leaderboard...";

  bodyEl.innerHTML = `
    <tr>
      <td colspan="3" style="text-align:center;">
        Loading...
      </td>
    </tr>
  `;

  try {
    const response = await fetch(
      `${TRADE_FAIR_API_BASE}/imperial-trade-fair/draw-leaderboard/${encodeURIComponent(
        username,
      )}`,
      {
        headers: getTradeFairActorHeaders(),
      },
    );

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || "Failed to load Lucky Draw leaderboard.");
    }

    const leaderboard = Array.isArray(data.leaderboard) ? data.leaderboard : [];

    summaryEl.innerHTML =
      `👥 Participants: <strong>${Number(data.participants) || 0}</strong><br>` +
      `🎲 Total Lucky Weight: <strong>${Number(
        data.total_lucky_weight || 0,
      ).toFixed(3)}</strong>`;

    if (leaderboard.length === 0) {
      bodyEl.innerHTML = `
        <tr>
          <td colspan="3" style="text-align:center;">
            No participants yet.
          </td>
        </tr>
      `;

      return;
    }

    let rowsHtml = "";

    leaderboard.forEach((player, index) => {
      const rank = Number(player.rank) || index + 1;
      const playerUsername = String(player.username || "-");
      const luckyWeight = Number(player.lucky_weight) || 0;
      const chance = Number(player.chance) || 0;

      rowsHtml += `
    <tr>
      <td>${rank}</td>
      <td>@${playerUsername}</td>
      <td>${luckyWeight.toFixed(3)}</td>
      <td>${chance.toFixed(2)}%</td>
    </tr>
  `;
    });

    bodyEl.innerHTML = rowsHtml;
  } catch (error) {
    console.error("Trade Fair Lucky Draw leaderboard error:", error);

    summaryEl.textContent =
      error.message || "Unable to load Lucky Draw leaderboard.";

    bodyEl.innerHTML = `
      <tr>
        <td colspan="4" style="text-align:center;">
          Unable to load leaderboard.
        </td>
      </tr>
    `;
  }
}
function renderTradeFairDrawGoodCard(good) {
  const industry = String(good.industry || "")
    .trim()
    .toUpperCase();

  const quality = String(good.quality || "STANDARD")
    .trim()
    .toUpperCase();

  const qualitySlug = quality.toLowerCase();

  const productLevel = String(good.product_level || "")
    .trim()
    .toUpperCase();

  const levelSlug = productLevel.toLowerCase();

  const rarityMark =
    productLevel === "LUXURY"
      ? "R5"
      : productLevel === "PREMIUM"
        ? "R4"
        : productLevel === "VALUE"
          ? "R3"
          : productLevel === "STANDARD"
            ? "R2"
            : "R1";

  const qualityDots =
    quality === "SUPERIOR" ? "◆◆◆" : quality === "FINE" ? "◆◆" : "◆";

  const productKey = String(good.product_key || "").trim();

  const imagePath = productKey ? `assets/goods/${productKey}.png` : "";

  return `
    <label
      class="
        trade-fair-good-card
        goods-product-card
        goods-collectible-card
        goods-quality-${escapeTradeFairHtml(qualitySlug)}
        goods-level-${escapeTradeFairHtml(levelSlug)}
      "
    >
      <input
        type="checkbox"
        class="trade-fair-good-checkbox trade-fair-draw-good-checkbox"
        value="${Number(good.id)}"
        data-good-id="${Number(good.id)}"
        data-industry="${escapeTradeFairHtml(industry)}"
      />

      <div class="goods-collectible-frame">
        <div class="goods-card-topline">
          <span class="goods-card-name">
            ${escapeTradeFairHtml(good.product_name || "Factory Good")}
          </span>

          <span class="goods-card-rarity">
            ${escapeTradeFairHtml(rarityMark)}
          </span>
        </div>

        <div class="goods-card-industry">
          ${escapeTradeFairHtml(industry)}
        </div>

        <div
          class="
            goods-card-quality
            goods-quality-dots-${escapeTradeFairHtml(qualitySlug)}
          "
          title="${escapeTradeFairHtml(quality)} Quality"
        >
          ${qualityDots}
        </div>

        <div class="goods-card-image-area">
          ${
            imagePath
              ? `
                <img
                  src="${escapeTradeFairHtml(imagePath)}"
                  alt="${escapeTradeFairHtml(
                    good.product_name || "Factory Good",
                  )}"
                  loading="lazy"
                  onerror="
                    this.style.display='none';
                    this.parentElement.classList.add('goods-image-missing');
                  "
                />
              `
              : ""
          }
        </div>

        <div class="goods-card-pv">
  ${Number(good.final_value || 0)} PV
</div>
      </div>
    </label>
  `;
}
function renderTradeFairDrawGoods() {
  const listEl = document.getElementById("trade-fair-draw-goods-list");

  const summaryEl = document.getElementById("trade-fair-draw-summary");

  if (!listEl || !summaryEl) return;

  if (!tradeFairDrawGoods.length) {
    listEl.innerHTML = `
      <div class="trade-fair-no-goods">
        No available Goods found.
      </div>
    `;

    summaryEl.textContent = "No Goods are currently available.";

    updateTradeFairDrawSelection();

    return;
  }

  const industryOrder = [
    "FOOD",
    "PHARMA",
    "TEXTILE",
    "CHEMICAL",
    "SUPERMARKET",
  ];

  const industryDetails = {
    FOOD: {
      icon: "🌾",
      name: "Food Goods",
    },

    PHARMA: {
      icon: "💊",
      name: "Pharma Goods",
    },

    TEXTILE: {
      icon: "🧵",
      name: "Textile Goods",
    },

    CHEMICAL: {
      icon: "🧪",
      name: "Chemical Goods",
    },

    SUPERMARKET: {
      icon: "🛒",
      name: "Supermarket Goods",
    },
  };

  summaryEl.textContent = `${tradeFairDrawGoods.length} available Goods loaded.`;

  listEl.className = "trade-fair-goods-list";

  listEl.innerHTML = industryOrder
    .map((industry) => {
      const industryGoods = tradeFairDrawGoods.filter(
        (good) =>
          String(good.industry || "")
            .trim()
            .toUpperCase() === industry,
      );

      if (!industryGoods.length) {
        return "";
      }

      const details = industryDetails[industry];

      const isFeatured = industryGoods.some((good) => good.featured_industry);

      return `
        <section class="trade-fair-goods-industry-section">
          <div class="trade-fair-goods-industry-head">
            <div>
              <strong>
                ${details.icon}
                ${details.name}
              </strong>

              <small>
                Selected:
                <span
                  id="trade-fair-draw-${industry.toLowerCase()}-selected-count"
                >
                  0
                </span>
                / ${industryGoods.length}

                · ${isFeatured ? "100% weight" : "25% weight"}
              </small>
            </div>

           <div
  style="
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  "
>
  <span class="trade-fair-enough">
    Available: ${industryGoods.length}
  </span>

  <button
    type="button"
    class="trade-fair-draw-small-btn trade-fair-draw-select-industry-btn"
    data-industry="${industry}"
  >
    Select All
  </button>
</div>
          </div>

          <div class="trade-fair-goods-card-grid">
            ${industryGoods
              .map((good) => renderTradeFairDrawGoodCard(good))
              .join("")}
          </div>
        </section>
      `;
    })
    .join("");

  listEl
    .querySelectorAll(".trade-fair-draw-good-checkbox")
    .forEach((checkbox) => {
      checkbox.addEventListener("change", () => {
        const goodId = Number(checkbox.value);

        if (checkbox.checked) {
          selectedTradeFairDrawGoods.add(goodId);
        } else {
          selectedTradeFairDrawGoods.delete(goodId);
        }

        updateTradeFairDrawSelection();
      });
    });

  listEl
    .querySelectorAll(".trade-fair-draw-select-industry-btn")
    .forEach((button) => {
      button.addEventListener("click", () => {
        const industry = String(button.dataset.industry || "").toUpperCase();

        const industryGoods = tradeFairDrawGoods.filter(
          (good) =>
            String(good.industry || "")
              .trim()
              .toUpperCase() === industry,
        );

        const allAlreadySelected = industryGoods.every((good) =>
          selectedTradeFairDrawGoods.has(Number(good.id)),
        );

        industryGoods.forEach((good) => {
          const goodId = Number(good.id);

          if (allAlreadySelected) {
            selectedTradeFairDrawGoods.delete(goodId);
          } else {
            selectedTradeFairDrawGoods.add(goodId);
          }
        });

        listEl
          .querySelectorAll(
            `.trade-fair-draw-good-checkbox[data-industry="${industry}"]`,
          )
          .forEach((checkbox) => {
            checkbox.checked = selectedTradeFairDrawGoods.has(
              Number(checkbox.value),
            );
          });

        button.textContent = allAlreadySelected
          ? `Select All ${industryDetails[industry].name}`
          : `Clear ${industryDetails[industry].name}`;

        updateTradeFairDrawSelection();
      });
    });

  updateTradeFairDrawSelection();
}
function updateTradeFairDrawSelection() {
  const countEl = document.getElementById("trade-fair-draw-selected-count");

  const weightEl = document.getElementById("trade-fair-draw-total-weight");

  const submitBtn = document.getElementById("trade-fair-draw-submit-btn");

  const selectedGoods = tradeFairDrawGoods.filter((good) =>
    selectedTradeFairDrawGoods.has(Number(good.id)),
  );

  const totalWeight = selectedGoods.reduce(
    (sum, good) => sum + Number(good.draw_weight || 0),
    0,
  );

  if (countEl) {
    countEl.textContent = String(selectedGoods.length);
  }

  if (weightEl) {
    weightEl.textContent = totalWeight.toFixed(3);
  }
  const industryOrder = [
    "FOOD",
    "PHARMA",
    "TEXTILE",
    "CHEMICAL",
    "SUPERMARKET",
  ];

  industryOrder.forEach((industry) => {
    const selectedIndustryCount = selectedGoods.filter(
      (good) =>
        String(good.industry || "")
          .trim()
          .toUpperCase() === industry,
    ).length;

    const industryCountEl = document.getElementById(
      `trade-fair-draw-${industry.toLowerCase()}-selected-count`,
    );

    if (industryCountEl) {
      industryCountEl.textContent = String(selectedIndustryCount);
    }
  });
  if (submitBtn) {
    submitBtn.disabled = selectedGoods.length === 0;
  }
}
function selectAllTradeFairDrawGoods() {
  selectedTradeFairDrawGoods.clear();

  tradeFairDrawGoods.forEach((good) => {
    selectedTradeFairDrawGoods.add(Number(good.id));
  });

  document
    .querySelectorAll(".trade-fair-draw-good-checkbox")
    .forEach((checkbox) => {
      checkbox.checked = true;

      const card = checkbox.closest(".trade-fair-good-card");

      if (card) {
        card.classList.add("selected");
      }
    });

  document
    .querySelectorAll(".trade-fair-draw-select-industry-btn")
    .forEach((button) => {
      const industry = String(button.dataset.industry || "").toUpperCase();

      const industryNames = {
        FOOD: "Food Goods",
        PHARMA: "Pharma Goods",
        TEXTILE: "Textile Goods",
        CHEMICAL: "Chemical Goods",
        SUPERMARKET: "Supermarket Goods",
      };

      button.textContent = `Clear ${industryNames[industry] || industry}`;
    });

  updateTradeFairDrawSelection();
}
async function submitTradeFairDrawGoods() {
  const username = getTradeFairUsername();

  const submitButton = document.getElementById("trade-fair-draw-submit-btn");

  const statusEl = document.getElementById("trade-fair-draw-status");

  const goodsIds = Array.from(selectedTradeFairDrawGoods).map(Number);

  if (!username) {
    if (statusEl) {
      statusEl.textContent = "Please connect your Hive account first.";
    }

    return;
  }

  if (goodsIds.length === 0) {
    if (statusEl) {
      statusEl.textContent = "Select at least one Good first.";
    }

    return;
  }

  const selectedGoods = tradeFairDrawGoods.filter((good) =>
    selectedTradeFairDrawGoods.has(Number(good.id)),
  );

  const totalWeight = selectedGoods.reduce(
    (sum, good) => sum + Number(good.draw_weight || 0),
    0,
  );

  const confirmed = window.confirm(
    `Permanently burn ${goodsIds.length} Goods for ${totalWeight.toFixed(
      3,
    )} Lucky Draw weight?\n\nThis action cannot be reversed.`,
  );

  if (!confirmed) {
    return;
  }

  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = "Submitting Goods...";
  }

  if (statusEl) {
    statusEl.textContent =
      "Burning selected Goods and recording Lucky Draw weight...";
  }

  try {
    const response = await fetch(
      `${TRADE_FAIR_API_BASE}/imperial-trade-fair/draw-submit/${encodeURIComponent(
        username,
      )}`,
      {
        method: "POST",

        headers: getTradeFairActorHeaders(),

        body: JSON.stringify({
          goods_ids: goodsIds,
        }),
      },
    );

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(
        data.error || "Failed to submit Goods to the Lucky Draw.",
      );
    }

    const submittedCount =
      Number(data.submission?.goods_count) || goodsIds.length;

    const playerTotalWeight =
      Number(data.submission?.total_player_draw_weight) || 0;

    selectedTradeFairDrawGoods.clear();

    await loadTradeFairDrawGoods();

    if (statusEl) {
      statusEl.textContent =
        `✅ ${submittedCount} Goods burned successfully. ` +
        `Your total Lucky Draw weight is now ${playerTotalWeight.toFixed(3)}.`;
    }
  } catch (error) {
    console.error("Trade Fair Lucky Draw submission error:", error);

    if (statusEl) {
      statusEl.textContent =
        error.message || "Failed to submit Goods to the Lucky Draw.";
    }

    updateTradeFairDrawSelection();
  } finally {
    if (submitButton) {
      submitButton.textContent = "Submit to Lucky Draw";

      submitButton.disabled = selectedTradeFairDrawGoods.size === 0;
    }
  }
}
async function loadTradeFairState() {
  const username = getTradeFairUsername();

  if (!username) {
    setTradeFairText("trade-fair-event-status", "Login Required");

    setTradeFairText("trade-fair-countdown", "--");

    setTradeFairText(
      "trade-fair-countdown-note",
      "Connect your Hive account to enter the Trade Fair.",
    );

    return;
  }

  try {
    const response = await fetch(
      `${TRADE_FAIR_API_BASE}/imperial-trade-fair/state/${encodeURIComponent(
        username,
      )}?t=${Date.now()}`,
      {
        cache: "no-store",
      },
    );

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || "Failed to load Trade Fair.");
    }

    renderTradeFairEventState(data);

    setTradeFairText(
      "trade-fair-action-status",
      data.event?.timing_status === "LIVE"
        ? "Select a contract to load eligible Goods."
        : "Contracts can be prepared when the event is live.",
    );
  } catch (error) {
    console.error("Imperial Trade Fair state error:", error);

    setTradeFairText("trade-fair-event-status", "Load Failed");

    setTradeFairText("trade-fair-countdown", "--");

    setTradeFairText(
      "trade-fair-countdown-note",
      error.message || "Unable to load event information.",
    );

    setTradeFairText(
      "trade-fair-action-status",
      error.message || "Unable to load Trade Fair.",
    );
  }
}

document.addEventListener("DOMContentLoaded", loadTradeFairState);
// ==============================================
// 🏛 TRADE FAIR — CONTRACT AND GOODS SELECTION
// ==============================================

let selectedTradeFairTier = "";
let selectedTradeFairFoodIds = [];
let selectedTradeFairPharmaIds = [];
let selectedTradeFairRequirements = {
  food_required: 0,
  pharma_required: 0,
};

function escapeTradeFairHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getTradeFairActorHeaders() {
  return {
    "Content-Type": "application/json",
    "x-mde-actor": getTradeFairUsername(),
  };
}

function resetTradeFairPreview() {
  setTradeFairText("trade-fair-preview-tier", selectedTradeFairTier || "None");

  setTradeFairText("trade-fair-preview-quality", "--");

  setTradeFairText("trade-fair-preview-bonus", "--");

  setTradeFairText("trade-fair-preview-emp", "--");

  setTradeFairText("trade-fair-preview-ap", "--");

  setTradeFairText("trade-fair-preview-smp", "--");

  setTradeFairText("trade-fair-preview-fragment", "--");

  const completeButton = document.getElementById("trade-fair-complete-btn");

  if (completeButton) {
    completeButton.disabled = true;
  }
}

function getTradeFairStars(stars) {
  const safeStars = Math.max(1, Math.min(Number(stars || 1), 3));

  return "★".repeat(safeStars) + "☆".repeat(3 - safeStars);
}

function getTradeFairQualityClass(stars) {
  const safeStars = Number(stars || 1);

  if (safeStars === 3) {
    return "trade-fair-good-superior";
  }

  if (safeStars === 2) {
    return "trade-fair-good-fine";
  }

  return "trade-fair-good-standard";
}

function renderTradeFairGoodCard(good, industry, requiredCount) {
  const safeIndustry = String(industry || "")
    .trim()
    .toUpperCase();

  const inputClass =
    safeIndustry === "FOOD"
      ? "trade-fair-food-checkbox"
      : "trade-fair-pharma-checkbox";

  const quality = String(good.quality || "STANDARD").toUpperCase();

  const qualitySlug = quality.toLowerCase();

  const productLevel = String(good.product_level || "").toUpperCase();

  const levelSlug = productLevel.toLowerCase();

  const rarityMark =
    productLevel === "LUXURY"
      ? "R5"
      : productLevel === "PREMIUM"
        ? "R4"
        : productLevel === "VALUE"
          ? "R3"
          : productLevel === "STANDARD"
            ? "R2"
            : "R1";

  const qualityDots =
    quality === "SUPERIOR" ? "◆◆◆" : quality === "FINE" ? "◆◆" : "◆";

  const productKey = String(good.product_key || "").trim();

  const imagePath = productKey ? `assets/goods/${productKey}.png` : "";

  return `
    <label
      class="
        trade-fair-good-card
        goods-product-card
        goods-collectible-card
        goods-quality-${escapeTradeFairHtml(qualitySlug)}
        goods-level-${escapeTradeFairHtml(levelSlug)}
      "
    >
      <input
        type="checkbox"
        class="trade-fair-good-checkbox ${inputClass}"
        data-good-id="${Number(good.id)}"
        data-industry="${escapeTradeFairHtml(safeIndustry)}"
      />

      <div class="goods-collectible-frame">
        <div class="goods-card-topline">
          <span class="goods-card-name">
            ${escapeTradeFairHtml(good.product_name || "Factory Good")}
          </span>

          <span class="goods-card-rarity">
            ${escapeTradeFairHtml(rarityMark)}
          </span>
        </div>

        <div class="goods-card-industry">
          ${escapeTradeFairHtml(safeIndustry)}
        </div>

        <div
          class="
            goods-card-quality
            goods-quality-dots-${escapeTradeFairHtml(qualitySlug)}
          "
          title="${escapeTradeFairHtml(quality)} Quality"
        >
          ${qualityDots}
        </div>

        <div class="goods-card-image-area">
          ${
            imagePath
              ? `
                <img
                  src="${escapeTradeFairHtml(imagePath)}"
                  alt="${escapeTradeFairHtml(
                    good.product_name || "Factory Good",
                  )}"
                  loading="lazy"
                  onerror="
                    this.style.display='none';
                    this.parentElement.classList.add('goods-image-missing');
                  "
                />
              `
              : ""
          }
        </div>

        <div class="goods-card-pv">
          ${Number(good.final_value || 0)} PV
        </div>

        
      </div>
    </label>
  `;
}

function renderTradeFairEligibleGoods(data) {
  const container = document.getElementById("trade-fair-goods-container");

  if (!container) return;

  const foodGoods = Array.isArray(data.eligible_goods?.food)
    ? data.eligible_goods.food
    : [];

  const pharmaGoods = Array.isArray(data.eligible_goods?.pharma)
    ? data.eligible_goods.pharma
    : [];

  const foodRequired = Number(data.requirements?.food_required || 0);

  const pharmaRequired = Number(data.requirements?.pharma_required || 0);

  selectedTradeFairRequirements = {
    food_required: foodRequired,
    pharma_required: pharmaRequired,
  };

  const enoughFood = foodGoods.length >= foodRequired;

  const enoughPharma = pharmaGoods.length >= pharmaRequired;

  container.className = "trade-fair-goods-list";

  container.innerHTML = `
    <div class="trade-fair-selection-summary">
      <strong>
        ${escapeTradeFairHtml(data.contract?.name || selectedTradeFairTier)}
      </strong>

      <span>
        Select exactly ${foodRequired} Food and
        ${pharmaRequired} Pharma Goods.
      </span>
    </div>

    <section class="trade-fair-goods-industry-section">
      <div class="trade-fair-goods-industry-head">
        <div>
          <strong>🌾 Food Goods</strong>

          <small>
            Required:
            <span id="trade-fair-food-selected-count">0</span>
            / ${foodRequired}
          </small>
        </div>

        <span class="${
          enoughFood ? "trade-fair-enough" : "trade-fair-not-enough"
        }">
          Available: ${foodGoods.length}
        </span>
      </div>

      <div class="trade-fair-goods-card-grid">
        ${
          foodGoods.length
            ? foodGoods
                .map((good) =>
                  renderTradeFairGoodCard(good, "FOOD", foodRequired),
                )
                .join("")
            : `
              <div class="trade-fair-no-goods">
                No eligible Food Goods found for this contract.
              </div>
            `
        }
      </div>
    </section>

    <section class="trade-fair-goods-industry-section">
      <div class="trade-fair-goods-industry-head">
        <div>
          <strong>💊 Pharma Goods</strong>

          <small>
            Required:
            <span id="trade-fair-pharma-selected-count">0</span>
            / ${pharmaRequired}
          </small>
        </div>

        <span class="${
          enoughPharma ? "trade-fair-enough" : "trade-fair-not-enough"
        }">
          Available: ${pharmaGoods.length}
        </span>
      </div>

      <div class="trade-fair-goods-card-grid">
        ${
          pharmaGoods.length
            ? pharmaGoods
                .map((good) =>
                  renderTradeFairGoodCard(good, "PHARMA", pharmaRequired),
                )
                .join("")
            : `
              <div class="trade-fair-no-goods">
                No eligible Pharma Goods found for this contract.
              </div>
            `
        }
      </div>
    </section>
  `;

  container
    .querySelectorAll(".trade-fair-good-checkbox")
    .forEach((checkbox) => {
      checkbox.addEventListener("change", handleTradeFairGoodsSelection);
    });

  if (!data.totals?.enough_goods) {
    setTradeFairText(
      "trade-fair-action-status",
      `You do not currently have enough eligible ${data.contract?.rarity || ""} Food and Pharma Goods for this contract.`,
    );
  } else {
    setTradeFairText(
      "trade-fair-action-status",
      "Select the required Food and Pharma Goods.",
    );
  }
}

function getCheckedTradeFairIds(selector) {
  return Array.from(document.querySelectorAll(`${selector}:checked`))
    .map((checkbox) => Number(checkbox.dataset.goodId))
    .filter((id) => Number.isInteger(id) && id > 0);
}

function enforceTradeFairSelectionLimit(changedCheckbox, selector, maximum) {
  const selected = document.querySelectorAll(`${selector}:checked`);

  if (selected.length <= maximum) {
    return true;
  }

  changedCheckbox.checked = false;

  return false;
}

async function handleTradeFairGoodsSelection(event) {
  const changedCheckbox = event.currentTarget;

  const industry = String(changedCheckbox.dataset.industry || "").toUpperCase();

  if (industry === "FOOD") {
    const allowed = enforceTradeFairSelectionLimit(
      changedCheckbox,
      ".trade-fair-food-checkbox",
      selectedTradeFairRequirements.food_required,
    );

    if (!allowed) {
      setTradeFairText(
        "trade-fair-action-status",
        `Select only ${selectedTradeFairRequirements.food_required} Food Goods.`,
      );
    }
  }

  if (industry === "PHARMA") {
    const allowed = enforceTradeFairSelectionLimit(
      changedCheckbox,
      ".trade-fair-pharma-checkbox",
      selectedTradeFairRequirements.pharma_required,
    );

    if (!allowed) {
      setTradeFairText(
        "trade-fair-action-status",
        `Select only ${selectedTradeFairRequirements.pharma_required} Pharma Goods.`,
      );
    }
  }

  selectedTradeFairFoodIds = getCheckedTradeFairIds(
    ".trade-fair-food-checkbox",
  );

  selectedTradeFairPharmaIds = getCheckedTradeFairIds(
    ".trade-fair-pharma-checkbox",
  );

  setTradeFairText(
    "trade-fair-food-selected-count",
    String(selectedTradeFairFoodIds.length),
  );

  setTradeFairText(
    "trade-fair-pharma-selected-count",
    String(selectedTradeFairPharmaIds.length),
  );

  document.querySelectorAll(".trade-fair-good-card").forEach((card) => {
    const checkbox = card.querySelector(".trade-fair-good-checkbox");

    card.classList.toggle("selected", Boolean(checkbox?.checked));
  });

  const foodReady =
    selectedTradeFairFoodIds.length ===
    selectedTradeFairRequirements.food_required;

  const pharmaReady =
    selectedTradeFairPharmaIds.length ===
    selectedTradeFairRequirements.pharma_required;

  if (foodReady && pharmaReady) {
    await previewTradeFairSelection();
  } else {
    resetTradeFairPreview();

    setTradeFairText(
      "trade-fair-action-status",
      `Selected ${selectedTradeFairFoodIds.length}/${selectedTradeFairRequirements.food_required} Food and ${selectedTradeFairPharmaIds.length}/${selectedTradeFairRequirements.pharma_required} Pharma Goods.`,
    );
  }
}

async function loadTradeFairEligibleGoods(contractTier) {
  const username = getTradeFairUsername();

  if (!username) {
    setTradeFairText(
      "trade-fair-action-status",
      "Please connect your Hive account first.",
    );

    return;
  }

  selectedTradeFairTier = String(contractTier || "").toUpperCase();

  selectedTradeFairFoodIds = [];
  selectedTradeFairPharmaIds = [];

  resetTradeFairPreview();

  document.querySelectorAll(".trade-fair-contract-card").forEach((card) => {
    card.classList.toggle(
      "active",
      String(card.dataset.tier || "").toUpperCase() === selectedTradeFairTier,
    );
  });

  const container = document.getElementById("trade-fair-goods-container");

  if (container) {
    container.className = "trade-fair-empty";

    container.innerHTML = `
      Loading eligible ${escapeTradeFairHtml(selectedTradeFairTier)} Goods...
    `;
  }

  setTradeFairText("trade-fair-preview-tier", selectedTradeFairTier);

  setTradeFairText("trade-fair-action-status", "Loading eligible Goods...");

  try {
    const response = await fetch(
      `${TRADE_FAIR_API_BASE}/imperial-trade-fair/eligible-goods/${encodeURIComponent(
        username,
      )}/${encodeURIComponent(selectedTradeFairTier)}`,
      {
        method: "GET",
        headers: getTradeFairActorHeaders(),
      },
    );

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || "Failed to load eligible Goods.");
    }

    renderTradeFairEligibleGoods(data);
  } catch (error) {
    console.error("Trade Fair eligible Goods error:", error);

    if (container) {
      container.className = "trade-fair-empty";

      container.textContent = error.message || "Unable to load eligible Goods.";
    }

    setTradeFairText(
      "trade-fair-action-status",
      error.message || "Unable to load eligible Goods.",
    );
  }
}

async function previewTradeFairSelection() {
  const username = getTradeFairUsername();

  if (!username || !selectedTradeFairTier) {
    return;
  }

  setTradeFairText("trade-fair-action-status", "Calculating final rewards...");

  const completeButton = document.getElementById("trade-fair-complete-btn");

  if (completeButton) {
    completeButton.disabled = true;
  }

  try {
    const response = await fetch(
      `${TRADE_FAIR_API_BASE}/imperial-trade-fair/preview/${encodeURIComponent(
        username,
      )}`,
      {
        method: "POST",

        headers: getTradeFairActorHeaders(),

        body: JSON.stringify({
          contract_tier: selectedTradeFairTier,

          food_goods_ids: selectedTradeFairFoodIds,

          pharma_goods_ids: selectedTradeFairPharmaIds,
        }),
      },
    );

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || "Failed to calculate contract rewards.");
    }

    const averageQuality = Number(data.quality?.average_quality || 0);

    const bonusPercent = Number(data.quality?.bonus_percent || 0);

    setTradeFairText(
      "trade-fair-preview-tier",
      data.contract?.name || selectedTradeFairTier,
    );

    setTradeFairText(
      "trade-fair-preview-quality",
      `${averageQuality.toFixed(2)}★`,
    );

    setTradeFairText("trade-fair-preview-bonus", `${bonusPercent.toFixed(2)}%`);

    setTradeFairText(
      "trade-fair-preview-emp",
      `${Number(data.rewards?.final_emp || 0).toLocaleString()} EMP`,
    );

    setTradeFairText(
      "trade-fair-preview-ap",
      `${Number(data.rewards?.final_ap || 0).toLocaleString()} AP`,
    );

    const eventIsLive =
      String(data.event?.timing_status || "").toUpperCase() === "LIVE";

    if (completeButton) {
      completeButton.disabled = !data.can_complete || !eventIsLive;
    }

    setTradeFairText(
      "trade-fair-action-status",
      eventIsLive
        ? "Reward preview ready. Review carefully before completing the contract."
        : "Reward preview ready. Contract completion will unlock when the event is live.",
    );
  } catch (error) {
    console.error("Trade Fair preview error:", error);

    resetTradeFairPreview();

    setTradeFairText(
      "trade-fair-action-status",
      error.message || "Unable to preview this contract.",
    );
  }
}

function initialiseTradeFairContractCards() {
  document.querySelectorAll(".trade-fair-contract-card").forEach((card) => {
    card.addEventListener("click", () => {
      const tier = String(card.dataset.tier || "").toUpperCase();

      if (!tier) return;

      loadTradeFairEligibleGoods(tier);
    });
  });
}

document.addEventListener("DOMContentLoaded", initialiseTradeFairContractCards);
// ==============================================
// 🏛 TRADE FAIR — COMPLETE CONTRACT
// ==============================================

let tradeFairCompletionInProgress = false;

function closeTradeFairSuccessPopup() {
  const popup = document.getElementById("trade-fair-success-popup");

  if (popup) {
    popup.remove();
  }
}

function showTradeFairSuccessPopup(data) {
  closeTradeFairSuccessPopup();

  const rewards = data.rewards || {};
  const quality = data.quality || {};
  const contract = data.contract || {};
  const balances = data.balances || {};

  const smpReward = Number(rewards.smp || 0);
  const fragmentReward = Number(rewards.fragment || 0);

  const popup = document.createElement("div");

  popup.id = "trade-fair-success-popup";
  popup.className = "trade-fair-success-popup";

  popup.innerHTML = `
    <div
      class="trade-fair-success-backdrop"
      data-close-trade-fair-popup="true"
    ></div>

    <div
      class="trade-fair-success-panel"
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        class="trade-fair-success-close"
        data-close-trade-fair-popup="true"
        aria-label="Close"
      >
        ×
      </button>

      <div class="trade-fair-success-icon">
        🎉
      </div>

      <div class="trade-fair-success-kicker">
        CONTRACT COMPLETED
      </div>

      <h2>
        ${escapeTradeFairHtml(contract.name || "Trade Fair Contract")}
      </h2>

      <p class="trade-fair-success-message">
        Your selected Goods have been delivered and the
        imperial rewards have been credited successfully.
      </p>

      <div class="trade-fair-success-quality">
        <span>Average Quality</span>

        <strong>
          ${Number(quality.average_quality || 0).toFixed(2)}★
        </strong>

        <small>
          ${Number(quality.bonus_percent || 0).toFixed(2)}% Quality Bonus
        </small>
      </div>

      <div class="trade-fair-success-rewards">
        <div>
          <span>EMP Reward</span>

          <strong>
            ${Number(rewards.final_emp || 0).toLocaleString()} EMP
          </strong>
        </div>

        <div>
          <span>Activity Points</span>

          <strong>
            ${Number(rewards.final_ap || 0).toLocaleString()} AP
          </strong>
        </div>

        ${
          smpReward > 0
            ? `
              <div>
                <span>SMP Reward</span>
                <strong>${smpReward} SMP</strong>
              </div>
            `
            : ""
        }

        ${
          fragmentReward > 0
            ? `
              <div>
                <span>Fragment Reward</span>
                <strong>
                  ${fragmentReward}
                  Fragment${fragmentReward === 1 ? "" : "s"}
                </strong>
              </div>
            `
            : ""
        }
      </div>

      <div class="trade-fair-success-progress">
        <div>
          <span>Contract Progress</span>

          <strong>
            ${Number(contract.completed_count || 0)}
            /
            ${Number(contract.active_cap || 0)}
          </strong>
        </div>

        <div>
          <span>Remaining Completions</span>

          <strong>
            ${Number(contract.remaining_count || 0)}
          </strong>
        </div>
      </div>

      <div class="trade-fair-success-balances">
        <span>
          Updated EMP Balance:
          <strong>
            ${Number(balances.emp || 0).toLocaleString()} EMP
          </strong>
        </span>

        <span>
          Current AP:
          <strong>
            ${Number(balances.activity_points || 0).toLocaleString()} AP
          </strong>
        </span>
      </div>

      <button
        type="button"
        class="trade-fair-success-continue"
        data-close-trade-fair-popup="true"
      >
        Continue Trade Fair
      </button>
    </div>
  `;

  document.body.appendChild(popup);

  popup
    .querySelectorAll("[data-close-trade-fair-popup='true']")
    .forEach((element) => {
      element.addEventListener("click", closeTradeFairSuccessPopup);
    });
}

async function completeTradeFairContract() {
  if (tradeFairCompletionInProgress) {
    return;
  }

  const username = getTradeFairUsername();

  if (!username) {
    setTradeFairText(
      "trade-fair-action-status",
      "Please connect your Hive account first.",
    );

    return;
  }

  if (!selectedTradeFairTier) {
    setTradeFairText(
      "trade-fair-action-status",
      "Please select a contract first.",
    );

    return;
  }

  const foodReady =
    selectedTradeFairFoodIds.length ===
    selectedTradeFairRequirements.food_required;

  const pharmaReady =
    selectedTradeFairPharmaIds.length ===
    selectedTradeFairRequirements.pharma_required;

  if (!foodReady || !pharmaReady) {
    setTradeFairText(
      "trade-fair-action-status",
      "Select the exact required number of Food and Pharma Goods.",
    );

    return;
  }

  const confirmed = window.confirm(
    "Complete this Trade Fair contract?\n\n" +
      "The selected Goods will be permanently burned and cannot be recovered.",
  );

  if (!confirmed) {
    return;
  }

  const completeButton = document.getElementById("trade-fair-complete-btn");

  tradeFairCompletionInProgress = true;

  if (completeButton) {
    completeButton.disabled = true;
    completeButton.textContent = "Completing Contract...";
  }

  setTradeFairText(
    "trade-fair-action-status",
    "Delivering Goods and crediting rewards...",
  );

  try {
    const response = await fetch(
      `${TRADE_FAIR_API_BASE}/imperial-trade-fair/complete/${encodeURIComponent(
        username,
      )}`,
      {
        method: "POST",

        headers: getTradeFairActorHeaders(),

        body: JSON.stringify({
          contract_tier: selectedTradeFairTier,

          food_goods_ids: selectedTradeFairFoodIds,

          pharma_goods_ids: selectedTradeFairPharmaIds,
        }),
      },
    );

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(
        data.error || "Failed to complete the Trade Fair contract.",
      );
    }

    showTradeFairSuccessPopup(data);

    setTradeFairText(
      "trade-fair-action-status",
      data.message || "Contract completed successfully.",
    );

    selectedTradeFairFoodIds = [];
    selectedTradeFairPharmaIds = [];

    await loadTradeFairState();

    await loadTradeFairEligibleGoods(selectedTradeFairTier);
  } catch (error) {
    console.error("Trade Fair completion error:", error);

    setTradeFairText(
      "trade-fair-action-status",
      error.message || "Unable to complete this contract.",
    );

    if (completeButton) {
      completeButton.disabled = false;
    }
  } finally {
    tradeFairCompletionInProgress = false;

    if (completeButton) {
      completeButton.textContent = "Complete Contract";
    }
  }
}

function initialiseTradeFairCompleteButton() {
  const completeButton = document.getElementById("trade-fair-complete-btn");

  if (!completeButton) {
    return;
  }

  completeButton.addEventListener("click", completeTradeFairContract);
}

document.addEventListener(
  "DOMContentLoaded",
  initialiseTradeFairCompleteButton,
);
document.addEventListener("DOMContentLoaded", async () => {
  const drawLoadButton = document.getElementById("trade-fair-draw-load-btn");

  const drawSubmitButton = document.getElementById(
    "trade-fair-draw-submit-btn",
  );

  if (drawLoadButton) {
    drawLoadButton.addEventListener("click", loadTradeFairDrawGoods);
  }

  if (drawSubmitButton) {
    drawSubmitButton.addEventListener("click", submitTradeFairDrawGoods);
  }
  await loadTradeFairDrawLeaderboard();
});

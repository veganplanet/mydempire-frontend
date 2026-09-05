// =============================================
// MYDEMPIRE — IMPERIAL TICKET RECIPE CHECKER
// Frontend preview only.
// No Goods or EMP are consumed at this stage.
// =============================================

(function () {
  const TICKET_EMP_COST = 50;
  const TICKET_R1_PER_INDUSTRY = 2;
  const TICKET_R2_COUNT = 4;
  const TICKET_R3_COUNT = 4;
  const TICKET_R4_COUNT = 2;
  const TICKET_R5_COUNT = 1;
  const TICKET_TOTAL_GOODS = 21;

  const TICKET_INDUSTRIES = [
    "FOOD",
    "TEXTILE",
    "PHARMA",
    "CHEMICAL",
    "SUPERMARKET",
  ];

  const TICKET_LOCAL_API = "http://localhost:10000";
  const TICKET_PROD_API = "https://mydempire-backend-1.onrender.com";

  const TICKET_API_BASE =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
      ? TICKET_LOCAL_API
      : TICKET_PROD_API;

  let ticketInventory = [];
  let ticketEmpBalance = 0;
  let ticketSelectedGoods = [];
  let ticketLoading = false;
  let ticketMintInProgress = false;
  function getTicketLoggedInUser() {
    return String(
      localStorage.getItem("hiveUsername") ||
        localStorage.getItem("mde_username") ||
        localStorage.getItem("username") ||
        "",
    )
      .replace("@", "")
      .trim()
      .toLowerCase();
  }

  function getTicketViewedUser() {
    const params = new URLSearchParams(window.location.search);

    return String(
      params.get("user") || params.get("view") || getTicketLoggedInUser(),
    )
      .replace("@", "")
      .trim()
      .toLowerCase();
  }

  function normalizeTicketValue(value) {
    return String(value || "")
      .trim()
      .toUpperCase();
  }

  function getTicketStars(quality) {
    const normalized = normalizeTicketValue(quality);

    if (
      normalized === "SUPERIOR" ||
      normalized === "3★" ||
      normalized === "3*" ||
      normalized === "3 STAR"
    ) return 3;

    if (
      normalized === "FINE" ||
      normalized === "2★" ||
      normalized === "2*" ||
      normalized === "2 STAR"
    ) return 2;

    if (
      normalized === "STANDARD" ||
      normalized === "1★" ||
      normalized === "1*" ||
      normalized === "1 STAR"
    ) return 1;

    return 1;
  }

function getTicketGoodsRank(good) {
  const level = normalizeTicketValue(
    good?.product_level,
  );

  if (level === "ESSENTIAL" || level === "R1") {
    return "R1";
  }

  if (level === "STANDARD" || level === "R2") {
    return "R2";
  }

  if (level === "VALUE" || level === "R3") {
    return "R3";
  }

  if (level === "PREMIUM" || level === "R4") {
    return "R4";
  }

  if (level === "LUXURY" || level === "R5") {
    return "R5";
  }

  return "";
}

function isTicketR1(good) {
  return getTicketGoodsRank(good) === "R1";
}

function isTicketR2(good) {
  return getTicketGoodsRank(good) === "R2";
}

function isTicketR3(good) {
  return getTicketGoodsRank(good) === "R3";
}

function isTicketR4(good) {
  return getTicketGoodsRank(good) === "R4";
}

function isTicketR5(good) {
  return getTicketGoodsRank(good) === "R5";
}

function isAvailableTicketGood(good) {
  return (
    Number(good?.id) > 0 &&
    normalizeTicketValue(
      good?.status || "AVAILABLE",
    ) === "AVAILABLE"
  );
}

function sortTicketGoodsByValue(a, b) {
  const valueDifference =
    Number(a?.final_value || 0) -
    Number(b?.final_value || 0);

  if (valueDifference !== 0) {
    return valueDifference;
  }

  return Number(a?.id || 0) -
    Number(b?.id || 0);
}

function sortTicketGoodsProtectQuality(a, b) {
  const starDifference =
    getTicketStars(a?.quality) -
    getTicketStars(b?.quality);

  if (starDifference !== 0) {
    return starDifference;
  }

  return sortTicketGoodsByValue(a, b);
}

function getTicketGoodDescription(good) {
  if (!good) return "";

  const stars = getTicketStars(good.quality);
  const productName =
    good.product_name || "Factory Good";

  const industry = normalizeTicketValue(
    good.industry,
  );

  const rank = getTicketGoodsRank(good);

  return `${rank} ${industry} • ${productName} • ${stars}★ • ${Number(
    good.final_value || 0,
  )} PV`;
}

function findUnusedGood(goods, usedIds) {
  return (
    goods.find(
      (good) =>
        !usedIds.has(Number(good.id)),
    ) || null
  );
}

function selectTicketGoodsAcrossIndustries({
  rank,
  minimumStars,
  requiredCount,
  usedIds,
}) {
  const industryOptions = [];

  for (const industry of TICKET_INDUSTRIES) {
    const candidates = ticketInventory
      .filter(
        (good) =>
          isAvailableTicketGood(good) &&
          getTicketGoodsRank(good) === rank &&
          normalizeTicketValue(good.industry) ===
            industry &&
          getTicketStars(good.quality) >=
            minimumStars &&
          !usedIds.has(Number(good.id)),
      )
      .sort(sortTicketGoodsProtectQuality);

    const selected = candidates[0] || null;

    if (selected) {
      industryOptions.push({
        industry,
        good: selected,
      });
    }
  }

  industryOptions.sort((a, b) => {
    const starDifference =
      getTicketStars(a.good.quality) -
      getTicketStars(b.good.quality);

    if (starDifference !== 0) {
      return starDifference;
    }

    return sortTicketGoodsByValue(
      a.good,
      b.good,
    );
  });

  const selectedGoods = [];

  for (const option of industryOptions) {
    if (
      selectedGoods.length >= requiredCount
    ) {
      break;
    }

    selectedGoods.push(option.good);
    usedIds.add(Number(option.good.id));
  }

  return selectedGoods;
}

function buildTicketAutoSelection() {
  const usedIds = new Set();
  const selectedR1ByIndustry = {};

  // R1 3★ — two from every industry
  for (const industry of TICKET_INDUSTRIES) {
    const candidates = ticketInventory
      .filter(
        (good) =>
          isAvailableTicketGood(good) &&
          isTicketR1(good) &&
          normalizeTicketValue(good.industry) === industry &&
          getTicketStars(good.quality) === 3,
      )
      .sort(sortTicketGoodsByValue);

    const selected = [];

    for (const good of candidates) {
      if (selected.length >= TICKET_R1_PER_INDUSTRY) break;
      if (usedIds.has(Number(good.id))) continue;

      selected.push(good);
      usedIds.add(Number(good.id));
    }

    selectedR1ByIndustry[industry] = selected;
  }

  // R2 2★+ — four different industries
  const selectedR2Goods = selectTicketGoodsAcrossIndustries({
    rank: "R2",
    minimumStars: 2,
    requiredCount: TICKET_R2_COUNT,
    usedIds,
  });

  // R3 2★+ — four different industries
  const selectedR3Goods = selectTicketGoodsAcrossIndustries({
    rank: "R3",
    minimumStars: 2,
    requiredCount: TICKET_R3_COUNT,
    usedIds,
  });

  // R4 1★+ — two different industries
  const selectedR4Goods = selectTicketGoodsAcrossIndustries({
    rank: "R4",
    minimumStars: 1,
    requiredCount: TICKET_R4_COUNT,
    usedIds,
  });

  // R5 1★+ — any industry
  const r5Candidates = ticketInventory
    .filter(
      (good) =>
        isAvailableTicketGood(good) &&
        isTicketR5(good) &&
        TICKET_INDUSTRIES.includes(normalizeTicketValue(good.industry)) &&
        getTicketStars(good.quality) >= 1 &&
        !usedIds.has(Number(good.id)),
    )
    .sort(sortTicketGoodsProtectQuality);

  const selectedR5Good = findUnusedGood(r5Candidates, usedIds);

  if (selectedR5Good) {
    usedIds.add(Number(selectedR5Good.id));
  }

  const selectedR1Goods = TICKET_INDUSTRIES.flatMap(
    (industry) => selectedR1ByIndustry[industry] || [],
  );

  const selectedGoods = [
    ...selectedR1Goods,
    ...selectedR2Goods,
    ...selectedR3Goods,
    ...selectedR4Goods,
  ];

  if (selectedR5Good) {
    selectedGoods.push(selectedR5Good);
  }

  return {
    selectedR1ByIndustry,
    selectedR2Goods,
    selectedR3Goods,
    selectedR4Goods,
    selectedR5Good,
    selectedGoods,
  };
}

function updateTicketRecipeCell(cell, good) {
  if (!cell) return;

  cell.classList.remove(
    "ticket-slot-pending",
    "ticket-slot-complete",
  );

  if (!good) {
    cell.textContent = "❌ 0 / 1";
    cell.classList.add(
      "ticket-slot-pending",
    );

    cell.removeAttribute("title");
    return;
  }

  cell.textContent = "✅ 1 / 1";

  cell.classList.add(
    "ticket-slot-complete",
  );

  cell.title =
    getTicketGoodDescription(good);
}

function updateTicketGroupCell(
  cell,
  goods,
  requiredCount,
) {
  if (!cell) return;

  const safeGoods = Array.isArray(goods)
    ? goods
    : [];

  const complete =
    safeGoods.length === requiredCount;

  cell.classList.remove(
    "ticket-slot-pending",
    "ticket-slot-complete",
  );

  cell.textContent =
    `${complete ? "✅" : "❌"} ` +
    `${safeGoods.length} / ${requiredCount}`;

  cell.classList.add(
    complete
      ? "ticket-slot-complete"
      : "ticket-slot-pending",
  );

  if (safeGoods.length > 0) {
    cell.title = safeGoods
      .map(getTicketGoodDescription)
      .join("\n");
  } else {
    cell.removeAttribute("title");
  }
}

function ensureTicketV3RecipeUI() {
  for (const industry of TICKET_INDUSTRIES) {
    const row = document.querySelector(
      `[data-ticket-r1-industry="${industry}"]`,
    );

    if (!row) continue;

    const cells = row.querySelectorAll("td");
    if (cells[1]) cells[1].textContent = "Two required";

    const progress = row.querySelector("[data-ticket-progress]");
    if (progress && !progress.classList.contains("ticket-slot-complete")) {
      progress.textContent = "❌ 0 / 2";
    }
  }

  const r2Cell = document.getElementById("ticket-r2-count");
  if (r2Cell) {
    const row = r2Cell.closest("tr");
    const cells = row?.querySelectorAll("td") || [];
    if (cells[1]) cells[1].textContent = "4 different industries";
    r2Cell.textContent = "❌ 0 / 4";
  }

  const r3Cell = document.getElementById("ticket-r3-count");
  if (r3Cell) {
    const row = r3Cell.closest("tr");
    const cells = row?.querySelectorAll("td") || [];
    if (cells[1]) cells[1].textContent = "4 different industries";
    r3Cell.textContent = "❌ 0 / 4";
  }

  const r4Cell = document.getElementById("ticket-r4-count");
  if (r4Cell) {
    const row = r4Cell.closest("tr");
    const cells = row?.querySelectorAll("td") || [];
    if (cells[0]) cells[0].textContent = "👑 R4 Goods 1★+";
    if (cells[1]) cells[1].textContent = "2 different industries";
    r4Cell.textContent = "❌ 0 / 2";

    if (!document.getElementById("ticket-r5-count") && row?.parentElement) {
      const r5Row = document.createElement("tr");
      r5Row.innerHTML = `
        <td>💎 R5 Good 1★+</td>
        <td>Any industry</td>
        <td id="ticket-r5-count" class="ticket-slot-pending">❌ 0 / 1</td>
      `;
      row.parentElement.insertBefore(r5Row, row.nextSibling);
    }
  }

  const selectedCountEl = document.getElementById(
    "ticket-selected-goods-count",
  );
  if (selectedCountEl) selectedCountEl.textContent = "0 / 21";

  const recipeCard = document.querySelector(".ticket-recipe-head p");
  if (recipeCard) {
    recipeCard.textContent =
      "Collect two R1 3★ Goods from every industry, four R2 and four R3 Goods from different industries, two R4 Goods from different industries, and one R5 Good.";
  }
}

function renderTicketRecipe() {
  const result = buildTicketAutoSelection();
  ticketSelectedGoods = result.selectedGoods;

  for (const industry of TICKET_INDUSTRIES) {
    const row = document.querySelector(
      `[data-ticket-r1-industry="${industry}"]`,
    );
    if (!row) continue;

    updateTicketGroupCell(
      row.querySelector("[data-ticket-progress]"),
      result.selectedR1ByIndustry[industry],
      TICKET_R1_PER_INDUSTRY,
    );
  }

  updateTicketGroupCell(
    document.getElementById("ticket-r2-count"),
    result.selectedR2Goods,
    TICKET_R2_COUNT,
  );

  updateTicketGroupCell(
    document.getElementById("ticket-r3-count"),
    result.selectedR3Goods,
    TICKET_R3_COUNT,
  );

  updateTicketGroupCell(
    document.getElementById("ticket-r4-count"),
    result.selectedR4Goods,
    TICKET_R4_COUNT,
  );

  updateTicketGroupCell(
    document.getElementById("ticket-r5-count"),
    result.selectedR5Good ? [result.selectedR5Good] : [],
    TICKET_R5_COUNT,
  );

  const missingR1Industries = TICKET_INDUSTRIES.filter(
    (industry) =>
      (result.selectedR1ByIndustry[industry] || []).length <
      TICKET_R1_PER_INDUSTRY,
  );

  const selectedCount = ticketSelectedGoods.length;
  const selectedPV = ticketSelectedGoods.reduce(
    (total, good) => total + Number(good?.final_value || 0),
    0,
  );

  const hasAllR1 = missingR1Industries.length === 0;
  const hasAllR2 = result.selectedR2Goods.length === TICKET_R2_COUNT;
  const hasAllR3 = result.selectedR3Goods.length === TICKET_R3_COUNT;
  const hasAllR4 = result.selectedR4Goods.length === TICKET_R4_COUNT;
  const hasR5 = Boolean(result.selectedR5Good);
  const hasAllGoods = selectedCount === TICKET_TOTAL_GOODS;
  const hasEnoughEmp = ticketEmpBalance >= TICKET_EMP_COST;

  const selectedCountEl = document.getElementById(
    "ticket-selected-goods-count",
  );
  const selectedPvEl = document.getElementById("ticket-selected-pv");
  const empEl = document.getElementById("ticket-emp-requirement");
  const mintBtn = document.getElementById("ticket-mint-btn");
  const statusEl = document.getElementById("ticket-mint-status");

  if (selectedCountEl) {
    selectedCountEl.textContent = `${selectedCount} / ${TICKET_TOTAL_GOODS}`;
  }

  if (selectedPvEl) {
    selectedPvEl.textContent = selectedPV.toLocaleString(undefined, {
      maximumFractionDigits: 2,
    });
  }

  if (empEl) {
    empEl.textContent = `${ticketEmpBalance.toLocaleString(undefined, {
      maximumFractionDigits: 2,
    })} / ${TICKET_EMP_COST} EMP`;

    empEl.classList.remove("ticket-slot-pending", "ticket-slot-complete");
    empEl.classList.add(
      hasEnoughEmp ? "ticket-slot-complete" : "ticket-slot-pending",
    );
  }

  const recipeReady =
    hasAllR1 &&
    hasAllR2 &&
    hasAllR3 &&
    hasAllR4 &&
    hasR5 &&
    hasAllGoods &&
    hasEnoughEmp;

  if (statusEl) {
    if (recipeReady) {
      statusEl.textContent =
        "✅ Imperial Ticket recipe is ready. Review the selected Goods and mint your Ticket.";
      statusEl.style.color = "#166534";
      statusEl.style.background = "#f0fdf4";
      statusEl.style.borderColor = "#86efac";
    } else {
      const missing = [];

      if (!hasAllR1) {
        missing.push(
          `R1 3★: ${missingR1Industries.join(", ")}`,
        );
      }
      if (!hasAllR2) {
        missing.push(
          `${TICKET_R2_COUNT - result.selectedR2Goods.length} R2 2★+ Good(s) from different industries`,
        );
      }
      if (!hasAllR3) {
        missing.push(
          `${TICKET_R3_COUNT - result.selectedR3Goods.length} R3 2★+ Good(s) from different industries`,
        );
      }
      if (!hasAllR4) {
        missing.push(
          `${TICKET_R4_COUNT - result.selectedR4Goods.length} R4 1★+ Good(s) from different industries`,
        );
      }
      if (!hasR5) {
        missing.push("1 R5 1★+ Good");
      }
      if (!hasEnoughEmp) {
        missing.push(
          `${(TICKET_EMP_COST - ticketEmpBalance).toLocaleString(undefined, {
            maximumFractionDigits: 2,
          })} EMP`,
        );
      }

      statusEl.textContent = `Still required: ${missing.join(" • ")}`;
      statusEl.style.color = "#92400e";
      statusEl.style.background = "#fffbeb";
      statusEl.style.borderColor = "#fcd34d";
    }
  }

  if (mintBtn) {
    mintBtn.disabled = !recipeReady || ticketMintInProgress;
    mintBtn.title = recipeReady
      ? "Mint one Imperial Ticket."
      : "Complete all Ticket requirements first.";
  }
}

  async function loadTicketRecipeData() {
    if (ticketLoading) return;

    const username = getTicketViewedUser();
    const actor = getTicketLoggedInUser();

    const statusEl = document.getElementById("ticket-mint-status");

    if (!username || !actor) {
      if (statusEl) {
        statusEl.textContent =
          "Please connect your account to view Ticket requirements.";
      }

      return;
    }

    try {
      ticketLoading = true;

      if (statusEl) {
        statusEl.textContent = "Checking available Goods and EMP balance...";
      }

      const [inventoryResponse, empResponse, ticketStateResponse] =
        await Promise.all([
          fetch(
            `${TICKET_API_BASE}/goods/${encodeURIComponent(username)}/inventory`,
            {
              headers: {
                "x-mde-actor": actor,
              },
            },
          ),

          fetch(
            `${TICKET_API_BASE}/player/${encodeURIComponent(actor)}/empire-overview`,
          ),
          fetch(
            `${TICKET_API_BASE}/goods/${encodeURIComponent(
              username,
            )}/imperial-ticket/state`,
            {
              headers: {
                "x-mde-actor": actor,
              },
            },
          ),
        ]);

      const inventoryData = await inventoryResponse.json();
      const empData = await empResponse.json();
      const ticketStateData = await ticketStateResponse.json();

      if (!inventoryResponse.ok || !inventoryData.success) {
        throw new Error(
          inventoryData.error || "Failed to load available Goods.",
        );
      }

      if (!empResponse.ok) {
        throw new Error(empData.error || "Failed to load EMP balance.");
      }

      ticketInventory = Array.isArray(inventoryData.items)
        ? inventoryData.items
        : [];

      ticketEmpBalance = Number(ticketStateData.emp_balance || 0);
      const ownedCountEl = document.getElementById("ticket-owned-count");

      if (ownedCountEl) {
        ownedCountEl.textContent = String(
          Number(ticketStateData.owned_count || 0),
        );
      }

      renderTicketRecipe();
    } catch (err) {
      console.error("Imperial Ticket data load failed:", err);

      if (statusEl) {
        statusEl.textContent =
          err.message || "Failed to check Imperial Ticket requirements.";

        statusEl.style.color = "#b91c1c";
        statusEl.style.background = "#fef2f2";
        statusEl.style.borderColor = "#fca5a5";
      }
    } finally {
      ticketLoading = false;
    }
  }

  async function mintImperialTicket() {
    if (ticketMintInProgress) return;

    const username = getTicketViewedUser();
    const actor = getTicketLoggedInUser();

    const mintBtn = document.getElementById("ticket-mint-btn");
    const statusEl = document.getElementById("ticket-mint-status");

    if (!username || !actor || username !== actor) {
      alert("Imperial Tickets can only be minted from your own account.");
      return;
    }

    if (ticketSelectedGoods.length !== TICKET_TOTAL_GOODS) {
      alert("The Imperial Ticket recipe is not complete yet.");
      return;
    }

    const selectedPV = ticketSelectedGoods.reduce(
      (total, good) => total + Number(good?.final_value || 0),
      0,
    );

    const confirmed = window.confirm(
      [
        "Mint 1 Imperial Ticket?",
        "",
        "This action will permanently burn:",
        `• ${TICKET_TOTAL_GOODS} selected Goods`,
        `• ${selectedPV.toLocaleString(undefined, {
          maximumFractionDigits: 2,
        })} total Product Value`,
        `• ${TICKET_EMP_COST} EMP`,
        "",
        "The burned Goods cannot be recovered.",
      ].join("\n"),
    );

    if (!confirmed) return;

    try {
      ticketMintInProgress = true;

      if (mintBtn) {
        mintBtn.disabled = true;
        mintBtn.textContent = "Minting Ticket...";
      }

      if (statusEl) {
        statusEl.textContent = "Constructing your Imperial Ticket securely...";

        statusEl.style.color = "#6b21a8";
        statusEl.style.background = "#faf5ff";
        statusEl.style.borderColor = "#d8b4fe";
      }

      const response = await fetch(
        `${TICKET_API_BASE}/goods/${encodeURIComponent(
          username,
        )}/imperial-ticket/mint`,
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json",
            "x-mde-actor": actor,
          },

          body: JSON.stringify({
            username,
            goods_ids: ticketSelectedGoods.map((good) => Number(good.id)),
          }),
        },
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to mint Imperial Ticket.");
      }

      const ownedCountEl = document.getElementById("ticket-owned-count");

      if (ownedCountEl) {
        ownedCountEl.textContent = String(Number(data.owned_count || 0));
      }

      alert(
        [
          "🎟️ Imperial Ticket minted successfully!",
          "",
          `Ticket NFT ID: #${data.ticket?.id || "--"}`,
          `Goods burned: ${data.goods_burned || TICKET_TOTAL_GOODS}`,
          `PV burned: ${data.total_product_value_burned || selectedPV}`,
          `EMP spent: ${data.emp_spent || TICKET_EMP_COST}`,
        ].join("\n"),
      );

      ticketInventory = [];
      ticketSelectedGoods = [];

      await loadTicketRecipeData();
    } catch (err) {
      console.error("Imperial Ticket mint failed:", err);

      if (statusEl) {
        statusEl.textContent = err.message || "Failed to mint Imperial Ticket.";

        statusEl.style.color = "#b91c1c";
        statusEl.style.background = "#fef2f2";
        statusEl.style.borderColor = "#fca5a5";
      }

      alert(err.message || "Failed to mint Imperial Ticket.");
    } finally {
      ticketMintInProgress = false;

      if (mintBtn) {
        mintBtn.textContent = "🎟️ Mint Imperial Ticket";
      }

      renderTicketRecipe();
    }
  }

  function setupTicketMintFrontend() {
    ensureTicketV3RecipeUI();

    const ticketTab = document.querySelector('[data-goods-tab="ticket"]');
    const mintBtn = document.getElementById("ticket-mint-btn");
    if (ticketTab) {
      ticketTab.addEventListener("click", () => {
        loadTicketRecipeData();
      });
    }
    if (mintBtn) {
      mintBtn.addEventListener("click", mintImperialTicket);
    }
    // Initial load prepares the data before the player opens the tab.
    loadTicketRecipeData();
    const ticketInfoBtn = document.getElementById("ticket-info-btn");

    const ticketInfoModal = document.getElementById("ticket-info-modal");

    const ticketInfoCloseBtn = document.getElementById("ticket-info-close-btn");

    const ticketInfoConfirmBtn = document.getElementById(
      "ticket-info-confirm-btn",
    );

    function openTicketInfoModal() {
      if (!ticketInfoModal) return;

      ticketInfoModal.classList.remove("hidden");
      document.body.style.overflow = "hidden";

      if (ticketInfoCloseBtn) {
        ticketInfoCloseBtn.focus();
      }
    }

    function closeTicketInfoModal() {
      if (!ticketInfoModal) return;

      ticketInfoModal.classList.add("hidden");
      document.body.style.overflow = "";

      if (ticketInfoBtn) {
        ticketInfoBtn.focus();
      }
    }

    if (ticketInfoBtn) {
      ticketInfoBtn.addEventListener("click", openTicketInfoModal);
    }

    if (ticketInfoCloseBtn) {
      ticketInfoCloseBtn.addEventListener("click", closeTicketInfoModal);
    }

    if (ticketInfoConfirmBtn) {
      ticketInfoConfirmBtn.addEventListener("click", closeTicketInfoModal);
    }

    if (ticketInfoModal) {
      ticketInfoModal.addEventListener("click", (event) => {
        if (event.target === ticketInfoModal) {
          closeTicketInfoModal();
        }
      });
    }

    document.addEventListener("keydown", (event) => {
      if (
        event.key === "Escape" &&
        ticketInfoModal &&
        !ticketInfoModal.classList.contains("hidden")
      ) {
        closeTicketInfoModal();
      }
    });
  }

  document.addEventListener("DOMContentLoaded", setupTicketMintFrontend);
})();

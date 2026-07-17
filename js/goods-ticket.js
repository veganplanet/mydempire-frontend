// =============================================
// MYDEMPIRE — IMPERIAL TICKET RECIPE CHECKER
// Frontend preview only.
// No Goods or EMP are consumed at this stage.
// =============================================

(function () {
  const TICKET_EMP_COST = 50;

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

    if (normalized === "SUPERIOR") return 3;
    if (normalized === "FINE") return 2;

    return 1;
  }

  function isTicketR2(good) {
    return normalizeTicketValue(good?.product_level) === "STANDARD";
  }

  function isTicketR3(good) {
    return normalizeTicketValue(good?.product_level) === "VALUE";
  }

  function isAvailableTicketGood(good) {
    return (
      Number(good?.id) > 0 &&
      normalizeTicketValue(good?.status || "AVAILABLE") === "AVAILABLE"
    );
  }

  function sortTicketGoodsByValue(a, b) {
    const valueDifference =
      Number(a?.final_value || 0) - Number(b?.final_value || 0);

    if (valueDifference !== 0) {
      return valueDifference;
    }

    return Number(a?.id || 0) - Number(b?.id || 0);
  }

  function getTicketGoodDescription(good) {
    if (!good) return "";

    const stars = getTicketStars(good.quality);
    const productName = good.product_name || "Factory Good";

    return `${productName} • ${stars}★ • ${Number(good.final_value || 0)} PV`;
  }

  function findUnusedGood(goods, usedIds) {
    return goods.find((good) => !usedIds.has(Number(good.id))) || null;
  }

  function buildTicketAutoSelection() {
    const usedIds = new Set();
    const selectedByIndustry = {};

    for (const industry of TICKET_INDUSTRIES) {
      selectedByIndustry[industry] = {
        r2TwoStar: null,
        r2ThreeStar: null,
        r3TwoStar: null,
      };

      const industryGoods = ticketInventory.filter(
        (good) =>
          isAvailableTicketGood(good) &&
          normalizeTicketValue(good.industry) === industry,
      );

      // First reserve the compulsory R2 3★ Good.
      const r2ThreeStarCandidates = industryGoods
        .filter(
          (good) => isTicketR2(good) && getTicketStars(good.quality) === 3,
        )
        .sort(sortTicketGoodsByValue);

      const r2ThreeStar = findUnusedGood(r2ThreeStarCandidates, usedIds);

      if (r2ThreeStar) {
        selectedByIndustry[industry].r2ThreeStar = r2ThreeStar;
        usedIds.add(Number(r2ThreeStar.id));
      }

      // Prefer a 2★ Good here so an extra 3★ is not wasted.
      const r2TwoStarCandidates = industryGoods
        .filter((good) => isTicketR2(good) && getTicketStars(good.quality) >= 2)
        .sort((a, b) => {
          const starDifference =
            getTicketStars(a.quality) - getTicketStars(b.quality);

          if (starDifference !== 0) {
            return starDifference;
          }

          return sortTicketGoodsByValue(a, b);
        });

      const r2TwoStar = findUnusedGood(r2TwoStarCandidates, usedIds);

      if (r2TwoStar) {
        selectedByIndustry[industry].r2TwoStar = r2TwoStar;
        usedIds.add(Number(r2TwoStar.id));
      }
    }

    // Select one R3 2★+ Good from every industry.
    // Start by preferring 2★ to protect valuable 3★ Goods.
    for (const industry of TICKET_INDUSTRIES) {
      const industryGoods = ticketInventory.filter(
        (good) =>
          isAvailableTicketGood(good) &&
          normalizeTicketValue(good.industry) === industry &&
          isTicketR3(good) &&
          getTicketStars(good.quality) >= 2 &&
          !usedIds.has(Number(good.id)),
      );

      const candidates = industryGoods.sort((a, b) => {
        const starDifference =
          getTicketStars(a.quality) - getTicketStars(b.quality);

        if (starDifference !== 0) {
          return starDifference;
        }

        return sortTicketGoodsByValue(a, b);
      });

      const selected = candidates[0] || null;

      if (selected) {
        selectedByIndustry[industry].r3TwoStar = selected;
        usedIds.add(Number(selected.id));
      }
    }

    // At least two selected R3 Goods must be 3★.
    let selectedR3ThreeStarCount = TICKET_INDUSTRIES.filter(
      (industry) =>
        getTicketStars(selectedByIndustry[industry].r3TwoStar?.quality) === 3,
    ).length;

    if (selectedR3ThreeStarCount < 2) {
      const upgradeOptions = [];

      for (const industry of TICKET_INDUSTRIES) {
        const current = selectedByIndustry[industry].r3TwoStar;

        if (!current || getTicketStars(current.quality) === 3) {
          continue;
        }

        const superiorCandidates = ticketInventory
          .filter(
            (good) =>
              isAvailableTicketGood(good) &&
              normalizeTicketValue(good.industry) === industry &&
              isTicketR3(good) &&
              getTicketStars(good.quality) === 3 &&
              !usedIds.has(Number(good.id)),
          )
          .sort(sortTicketGoodsByValue);

        const replacement = superiorCandidates[0];

        if (!replacement) continue;

        upgradeOptions.push({
          industry,
          current,
          replacement,
          valueIncrease:
            Number(replacement.final_value || 0) -
            Number(current.final_value || 0),
        });
      }

      upgradeOptions.sort((a, b) => {
        if (a.valueIncrease !== b.valueIncrease) {
          return a.valueIncrease - b.valueIncrease;
        }

        return sortTicketGoodsByValue(a.replacement, b.replacement);
      });

      for (const option of upgradeOptions) {
        if (selectedR3ThreeStarCount >= 2) break;

        usedIds.delete(Number(option.current.id));
        usedIds.add(Number(option.replacement.id));

        selectedByIndustry[option.industry].r3TwoStar = option.replacement;

        selectedR3ThreeStarCount += 1;
      }
    }

    const selectedGoods = [];

    for (const industry of TICKET_INDUSTRIES) {
      const selection = selectedByIndustry[industry];

      if (selection.r2TwoStar) {
        selectedGoods.push(selection.r2TwoStar);
      }

      if (selection.r2ThreeStar) {
        selectedGoods.push(selection.r2ThreeStar);
      }

      if (selection.r3TwoStar) {
        selectedGoods.push(selection.r3TwoStar);
      }
    }

    return {
      selectedByIndustry,
      selectedGoods,
    };
  }

  function updateTicketRecipeCell(cell, good) {
    if (!cell) return;

    cell.classList.remove("ticket-slot-pending", "ticket-slot-complete");

    if (!good) {
      cell.textContent = "❌ 0 / 1";
      cell.classList.add("ticket-slot-pending");
      cell.removeAttribute("title");
      return;
    }

    cell.textContent = "✅ 1 / 1";
    cell.classList.add("ticket-slot-complete");
    cell.title = getTicketGoodDescription(good);
  }

  function renderTicketRecipe() {
    const result = buildTicketAutoSelection();

    ticketSelectedGoods = result.selectedGoods;

    for (const industry of TICKET_INDUSTRIES) {
      const row = document.querySelector(
        `[data-ticket-industry="${industry}"]`,
      );

      if (!row) continue;

      const cells = row.querySelectorAll("td");
      const selected = result.selectedByIndustry[industry];

      updateTicketRecipeCell(cells[1], selected.r2TwoStar);
      updateTicketRecipeCell(cells[2], selected.r2ThreeStar);
      updateTicketRecipeCell(cells[3], selected.r3TwoStar);
    }

    const r3ThreeStarCount = ticketSelectedGoods.filter(
      (good) => isTicketR3(good) && getTicketStars(good.quality) === 3,
    ).length;

    const selectedCount = ticketSelectedGoods.length;
    const selectedPV = ticketSelectedGoods.reduce(
      (total, good) => total + Number(good?.final_value || 0),
      0,
    );
    const hasEnoughEmp = ticketEmpBalance >= TICKET_EMP_COST;
    const hasAllGoods = selectedCount === 15;
    const hasEnoughR3ThreeStar = r3ThreeStarCount >= 2;

    const r3CountEl = document.getElementById("ticket-r3-three-star-count");

    const empEl = document.getElementById("ticket-emp-requirement");

    const selectedCountEl = document.getElementById(
      "ticket-selected-goods-count",
    );
    const selectedPvEl = document.getElementById("ticket-selected-pv");
    const statusEl = document.getElementById("ticket-mint-status");

    const mintBtn = document.getElementById("ticket-mint-btn");

    if (r3CountEl) {
      r3CountEl.textContent = `${r3ThreeStarCount} / 2`;
      r3CountEl.style.color = hasEnoughR3ThreeStar ? "#15803d" : "#b45309";
    }

    if (empEl) {
      empEl.textContent = `${ticketEmpBalance.toLocaleString(undefined, {
        maximumFractionDigits: 2,
      })} / ${TICKET_EMP_COST} EMP`;

      empEl.style.color = hasEnoughEmp ? "#15803d" : "#b45309";
    }

    if (selectedCountEl) {
      selectedCountEl.textContent = `${selectedCount} / 15`;
      selectedCountEl.style.color = hasAllGoods ? "#15803d" : "#b45309";
    }
    if (selectedPvEl) {
      selectedPvEl.textContent = `${selectedPV.toLocaleString(undefined, {
        maximumFractionDigits: 2,
      })} PV`;

      selectedPvEl.style.color = "#7e22ce";
    }
    const recipeReady = hasAllGoods && hasEnoughR3ThreeStar && hasEnoughEmp;

    if (statusEl) {
      if (recipeReady) {
        statusEl.textContent =
          "✅ Imperial Ticket recipe is ready. The minting transaction will be connected in the next backend step.";

        statusEl.style.color = "#166534";
        statusEl.style.background = "#f0fdf4";
        statusEl.style.borderColor = "#86efac";
      } else {
        const missing = [];

        if (!hasAllGoods) {
          missing.push(`${15 - selectedCount} required Goods`);
        }

        if (!hasEnoughR3ThreeStar) {
          missing.push(`${2 - r3ThreeStarCount} additional R3 3★ Good(s)`);
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

    const autoSelectBtn = document.getElementById("ticket-auto-select-btn");

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

      if (autoSelectBtn) {
        autoSelectBtn.disabled = true;
        autoSelectBtn.textContent = "Loading Goods...";
      }

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
            `${TICKET_API_BASE}/player/${encodeURIComponent(actor)}/emp-balance`,
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

      if (!empResponse.ok || !empData.success) {
        throw new Error(empData.error || "Failed to load EMP balance.");
      }

      ticketInventory = Array.isArray(inventoryData.items)
        ? inventoryData.items
        : [];

      ticketEmpBalance = Number(empData.emp_balance || 0);
      const ownedCountEl = document.getElementById("ticket-owned-count");

      if (ownedCountEl) {
        ownedCountEl.textContent = String(
          Number(ticketStateData.owned_count || 0),
        );
      }

      renderTicketRecipe();

      if (autoSelectBtn) {
        autoSelectBtn.disabled = false;
        autoSelectBtn.textContent = "✨ Auto-Select Goods";
      }
    } catch (err) {
      console.error("Imperial Ticket data load failed:", err);

      if (statusEl) {
        statusEl.textContent =
          err.message || "Failed to check Imperial Ticket requirements.";

        statusEl.style.color = "#b91c1c";
        statusEl.style.background = "#fef2f2";
        statusEl.style.borderColor = "#fca5a5";
      }

      if (autoSelectBtn) {
        autoSelectBtn.disabled = true;
        autoSelectBtn.textContent = "✨ Auto-Select Goods";
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

    if (ticketSelectedGoods.length !== 15) {
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
        "• 15 selected Goods",
        `• ${selectedPV.toLocaleString(undefined, {
          maximumFractionDigits: 2,
        })} total Product Value`,
        "• 50 EMP",
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
          `Goods burned: ${data.goods_burned || 15}`,
          `PV burned: ${data.total_product_value_burned || selectedPV}`,
          `EMP spent: ${data.emp_spent || 50}`,
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
    const ticketTab = document.querySelector('[data-goods-tab="ticket"]');

    const autoSelectBtn = document.getElementById("ticket-auto-select-btn");
    const mintBtn = document.getElementById("ticket-mint-btn");
    if (ticketTab) {
      ticketTab.addEventListener("click", () => {
        loadTicketRecipeData();
      });
    }

    if (autoSelectBtn) {
      autoSelectBtn.addEventListener("click", () => {
        renderTicketRecipe();
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

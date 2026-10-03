(() => {
  "use strict";

  const HONORS = Object.freeze([
    Object.freeze({
      code: "FIRST_IMPERIAL_ARCHITECT",
      state: "achieved",
      username: "newenx",
      icon: "🏛",
      heading: "First to 500,000 Lifetime EP",
      title: "First Imperial Architect",
      description:
        "Awarded to the first player in MydEmpire history to reach 500,000 verified Lifetime EP.",
      reward: "Imperial Mint Blueprint — awarded",
      awardedAt: "2026-09-24",
    }),
    Object.freeze({
      code: "FOOD_INDUSTRY_SPECIALIST",
      state: "active",
      icon: "🍞",
      heading: "Food Industry Specialist",
      title: "Food Industry Specialist",
      description:
        "Reach 100,000 verified Lifetime Food EP. Available to every qualifying player.",
      reward: "1 Imperial Ticket + permanent Food Industry Specialist title",
    }),
    Object.freeze({
      code: "TEXTILE_INDUSTRY_SPECIALIST",
      state: "active",
      icon: "🧵",
      heading: "Textile Industry Specialist",
      title: "Textile Industry Specialist",
      description:
        "Reach 100,000 verified Lifetime Textile EP. Available to every qualifying player.",
      reward: "1 Imperial Ticket + permanent Textile Industry Specialist title",
    }),
    Object.freeze({
      code: "PHARMA_INDUSTRY_SPECIALIST",
      state: "active",
      icon: "💊",
      heading: "Pharma Industry Specialist",
      title: "Pharma Industry Specialist",
      description:
        "Reach 100,000 verified Lifetime Pharma EP. Available to every qualifying player.",
      reward: "1 Imperial Ticket + permanent Pharma Industry Specialist title",
    }),
    Object.freeze({
      code: "CHEMICAL_INDUSTRY_SPECIALIST",
      state: "active",
      icon: "⚗️",
      heading: "Chemical Industry Specialist",
      title: "Chemical Industry Specialist",
      description:
        "Reach 100,000 verified Lifetime Chemical EP. Available to every qualifying player.",
      reward: "1 Imperial Ticket + permanent Chemical Industry Specialist title",
    }),
    Object.freeze({
      code: "SUPERMARKET_INDUSTRY_SPECIALIST",
      state: "active",
      icon: "🛒",
      heading: "Supermarket Industry Specialist",
      title: "Supermarket Industry Specialist",
      description:
        "Reach 100,000 verified Lifetime Supermarket EP. Available to every qualifying player.",
      reward: "1 Imperial Ticket + permanent Supermarket Industry Specialist title",
    }),
    Object.freeze({
      code: "GOLDEN_1000TH_PACK",
      state: "achieved",
      username: "danideuder",
      icon: "👑",
      heading: "The Golden 1000th Pack",
      title: "Golden 1000th Pack Holder",
      description:
        "Awarded to the player who purchased MydEmpire’s historic 1,000th Genesis Pack.",
      awardedAt: "2026-09-10",
    }),
  ]);

  let activeFilter = "active";
  let visibleIndex = 0;
  let rotationTimer = null;

  function cleanUsername(value) {
    return String(value || "").trim().replace(/^@/, "").toLowerCase();
  }

  function getViewedUsername() {
    const params = new URLSearchParams(window.location.search);
    return cleanUsername(
      params.get("user") ||
        localStorage.getItem("hiveUsername") ||
        localStorage.getItem("mde_username") ||
        localStorage.getItem("username"),
    );
  }

  function getFilteredHonors() {
    return HONORS.filter((honor) => honor.state === activeFilter);
  }

  function makeTextElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    element.textContent = text;
    return element;
  }

  function buildHonorCard(honor, compact = false) {
    const card = document.createElement("article");
    card.className = compact
      ? "historic-honor-card historic-honor-card-compact"
      : "historic-honor-card";

    const icon = makeTextElement("div", "historic-honor-icon", honor.icon);
    icon.setAttribute("aria-hidden", "true");

    const body = document.createElement("div");
    body.className = "historic-honor-body";
    body.appendChild(makeTextElement("h3", "", honor.heading));

    if (honor.state === "achieved") {
      body.appendChild(
        makeTextElement("div", "historic-honor-owner", `@${honor.username}`),
      );
    } else {
      body.appendChild(
        makeTextElement("div", "historic-honor-owner", "Awaiting Champion"),
      );
    }

    body.appendChild(makeTextElement("p", "", honor.description));

    if (honor.reward) {
      body.appendChild(
        makeTextElement("div", "historic-honor-reward", `Reward: ${honor.reward}`),
      );
    }

    card.append(icon, body);
    return card;
  }

  function renderPlayerHonors() {
    const container = document.getElementById("player-honors");
    if (!container) return;

    const viewedUsername = getViewedUsername();
    const honors = HONORS.filter(
      (honor) =>
        honor.state === "achieved" &&
        cleanUsername(honor.username) === viewedUsername,
    );

    container.replaceChildren();

    honors.slice(0, 1).forEach((honor) => {
      const badge = document.createElement("span");
      badge.className = "player-honor-badge";
      badge.title = honor.description;
      badge.setAttribute("aria-label", `${honor.title}: ${honor.description}`);

      const icon = makeTextElement("span", "", honor.icon);
      icon.setAttribute("aria-hidden", "true");
      badge.append(icon, makeTextElement("span", "", honor.title));
      container.appendChild(badge);
    });

    container.hidden = honors.length === 0;
  }

  function renderCurrentHonor() {
    const stage = document.getElementById("historic-honor-stage");
    const count = document.getElementById("historic-honor-count");
    if (!stage || !count) return;

    const honors = getFilteredHonors();
    stage.replaceChildren();

    if (!honors.length) {
      stage.appendChild(
        makeTextElement("div", "status-text", "No milestones in this category yet."),
      );
      count.textContent = "0 / 0";
      return;
    }

    visibleIndex = ((visibleIndex % honors.length) + honors.length) % honors.length;
    stage.appendChild(buildHonorCard(honors[visibleIndex], true));
    count.textContent = `${visibleIndex + 1} / ${honors.length}`;
  }

  function setFilter(filter) {
    if (!["active", "achieved"].includes(filter)) return;
    activeFilter = filter;
    visibleIndex = 0;

    document.querySelectorAll("[data-honor-filter]").forEach((button) => {
      const selected = button.dataset.honorFilter === filter;
      button.classList.toggle("active", selected);
      button.setAttribute("aria-selected", String(selected));
    });

    renderCurrentHonor();
    restartRotation();
  }

  function moveHonor(direction) {
    const honors = getFilteredHonors();
    if (!honors.length) return;
    visibleIndex = (visibleIndex + direction + honors.length) % honors.length;
    renderCurrentHonor();
    restartRotation();
  }

  function restartRotation() {
    if (rotationTimer) window.clearInterval(rotationTimer);
    rotationTimer = window.setInterval(() => {
      const honors = getFilteredHonors();
      if (honors.length > 1) {
        visibleIndex = (visibleIndex + 1) % honors.length;
        renderCurrentHonor();
      }
    }, 7000);
  }

  function openAllHonors() {
    const modal = document.getElementById("all-honors-modal");
    const list = document.getElementById("all-honors-list");
    if (!modal || !list) return;

    list.replaceChildren();

    [
      ["Active Challenges", HONORS.filter((honor) => honor.state === "active")],
      ["Historic Achievements", HONORS.filter((honor) => honor.state === "achieved")],
    ].forEach(([heading, honors]) => {
      const section = document.createElement("section");
      section.className = "all-honors-group";
      section.appendChild(makeTextElement("h3", "", heading));
      honors.forEach((honor) => section.appendChild(buildHonorCard(honor)));
      list.appendChild(section);
    });

    modal.hidden = false;
    document.body.classList.add("honors-modal-open");
  }

  function closeAllHonors() {
    const modal = document.getElementById("all-honors-modal");
    if (!modal) return;
    modal.hidden = true;
    document.body.classList.remove("honors-modal-open");
  }

  function renderHonors() {
    renderPlayerHonors();

    document.querySelectorAll("[data-honor-filter]").forEach((button) => {
      button.addEventListener("click", () => setFilter(button.dataset.honorFilter));
    });

    document
      .getElementById("historic-honor-prev")
      ?.addEventListener("click", () => moveHonor(-1));
    document
      .getElementById("historic-honor-next")
      ?.addEventListener("click", () => moveHonor(1));
    document
      .getElementById("historic-honor-view-all")
      ?.addEventListener("click", openAllHonors);
    document
      .getElementById("all-honors-close")
      ?.addEventListener("click", closeAllHonors);
    document
      .getElementById("all-honors-backdrop")
      ?.addEventListener("click", closeAllHonors);

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeAllHonors();
    });

    setFilter("active");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", renderHonors, { once: true });
  } else {
    renderHonors();
  }
})();

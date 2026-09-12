(() => {
  "use strict";

  const PLAYER_HONORS = Object.freeze([
    Object.freeze({
      username: "danideuder",
      code: "GOLDEN_1000TH_PACK",
      icon: "👑",
      title: "Golden 1000th Pack Holder",
      heading: "The Golden 1000th Pack",
      description:
        "Awarded to the player who purchased MydEmpire’s historic 1,000th Genesis Pack.",
      awardedAt: "2026-09-10",
    }),
  ]);

  function cleanUsername(value) {
    return String(value || "")
      .trim()
      .replace(/^@/, "")
      .toLowerCase();
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

  function renderPlayerHonors() {
    const container = document.getElementById("player-honors");
    if (!container) return;

    const viewedUsername = getViewedUsername();
    const honors = PLAYER_HONORS.filter(
      (honor) => cleanUsername(honor.username) === viewedUsername,
    );

    container.replaceChildren();

    honors.forEach((honor) => {
      const badge = document.createElement("span");
      badge.className = "player-honor-badge";
      badge.title = honor.description;
      badge.setAttribute("aria-label", `${honor.title}: ${honor.description}`);

      const icon = document.createElement("span");
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = honor.icon;

      const label = document.createElement("span");
      label.textContent = honor.title;

      badge.append(icon, label);
      container.appendChild(badge);
    });

    container.hidden = honors.length === 0;
  }

  function renderHallOfFame() {
    const list = document.getElementById("historic-honors-list");
    if (!list) return;

    list.replaceChildren();

    PLAYER_HONORS.forEach((honor) => {
      const card = document.createElement("article");
      card.className = "historic-honor-card";

      const icon = document.createElement("div");
      icon.className = "historic-honor-icon";
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = honor.icon;

      const body = document.createElement("div");

      const heading = document.createElement("h3");
      heading.textContent = honor.heading;

      const owner = document.createElement("div");
      owner.className = "historic-honor-owner";
      owner.textContent = `@${honor.username}`;

      const description = document.createElement("p");
      description.textContent = honor.description;

      body.append(heading, owner, description);
      card.append(icon, body);
      list.appendChild(card);
    });
  }

  function renderHonors() {
    renderPlayerHonors();
    renderHallOfFame();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", renderHonors, { once: true });
  } else {
    renderHonors();
  }
})();

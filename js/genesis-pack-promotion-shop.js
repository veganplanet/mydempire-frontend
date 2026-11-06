(() => {
  const host = window.location.hostname;
  const apiBase = host === "localhost" || host === "127.0.0.1"
    ? "http://localhost:10000"
    : "https://mydempire-backend-1.onrender.com";
  const $ = (id) => document.getElementById(id);

  function remainingLabel(endsAt) {
    const ms = Math.max(0, new Date(endsAt || 0).getTime() - Date.now());
    if (!ms) return "Offer ended";
    const days = Math.floor(ms / 86400000);
    const hours = Math.floor(ms % 86400000 / 3600000);
    return `Ends in ${days}d ${String(hours).padStart(2, "0")}h`;
  }

  async function load() {
    try {
      const response = await fetch(`${apiBase}/genesis-pack-promotion/status`);
      const data = await response.json();
      if (!response.ok || !data.success || !data.launched) return;
      $("genesis-promo-shop").hidden = false;
      const count = Number(data.packsAwarded || 0);
      const cap = Number(data.packCap || 250);
      $("genesis-promo-shop-total").textContent = data.winnerUsername
        ? `Offer closed · Winner @${data.winnerUsername}`
        : `Eligible packs: ${count} / ${cap}`;
      $("genesis-promo-shop-bar").style.width = `${Math.min(100, count / cap * 100)}%`;
      $("genesis-promo-shop-time").textContent = data.active
        ? remainingLabel(data.endsAt)
        : count >= cap ? "250-pack cap reached" : "Offer ended";

      const username = typeof getShopActiveUser === "function" ? getShopActiveUser() : "";
      if (username && typeof getShopActorHeaders === "function") {
        const progressResponse = await fetch(`${apiBase}/genesis-pack-promotion/player/${encodeURIComponent(username)}`, {
          headers: getShopActorHeaders(),
        });
        const progress = await progressResponse.json();
        if (progressResponse.ok && progress.success) {
          $("genesis-promo-shop-player").textContent =
            `Your packs: ${Number(progress.packs || 0)} · Draw entries: ${Number(progress.entries || 0)}`;
        } else {
          $("genesis-promo-shop-player").textContent = "Every 5 eligible packs earns 1 draw entry";
        }
      } else {
        $("genesis-promo-shop-player").textContent = "Every 5 eligible packs earns 1 draw entry";
      }
    } catch (error) {
      console.warn("Genesis pack promotion details unavailable:", error);
    }
  }

  document.addEventListener("DOMContentLoaded", load);
})();

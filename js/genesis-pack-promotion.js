(() => {
  const host = window.location.hostname;
  const apiBase = host === "localhost" || host === "127.0.0.1"
    ? "http://localhost:10000"
    : "https://mydempire-backend-1.onrender.com";
  const $ = (id) => document.getElementById(id);
  const escapeName = (value) => String(value || "").replace(/^@/, "").toLowerCase();

  function closeModal() {
    const modal = $("genesis-pack-promo-modal");
    if (modal) modal.hidden = true;
  }

  function formatRemaining(endsAt) {
    if (!endsAt) return "Offer ends after 21 days";
    const remaining = Math.max(0, new Date(endsAt).getTime() - Date.now());
    if (!remaining) return "Offer ended";
    const days = Math.floor(remaining / 86400000);
    const hours = Math.floor((remaining % 86400000) / 3600000);
    const minutes = Math.floor((remaining % 3600000) / 60000);
    return `Ends in ${days}d ${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m`;
  }

  async function loadPromotion() {
    try {
      const statusRes = await fetch(`${apiBase}/genesis-pack-promotion/status`);
      const status = await statusRes.json();
      if (!statusRes.ok || !status.success || !status.launched) return;

      const card = $("genesis-pack-promo-card");
      if (!card) return;
      card.hidden = false;

      const total = Number(status.packsAwarded || 0);
      const cap = Number(status.packCap || 250);
      const pct = Math.min(100, cap ? total / cap * 100 : 0);
      $("genesis-pack-promo-total").textContent = status.winnerUsername
        ? `Offer complete: ${total} / ${cap} packs · Winner @${status.winnerUsername}`
        : `Eligible packs: ${total} / ${cap}`;
      $("genesis-pack-promo-progress-bar").style.width = `${pct}%`;
      $("genesis-pack-promo-countdown").textContent = status.active
        ? formatRemaining(status.endsAt)
        : (total >= cap ? "250-pack cap reached" : "Offer ended");

      const user = escapeName(typeof PLAYER_USERNAME !== "undefined" ? PLAYER_USERNAME : window.PLAYER_USERNAME || "");
      let playerPacks = 0;
      if (user && typeof window.getActorHeaders === "function" && (typeof window.isOwnEmpireView !== "function" || window.isOwnEmpireView())) {
        try {
          const playerRes = await fetch(`${apiBase}/genesis-pack-promotion/player/${encodeURIComponent(user)}`, {
            headers: window.getActorHeaders(),
          });
          const progress = await playerRes.json();
          if (playerRes.ok && progress.success) {
            playerPacks = Number(progress.packs || 0);
            $("genesis-pack-promo-player").textContent =
              `Your packs: ${playerPacks} · Draw entries: ${Number(progress.entries || 0)}`;
            $("genesis-pack-promo-modal-progress").textContent =
              `You have ${playerPacks} eligible pack${playerPacks === 1 ? "" : "s"} and ${Number(progress.entries || 0)} draw entries. Every 5 packs earns another entry.`;
          }
        } catch (error) {
          console.warn("Promotion player progress unavailable:", error);
        }
      }
      if (!user || playerPacks === 0) {
        $("genesis-pack-promo-player").textContent = "5 packs = 1 draw entry";
      }

      if (status.active && playerPacks < 5 && user) {
        const key = `mde_genesis_pack_promo_notice_${user}`;
        const lastShown = Number(localStorage.getItem(key) || 0);
        if (Date.now() - lastShown >= 86400000) {
          $("genesis-pack-promo-modal").hidden = false;
          localStorage.setItem(key, String(Date.now()));
        }
      }
      if (status.active) {
        window.setInterval(() => {
          $("genesis-pack-promo-countdown").textContent = formatRemaining(status.endsAt);
        }, 60000);
      }
    } catch (error) {
      console.warn("Genesis pack promotion unavailable:", error);
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("[data-promo-close]").forEach((el) => el.addEventListener("click", closeModal));
    loadPromotion();
  });
})();

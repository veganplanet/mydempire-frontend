(() => {
  const host = window.location.hostname;
  const apiBase = host === "localhost" || host === "127.0.0.1"
    ? "http://localhost:10000"
    : "https://mydempire-backend-1.onrender.com";
  const $ = (id) => document.getElementById(id);
  const key = () => sessionStorage.getItem("MYDEMPIRE_ADMIN_KEY") || "";
  const headers = () => ({ "x-admin-key": key(), "Content-Type": "application/json" });

  async function loadPromotion() {
    const status = $("genesis-pack-promo-admin-status");
    if (!status) return;
    status.textContent = "Loading promotion status…";
    try {
      const response = await fetch(`${apiBase}/admin/genesis-pack-promotion`, { headers: headers() });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "Unable to load status.");
      const summary = $("genesis-pack-promo-admin-summary");
      summary.innerHTML =
        `<div class="metric"><b>Status</b><span>${data.winnerUsername ? "Draw complete" : data.active ? "Active" : data.launched ? "Ended / cap reached" : "Not started"}</span></div>` +
        `<div class="metric"><b>Eligible packs</b><span>${Number(data.packsAwarded || 0)} / ${Number(data.packCap || 250)}</span></div>` +
        `<div class="metric"><b>Bonus issued</b><span>${(Number(data.packsAwarded || 0) * Number(data.empPerPack || 200)).toLocaleString()} EMP</span></div>` +
        `<div class="metric"><b>Deadline</b><span>${data.endsAt ? new Date(data.endsAt).toLocaleString() : "Starts when activated"}</span></div>` +
        (data.winnerUsername ? `<div class="metric"><b>Imperial Mint Blueprint winner</b><span>@${data.winnerUsername}</span></div>` : "");
      status.textContent = data.active
        ? "Offer is live. Payments confirmed before the cap or deadline receive the bonus automatically."
        : data.launched
          ? "Offer is closed. Run the draw when ready."
          : "Ready. Start the offer when you want the promotion to begin.";
      $("genesis-pack-promo-admin-start").disabled = Boolean(data.launched);
      $("genesis-pack-promo-admin-draw").disabled = !data.launched || data.active || Boolean(data.winnerUsername);
    } catch (error) {
      status.textContent = error.message || "Unable to load promotion status.";
      $("genesis-pack-promo-admin-start").disabled = true;
      $("genesis-pack-promo-admin-draw").disabled = true;
    }
  }

  async function postAction(action, confirmText) {
    if (!window.confirm(confirmText)) return;
    const status = $("genesis-pack-promo-admin-status");
    status.textContent = "Processing…";
    try {
      const response = await fetch(`${apiBase}/admin/genesis-pack-promotion/${action}`, {
        method: "POST",
        headers: headers(),
        body: "{}",
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "Action failed.");
      if (action === "draw") {
        status.textContent = `Draw complete: @${data.winnerUsername} won the Imperial Mint Blueprint. Please issue the Blueprint from the existing admin award flow.`;
      }
      await loadPromotion();
    } catch (error) {
      status.textContent = error.message || "Action failed.";
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    $("genesis-pack-promo-admin-load")?.addEventListener("click", loadPromotion);
    $("genesis-pack-promo-admin-start")?.addEventListener("click", () =>
      postAction("start", "Start the 21-day Genesis Pack promotion now? The countdown cannot be reset.")
    );
    $("genesis-pack-promo-admin-draw")?.addEventListener("click", () =>
      postAction("draw", "Conduct the weighted draw now? The winner will be final.")
    );
    $("unlock-admin-btn")?.addEventListener("click", () => window.setTimeout(loadPromotion, 300));
    loadPromotion();
  });
})();

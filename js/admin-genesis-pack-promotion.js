(() => {
  const host = window.location.hostname;
  const apiBase = host === "localhost" || host === "127.0.0.1"
    ? "http://localhost:10000"
    : "https://mydempire-backend-1.onrender.com";
  const $ = (id) => document.getElementById(id);
  const key = () => sessionStorage.getItem("MYDEMPIRE_ADMIN_KEY") || "";
  const headers = () => ({ "x-admin-key": key(), "Content-Type": "application/json" });

  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);

  function renderPlayerSales(containerId, players) {
    const container = $(containerId);
    if (!container) return;
    container.replaceChildren();
    if (!Array.isArray(players) || !players.length) {
      const empty = document.createElement("div");
      empty.className = "genesis-promo-audit-empty";
      empty.textContent = "No eligible pack purchases recorded yet.";
      container.appendChild(empty);
      return;
    }
    const wrap = document.createElement("div");
    wrap.className = "genesis-promo-audit-table-wrap";
    const table = document.createElement("table");
    table.className = "genesis-promo-audit-table";
    table.innerHTML = "<thead><tr><th>Player</th><th>Eligible packs</th><th>Draw entries</th></tr></thead>";
    const body = document.createElement("tbody");
    players.forEach((player) => {
      const row = document.createElement("tr");
      [`@${escapeHtml(player.username)}`, Number(player.packs || 0), Number(player.entries || 0)].forEach((value) => {
        const cell = document.createElement("td");
        if (typeof value === "number") cell.textContent = value.toLocaleString();
        else cell.innerHTML = value;
        row.appendChild(cell);
      });
      body.appendChild(row);
    });
    table.appendChild(body);
    wrap.appendChild(table);
    container.appendChild(wrap);
  }

  function renderDrawProof(containerId, data) {
    const container = $(containerId);
    if (!container) return;
    container.replaceChildren();
    container.hidden = true;
    if (!data.drawBlockNumber || !data.drawBlockId) return;
    container.hidden = false;

    const heading = document.createElement("strong");
    heading.textContent = `Hive-verified draw · Winner @${data.winnerUsername || "unknown"}`;
    container.appendChild(heading);

    const method = document.createElement("p");
    method.textContent = `Method: ${data.drawMethod || "SHA256(hive_block_id:username:ticket_number), lowest hash wins"}. The draw used the first finalized Hive block at or after the offer closed.`;
    container.appendChild(method);

    const link = document.createElement("a");
    link.href = `https://hiveblocks.com/b/${Number(data.drawBlockNumber)}`;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = `Hive block #${Number(data.drawBlockNumber)}`;
    container.appendChild(link);

    const blockId = document.createElement("code");
    blockId.textContent = `Block ID / seed: ${data.drawBlockId}`;
    container.appendChild(blockId);

    const totals = document.createElement("p");
    totals.textContent = `Eligible draw entries: ${Number(data.totalDrawEntries || 0)} · Winning ticket for @${data.winnerUsername || "unknown"}: #${Number(data.winnerEntry || 0)}`;
    container.appendChild(totals);

    const winningHash = document.createElement("code");
    winningHash.textContent = `Winning SHA-256: ${data.winnerHash || "unavailable"}`;
    container.appendChild(winningHash);

    if (Array.isArray(data.drawRanking) && data.drawRanking.length) {
      const details = document.createElement("details");
      const summary = document.createElement("summary");
      summary.textContent = "View all SHA-256 ticket hashes";
      details.appendChild(summary);
      const wrap = document.createElement("div");
      wrap.className = "genesis-promo-audit-table-wrap";
      const table = document.createElement("table");
      table.className = "genesis-promo-audit-table";
      table.innerHTML = "<thead><tr><th>Rank</th><th>Player</th><th>Ticket</th><th>SHA-256</th></tr></thead>";
      const body = document.createElement("tbody");
      data.drawRanking.forEach((entry) => {
        const row = document.createElement("tr");
        [Number(entry.rank || 0), `@${entry.username || ""}`, Number(entry.ticketNumber || 0), String(entry.hash || "")].forEach((value) => {
          const cell = document.createElement("td");
          cell.textContent = typeof value === "number" ? value.toLocaleString() : value;
          row.appendChild(cell);
        });
        body.appendChild(row);
      });
      table.appendChild(body);
      wrap.appendChild(table);
      details.appendChild(wrap);
      container.appendChild(details);
    }
  }

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
      renderPlayerSales("genesis-pack-promo-admin-players", data.players);
      renderDrawProof("genesis-pack-promo-admin-proof", data);
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
        status.textContent = `Draw complete: @${data.winnerUsername} won with ticket #${data.winnerEntry}. Hive block #${data.drawBlockNumber} · Please issue the Blueprint from the existing admin award flow.`;
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
      postAction("draw", "Use the first finalized Hive block at or after the offer close to select the winner? The result will be final and publicly verifiable.")
    );
    $("unlock-admin-btn")?.addEventListener("click", () => window.setTimeout(loadPromotion, 300));
    loadPromotion();
  });
})();

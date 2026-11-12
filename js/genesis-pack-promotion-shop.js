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
      const cells = [`@${player.username || ""}`, Number(player.packs || 0), Number(player.entries || 0)];
      cells.forEach((value) => {
        const cell = document.createElement("td");
        cell.textContent = typeof value === "number" ? value.toLocaleString() : value;
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

  async function load() {
    try {
      const response = await fetch(`${apiBase}/genesis-pack-promotion/status`);
      const data = await response.json();
      if (!response.ok || !data.success) return;
      $("genesis-promo-shop").hidden = false;
      const prelaunch = !data.launched;
      const promoCta = $("genesis-promo-shop-cta");
      if (promoCta) {
        const disabled = !data.active;
        promoCta.classList.toggle("promo-disabled", disabled);
        promoCta.setAttribute("aria-disabled", String(disabled));
        promoCta.tabIndex = disabled ? -1 : 0;
        promoCta.title = disabled ? "Available when the promotion is activated" : "Buy eligible Genesis Packs";
      }
      document.querySelectorAll(".genesis-promo-shop-kicker").forEach((el) => {
        el.textContent = prelaunch ? "COMING SOON" : "LIMITED GENESIS PACK OFFER";
      });
      const count = Number(data.packsAwarded || 0);
      const cap = Number(data.packCap || 250);
      $("genesis-promo-shop-total").textContent = prelaunch
        ? `Coming soon · Eligible packs: 0 / ${cap}`
        : data.winnerUsername
          ? `Offer closed · Winner @${data.winnerUsername}`
          : `Eligible packs: ${count} / ${cap}`;
      $("genesis-promo-shop-bar").style.width = `${Math.min(100, count / cap * 100)}%`;
      $("genesis-promo-shop-time").textContent = prelaunch
        ? "Starts when activated"
        : data.active
          ? remainingLabel(data.endsAt)
          : count >= cap ? "250-pack cap reached" : "Offer ended";

      renderPlayerSales("genesis-promo-shop-players", data.players);
      renderDrawProof("genesis-promo-shop-proof", data);

      const username = typeof getShopActiveUser === "function" ? getShopActiveUser() : "";
      if (data.launched && username && typeof getShopActorHeaders === "function") {
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
        $("genesis-promo-shop-player").textContent = prelaunch
          ? "Pack purchases count after activation"
          : "Every 5 eligible packs across your purchases earns 1 draw entry";
      }
    } catch (error) {
      console.warn("Genesis pack promotion details unavailable:", error);
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    const promoCta = $("genesis-promo-shop-cta");
    promoCta?.addEventListener("click", (event) => {
      if (promoCta.getAttribute("aria-disabled") === "true") event.preventDefault();
    });
    load();
  });
})();

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

  async function loadPromotion() {
    try {
      const statusRes = await fetch(`${apiBase}/genesis-pack-promotion/status`);
      const status = await statusRes.json();
      if (!statusRes.ok || !status.success) return;

      const card = $("genesis-pack-promo-card");
      if (!card) return;
      card.hidden = false;
      const prelaunch = !status.launched;
      document.querySelectorAll(".genesis-pack-promo-kicker").forEach((el) => {
        el.textContent = prelaunch ? "COMING SOON" : "LIMITED GENESIS PACK OFFER";
      });

      const promoCta = $("genesis-pack-promo-dashboard-cta");
      if (promoCta) {
        const disabled = !status.active;
        promoCta.classList.toggle("promo-disabled", disabled);
        promoCta.setAttribute("aria-disabled", String(disabled));
        promoCta.tabIndex = disabled ? -1 : 0;
        promoCta.title = disabled ? "Available when the promotion is activated" : "View the active Genesis Pack promotion";
      }

      renderPlayerSales("genesis-pack-promo-dashboard-players", status.players);
      renderDrawProof("genesis-pack-promo-dashboard-proof", status);

      const total = Number(status.packsAwarded || 0);
      const cap = Number(status.packCap || 250);
      const pct = Math.min(100, cap ? total / cap * 100 : 0);
      $("genesis-pack-promo-total").textContent = prelaunch
        ? `Coming soon · Eligible packs: 0 / ${cap}`
        : status.winnerUsername
          ? `Offer complete: ${total} / ${cap} packs · Winner @${status.winnerUsername}`
          : `Eligible packs: ${total} / ${cap}`;
      $("genesis-pack-promo-progress-bar").style.width = `${pct}%`;
      $("genesis-pack-promo-countdown").textContent = prelaunch
        ? "Starts when activated"
        : status.active
          ? formatRemaining(status.endsAt)
          : (total >= cap ? "250-pack cap reached" : "Offer ended");

      const user = escapeName(typeof PLAYER_USERNAME !== "undefined" ? PLAYER_USERNAME : window.PLAYER_USERNAME || "");
      let playerPacks = 0;
      if (status.launched && user && typeof window.getActorHeaders === "function" && (typeof window.isOwnEmpireView !== "function" || window.isOwnEmpireView())) {
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
              `You have ${playerPacks} eligible pack${playerPacks === 1 ? "" : "s"} and ${Number(progress.entries || 0)} draw entries. Every 5 eligible packs across your purchases earns another entry.`;
          }
        } catch (error) {
          console.warn("Promotion player progress unavailable:", error);
        }
      }
      if (prelaunch) {
        $("genesis-pack-promo-player").textContent = "Pack purchases count after activation";
        $("genesis-pack-promo-modal-progress").textContent =
          "The EMP bonus and 21-day countdown begin when the offer is activated.";
      } else if (!user || playerPacks === 0) {
        $("genesis-pack-promo-player").textContent = "5 packs = 1 draw entry";
      }

      if ((!status.launched || status.active) && playerPacks < 5 && user) {
        const key = `mde_genesis_pack_promo_notice_shown_${user}`;
        if (localStorage.getItem(key) !== "1") {
          $("genesis-pack-promo-modal").hidden = false;
          localStorage.setItem(key, "1");
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
    const promoCta = $("genesis-pack-promo-dashboard-cta");
    promoCta?.addEventListener("click", (event) => {
      if (promoCta.getAttribute("aria-disabled") === "true") event.preventDefault();
    });
    loadPromotion();
  });
})();

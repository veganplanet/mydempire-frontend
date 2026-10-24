/* Once-per-UTC-day Diwali reminder for the signed-in player dashboard. */
(function () {
  "use strict";
  const api = location.hostname === "localhost" || location.hostname === "127.0.0.1"
    ? "http://localhost:10000" : "https://mydempire-backend-1.onrender.com";
  const festivalUrl = "/diwali-festival.html";
  const end = Date.parse("2026-11-08T00:00:00Z");

  function username() {
    const signed = window.MDEAuth && typeof window.MDEAuth.getUsername === "function"
      ? window.MDEAuth.getUsername() : "";
    return String(signed || "").replace(/^@/, "").trim().toLowerCase();
  }

  function showReminder(name, fee) {
    const overlay = document.createElement("div");
    overlay.id = "diwali-daily-registration-reminder";
    overlay.setAttribute("role", "presentation");
    overlay.style.cssText = "position:fixed;inset:0;background:rgba(13,12,34,.75);z-index:2147483640;display:flex;align-items:center;justify-content:center;padding:18px";
    const dialog = document.createElement("section");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "diwali-reminder-heading");
    dialog.style.cssText = "max-width:440px;width:100%;border:2px solid #fbbf24;border-radius:18px;padding:28px 24px;background:linear-gradient(155deg,#321653,#16132c);color:#fff;text-align:center;box-shadow:0 18px 65px #0008;font-family:inherit";
    const title = document.createElement("h2");
    title.id = "diwali-reminder-heading";
    title.textContent = "🪔 Diwali Festival — Register Now!";
    title.style.cssText = "margin:0 0 12px;color:#fde68a;font-size:1.55rem";
    const details = document.createElement("p");
    details.textContent = "Join the MyD Empire Diwali Festival (1–7 Nov)! Register once for " + fee + " EMP, then submit a daily Goods basket worth at least 500 PV. No minimum Goods count.";
    details.style.cssText = "line-height:1.6;margin:0 0 18px";
    const action = document.createElement("a");
    action.href = festivalUrl;
    action.textContent = "🎆 REGISTER FOR DIWALI";
    action.style.cssText = "display:block;padding:13px 16px;background:#fbbf24;color:#21122d;border-radius:10px;font-weight:800;text-decoration:none";
    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "Maybe later";
    close.style.cssText = "display:block;margin:15px auto 0;background:transparent;border:0;color:#ddd;cursor:pointer;padding:8px";
    close.addEventListener("click", () => overlay.remove());
    dialog.append(title, details, action, close);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    close.focus();
  }

  async function check() {
    if (Date.now() >= end) return;
    const name = username();
    if (!name) return;
    const day = new Date().toISOString().slice(0, 10);
    const key = "mde-diwali-reminder:" + name + ":" + day;
    try {
      if (localStorage.getItem(key) === "shown") return;
      const response = await fetch(api + "/diwali-festival/player/" + encodeURIComponent(name), {
        headers: { "x-mde-actor": name }, cache: "no-store"
      });
      if (!response.ok) return;
      const result = await response.json();
      if (!result.success || !result.player || result.player.registered) return;
      localStorage.setItem(key, "shown");
      showReminder(name, Number(result.event?.entry_fee_emp ?? 100));
    } catch (error) {
      // Offline, unavailable API, or blocked storage: never interrupt gameplay.
    }
  }
  document.addEventListener("DOMContentLoaded", () => {
    window.setTimeout(check, 1800);
  });
})();

(() => {
  const api =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
      ? "http://localhost:10000"
      : "https://mydempire-backend-1.onrender.com";

  const banner = document.getElementById("diwali-supplement-dashboard-banner");
  if (!banner) return;

  async function refresh() {
    try {
      const response = await fetch(api + "/diwali-festival/activity?t=" + Date.now(), {
        cache: "no-store",
      });
      const data = await response.json();
      const draw = data.activity?.supplement_draw;
      banner.style.display = draw?.status === "COMPLETED" ? "none" : "flex";
    } catch {
      banner.style.display = "none";
    }
  }

  refresh();
  window.setInterval(refresh, 60 * 1000);
})();

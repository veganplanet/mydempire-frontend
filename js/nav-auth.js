// nav-auth.js
(function () {
  // If wallet is connected, we expect a username stored here
  const user = localStorage.getItem("mde_username");

  // Show/Hide Dashboard link everywhere
  document.querySelectorAll('[data-nav="dashboard"]').forEach((el) => {
    el.style.display = user ? "inline-flex" : "none";
  });

  // If a page requires login, redirect to Home
  const requiresLogin = document.body && document.body.dataset.requiresLogin === "true";
  if (requiresLogin && !user) {
    alert("Please connect your wallet first to access Dashboard.");
    window.location.href = "index.html";
  }

  // If you’re on dashboard and it has ?user=, prefer it; otherwise use localStorage username
  const url = new URL(window.location.href);
  const hasUserParam = url.searchParams.get("user");
  if (!hasUserParam && user && window.location.pathname.endsWith("player-dashboard.html")) {
    url.searchParams.set("user", user);
    window.location.replace(url.toString());
  }
})();

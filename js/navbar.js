(function () {
  const user =
    localStorage.getItem("mde_username") ||
    localStorage.getItem("hiveUsername") ||
    "";

  const authLinks = user
    ? `
    <a href="player-dashboard.html" class="appbar-link">Dashboard</a>
    <a href="shop.html" class="appbar-link">Shop</a>
    <a href="marketplace.html" class="appbar-link">Marketplace</a>
    <a href="empire-hub.html" class="appbar-link">
      Empire Hub <span class="new-flag">NEW</span>
    </a>
  `
    : "";

  const navbar = `
    <header class="appbar">
      <div class="appbar-inner">

        <div class="appbar-left">
          <a href="index.html" class="appbar-logo">
            <img src="assets/logo.png" alt="MydEmpire">
          </a>

          <button id="mobileMenuBtn" class="mobile-menu-btn" type="button">
            ☰
          </button>

          <nav id="mobileNavMenu" class="appbar-nav">
            <a href="index.html" class="appbar-link">Home</a>
            <a href="economy.html" class="appbar-link">Economy</a>
            <a href="codex.html" class="appbar-link">Codex</a>
            ${authLinks}
          </nav>
        </div>

        <div class="appbar-right">
          ${
            user
              ? `
              <button id="notification-bell-btn" class="notification-bell-btn" type="button">
                🔔 <span id="notification-count">0</span>
              </button>

              <div id="notification-panel" class="notification-panel" style="display:none;">
                <div id="notification-list">
                  <div class="notification-item">No notifications yet.</div>
                </div>
              </div>

              <div id="appbarAccountWrap" class="appbar-account-wrap">
                <button id="appbarAccountBtn" class="appbar-account-btn" type="button">
                  @${user} ▼
                </button>

                <div id="appbarDropdown" class="appbar-dropdown">
                  <div id="appbarDropdownHead" class="appbar-dropdown-head">
                    @${user}
                  </div>

                  <a href="player-dashboard.html" class="appbar-dropdown-link">
                    Visit My Empire
                  </a>

                  <button id="visitOtherEmpireBtn" type="button" class="appbar-dropdown-link">
                    Visit Other Empire
                  </button>

                  <button id="appbarLogoutBtn" type="button" class="appbar-dropdown-link">
                    Logout
                  </button>
                </div>
              </div>
            `
              : `
              <button id="appbarLoginBtn" class="appbar-login-btn" type="button">
                Connect Wallet
              </button>
            `
          }
        </div>

      </div>
    </header>
  `;

  const mount = document.getElementById("mde-navbar");
  if (mount) {
    mount.innerHTML = navbar;
  }

  const mobileMenuBtn = document.getElementById("mobileMenuBtn");
  const mobileNavMenu = document.getElementById("mobileNavMenu");

  if (mobileMenuBtn && mobileNavMenu) {
    mobileMenuBtn.addEventListener("click", function () {
      mobileNavMenu.classList.toggle("mobile-open");
    });
  }

  const accountBtn = document.getElementById("appbarAccountBtn");
  const dropdown = document.getElementById("appbarDropdown");

  if (accountBtn && dropdown) {
    accountBtn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();

      dropdown.style.display =
        dropdown.style.display === "block" ? "none" : "block";
    });

    document.addEventListener("click", function () {
      dropdown.style.display = "none";
    });
  }

  const logoutBtn = document.getElementById("appbarLogoutBtn");

  if (logoutBtn) {
    logoutBtn.addEventListener("click", function () {
      localStorage.removeItem("mde_username");
      localStorage.removeItem("hiveUsername");
      window.location.href = "index.html";
    });
  }

  const visitOtherEmpireBtn = document.getElementById("visitOtherEmpireBtn");

  if (visitOtherEmpireBtn) {
    visitOtherEmpireBtn.addEventListener("click", function () {
      const target = prompt("Enter Hive username to visit:");
      if (!target) return;

      const cleanTarget = target.trim().replace("@", "").toLowerCase();
      if (!cleanTarget) return;

      window.location.href = `player-dashboard.html?user=${encodeURIComponent(cleanTarget)}`;
    });
  }
})();

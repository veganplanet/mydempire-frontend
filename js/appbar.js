(function () {
  function getActiveUser() {
    return (
      localStorage.getItem("mde_username") ||
      localStorage.getItem("hiveUsername") ||
      localStorage.getItem("username") ||
      ""
    ).replace("@", "").trim().toLowerCase();
  }

  function applyAuthState() {
    const activeUser = getActiveUser();
    const body = document.body;

    const loginBtn = document.getElementById("appbarLoginBtn");
    const accountWrap = document.getElementById("appbarAccountWrap");
    const accountBtn = document.getElementById("appbarAccountBtn");
    const dropdown = document.getElementById("appbarDropdown");
    const dropdownHead = document.getElementById("appbarDropdownHead");
    const visitMyEmpireLink = document.getElementById("visitMyEmpireLink");
    const visitOtherEmpireBtn = document.getElementById("visitOtherEmpireBtn");
    const logoutBtn = document.getElementById("appbarLogoutBtn");

    if (activeUser) {
      body.classList.add("user-logged-in");

      if (loginBtn) loginBtn.style.display = "none";
      if (accountWrap) accountWrap.style.display = "block";
      if (accountBtn) accountBtn.textContent = "@" + activeUser + " ▼";
      if (dropdownHead) dropdownHead.textContent = "@" + activeUser;
      if (visitMyEmpireLink) {
        visitMyEmpireLink.href = "player-dashboard.html?user=" + encodeURIComponent(activeUser);
      }
    } else {
      body.classList.remove("user-logged-in");

      if (loginBtn) loginBtn.style.display = "inline-flex";
      if (accountWrap) accountWrap.style.display = "none";
    }

    if (accountBtn && dropdown && !accountBtn.dataset.bound) {
      accountBtn.dataset.bound = "true";

      accountBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        dropdown.classList.toggle("open");
      });

      document.addEventListener("click", function () {
        dropdown.classList.remove("open");
      });
    }

    if (visitOtherEmpireBtn && !visitOtherEmpireBtn.dataset.bound) {
      visitOtherEmpireBtn.dataset.bound = "true";

      visitOtherEmpireBtn.addEventListener("click", function () {
        const target = prompt("Enter Hive username to visit empire:");
        const clean = String(target || "").replace("@", "").trim().toLowerCase();
        if (!clean) return;
        window.location.href = "player-dashboard.html?user=" + encodeURIComponent(clean);
      });
    }

    if (logoutBtn && !logoutBtn.dataset.bound) {
      logoutBtn.dataset.bound = "true";

      logoutBtn.addEventListener("click", function () {
        localStorage.removeItem("mde_username");
        localStorage.removeItem("hiveUsername");
        localStorage.removeItem("username");
        window.location.href = "index.html";
      });
    }
  }

  function setupAppbarHideOnScroll() {
    const appbar = document.querySelector(".appbar");
    if (!appbar) return;

    let lastScrollY = window.scrollY;
    let ticking = false;

    function update() {
      const currentScrollY = window.scrollY;

      if (currentScrollY <= 10) {
        appbar.classList.remove("appbar-hidden");
      } else if (currentScrollY > lastScrollY + 6) {
        appbar.classList.add("appbar-hidden");
      } else if (currentScrollY < lastScrollY - 6) {
        appbar.classList.remove("appbar-hidden");
      }

      lastScrollY = currentScrollY;
      ticking = false;
    }

    window.addEventListener("scroll", function () {
      if (!ticking) {
        window.requestAnimationFrame(update);
        ticking = true;
      }
    }, { passive: true });
  }

  function protectPageIfNeeded() {
    const requiresLogin = document.body?.dataset?.requiresLogin === "true";
    if (!requiresLogin) return;

    const activeUser = getActiveUser();
    if (!activeUser) {
      window.location.href = "index.html";
    }
  }

  window.addEventListener("DOMContentLoaded", function () {
    protectPageIfNeeded();
    applyAuthState();
    setupAppbarHideOnScroll();
  });
})();
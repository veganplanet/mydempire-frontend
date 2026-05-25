// nav-auth.js
(function () {
  function getUser() {
    return (
      localStorage.getItem("mde_username") ||
      localStorage.getItem("hiveUsername") ||
      ""
    ).trim();
  }

  function updateNav() {
    const user = getUser();

    document.querySelectorAll("[data-nav]").forEach((el) => {
      el.style.display = user ? "inline-flex" : "none";
    });

    const accountWrap = document.getElementById("appbarAccountWrap");
    const loginBtn = document.getElementById("appbarLoginBtn");
    const accountBtn = document.getElementById("appbarAccountBtn");
    const dropdownHead = document.getElementById("appbarDropdownHead");

    if (loginBtn) loginBtn.style.display = user ? "none" : "inline-flex";
    if (accountWrap) accountWrap.style.display = user ? "block" : "none";
    if (accountBtn && user) accountBtn.textContent = `@${user} ▼`;
    if (dropdownHead && user) dropdownHead.textContent = `@${user}`;
  }

  updateNav();

  const accountBtn = document.getElementById("appbarAccountBtn");
  const dropdown = document.getElementById("appbarDropdown");

  if (accountBtn && dropdown) {
    accountBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropdown.classList.toggle("open");
    });

    document.addEventListener("click", () => {
      dropdown.classList.remove("open");
    });
  }

  const logoutBtn = document.getElementById("appbarLogoutBtn");

  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      localStorage.removeItem("mde_username");
      localStorage.removeItem("hiveUsername");
      updateNav();
      window.location.href = "index.html";
    });
  }

  const requiresLogin =
    document.body && document.body.dataset.requiresLogin === "true";

  if (requiresLogin && !getUser()) {
    window.location.href = "index.html";
  }
})();

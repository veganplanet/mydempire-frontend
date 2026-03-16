document.addEventListener("DOMContentLoaded", () => {
  const navbar = document.querySelector(".appbar");
  if (!navbar) return;

  let lastScrollY = window.scrollY;
  let ticking = false;

  function handleScroll() {
    const currentScrollY = window.scrollY;

    /* keep navbar visible near top of page */
    if (currentScrollY <= 80) {
      navbar.classList.remove("appbar-hidden");
      lastScrollY = currentScrollY;
      ticking = false;
      return;
    }

    /* hide only when scrolling down */
    if (currentScrollY > lastScrollY) {
      navbar.classList.add("appbar-hidden");
    } else {
      navbar.classList.remove("appbar-hidden");
    }

    lastScrollY = currentScrollY;
    ticking = false;
  }

  window.addEventListener("scroll", () => {
    if (!ticking) {
      window.requestAnimationFrame(handleScroll);
      ticking = true;
    }
  });
});
